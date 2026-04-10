# one-api back

## Run

```bash
node src/server.js
```

## Verify

```bash
node scripts/verify.js
```

## API

- `GET /v1/adapters`
- `POST /v1/adapters/generate`
- `POST /v1/adapters/validate`
- `POST /v1/adapters/publish`
- `POST /v1/adapters/dry-run`
- `GET /v1/secrets`
- `POST /v1/secrets`
- `GET /v1/executions`
- `GET /v1/executions/:id`
- `GET /v1/models`
- `POST /v1/models/activate`
- `POST /v1/models/prompt`

`POST /v1/execute` supports optional:

```json
{
  "api_slug": "weather",
  "action": "current",
  "payload": {},
  "options": { "include_hint": true }
}
```

When `include_hint=true`, response includes `meta.schema_hint` from adapter spec.

## Local SQL for Secrets

Secrets, adapters, and executions now support local SQLite persistence (enabled by default).

Env:

```env
ENABLE_SQLITE_SECRETS=true
ENABLE_SQLITE_STATE=true
SQLITE_PATH=data/one-api.db
```

Sensitive secret payload fields (`iv/ciphertext/tag`) are stored in SQLite, not in-memory only.
Adapter drafts/active versions and execution logs are also restored after restart.

## Workspace LLM Keys (via Secrets)

Model provider API keys can be configured per workspace using existing Secrets:

- `openai_api_key`
- `gemini_api_key`
- `deepseek_api_key`

Resolution priority during adapter generation:
1. workspace secret key
2. env key fallback (`OPENAI_API_KEY` / `GEMINI_API_KEY` / `DEEPSEEK_API_KEY`)

## OAuth Login (Linux.do)

The backend can run with OAuth login + cookie session (recommended for web UI testing).

```env
AUTH_ENABLED=true
OAUTH_PROVIDER_NAME=linuxdo
OAUTH_CLIENT_ID=...
OAUTH_CLIENT_SECRET=...
OAUTH_AUTH_URL=...
OAUTH_TOKEN_URL=...
OAUTH_USERINFO_URL=...
OAUTH_SCOPE=openid profile email
OAUTH_CALLBACK_URL=https://<your-domain>/auth/callback
AUTH_SUCCESS_REDIRECT=https://<your-frontend-domain>
CORS_ALLOWED_ORIGINS=https://<your-frontend-domain>,http://localhost:5173
SESSION_COOKIE_NAME=oneapi_session
SESSION_TTL_DAYS=7
SESSION_COOKIE_SAME_SITE=Lax
COOKIE_SECURE_MODE=auto
```

Endpoints:
- `GET /auth/login`
- `GET /auth/callback`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /auth/password-login` (`{ "username": "...", "password": "..." }`)

Local password login uses SQLite users (provider=`local`).
To enable local password login endpoint:

```env
LOCAL_PASSWORD_AUTH_ENABLED=true
```

Password is stored in `users.local_password_hash`.
Supported formats:
- `scrypt$<salt_hex>$<hash_hex>` (recommended)
- `plain:<password>` (for quick local tests only)

Deploy check:

```bash
node scripts/verify-auth-deploy.js
```

## Local Admin Login (M1)

Admin login is password-based and restricted to localhost IP (`127.0.0.1` / `::1`).

```env
ENABLE_ADMIN_AUTH=true
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change_me
ADMIN_SESSION_COOKIE_NAME=oneapi_admin_session
ADMIN_SESSION_TTL_DAYS=1
ADMIN_SESSION_COOKIE_SAME_SITE=Lax
```

Endpoints:
- `POST /admin/login` (`{ "username": "...", "password": "..." }`)
- `GET /admin/me`
- `POST /admin/logout`
- `GET /admin/users?limit=100&offset=0&q=keyword`
- `POST /admin/users/delete` (`{ "user_id": "..." }`)

## Tunnel / OAuth Test Notes

Recommended for test:
1. Expose backend with a stable HTTPS tunnel URL.
2. Set `OAUTH_CALLBACK_URL=https://<backend-tunnel>/auth/callback`.
3. Set `AUTH_SUCCESS_REDIRECT=https://<frontend-domain-or-tunnel>`.
4. Add the frontend origin to `CORS_ALLOWED_ORIGINS`.
5. If frontend and backend are truly cross-site, use:

```env
SESSION_COOKIE_SAME_SITE=None
COOKIE_SECURE_MODE=true
ADMIN_SESSION_COOKIE_SAME_SITE=None
```

For same-site local dev (`localhost`/same domain), `Lax` is preferred.

## Troubleshooting `fetch failed`

If `/v1/execute` returns `BAD_REQUEST` with an upstream network message (for example `EACCES`),
the runtime process cannot reach the upstream host/port from your current environment.
This is a network egress/connectivity issue, not adapter mapping logic.

## Skill Library (Prompt-time)

- Config file: `skills/skill-library.json`
- Env:
  - `ENABLE_SKILL_LIBRARY=true|false`
  - `SKILL_LIBRARY_PATH=skills/skill-library.json`

Enabled skills in the library are injected into the adapter generation system prompt.
You can later enable web browsing and information extraction skills by editing the JSON file.

Current default enabled skills:
- `web_search`: use DuckDuckGo to get title/link/snippet candidates.
- `web_fetch`: fetch selected URL and extract readable markdown/text.

Suggested flow:
1. `web_search` find candidate docs.
2. `web_fetch` read target pages.
3. summarize and extract endpoint/auth/params into adapter fields.
