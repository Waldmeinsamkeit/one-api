# P1 LLM + Source URL + Logs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete P1 iteration: add LLM management UI, workspace-scoped API key management via Secrets, source_url input flow, and first-pass logs pagination/filtering.

**Architecture:** Keep current monolith structure. Reuse existing `Secrets` storage for provider keys (`openai_api_key/gemini_api_key/deepseek_api_key`) and wire model key resolution by `workspaceId` through service/runtime. Extend current React single-page UI with a new `LLM` view and lightweight log query controls.

**Tech Stack:** Node.js (http server), SQLite-backed repositories, React + TypeScript + Vite.

---

### Task 1: Backend TDD for workspace LLM key resolution

**Files:**
- Modify: `back/test/platformService.publish.test.js`
- Modify: `back/src/domain/modelRegistry.js`
- Modify: `back/src/domain/platformService.js`

- [x] Add failing tests asserting model list/active model `api_key_configured` depends on workspace secrets.
- [x] Run targeted tests and confirm failure.
- [x] Implement workspace-aware key check path (`platformService -> modelRegistry`).
- [x] Re-run tests until green.

### Task 2: Backend TDD for LLM generation using workspace keys with env fallback

**Files:**
- Modify: `back/test/adapterGenerator.test.js`
- Modify: `back/src/domain/adapterGenerator.js`
- Modify: `back/src/domain/llmClient.js`

- [x] Add failing tests for provider key resolution priority: secret key first, env fallback second.
- [x] Run targeted tests and confirm failure.
- [x] Implement key resolver injection from service to generator/llm client.
- [x] Re-run tests until green.

### Task 3: Frontend LLM management UI + source_url input

**Files:**
- Modify: `front/src/lib/types.ts`
- Modify: `front/src/lib/api.ts`
- Modify: `front/src/App.tsx`

- [x] Add `llm` view in sidebar and UI for model list, active switch, system prompt edit.
- [x] Add API key editor for OpenAI/Gemini/DeepSeek using Secrets key names.
- [x] Add `source_url` input and request payload wiring in adapter generator.
- [x] Manual smoke validation in UI flow.

### Task 4: Logs first-pass pagination/filtering UI

**Files:**
- Modify: `front/src/App.tsx`

- [x] Add client-side controls: status filter, keyword search, page size, page index.
- [x] Apply filtered/paginated rendering for logs table.
- [x] Ensure execution detail drawer still works from paginated view.

### Task 5: Verification and docs sync

**Files:**
- Modify: `note.md`
- Modify: `back/README.md`

- [x] Run backend tests for touched behavior.
- [x] Run `node scripts/verify.js`.
- [x] Update progress notes for completed P1 items.
