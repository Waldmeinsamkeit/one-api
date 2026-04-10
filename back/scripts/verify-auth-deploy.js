import { config } from "../src/config.js";

function printLine(status, message) {
  // eslint-disable-next-line no-console
  console.log(`[${status}] ${message}`);
}

function checkRequired(name, value) {
  if (!value) {
    printLine("ERR", `${name} is missing`);
    return false;
  }
  printLine("OK", `${name} is configured`);
  return true;
}

function main() {
  let ok = true;

  printLine("INFO", `AUTH_ENABLED=${config.authEnabled}`);
  printLine("INFO", `ENABLE_ADMIN_AUTH=${config.enableAdminAuth}`);
  printLine("INFO", `OAUTH_CALLBACK_URL=${config.oauthCallbackUrl}`);
  printLine("INFO", `AUTH_SUCCESS_REDIRECT=${config.authSuccessRedirect}`);
  printLine("INFO", `CORS_ALLOWED_ORIGINS=${config.corsAllowedOrigins.join(", ") || "<empty>"}`);
  printLine("INFO", `SESSION_COOKIE_SAME_SITE=${config.sessionCookieSameSite}`);
  printLine("INFO", `ADMIN_SESSION_COOKIE_SAME_SITE=${config.adminSessionCookieSameSite}`);
  printLine("INFO", `COOKIE_SECURE_MODE=${config.cookieSecureMode}`);

  ok = checkRequired("OAUTH_CLIENT_ID", config.oauthClientId) && ok;
  ok = checkRequired("OAUTH_CLIENT_SECRET", config.oauthClientSecret) && ok;
  ok = checkRequired("OAUTH_AUTH_URL", config.oauthAuthUrl) && ok;
  ok = checkRequired("OAUTH_TOKEN_URL", config.oauthTokenUrl) && ok;
  ok = checkRequired("OAUTH_USERINFO_URL", config.oauthUserInfoUrl) && ok;
  ok = checkRequired("ADMIN_PASSWORD", config.adminPassword) && ok;

  if (!config.corsAllowedOrigins.length) {
    printLine("WARN", "CORS_ALLOWED_ORIGINS is empty; browser auth requests may fail");
  }

  if (
    config.sessionCookieSameSite.toLowerCase() === "none" &&
    config.cookieSecureMode === "false"
  ) {
    printLine("ERR", "SameSite=None requires Secure cookies in browsers");
    ok = false;
  }

  if (
    config.oauthCallbackUrl.startsWith("http://") &&
    config.cookieSecureMode === "true"
  ) {
    printLine("WARN", "COOKIE_SECURE_MODE=true with http callback will block cookies in local testing");
  }

  if (
    config.authSuccessRedirect.startsWith("https://") &&
    !config.corsAllowedOrigins.includes(config.authSuccessRedirect)
  ) {
    printLine("WARN", "AUTH_SUCCESS_REDIRECT origin is not listed in CORS_ALLOWED_ORIGINS");
  }

  if (!ok) {
    process.exitCode = 1;
    return;
  }
  printLine("OK", "Auth deploy config looks usable");
}

main();
