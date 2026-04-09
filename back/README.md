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

## Local SQL for Secrets

Secrets now support local SQLite persistence (enabled by default).

Env:

```env
ENABLE_SQLITE_SECRETS=true
SQLITE_PATH=data/one-api.db
```

Sensitive secret payload fields (`iv/ciphertext/tag`) are stored in SQLite, not in-memory only.

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
