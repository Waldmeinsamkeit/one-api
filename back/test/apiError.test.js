import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, toApiError, errorEnvelope } from "../src/lib/apiError.js";

test("toApiError maps validation-like messages to 422", () => {
  const err = toApiError(new Error("Missing required field: api_slug"));
  assert.equal(err.status, 422);
  assert.equal(err.code, "VALIDATION_ERROR");
});

test("toApiError maps not found to 404", () => {
  const err = toApiError(new Error("Adapter not found"));
  assert.equal(err.status, 404);
  assert.equal(err.code, "NOT_FOUND");
});

test("errorEnvelope includes meta", () => {
  const env = errorEnvelope(
    { code: "FORBIDDEN", message: "Denied" },
    "req_1"
  );
  assert.equal(env.success, false);
  assert.equal(env.error.code, "FORBIDDEN");
  assert.equal(env.meta.request_id, "req_1");
  assert.ok(typeof env.meta.timestamp === "string");
});

test("ApiError preserves provided status and code", () => {
  const err = new ApiError({ status: 403, code: "FORBIDDEN", message: "No access" });
  assert.equal(err.status, 403);
  assert.equal(err.code, "FORBIDDEN");
  assert.equal(err.message, "No access");
});
