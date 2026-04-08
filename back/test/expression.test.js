import test from "node:test";
import assert from "node:assert/strict";
import { evaluateExpression } from "../src/lib/expression.js";

test("evaluate path and builtins", () => {
  const context = {
    payload: { city: "Paris", units: "celsius", missing: null },
    secrets: {},
    meta: {}
  };
  assert.equal(evaluateExpression("payload.city", context), "Paris");
  assert.equal(evaluateExpression("if(eq(payload.units,'celsius'),'C','F')", context), "C");
  assert.equal(evaluateExpression("coalesce(payload.missing,'fallback')", context), "fallback");
});
