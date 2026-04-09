import test from "node:test";
import assert from "node:assert/strict";
import { generateAdapterFromSource } from "../src/domain/adapterGenerator.js";

test("fallback generated adapter does not require api_key by default", () => {
  const adapter = generateAdapterFromSource({
    apiSlug: "demo_api",
    action: "execute_demo",
    sourceType: "raw",
    sourceContent: "GET https://restcountries.com/v3.1/name/Japan?fullText=false"
  });
  assert.equal(adapter.target.headers.Accept, "application/json");
  assert.equal("Authorization" in adapter.target.headers, false);
  assert.equal("auth_ref" in adapter, false);
});
