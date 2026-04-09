import { isExpressionAllowed } from "../lib/expression.js";

function assertObject(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function checkExpressions(obj, path = "$") {
  if (typeof obj === "string") {
    const matches = [...obj.matchAll(/\{\{(.+?)\}\}/g)];
    for (const match of matches) {
      const expr = match[1].trim();
      if (!isExpressionAllowed(expr)) {
        throw new Error(`Disallowed expression at ${path}: ${expr}`);
      }
    }
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => checkExpressions(item, `${path}[${idx}]`));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      checkExpressions(v, `${path}.${k}`);
    }
  }
}

function checkResponseMapping(mapping, path = "$.response_mapping") {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    throw new Error(`${path} must be an object`);
  }
  for (const [key, value] of Object.entries(mapping)) {
    const currentPath = `${path}.${key}`;
    if (!key || key.trim().length === 0) {
      throw new Error(`Invalid response mapping key at ${currentPath}`);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("$")) {
        continue;
      }
      if (/^[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(trimmed)) {
        throw new Error(
          `response_mapping at ${currentPath} looks like expression '${trimmed}'. Use JSONPath only.`
        );
      }
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      checkResponseMapping(value, currentPath);
      continue;
    }
  }
}

export function validateAdapterSchema(adapter) {
  assertObject(adapter, "adapter");
  const required = ["api_slug", "action", "adapter_schema_version", "target", "response_mapping"];
  for (const field of required) {
    if (!adapter[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  assertObject(adapter.target, "target");
  if (!adapter.target.url || typeof adapter.target.url !== "string") {
    throw new Error("target.url is required");
  }
  const method = String(adapter.target.method ?? "GET").toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"].includes(method)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  checkExpressions(adapter.target);
  checkExpressions(adapter.response_mapping);
  checkResponseMapping(adapter.response_mapping);
  if (adapter.request_mapping) {
    checkExpressions(adapter.request_mapping);
  }
  return true;
}
