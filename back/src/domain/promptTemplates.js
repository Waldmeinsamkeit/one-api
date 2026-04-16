const ADAPTER_SCHEMA_TEMPLATE = {
  api_slug: "string",
  action: "string",
  adapter_schema_version: "1.0",
  logic_version: 1,
  auth_mode: "none|secret",
  target: {
    url: "https://example.com/path",
    method: "GET|POST|PUT|PATCH|DELETE|HEAD",
    headers: {
      Accept: "application/json"
    },
    query_params: {
      any_field: "{{payload.some_field}}"
    },
    body: null
  },
  response_mapping: {
    data: "$"
  },
  schema_hint: {
    data: {
      type: "object",
      desc: "Mapped unified data object"
    }
  }, // optional lightweight metadata for mapped fields
  auth_ref: {
    secret_name: "api_key",
    placement: "header|query",
    key: "Authorization|appid",
    prefix: "Bearer "
  }, // required when auth_mode=secret, omit when auth_mode=none
  policy: {
    timeout_ms: 8000,
    retry: {
      max_attempts: 1
    }
  }
};

export function buildSystemPrompt({ skillInstructions = "" } = {}) {
  const base = [
    "You are an API adapter compiler.",
    "Task: convert third-party API description into deterministic adapter JSON.",
    "Output JSON only. No markdown. No comments.",
    "Never include secret values, only secret placeholders like {{secrets.api_key}}.",
    "Expression language is restricted to these functions: coalesce, to_string, to_number, eq, if.",
    "Use JSONPath in response_mapping for extraction.",
    "Use explicit auth_mode: none or secret.",
    "If upstream API does not require auth, set auth_mode=none and do NOT add Authorization or auth_ref.",
    "If upstream API requires auth, set auth_mode=secret and include auth_ref + secrets placeholders.",
    "Adapter schema should follow this structure (auth_ref optional):",
    JSON.stringify(ADAPTER_SCHEMA_TEMPLATE)
  ];
  if (skillInstructions) {
    base.push(
      "Skill execution workflow: first use web_search to find candidate docs, then use web_fetch to read target pages, then summarize and extract deterministic adapter fields."
    );
    base.push(skillInstructions);
  }
  return base.join("\n");
}

export function buildUserPrompt({
  apiSlug,
  action,
  sourceType,
  sourceContent,
  targetFormat,
  warningPromptSuffix = ""
}) {
  const requestedTarget =
    targetFormat ||
    JSON.stringify(
      {
        unified_request: {
          api_slug: "string",
          action: "string",
          payload: {}
        },
        unified_response: {
          success: "boolean",
          data: {},
          error: { code: "string", message: "string" },
          meta: { upstream_status: "number", adapter_version: "number" }
        }
      },
      null,
      2
    );

  return [
    `api_slug: ${apiSlug}`,
    `action: ${action}`,
    `source_type: ${sourceType}`,
    "source_content:",
    sourceContent,
    "target_unified_contract:",
    requestedTarget,
    "Generate the best adapter JSON for this API and contract.",
    "Use adapter_schema_version=1.0 and logic_version=1.",
    "If source has multiple endpoints, choose the endpoint that best matches action.",
    "Also generate schema_hint for mapped output fields. Keep it lightweight: type/format/desc/enum/unit.",
    warningPromptSuffix
  ].join("\n");
}
