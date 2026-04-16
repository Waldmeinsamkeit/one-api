export class ApiError extends Error {
  constructor({ status = 500, code = "INTERNAL_ERROR", message = "Internal server error", details = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function normalizeMessage(error) {
  if (error instanceof Error) {
    return error.message || "Unknown error";
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

function inferStatusAndCode(message) {
  const lower = message.toLowerCase();

  if (lower.includes("not found")) {
    return { status: 404, code: "NOT_FOUND" };
  }

  if (lower.includes("unauthorized") || lower.includes("invalid token") || lower.includes("not logged in")) {
    return { status: 401, code: "UNAUTHORIZED" };
  }

  if (lower.includes("forbidden") || lower.includes("localhost")) {
    return { status: 403, code: "FORBIDDEN" };
  }

  if (
    lower.includes("invalid json") ||
    lower.includes("unexpected token") ||
    lower.includes("missing required") ||
    lower.includes("must be") ||
    lower.includes("unsupported") ||
    lower.includes("invalid") ||
    lower.includes("schema") ||
    lower.includes("jsonpath") ||
    lower.includes("missing secret") ||
    lower.includes("secret name is required") ||
    lower.includes("source_type must be") ||
    lower.includes("unable to parse")
  ) {
    return { status: 422, code: "VALIDATION_ERROR" };
  }

  return { status: 500, code: "INTERNAL_ERROR" };
}

export function toApiError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  const message = normalizeMessage(error);
  const inferred = inferStatusAndCode(message);
  return new ApiError({
    status: inferred.status,
    code: inferred.code,
    message
  });
}

export function errorEnvelope({ code, message, details = null }, requestId) {
  return {
    success: false,
    data: null,
    error: {
      code,
      message,
      details
    },
    meta: {
      request_id: requestId,
      timestamp: new Date().toISOString()
    }
  };
}
