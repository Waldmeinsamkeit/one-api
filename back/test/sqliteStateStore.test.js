import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SqliteStateStore } from "../src/domain/sqliteStateStore.js";
import { InMemoryRepositories } from "../src/domain/repositories.js";

function createTempDbPath() {
  const dir = path.resolve(process.cwd(), ".tmp");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `state-${Date.now()}-${Math.random().toString(16).slice(2)}.db`);
}

test("sqlite state store persists adapters and executions via repositories", () => {
  const dbPath = createTempDbPath();
  const store1 = new SqliteStateStore({ dbPath });
  const repo1 = new InMemoryRepositories({ stateStore: store1 });
  const adapter = repo1.createAdapter({
    workspace_id: "default",
    api_slug: "demo_api",
    action: "execute_demo",
    adapter_schema_version: "1.0",
    logic_version: 1,
    model_profile_id: null,
    spec: {
      api_slug: "demo_api",
      action: "execute_demo",
      adapter_schema_version: "1.0",
      target: {
        url: "https://example.com",
        method: "GET",
        headers: { Accept: "application/json" }
      },
      response_mapping: { data: "$" }
    }
  });
  repo1.publishAdapter("default", adapter.id);
  repo1.createExecution({
    workspace_id: "default",
    api_slug: "demo_api",
    action: "execute_demo",
    dry_run: false,
    success: true,
    upstream_status: 200,
    latency_ms: 123,
    request_snapshot: { payload: { city: "Tokyo" } },
    upstream_response: { status: 200, body: { ok: true } },
    final_output: { success: true },
    trace_snapshot: [{ field: "$.target.url", expression: "payload.city", output_preview: "Tokyo" }],
    trace_enabled: true,
    trace_expire_at: new Date(Date.now() + 60_000).toISOString(),
    response_meta: { upstream_status: 200 }
  });

  const store2 = new SqliteStateStore({ dbPath });
  const repo2 = new InMemoryRepositories({ stateStore: store2 });
  const adapters = repo2.listAdapters("default");
  const executions = repo2.listExecutions("default");
  assert.equal(adapters.length, 1);
  assert.equal(adapters[0].status, "active");
  assert.equal(executions.length, 1);
  assert.equal(executions[0].api_slug, "demo_api");
  assert.equal(executions[0].request_snapshot.payload.city, "Tokyo");
});
