import http from "node:http";
import { config } from "./config.js";
import { InMemoryRepositories } from "./domain/repositories.js";
import { ModelRegistry } from "./domain/modelRegistry.js";
import { PlatformService } from "./domain/platformService.js";
import { SqliteSecretStore } from "./domain/sqliteSecretStore.js";
import { SqliteStateStore } from "./domain/sqliteStateStore.js";
import { SqliteAuthStore } from "./domain/sqliteAuthStore.js";
import { AuthService } from "./domain/authService.js";
import { isLocalhostIp } from "./lib/ip.js";
import { errorEnvelope, ApiError, toApiError } from "./lib/apiError.js";
import { buildOpenApiSpec } from "./openapi.js";
import crypto from "node:crypto";

const stateStore = config.enableSqliteState ? new SqliteStateStore({ dbPath: config.sqlitePath }) : null;
const secretStore = config.enableSqliteSecrets
  ? new SqliteSecretStore({ dbPath: config.sqlitePath })
  : null;
const repositories = new InMemoryRepositories({ secretStore, stateStore });
const modelRegistry = new ModelRegistry();
const service = new PlatformService({ repositories, modelRegistry });
const authStore = new SqliteAuthStore({ dbPath: config.sqlitePath });
const authService = new AuthService({ config, authStore });
let currentPlatformToken = config.platformToken;

function maskToken(token) {
  if (!token) {
    return "";
  }
  if (token.length <= 8) {
    return `${token.slice(0, 2)}***`;
  }
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

function isOriginAllowed(origin) {
  if (!origin) {
    return false;
  }
  return config.corsAllowedOrigins.includes(origin);
}

function buildCorsHeaders(req) {
  const origin = req?.headers?.origin;
  const base = {
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-workspace-id, x-role",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin"
  };
  if (origin && origin !== "null" && isOriginAllowed(origin)) {
    return {
      ...base,
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true"
    };
  }
  return base;
}

function sendJson(req, res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    ...buildCorsHeaders(req)
  });
  res.end(JSON.stringify(body));
}

function responseError(req, res, { status, code, message, details = null }) {
  const requestId = req?.requestId || req?.request_id || "";
  sendJson(req, res, status, errorEnvelope({ code, message, details }, requestId));
}

function shouldUseSecureCookies() {
  if (config.cookieSecureMode === "true") {
    return true;
  }
  if (config.cookieSecureMode === "false") {
    return false;
  }
  return (
    config.oauthCallbackUrl.startsWith("https://") ||
    config.authSuccessRedirect.startsWith("https://")
  );
}

function setCookie(res, { name, value, maxAge, sameSite }) {
  const secure = shouldUseSecureCookies();
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    `SameSite=${sameSite}`,
    `Max-Age=${maxAge}`
  ];
  if (secure) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function setSessionCookie(res, sessionId) {
  const maxAge = Math.max(1, config.sessionTtlDays * 24 * 60 * 60);
  setCookie(res, {
    name: config.sessionCookieName,
    value: sessionId,
    maxAge,
    sameSite: config.sessionCookieSameSite
  });
}

function setAdminSessionCookie(res, sessionId) {
  const maxAge = Math.max(1, config.adminSessionTtlDays * 24 * 60 * 60);
  setCookie(res, {
    name: config.adminSessionCookieName,
    value: sessionId,
    maxAge,
    sameSite: config.adminSessionCookieSameSite
  });
}

