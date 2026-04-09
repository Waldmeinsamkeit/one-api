const BUILTINS = {
  coalesce: (...values) => values.find((v) => v !== null && v !== undefined && v !== ""),
  to_string: (value) => String(value ?? ""),
  to_number: (value) => {
    const n = Number(value);
    if (Number.isNaN(n)) {
      throw new Error("to_number received non-numeric value");
    }
    return n;
  },
  eq: (a, b) => a === b,
  if: (condition, whenTrue, whenFalse) => (condition ? whenTrue : whenFalse)
};
const ALLOWED_ROOTS = new Set(["payload", "secrets", "meta"]);

function findTopLevelKeyword(input, keyword) {
  let depth = 0;
  let quote = "";
  const needle = ` ${keyword} `;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote && input[i - 1] !== "\\") {
        quote = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      continue;
    }
    if (depth === 0 && input.slice(i, i + needle.length) === needle) {
      return i;
    }
  }
  return -1;
}

function parseIfThenElse(expr) {
  if (!expr.startsWith("if ")) {
    return null;
  }
  const thenIndex = findTopLevelKeyword(expr, "then");
  if (thenIndex === -1) {
    return null;
  }
  const elseIndex = findTopLevelKeyword(expr, "else");
  if (elseIndex === -1 || elseIndex <= thenIndex) {
    return null;
  }
  const condition = expr.slice(3, thenIndex).trim();
  const whenTrue = expr.slice(thenIndex + 6, elseIndex).trim();
  const whenFalse = expr.slice(elseIndex + 6).trim();
  if (!condition || !whenTrue || !whenFalse) {
    throw new Error(`Invalid conditional expression: ${expr}`);
  }
  return { condition, whenTrue, whenFalse };
}

function splitArgs(input) {
  const args = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === quote && input[i - 1] !== "\\") {
        quote = "";
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim().length > 0) {
    args.push(current.trim());
  }
  return args;
}

function getPath(path, context) {
  const segments = path.split(".");
  let ptr = context;
  for (const segment of segments) {
    if (segment.length === 0) {
      continue;
    }
    if (ptr === null || ptr === undefined) {
      return undefined;
    }
    ptr = ptr[segment];
  }
  return ptr;
}

function parseLiteral(expr) {
  if (/^'.*'$/.test(expr) || /^".*"$/.test(expr)) {
    return expr.slice(1, -1);
  }
  if (expr === "true") {
    return true;
  }
  if (expr === "false") {
    return false;
  }
  if (expr === "null") {
    return null;
  }
  if (/^-?\d+(\.\d+)?$/.test(expr)) {
    return Number(expr);
  }
  return undefined;
}

export function evaluateExpression(expression, context) {
  const expr = expression.trim();
  const literal = parseLiteral(expr);
  if (literal !== undefined) {
    return literal;
  }

  const conditional = parseIfThenElse(expr);
  if (conditional) {
    return BUILTINS.if(
      evaluateExpression(conditional.condition, context),
      evaluateExpression(conditional.whenTrue, context),
      evaluateExpression(conditional.whenFalse, context)
    );
  }

  const fnMatch = expr.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
  if (fnMatch) {
    const fnName = fnMatch[1];
    const fn = BUILTINS[fnName];
    if (!fn) {
      throw new Error(`Expression function not allowed: ${fnName}`);
    }
    const args = splitArgs(fnMatch[2]).map((arg) => evaluateExpression(arg, context));
    return fn(...args);
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr)) {
    throw new Error(`Invalid expression: ${expr}`);
  }
  const root = expr.split(".")[0];
  if (!ALLOWED_ROOTS.has(root)) {
    throw new Error(`Expression root not allowed: ${root}`);
  }

  return getPath(expr, context);
}

export function isExpressionAllowed(expression) {
  try {
    evaluateExpression(expression, { payload: {}, secrets: {}, meta: {} });
    return true;
  } catch {
    return false;
  }
}
