# AV-CLI V1 Design (Init/Gen/Run/Logs/Secrets)

## Goal
Build a project-friendly CLI on top of existing one-api backend APIs (no backend API contract break), optimized for both developers and AI agents.

## Scope (V1)
Commands in scope:
- `av-cli init`
- `av-cli gen`
- `av-cli run`
- `av-cli logs`
- `av-cli secrets set`

Out of scope in V1:
- `publish` command
- `pull` command
- MCP server implementation

## Architecture
- New monorepo package: `cli/` (Node.js + TypeScript).
- Layered modules:
  - `commands/*` for CLI entry logic
  - `core/config` for config resolution and persistence
  - `core/http` for backend API client
  - `core/context` for local snapshot materialization
  - `core/output` for terminal formatting
- Keep backend API unchanged; CLI adapts to current endpoints.

## Configuration Model
Read priority: `ENV > project(.av-cli.json) > global(~/.config/av-cli/config.json)`.

### Global config
Path:
- Linux: `~/.config/av-cli/config.json`
- macOS: `~/Library/Application Support/av-cli/config.json`
- Windows: `%APPDATA%/av-cli/config.json`

Stores:
- `active_profile`
- `profiles.<name>.backend_url`
- `profiles.<name>.token`
- `profiles.<name>.default_workspace`

### Project config
Path: `./.av-cli.json`

Stores:
- `workspace_id`
- `adapter_dir`
- `preferred_model` (reserved, optional)

Never store token in project config.

## Context Snapshot
Directory: `./.av-cli/context/`

Files:
- `index.json`
- `<api_slug>.<action>.json`

State lifecycle in V1:
- `gen` success -> write/update detail snapshot with `status: pending` and update index
- `secrets set` success -> recompute `capability.is_ready` and `missing_secrets` for affected snapshots

## Command Contracts
### init
- Upsert global profile and initialize project config.
- Print effective configuration sources.

### gen
- Input: file (`-f`) and source type (`-t curl|openapi|raw`)
- Call: `POST /v1/adapters/generate`
- Output: generated adapter JSON preview + pending snapshot write.

### run
- Input: `<slug>`, optional `--action`, `--payload`, `--include-hint`
- Call: `POST /v1/execute`
- If `--include-hint`, send `options.include_hint=true`.
- Output: formatted `success/data/error/meta`.

### logs
- Input: `--tail N`
- Call: `GET /v1/executions?limit=N`
- Poll every 2s, print only unseen ids.

### secrets set
- Input: `key=value`
- Call: `POST /v1/secrets`
- After success, refresh readiness fields in local context snapshots.

## Error Handling
- Normalize backend errors (`error.code/error.message`) into consistent CLI exit messages.
- Non-zero exit code on command failure.
- Parse/validation errors are reported with actionable examples.

## Security
- Token only in global config or ENV.
- Project config and context are VCS-friendly; recommend keeping sensitive fields out.
- Add `.av-cli/context/` policy guidance (can commit by default; redact if needed).

## Testing Strategy
- Unit tests:
  - config merge precedence
  - snapshot readiness recompute
  - argument parsing and payload composition
- Integration tests (mocked HTTP):
  - gen/run/secrets/logs endpoint mapping
- Smoke command tests for local package scripts.

## Deliverables
- `cli/` package with 5 commands and shared core.
- docs for setup + examples.
- No MCP yet; design keeps `core/http + core/context` reusable for MCP phase.
