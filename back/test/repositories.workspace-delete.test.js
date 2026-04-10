import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepositories } from "../src/domain/repositories.js";

test("repositories deleteWorkspaceData removes adapters and executions", () => {
  const repos = new InMemoryRepositories();
  repos.createAdapter({
    workspace_id: "w1",
    api_slug: "a",
    action: "x",
    adapter_schema_version: "1.0",
    logic_version: 1,
    spec: {
      api_slug: "a",
      action: "x",
      adapter_schema_version: "1.0",
      target: { url: "https://example.com", method: "GET", headers: {} },
      response_mapping: { data: "$" }
    }
  });
  repos.createAdapter({
    workspace_id: "w2",
    api_slug: "b",
    action: "y",
    adapter_schema_version: "1.0",
    logic_version: 1,
    spec: {
      api_slug: "b",
      action: "y",
      adapter_schema_version: "1.0",
      target: { url: "https://example.com", method: "GET", headers: {} },
      response_mapping: { data: "$" }
    }
  });
  repos.createExecution({
    workspace_id: "w1",
    api_slug: "a",
    action: "x",
    dry_run: false,
    success: true,
    upstream_status: 200,
    latency_ms: 10,
    request_snapshot: {},
    upstream_response: {},
    final_output: {},
    trace_snapshot: null,
    trace_enabled: false,
    trace_expire_at: null,
    response_meta: {}
  });
  repos.createExecution({
    workspace_id: "w2",
    api_slug: "b",
    action: "y",
    dry_run: false,
    success: true,
    upstream_status: 200,
    latency_ms: 10,
    request_snapshot: {},
    upstream_response: {},
    final_output: {},
    trace_snapshot: null,
    trace_enabled: false,
    trace_expire_at: null,
    response_meta: {}
  });

  const result = repos.deleteWorkspaceData("w1");
  assert.equal(result.adapters_deleted, 1);
  assert.equal(result.executions_deleted, 1);
  assert.equal(repos.listAdapters("w1").length, 0);
  assert.equal(repos.listExecutions("w1").length, 0);
  assert.equal(repos.listAdapters("w2").length, 1);
  assert.equal(repos.listExecutions("w2").length, 1);
});
