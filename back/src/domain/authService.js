import crypto from "node:crypto";

function randomState() {
  return crypto.randomBytes(24).toString("hex");
}

function pickUserId(profile) {
  return (
    profile.sub ??
    profile.id ??
    profile.user_id ??
    profile.uid ??
    profile.username ??
    profile.email
  );
}

function pickUsername(profile) {
  return profile.username ?? profile.preferred_username ?? profile.name ?? null;
}

function pickEmail(profile) {
  return profile.email ?? null;
}

function safeEquals(left, right) {
  const a = String(left ?? "");
  const b = String(right ?? "");
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class AuthService {
  constructor({ config, authStore }) {
    this.config = config;
    this.authStore = authStore;
    this.oauthStateCache = new Map();
  }

  getCookieName() {
    return this.config.sessionCookieName;
  }

  getAdminCookieName() {
    return this.config.adminSessionCookieName;
  }

  getLoginUrl() {
    if (!this.config.oauthAuthUrl || !this.config.oauthClientId) {
      throw new Error("OAuth config missing: OAUTH_AUTH_URL/OAUTH_CLIENT_ID");
    }
    const state = randomState();
    this.oauthStateCache.set(state, Date.now() + 10 * 60 * 1000);
    const url = new URL(this.config.oauthAuthUrl);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.oauthClientId);
    url.searchParams.set("redirect_uri", this.config.oauthCallbackUrl);
    url.searchParams.set("scope", this.config.oauthScope);
    url.searchParams.set("state", state);
    return url.toString();
  }

  validateState(state) {
    const expiresAt = this.oauthStateCache.get(state);
    this.oauthStateCache.delete(state);
    if (!expiresAt) {
      throw new Error("Invalid OAuth state");
    }
    if (Date.now() > expiresAt) {
      throw new Error("OAuth state expired");
    }
  }

  async exchangeCodeForProfile(code) {
    if (!this.config.oauthTokenUrl || !this.config.oauthUserInfoUrl || !this.config.oauthClientSecret) {
      throw new Error("OAuth config missing: token/userinfo/client_secret");
    }
    const tokenResponse = await fetch(this.config.oauthTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.oauthCallbackUrl,
        client_id: this.config.oauthClientId,
        client_secret: this.config.oauthClientSecret
      })
    });
    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      throw new Error(`OAuth token exchange failed: ${tokenResponse.status} ${detail}`);
    }
    const tokenJson = await tokenResponse.json();
    const accessToken = tokenJson.access_token;
    if (!accessToken) {
      throw new Error("OAuth token exchange missing access_token");
    }

    const userInfoResponse = await fetch(this.config.oauthUserInfoUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    if (!userInfoResponse.ok) {
      const detail = await userInfoResponse.text();
      throw new Error(`OAuth userinfo failed: ${userInfoResponse.status} ${detail}`);
    }
    const profile = await userInfoResponse.json();
    return profile;
  }

  async loginByOAuthCode({ code, state }) {
    this.validateState(state);
    const profile = await this.exchangeCodeForProfile(code);
    const providerUserId = pickUserId(profile);
    if (!providerUserId) {
      throw new Error("OAuth profile missing stable user id");
    }
    const user = this.authStore.upsertOAuthUser({
      provider: this.config.oauthProviderName,
      providerUserId: String(providerUserId),
      username: pickUsername(profile),
      email: pickEmail(profile)
    });
    const session = this.authStore.createSession({
      userId: user.id,
      ttlDays: this.config.sessionTtlDays
    });
    return { user, session };
  }

  getSessionContext(sessionId) {
    if (!sessionId) {
      return null;
    }
    const row = this.authStore.getSessionWithUser(sessionId);
    if (!row) {
      return null;
    }
    return {
      sessionId: row.session_id,
      workspaceId: row.workspace_id,
      user: {
        id: row.user_id,
        provider: row.provider,
        provider_user_id: row.provider_user_id,
        username: row.username,
        email: row.email,
        workspace_id: row.workspace_id
      }
    };
  }

  logout(sessionId) {
    if (!sessionId) {
      return;
    }
    this.authStore.deleteSession(sessionId);
  }

  verifyAdminCredential({ username, password }) {
    if (!this.config.enableAdminAuth) {
      throw new Error("Admin auth is disabled");
    }
    if (!this.config.adminPassword) {
      throw new Error("ADMIN_PASSWORD is not configured");
    }
    return (
      safeEquals(username, this.config.adminUsername) &&
      safeEquals(password, this.config.adminPassword)
    );
  }

  verifyLocalPasswordCredential({ username, password }) {
    if (!this.config.localPasswordAuthEnabled) {
      throw new Error("Local password auth is disabled");
    }
    const validInStore = this.authStore.verifyLocalUserCredential({ username, password });
    if (validInStore) {
      return true;
    }

    const legacyUsername = this.config.localTestUsername;
    const legacyPassword = this.config.localTestPassword;
    if (!legacyUsername || !legacyPassword) {
      return false;
    }

    const validLegacy =
      safeEquals(username, legacyUsername) &&
      safeEquals(password, legacyPassword);
    if (!validLegacy) {
      return false;
    }

    const user = this.authStore.getLocalUserByUsername(legacyUsername);
    if (!user || !user.local_password_hash) {
      this.authStore.upsertLocalPasswordUser({
        username: legacyUsername,
        password: legacyPassword
      });
    }
    return true;
  }

  loginLocalPasswordUser({ username }) {
    const normalized = String(username ?? "").trim();
    if (!normalized) {
      throw new Error("username is required");
    }
    const user = this.authStore.getLocalUserByUsername(normalized);
    if (!user) {
      throw new Error("User not found");
    }
    this.authStore.touchUserLastLogin(user.id);
    const session = this.authStore.createSession({
      userId: user.id,
      ttlDays: this.config.sessionTtlDays
    });
    return { user: this.authStore.getUserById(user.id), session };
  }

  createAdminSession({ username, ip }) {
    return this.authStore.createAdminSession({
      username,
      ttlDays: this.config.adminSessionTtlDays,
      lastIp: ip
    });
  }

  getAdminSession(sessionId) {
    if (!sessionId) {
      return null;
    }
    return this.authStore.getAdminSession(sessionId);
  }

  logoutAdmin(sessionId) {
    if (!sessionId) {
      return;
    }
    this.authStore.deleteAdminSession(sessionId);
  }

  listUsers({ limit, offset, q }) {
    return this.authStore.listUsers({ limit, offset, q });
  }

  deleteUserById(userId) {
    if (!userId) {
      throw new Error("user_id is required");
    }
    const deleted = this.authStore.deleteUserById(String(userId));
    if (!deleted) {
      throw new Error("User not found");
    }
    return deleted;
  }
}
