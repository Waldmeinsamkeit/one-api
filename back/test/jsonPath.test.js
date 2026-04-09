import test from "node:test";
import assert from "node:assert/strict";
import { mapResponse } from "../src/lib/jsonPath.js";

test("mapResponse supports dot-path output keys as nested objects", () => {
  const raw = { message: "Not Found", status: 404 };
  const mapped = mapResponse(raw, {
    "error.code": "$.status",
    "error.message": "$.message",
    "meta.upstream_status": "$.status"
  });
  assert.deepEqual(mapped, {
    error: { code: 404, message: "Not Found" },
    meta: { upstream_status: 404 }
  });
});
