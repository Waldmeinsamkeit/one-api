import test from "node:test";
import assert from "node:assert/strict";
import { buildOpenApiSpec } from "../src/openapi.js";

test("openapi spec contains core paths", () => {
  const spec = buildOpenApiSpec();
  assert.equal(spec.openapi, "3.0.3");
  assert.ok(spec.paths["/v1/adapters/generate"]);
  assert.ok(spec.paths["/v1/adapters"]);
  assert.ok(spec.paths["/v1/execute"]);
  assert.ok(spec.paths["/v1/secrets"]);
  assert.ok(spec.paths["/v1/openapi.json"]);
});
