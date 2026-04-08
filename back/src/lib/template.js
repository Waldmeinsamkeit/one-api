import { evaluateExpression } from "./expression.js";

const WHOLE_EXPR = /^\{\{(.+)\}\}$/;
const EMBEDDED_EXPR = /\{\{(.+?)\}\}/g;

function preview(value) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) {
    return "";
  }
  if (raw.length > 120) {
    return `${raw.slice(0, 117)}...`;
  }
  return raw;
}

export function renderTemplate(input, context, trace = [], fieldPath = "$") {
  if (Array.isArray(input)) {
    return input.map((item, index) =>
      renderTemplate(item, context, trace, `${fieldPath}[${index}]`)
    );
  }
  if (input && typeof input === "object") {
    const obj = {};
    for (const [key, value] of Object.entries(input)) {
      obj[key] = renderTemplate(value, context, trace, `${fieldPath}.${key}`);
    }
    return obj;
  }
  if (typeof input !== "string") {
    return input;
  }

  const wholeMatch = input.match(WHOLE_EXPR);
  if (wholeMatch) {
    const expr = wholeMatch[1].trim();
    const output = evaluateExpression(expr, context);
    trace.push({
      field: fieldPath,
      expression: expr,
      output_preview: preview(output)
    });
    return output;
  }

  let rendered = input;
  rendered = rendered.replaceAll(EMBEDDED_EXPR, (_, expr) => {
    const trimmed = expr.trim();
    const output = evaluateExpression(trimmed, context);
    trace.push({
      field: fieldPath,
      expression: trimmed,
      output_preview: preview(output)
    });
    return output === undefined || output === null ? "" : String(output);
  });
  return rendered;
}
