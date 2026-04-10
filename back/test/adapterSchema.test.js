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

test("response_mapping rejects expression-like strings", () => {
  const adapter = {
    api_slug: "weather",
    action: "get_current",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/weather",
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    response_mapping: {
      success: "if(eq($.status, 200), true, false)"
    }
  };
  assert.throws(() => validateAdapterSchema(adapter), /Use JSONPath only/);
});

test("schema_hint accepts lightweight field metadata", () => {
  const adapter = {
    api_slug: "weather",
    action: "get_current",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/weather",
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    response_mapping: {
      t: "$.temp",
      c: "$.condition.code"
    },
    schema_hint: {
      t: { type: "number", unit: "Celsius", desc: "Current temperature" },
      c: { type: "integer", desc: "Condition code", enum: [1, 2, 3] }
    }
  };
  assert.equal(validateAdapterSchema(adapter), true);
});

test("schema_hint rejects non-object field metadata", () => {
  const adapter = {
    api_slug: "weather",
    action: "get_current",
    adapter_schema_version: "1.0",
    target: {
      url: "https://example.com/weather",
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    },
    response_mapping: {
      t: "$.temp"
    },
    schema_hint: {
      t: "number"
    }
  };
  assert.throws(() => validateAdapterSchema(adapter), /schema_hint\.t must be an object/);
});
