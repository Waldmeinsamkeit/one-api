import test from "node:test";
import assert from "node:assert/strict";
import { validateAdapterSchema } from "../src/domain/adapterSchema.js";

test("valid adapter passes", () => {
  const adapter = {
    api_slug: "weather",
    action: "get_current",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/weather",
      method: "GET",
      headers: {
        Authorization: "Bearer {{secrets.api_key}}"
      }
    },
    response_mapping: {
      temp: "$.data.temp"
    }
  };
  assert.equal(validateAdapterSchema(adapter), true);
});

test("invalid expression rejected", () => {
  const adapter = {
    api_slug: "weather",
    action: "get_current",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/weather",
      method: "GET",
      headers: {
        X: "{{process.env.SECRET}}"
      }
    },
    response_mapping: {}
  };
  assert.throws(() => validateAdapterSchema(adapter));
});

test("if then else expression in template passes", () => {
  const adapter = {
    api_slug: "search",
    action: "query",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/search",
      method: "GET",
      query_params: {
        fullText: "{{if eq(payload.full_text, true) then 'true' else 'false'}}"
      }
    },
    response_mapping: {}
  };
  assert.equal(validateAdapterSchema(adapter), true);
});
