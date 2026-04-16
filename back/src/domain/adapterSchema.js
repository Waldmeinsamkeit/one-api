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

function checkSchemaHint(schemaHint) {
  if (schemaHint === undefined) {
    return;
  }
  if (!schemaHint || typeof schemaHint !== "object" || Array.isArray(schemaHint)) {
    throw new Error("schema_hint must be an object");
  }
  for (const [field, metadata] of Object.entries(schemaHint)) {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
      throw new Error(`schema_hint.${field} must be an object`);
    }
    if (metadata.type !== undefined && typeof metadata.type !== "string") {
      throw new Error(`schema_hint.${field}.type must be a string`);
    }
    if (metadata.format !== undefined && typeof metadata.format !== "string") {
      throw new Error(`schema_hint.${field}.format must be a string`);
    }
    if (metadata.desc !== undefined && typeof metadata.desc !== "string") {
      throw new Error(`schema_hint.${field}.desc must be a string`);
    }
    if (metadata.unit !== undefined && typeof metadata.unit !== "string") {
      throw new Error(`schema_hint.${field}.unit must be a string`);
    }
    if (metadata.enum !== undefined && !Array.isArray(metadata.enum)) {
      throw new Error(`schema_hint.${field}.enum must be an array`);
    }
  }
}

function collectSecretPlaceholders(value, out = new Set()) {
  if (typeof value === "string") {
    const matches = [...value.matchAll(/\{\{\s*secrets\.([a-zA-Z0-9_]+)\s*\}\}/g)];
    for (const match of matches) {
      out.add(match[1]);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSecretPlaceholders(item, out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectSecretPlaceholders(nested, out);
    }
  }
  return out;
}

function checkAuthMode(adapter) {
  const hasExplicitMode = adapter.auth_mode !== undefined;
  const secretPlaceholders = collectSecretPlaceholders(adapter.target).size;
  if (!hasExplicitMode) {
    if (adapter.auth_ref && typeof adapter.auth_ref === "object") {
      if (!adapter.auth_ref.secret_name || typeof adapter.auth_ref.secret_name !== "string") {
        throw new Error("auth_ref.secret_name is required");
      }
    }
    // Legacy compatibility: old adapters may omit auth_mode.
    return;
  }

  const authMode = adapter.auth_mode;
  if (!["none", "secret"].includes(authMode)) {
    throw new Error("auth_mode must be 'none' or 'secret'");
  }

  if (authMode === "none") {
    if (adapter.auth_ref) {
      throw new Error("auth_mode=none does not allow auth_ref");
    }
    if (secretPlaceholders > 0) {
      throw new Error("auth_mode=none does not allow secrets placeholders in target");
    }
    return;
  }

  if (authMode === "secret") {
    if (!adapter.auth_ref || typeof adapter.auth_ref !== "object") {
      throw new Error("auth_mode=secret requires auth_ref");
    }
    if (!adapter.auth_ref.secret_name || typeof adapter.auth_ref.secret_name !== "string") {
      throw new Error("auth_ref.secret_name is required when auth_mode=secret");
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
  checkSchemaHint(adapter.schema_hint);
  checkAuthMode(adapter);
  if (adapter.request_mapping) {
    checkExpressions(adapter.request_mapping);
  }
  return true;
}
