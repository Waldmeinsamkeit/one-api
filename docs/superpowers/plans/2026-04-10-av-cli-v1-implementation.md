# AV-CLI V1 (5 Commands) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver `av-cli init/gen/run/logs/secrets set` with dual-level config, project context snapshots, and no backend API contract changes.

**Architecture:** Build a new `cli/` package with command layer + shared core modules (`config/http/context/output`). Commands call existing backend APIs and materialize project-local snapshots under `./.av-cli/context/`. Read precedence is `ENV > project > global`.

**Tech Stack:** Node.js + TypeScript, commander, chalk, ora, fs-extra, undici/fetch.

---

### Task 1: Scaffold `cli/` package and baseline runtime

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`
- Create: `cli/src/index.ts`
- Create: `cli/src/types/config.ts`
- Create: `cli/src/types/context.ts`

- [x] Add `package.json` scripts (`build`, `dev`, `test`) and bin entry `av-cli`.
- [x] Add TS config for NodeNext ESM build output to `cli/dist`.
- [x] Create CLI entry and root command skeleton with `--help`.
- [x] Build once to verify compile success.

### Task 2: Implement config system (global + project + ENV precedence)

**Files:**
- Create: `cli/src/core/paths.ts`
- Create: `cli/src/core/config.ts`
- Create: `cli/src/core/validate.ts`
- Create: `cli/src/core/errors.ts`
- Test: `cli/src/core/config.test.ts`

- [x] Write failing tests for precedence (`ENV > project > global`) and profile resolution.
- [x] Implement platform-aware global config path + project config loading.
- [x] Implement merge and effective config output with source metadata.
- [x] Re-run tests and confirm all pass.

### Task 3: Implement backend HTTP client and DTO mapping

**Files:**
- Create: `cli/src/core/http.ts`
- Create: `cli/src/types/http.ts`
- Test: `cli/src/core/http.test.ts`

- [x] Write failing tests for request headers/token/workspace and error unwrap.
- [x] Implement methods for used APIs: generate, execute, executions, saveSecret.
- [x] Implement normalized CLI error messages and exit-friendly error types.
- [x] Re-run tests and confirm green.

### Task 4: Implement context snapshot manager

**Files:**
- Create: `cli/src/core/context.ts`
- Create: `cli/src/core/readiness.ts`
- Test: `cli/src/core/context.test.ts`

- [x] Write failing tests for index/detail write and update behavior.
- [x] Implement `upsertPendingSnapshotFromGen()` for `gen` success.
- [x] Implement `refreshReadinessAfterSecretSet()` to update `is_ready/missing_secrets`.
- [x] Re-run tests and confirm green.

### Task 5: Implement `init` command

**Files:**
- Create: `cli/src/commands/init.ts`
- Modify: `cli/src/index.ts`
- Test: `cli/src/commands/init.test.ts`

- [x] Add failing tests for profile create/update and project config initialize.
- [x] Implement `av-cli init` options and interactive fallback prompts.
- [x] Print effective config with source resolution.
- [x] Re-run tests and verify command behavior.

### Task 6: Implement `gen` command (`pending` snapshot)

**Files:**
- Create: `cli/src/commands/gen.ts`
- Modify: `cli/src/index.ts`
- Test: `cli/src/commands/gen.test.ts`

- [x] Add failing tests for file read + payload compose by source type.
- [x] Implement call to `/v1/adapters/generate` and terminal JSON preview.
- [x] Persist `.av-cli/context/<slug>.<action>.json` + `index.json` with `status=pending`.
- [x] Re-run tests and verify snapshot output.

### Task 7: Implement `run` command (`--include-hint`)

**Files:**
- Create: `cli/src/commands/run.ts`
- Modify: `cli/src/index.ts`
- Test: `cli/src/commands/run.test.ts`

- [x] Add failing tests for payload parsing and `options.include_hint` forwarding.
- [x] Implement execute call and formatted output (`success/data/error/meta`).
- [x] Add clear errors for missing action resolution when slug is ambiguous.
- [x] Re-run tests and verify behavior.

### Task 8: Implement `logs` command (`--tail` polling)

**Files:**
- Create: `cli/src/commands/logs.ts`
- Modify: `cli/src/index.ts`
- Test: `cli/src/commands/logs.test.ts`

- [x] Add failing tests for unseen-id dedupe and polling renderer.
- [x] Implement `--tail N` with 2s polling loop and graceful Ctrl+C.
- [x] Ensure stable terminal output for repeated polling cycles.
- [x] Re-run tests and verify.

### Task 9: Implement `secrets set` command + readiness refresh

**Files:**
- Create: `cli/src/commands/secrets.ts`
- Modify: `cli/src/index.ts`
- Test: `cli/src/commands/secrets.test.ts`

- [x] Add failing tests for `key=value` parse and backend call.
- [x] Implement `av-cli secrets set key=value`.
- [x] Trigger local context readiness refresh and summary output.
- [x] Re-run tests and verify.

### Task 10: Docs + smoke verification

**Files:**
- Create: `cli/README.md`
- Modify: `note.md`

- [x] Document install/build/run examples for all 5 commands.
- [x] Add local smoke checklist and expected outputs.
- [x] Run `npm run build` (cli) and targeted tests.
- [x] Update `note.md` with CLI V1 progress.
