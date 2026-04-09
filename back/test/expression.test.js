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

test("evaluate if then else syntax", () => {
  const context = {
    payload: { full_text: true, units: "celsius" },
    secrets: {},
    meta: {}
  };
  assert.equal(
    evaluateExpression("if eq(payload.full_text, true) then 'true' else 'false'", context),
    "true"
  );
  assert.equal(
    evaluateExpression("if eq(payload.units, 'metric') then 'C' else 'F'", context),
    "F"
  );
});
