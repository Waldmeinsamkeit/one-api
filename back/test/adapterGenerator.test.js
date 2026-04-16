import test from "node:test";
import assert from "node:assert/strict";
import { detectSourceType, generateAdapterFromSource } from "../src/domain/adapterGenerator.js";

test("fallback generated adapter does not require api_key by default", () => {
  const generated = generateAdapterFromSource({
    apiSlug: "demo_api",
    action: "execute_demo",
    sourceType: "raw",
    sourceContent: "GET https://restcountries.com/v3.1/name/Japan?fullText=false"
  });
  const adapter = generated.adapter;
  assert.equal(adapter.target.headers.Accept, "application/json");
  assert.equal("Authorization" in adapter.target.headers, false);
  assert.equal("auth_ref" in adapter, false);
  assert.equal(adapter.auth_mode, "none");
  assert.deepEqual(adapter.schema_hint, {});
});

test("detectSourceType prefers curl over other patterns", () => {
  const detected = detectSourceType("curl -X POST https://example.com/v1/users -H 'Accept: application/json'");
  assert.equal(detected.detectedAs, "curl");
  assert.equal(detected.effectiveType, "curl");
  assert.equal(detected.confidence, "high");
});

test("detectSourceType identifies openapi json when not curl", () => {
  const detected = detectSourceType(
    JSON.stringify({
      openapi: "3.0.1",
      paths: {
        "/users": {
          get: {}
        }
      }
    })
  );
  assert.equal(detected.detectedAs, "openapi");
  assert.equal(detected.effectiveType, "openapi");
  assert.equal(detected.confidence, "high");
});

test("generateAdapterFromSource auto falls back to raw with warning for unknown input", () => {
  const generated = generateAdapterFromSource({
    apiSlug: "demo_api",
    action: "execute_demo",
    sourceType: "auto",
    sourceContent: "帮我查一下明天上海天气，返回温度和风速"
  });
  assert.equal(generated.adapter.api_slug, "demo_api");
  assert.equal(generated.meta.detected_as, "raw");
  assert.equal(generated.meta.confidence, "low");
  assert.equal(Array.isArray(generated.meta.warnings), true);
  assert.match(
    generated.meta.warnings[0],
    /No standard curl or OpenAPI format detected/
  );
});
