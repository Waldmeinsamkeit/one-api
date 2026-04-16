# Unified Source Auto Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `source_type=auto` with `curl > openapi > raw` priority, non-blocking raw fallback warnings, and frontend detection transparency with manual override.

**Architecture:** Add a detection/normalization layer in backend adapter generation, then return detection metadata in `/v1/adapters/generate` envelope `meta`. Frontend keeps auto as default, supports one-click cyclic override, and renders fallback warnings as yellow informational UI.

**Tech Stack:** Node.js ESM backend, node:test, React + TypeScript + Vite frontend.

---

### Task 1: Define detection behavior with failing backend tests

**Files:**
- Modify: `back/test/adapterGenerator.test.js`
- Modify: `back/src/domain/adapterGenerator.js`

- [ ] Add tests for `detectSourceType` priority (`curl > openapi > raw`) and confidence result.
- [ ] Add test for `generateAdapterFromSource` when `sourceType=auto` and unknown text fallback to raw with warning metadata.
- [ ] Run backend targeted tests and confirm RED before implementation.

### Task 2: Implement backend auto detection + warning metadata + prompt hint

**Files:**
- Modify: `back/src/domain/adapterGenerator.js`
- Modify: `back/src/domain/platformService.js`
- Modify: `back/src/server.js`
- Modify: `back/src/domain/promptTemplates.js`

- [ ] Implement `source_type=auto` detection and normalized context (`detected/effective/confidence/warnings`).
- [ ] Ensure low-confidence detection degrades to `raw` with warning (never 422 for this case).
- [ ] Add raw-fallback prompt augmentation text for LLM generation path.
- [ ] Return detection metadata through service output and `/v1/adapters/generate` response `meta`.
- [ ] Re-run backend tests to confirm GREEN.

### Task 3: Implement frontend transparency + manual cyclic override

**Files:**
- Modify: `front/src/App.tsx`
- Modify: `front/src/lib/api.ts`
- Modify: `front/src/lib/types.ts`

- [ ] Change generate API call to `unwrapEnvelope=false` and parse `{data, meta}` explicitly.
- [ ] Default source type to `auto`; show gray text “已识别为：X 模式”.
- [ ] Add small cyclic switch button: `不是 X？点此切换` (`curl -> openapi -> raw`).
- [ ] Render backend detection warnings as yellow informational message (not red error).
- [ ] Add quick action to retry by forcing selected mode.

### Task 4: Verification

**Files:**
- Modify: `back/test/adapterGenerator.test.js`

- [ ] Run `cd back && node --test test/adapterGenerator.test.js`.
- [ ] Run `cd back && node --test` (or relevant subset if full suite is too slow) and report results.
- [ ] Run `cd front && npm run build` to verify type/runtime compile.