function clearCookie(res, name, sameSite) {
  const parts = [`${name}=`, "Path=/", "HttpOnly", `SameSite=${sameSite}`, "Max-Age=0"];
  if (shouldUseSecureCookies()) {
    parts.push("Secure");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearSessionCookie(res) {
  clearCookie(res, config.sessionCookieName, config.sessionCookieSameSite);
}

function clearAdminSessionCookie(res) {
  clearCookie(res, config.adminSessionCookieName, config.adminSessionCookieSameSite);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) {
    return {};
  }
  return header.split(";").reduce((acc, item) => {
    const idx = item.indexOf("=");
    if (idx < 0) {
      return acc;
    }
    const key = item.slice(0, idx).trim();
    const value = item.slice(idx + 1).trim();
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getClientIp(req) {
  return req.socket?.remoteAddress ?? "";
}

function requireLocalhost(req, res) {
  const ip = getClientIp(req);
  if (!isLocalhostIp(ip)) {
    responseError(req, res, {
      status: 403,
      code: "FORBIDDEN",
      message: "Admin login only allowed from localhost"
    });
    return false;
  }
  return true;
}

function requireAdminSession(req, res) {
  const cookies = parseCookies(req);
  const session = authService.getAdminSession(cookies[config.adminSessionCookieName]);
  if (!session) {
    responseError(req, res, {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Admin not logged in"
    });
    return null;
  }
  return session;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError({
      status: 422,
      code: "INVALID_JSON",
      message: "Invalid JSON body"
    });
  }
}

function requireAuth(req, res) {
  if (config.authEnabled) {
    const cookies = parseCookies(req);
    const sessionId = cookies[config.sessionCookieName];
    const session = authService.getSessionContext(sessionId);
    if (session) {
      req.authUser = session.user;
      return session.workspaceId;
    }
  }

  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${currentPlatformToken}`) {
    responseError(req, res, {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Invalid token"
    });
    return null;
  }
  return req.headers["x-workspace-id"] || config.defaultWorkspaceId;
}

function requireAdmin(req, res) {
  const role = req.headers["x-role"];
  if (role !== "admin") {
    responseError(req, res, {
      status: 403,
      code: "FORBIDDEN",
      message: "Admin role required"
    });
    return false;
  }
  return true;
}

function sendError(req, res, error, requestId) {
  const apiError = toApiError(error);
  sendJson(req, res, apiError.status, errorEnvelope(apiError, requestId));
}

const server = http.createServer(async (req, res) => {
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader("x-request-id", String(requestId));
  try {
    const method = req.method ?? "GET";
    const parsedUrl = new URL(req.url ?? "/", "http://localhost");
    const path = parsedUrl.pathname;
    const requestStart = Date.now();
    res.on("finish", () => {
      // eslint-disable-next-line no-console
      console.log(
        `[${new Date().toISOString()}] ${method} ${path} -> ${res.statusCode} ${Date.now() - requestStart}ms`
      );
    });

    if (method === "OPTIONS") {
      res.writeHead(204, {
        ...buildCorsHeaders(req)
      });
      res.end();
      return;
    }

    if (path === "/healthz" && method === "GET") {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    if (path === "/v1/openapi.json" && method === "GET") {
      sendJson(req, res, 200, {
        success: true,
        data: buildOpenApiSpec()
      });
      return;
    }

    if (path === "/auth/login" && method === "GET") {
      const loginUrl = authService.getLoginUrl();
      redirect(res, loginUrl);
      return;
    }

    if (path === "/auth/callback" && method === "GET") {
      const code = parsedUrl.searchParams.get("code");
      const state = parsedUrl.searchParams.get("state");
      if (!code || !state) {
        throw new Error("OAuth callback missing code/state");
      }
      const { session } = await authService.loginByOAuthCode({ code, state });
      setSessionCookie(res, session.id);
      redirect(res, config.authSuccessRedirect);
      return;
    }

    if (path === "/auth/me" && method === "GET") {
      const cookies = parseCookies(req);
      const session = authService.getSessionContext(cookies[config.sessionCookieName]);
      if (!session) {
        responseError(req, res, {
          status: 401,
          code: "UNAUTHORIZED",
          message: "Not logged in"
        });
        return;
      }
      sendJson(req, res, 200, { success: true, data: session.user });
      return;
    }

    if (path === "/auth/logout" && method === "POST") {
      const cookies = parseCookies(req);
      authService.logout(cookies[config.sessionCookieName]);
      clearSessionCookie(res);
      sendJson(req, res, 200, { success: true, data: { logged_out: true } });
      return;
    }

    if (path === "/auth/password-login" && method === "POST") {
      const body = await readJson(req);
      const ok = authService.verifyLocalPasswordCredential({
        username: body.username,
        password: body.password
      });
      if (!ok) {
        responseError(req, res, {
          status: 401,
          code: "UNAUTHORIZED",
          message: "Invalid username or password"
        });
        return;
      }
      const { session, user } = authService.loginLocalPasswordUser({
        username: body.username
      });
      setSessionCookie(res, session.id);
      sendJson(req, res, 200, {
        success: true,
        data: {
          id: user.id,
          username: user.username,
          workspace_id: user.workspace_id
        }
      });
      return;
    }

    if (path === "/admin/login" && method === "POST") {
      if (!requireLocalhost(req, res)) {
        return;
      }
      const body = await readJson(req);
      const ok = authService.verifyAdminCredential({
        username: body.username,
        password: body.password
      });
      if (!ok) {
        responseError(req, res, {
          status: 401,
          code: "UNAUTHORIZED",
          message: "Invalid admin credentials"
        });
        return;
      }
      const session = authService.createAdminSession({
        username: body.username,
        ip: getClientIp(req)
      });
      setAdminSessionCookie(res, session.id);
      sendJson(req, res, 200, { success: true, data: { username: session.username } });
      return;
    }

    if (path === "/admin/me" && method === "GET") {
      const admin = requireAdminSession(req, res);
      if (!admin) {
        return;
      }
      sendJson(req, res, 200, {
        success: true,
        data: {
          username: admin.username,
          created_at: admin.created_at,
          expires_at: admin.expires_at
        }
      });
      return;
    }

    if (path === "/admin/users" && method === "GET") {
      const admin = requireAdminSession(req, res);
      if (!admin) {
        return;
      }
      const limit = Number(parsedUrl.searchParams.get("limit") || "100");
      const offset = Number(parsedUrl.searchParams.get("offset") || "0");
      const q = parsedUrl.searchParams.get("q") || "";
      const users = authService.listUsers({ limit, offset, q });
      sendJson(req, res, 200, {
        success: true,
        data: users
      });
      return;
    }

    if (path === "/admin/users/delete" && method === "POST") {
      const admin = requireAdminSession(req, res);
      if (!admin) {
        return;
      }
      const body = await readJson(req);
      const deletedUser = authService.deleteUserById(body.user_id);
      const purged = service.deleteWorkspaceData(deletedUser.workspace_id);
      sendJson(req, res, 200, {
        success: true,
        data: {
          user_id: deletedUser.id,
          workspace_id: deletedUser.workspace_id,
          purged
        }
      });
      return;
    }

    if (path === "/admin/logout" && method === "POST") {
      const cookies = parseCookies(req);
      authService.logoutAdmin(cookies[config.adminSessionCookieName]);
      clearAdminSessionCookie(res);
      sendJson(req, res, 200, { success: true, data: { logged_out: true } });
      return;
    }

    const workspaceId = requireAuth(req, res);
    if (!workspaceId) {
      return;
    }

    if (path === "/v1/models" && method === "GET") {
      sendJson(req, res, 200, { success: true, data: service.listModelProfiles(workspaceId) });
      return;
    }

    if (path === "/v1/platform-token" && method === "GET") {
      sendJson(req, res, 200, {
        success: true,
        data: {
          masked: maskToken(currentPlatformToken),
          length: currentPlatformToken.length
        }
      });
      return;
    }

    if (path === "/v1/platform-token/rotate" && method === "POST") {
      currentPlatformToken = `ptk_${crypto.randomBytes(18).toString("hex")}`;
      sendJson(req, res, 200, {
        success: true,
        data: {
          token: currentPlatformToken,
          masked: maskToken(currentPlatformToken),
          rotated_at: new Date().toISOString()
        }
      });
      return;
    }

    if (path === "/v1/models/active" && method === "GET") {
      sendJson(req, res, 200, { success: true, data: service.getActiveModelProfile(workspaceId) });
      return;
    }

    if (path === "/v1/models/activate" && method === "POST") {
      const body = await readJson(req);
      const activated = service.activateModelProfile({
        workspaceId,
        modelProfileId: body.model_profile_id
      });
      sendJson(req, res, 200, { success: true, data: activated });
      return;
    }

    if (path === "/v1/models/prompt" && method === "POST") {
      const body = await readJson(req);
      const updated = service.updateModelPrompt({
        modelProfileId: body.model_profile_id,
        systemPrompt: body.system_prompt
      });
      sendJson(req, res, 200, { success: true, data: updated });
      return;
    }

    if (path === "/v1/adapters/generate" && method === "POST") {
      const body = await readJson(req);
      const created = await service.generateAdapter({
        workspaceId,
        apiSlug: body.api_slug,
        action: body.action,
        sourceType: body.source_type,
        sourceContent: body.source_content,
        sourceUrl: body.source_url,
        targetFormat: body.target_format
      });
      sendJson(req, res, 201, { success: true, data: created });
      return;
    }

    if (path === "/v1/adapters" && method === "GET") {
      sendJson(req, res, 200, { success: true, data: service.listAdapters(workspaceId) });
      return;
    }

    if (path === "/v1/adapters/validate" && method === "POST") {
      const body = await readJson(req);
      const result = service.validateAdapter(body.adapter);
      sendJson(req, res, 200, { success: true, data: result });
      return;
    }

    if (path === "/v1/adapters/publish" && method === "POST") {
      const body = await readJson(req);
      const published = service.publishAdapter({ workspaceId, adapterId: body.adapter_id });
      sendJson(req, res, 200, { success: true, data: published });
      return;
    }

    if (path === "/v1/adapters/submit-public" && method === "POST") {
      const body = await readJson(req);
      const updated = service.submitPublicAdapter({ workspaceId, adapterId: body.adapter_id });
      sendJson(req, res, 200, { success: true, data: updated });
      return;
    }

    if (path === "/v1/adapters/dry-run" && method === "POST") {
      const body = await readJson(req);
      const result = await service.dryRun({
        workspaceId,
        adapter: body.adapter,
        payload: body.payload,
        tempSecrets: body.temp_secrets
      });
      sendJson(req, res, 200, result);
      return;
    }

    if (path === "/v1/secrets" && method === "POST") {
      const body = await readJson(req);
      const result = service.saveSecret({
        workspaceId,
        name: body.name,
        value: body.value
      });
      sendJson(req, res, 201, { success: true, data: result });
      return;
    }

    if (path === "/v1/secrets" && method === "GET") {
      sendJson(req, res, 200, { success: true, data: service.listSecrets(workspaceId) });
      return;
    }

    if (path === "/v1/secrets/delete" && method === "POST") {
      const body = await readJson(req);
      const result = service.deleteSecret({
        workspaceId,
        name: body.name
      });
      sendJson(req, res, 200, { success: true, data: result });
      return;
    }

    if (path === "/v1/execute" && method === "POST") {
      const body = await readJson(req);
      const result = await service.execute({
        workspaceId,
        apiSlug: body.api_slug,
        action: body.action,
        payload: body.payload,
        options: body.options
      });
      sendJson(req, res, 200, result);
      return;
    }

    if (path.startsWith("/v1/executions/") && method === "GET") {
      const executionId = path.split("/").at(-1);
      const execution = service.getExecution(executionId);
      if (!execution) {
        responseError(req, res, {
          status: 404,
          code: "NOT_FOUND",
          message: "Execution not found"
        });
        return;
      }
      sendJson(req, res, 200, { success: true, data: execution });
      return;
    }

    if (path === "/v1/executions" && method === "GET") {
      const parsed = new URL(req.url ?? "/", "http://localhost");
      const limit = Number(parsed.searchParams.get("limit") || "100");
      sendJson(req, res, 200, { success: true, data: service.listExecutions(workspaceId, limit) });
      return;
    }

    if (path === "/v1/gallery/adapters" && method === "GET") {
      sendJson(req, res, 200, { success: true, data: service.listGallery() });
      return;
    }

    if (path === "/v1/gallery/review" && method === "POST") {
      if (!requireAdmin(req, res)) {
        return;
      }
      const body = await readJson(req);
      const result = service.reviewPublicAdapter({
        adapterId: body.adapter_id,
        approved: Boolean(body.approved)
      });
      sendJson(req, res, 200, { success: true, data: result });
      return;
    }

    if (path.startsWith("/v1/gallery/adapters/") && path.endsWith("/clone") && method === "POST") {
      const parts = path.split("/");
      const adapterId = parts[4];
      const clone = service.cloneFromGallery({ workspaceId, adapterId });
      sendJson(req, res, 201, { success: true, data: clone });
      return;
    }

    sendJson(req, res, 404, errorEnvelope({ code: "NOT_FOUND", message: "Route not found" }, requestId));
  } catch (error) {
    sendError(req, res, error, requestId);
    // eslint-disable-next-line no-console
    console.log(`[error] ${(error && error.message) || "unknown error"}`);
  }
});

server.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`one-api listening on ${config.port}`);
});
