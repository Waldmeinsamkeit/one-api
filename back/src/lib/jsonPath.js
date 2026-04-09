function parsePath(path) {
  if (!path.startsWith("$")) {
    throw new Error(`Invalid JSONPath: ${path}`);
  }
  if (path === "$") {
    return [];
  }

  const tokens = [];
  let i = 1;
  while (i < path.length) {
    const ch = path[i];
    if (ch === ".") {
      i += 1;
      let start = i;
      while (i < path.length && /[a-zA-Z0-9_]/.test(path[i])) {
        i += 1;
      }
      if (start === i) {
        // Allow numeric direct access like $.0
        while (i < path.length && /[0-9]/.test(path[i])) {
          i += 1;
        }
      }
      const key = path.slice(start, i);
      if (!key) {
        throw new Error(`Unsupported JSONPath near index ${i}`);
      }
      tokens.push({ type: "key", value: /^[0-9]+$/.test(key) ? Number(key) : key });
      continue;
    }
    if (ch === "[") {
      i += 1;
      if (path[i] === "'" || path[i] === '"') {
        const quote = path[i];
        i += 1;
        const start = i;
        while (i < path.length && path[i] !== quote) {
          i += 1;
        }
        const key = path.slice(start, i);
        if (path[i] !== quote || path[i + 1] !== "]") {
          throw new Error(`Unsupported JSONPath bracket key near index ${i}`);
        }
        tokens.push({ type: "key", value: key });
        i += 2;
        continue;
      }
      const start = i;
      while (i < path.length && /[0-9]/.test(path[i])) {
        i += 1;
      }
      const idxText = path.slice(start, i);
      if (!idxText || path[i] !== "]") {
        throw new Error(`Unsupported JSONPath array index near index ${i}`);
      }
      tokens.push({ type: "index", value: Number(idxText) });
      i += 1;
      continue;
    }
    throw new Error(`Unsupported JSONPath token '${ch}' at index ${i}`);
  }
  return tokens;
}

export function readJsonPath(data, path) {
  const tokens = parsePath(path);
  let ptr = data;
  for (const token of tokens) {
    if (ptr === null || ptr === undefined) {
      return undefined;
    }
    if (token.type === "key") {
      ptr = ptr[token.value];
      continue;
    }
    if (token.type === "index") {
      if (!Array.isArray(ptr)) {
        return undefined;
      }
      ptr = ptr[token.value];
    }
  }
  return ptr;
}

export function mapResponse(rawBody, mapping) {
  if (!mapping || typeof mapping !== "object") {
    return rawBody;
  }
  const setNestedValue = (obj, keyPath, value) => {
    const keys = keyPath.split(".").filter(Boolean);
    if (keys.length === 0) {
      return;
    }
    let cursor = obj;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i];
      if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
        cursor[key] = {};
      }
      cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
  };

  const output = {};
  for (const [key, value] of Object.entries(mapping)) {
    let mappedValue;
    if (typeof value === "string" && value.startsWith("$")) {
      mappedValue = readJsonPath(rawBody, value);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      mappedValue = mapResponse(rawBody, value);
    } else {
      mappedValue = value;
    }
    if (key.includes(".")) {
      setNestedValue(output, key, mappedValue);
    } else {
      output[key] = mappedValue;
    }
  }
  return output;
}
