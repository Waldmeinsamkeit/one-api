import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const cwd = process.cwd();
  const candidatePaths = [
    path.resolve(cwd, ".env"),
    path.resolve(cwd, "back", ".env")
  ];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) {
      continue;
    }
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  }
}

loadDotEnv();

function toKeyBuffer(value) {
  if (!value) {
    return crypto.createHash("sha256").update("dev-master-key").digest();
  }
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }
  return crypto.createHash("sha256").update(value).digest();
}

function toStringArray(value, fallback = []) {
  if (!value) {
    return fallback;
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  platformToken: process.env.PLATFORM_TOKEN ?? "dev-token",
  masterKey: toKeyBuffer(process.env.MASTER_KEY),
  traceRetentionDays: Number.parseInt(process.env.TRACE_RETENTION_DAYS ?? "7", 10),
  defaultWorkspaceId: process.env.DEFAULT_WORKSPACE_ID ?? "default",
  requestTimeoutMs: Number.parseInt(process.env.REQUEST_TIMEOUT_MS ?? "8000", 10),
  targetReachabilityTimeoutMs: Number.parseInt(process.env.TARGET_REACHABILITY_TIMEOUT_MS ?? "4000", 10),
  maxRedirects: Number.parseInt(process.env.MAX_REDIRECTS ?? "3", 10),
  allowPrivateUpstream: process.env.ALLOW_PRIVATE_UPSTREAM === "true",
  enforceTargetReachability: process.env.ENFORCE_TARGET_REACHABILITY !== "false",
  enableSkillLibrary: process.env.ENABLE_SKILL_LIBRARY !== "false",
  skillLibraryPath: process.env.SKILL_LIBRARY_PATH ?? "skills/skill-library.json",
  enableSqliteSecrets: process.env.ENABLE_SQLITE_SECRETS !== "false",
  enableSqliteState: process.env.ENABLE_SQLITE_STATE !== "false",
  sqlitePath: process.env.SQLITE_PATH ?? "data/one-api.db",
  authEnabled: process.env.AUTH_ENABLED !== "false",
  localPasswordAuthEnabled: process.env.LOCAL_PASSWORD_AUTH_ENABLED !== "false",
  localTestUsername: process.env.LOCAL_TEST_USERNAME ?? "",
  localTestPassword: process.env.LOCAL_TEST_PASSWORD ?? "",
  enableAdminAuth: process.env.ENABLE_ADMIN_AUTH !== "false",
  adminUsername: process.env.ADMIN_USERNAME ?? "admin",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  adminSessionCookieName: process.env.ADMIN_SESSION_COOKIE_NAME ?? "oneapi_admin_session",
  adminSessionTtlDays: Number.parseInt(process.env.ADMIN_SESSION_TTL_DAYS ?? "1", 10),
  oauthProviderName: process.env.OAUTH_PROVIDER_NAME ?? "linuxdo",
  oauthClientId: process.env.OAUTH_CLIENT_ID ?? "",
  oauthClientSecret: process.env.OAUTH_CLIENT_SECRET ?? "",
  oauthAuthUrl: process.env.OAUTH_AUTH_URL ?? "",
  oauthTokenUrl: process.env.OAUTH_TOKEN_URL ?? "",
  oauthUserInfoUrl: process.env.OAUTH_USERINFO_URL ?? "",
  oauthScope: process.env.OAUTH_SCOPE ?? "openid profile email",
  oauthCallbackUrl: process.env.OAUTH_CALLBACK_URL ?? "http://localhost:3000/auth/callback",
  authSuccessRedirect: process.env.AUTH_SUCCESS_REDIRECT ?? "http://localhost:5173",
  corsAllowedOrigins: toStringArray(
    process.env.CORS_ALLOWED_ORIGINS,
    ["http://localhost:5173", "http://127.0.0.1:5173"]
  ),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "oneapi_session",
  sessionTtlDays: Number.parseInt(process.env.SESSION_TTL_DAYS ?? "7", 10),
  sessionCookieSameSite: process.env.SESSION_COOKIE_SAME_SITE ?? "Lax",
  adminSessionCookieSameSite: process.env.ADMIN_SESSION_COOKIE_SAME_SITE ?? "Lax",
  cookieSecureMode: process.env.COOKIE_SECURE_MODE ?? "auto",
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? "",
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
  geminiBaseUrl: process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1"
};
