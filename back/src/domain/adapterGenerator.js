import { buildSystemPrompt, buildUserPrompt } from "./promptTemplates.js";
import { generateAdapterByLlm } from "./llmClient.js";
import { assertSafeUrl } from "../lib/ssrf.js";

function parseCurl(input) {
  const method = (input.match(/-X\s+([A-Z]+)/i)?.[1] ?? "GET").toUpperCase();
  const url = input.match(/https?:\/\/[^\s'"]+/)?.[0] ?? "https://example.com";
  return { method, url };
}

function parseOpenApi(input) {
  try {
    const doc = JSON.parse(input);
    const firstPath = Object.keys(doc.paths ?? {})[0];
    if (!firstPath) {
      return null;
    }
    const entry = doc.paths[firstPath];
    const method = Object.keys(entry)[0]?.toUpperCase();
    const server = doc.servers?.[0]?.url ?? "https://example.com";
    return { method: method || "GET", url: `${server.replace(/\/$/, "")}${firstPath}` };
  } catch {
    return null;
  }
}

export function generateAdapterFromSource({ apiSlug, action, sourceType, sourceContent, sourceUrl }) {
  let parsed;
  if (sourceType === "curl") {
    parsed = parseCurl(sourceContent);
  } else if (sourceType === "openapi") {
    parsed = parseOpenApi(sourceContent);
  } else if (sourceType === "raw") {
    parsed = sourceUrl
      ? { method: "GET", url: sourceUrl }
      : parseCurl(sourceContent);
  } else {
    throw new Error("source_type must be openapi, curl, or raw");
  }

  if (!parsed) {
    throw new Error("Unable to parse API source");
  }

  return {
    api_slug: apiSlug,
    action,
    adapter_schema_version: "1.0",
    logic_version: 1,
    target: {
      url: parsed.url,
      method: parsed.method,
      headers: {
        Accept: "application/json",
        Authorization: "Bearer {{secrets.api_key}}"
      },
      query_params: {},
      body: null
    },
    response_mapping: {
      data: "$"
    },
    auth_ref: {
      secret_name: "api_key",
      placement: "header",
      key: "Authorization",
      prefix: "Bearer "
    },
    policy: {
      timeout_ms: 8000,
      retry: {
        max_attempts: 1
      }
    }
  };
}

function stripHtml(html) {
  return html
    .replaceAll(/<script[\s\S]*?<\/script>/gi, " ")
    .replaceAll(/<style[\s\S]*?<\/style>/gi, " ")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

async function resolveSourceContent({ sourceType, sourceContent, sourceUrl }) {
  if (sourceContent && sourceContent.trim()) {
    return sourceContent.trim();
  }
  if (!sourceUrl) {
    throw new Error("Either source_content or source_url is required");
  }
  await assertSafeUrl(sourceUrl, { allowPrivateIp: false });
  const response = await fetch(sourceUrl, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Failed to fetch source_url: ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("html")) {
    return stripHtml(text).slice(0, 15000);
  }
  return text.slice(0, 15000);
}

function ensureAdapterDefaults(adapter, { apiSlug, action }) {
  const merged = {
    ...adapter,
    api_slug: adapter.api_slug || apiSlug,
    action: adapter.action || action,
    adapter_schema_version: String(adapter.adapter_schema_version || "1.0"),
    logic_version: Number(adapter.logic_version || 1)
  };
  if (!merged.target?.headers) {
    merged.target = { ...(merged.target || {}), headers: { Accept: "application/json" } };
  }
  if (!merged.response_mapping) {
    merged.response_mapping = { data: "$" };
  }
  if (!merged.policy) {
    merged.policy = { timeout_ms: 8000, retry: { max_attempts: 1 } };
  }
  if (!merged.auth_ref) {
    merged.auth_ref = {
      secret_name: "api_key",
      placement: "header",
      key: "Authorization",
      prefix: "Bearer "
    };
  }
  return merged;
}

export async function generateAdapterWithLlmOrFallback({
  apiSlug,
  action,
  sourceType,
  sourceContent,
  sourceUrl,
  targetFormat,
  modelProfile
}) {
  const resolvedContent = await resolveSourceContent({ sourceType, sourceContent, sourceUrl });
  if (modelProfile) {
    const systemPrompt = modelProfile.system_prompt?.trim() || buildSystemPrompt();
    const userPrompt = buildUserPrompt({
      apiSlug,
      action,
      sourceType,
      sourceContent: resolvedContent,
      targetFormat
    });
    try {
      const generated = await generateAdapterByLlm({
        profile: modelProfile,
        systemPrompt,
        userPrompt
      });
      return {
        adapter: ensureAdapterDefaults(generated, { apiSlug, action }),
        generation_mode: "llm",
        source_excerpt: resolvedContent.slice(0, 500)
      };
    } catch (error) {
      const fallback = generateAdapterFromSource({
        apiSlug,
        action,
        sourceType,
        sourceContent: resolvedContent,
        sourceUrl
      });
      return {
        adapter: fallback,
        generation_mode: "fallback",
        generation_warning: String(error.message || error),
        source_excerpt: resolvedContent.slice(0, 500)
      };
    }
  }

  const fallback = generateAdapterFromSource({
    apiSlug,
    action,
    sourceType,
    sourceContent: resolvedContent,
    sourceUrl
  });
  return {
    adapter: fallback,
    generation_mode: "fallback",
    source_excerpt: resolvedContent.slice(0, 500)
  };
}
