import { buildSystemPrompt, buildUserPrompt } from "./promptTemplates.js";
import { generateAdapterByLlm } from "./llmClient.js";
import { assertSafeUrl } from "../lib/ssrf.js";
import { config } from "../config.js";
import { buildSkillPromptInstructions } from "./skillLibrary.js";

const AUTO_RAW_FALLBACK_WARNING =
  "No standard curl or OpenAPI format detected. System treated input as 'raw' text using heuristic reasoning.";

function isLikelyCurl(input) {
  if (!input || typeof input !== "string") {
    return false;
  }
  return /\bcurl(?:\.exe)?\b/i.test(input) && /https?:\/\/[^\s'"]+/i.test(input);
}

function isLikelyOpenApiText(input) {
  if (!input || typeof input !== "string") {
    return false;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return false;
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Boolean(
      parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        (parsed.openapi || parsed.swagger || parsed.paths)
    );
  } catch {
    return /(^|\n)\s*openapi\s*:/i.test(trimmed) || /(^|\n)\s*paths\s*:/i.test(trimmed);
  }
}

export function detectSourceType(input) {
  if (isLikelyCurl(input)) {
    return {
      detectedAs: "curl",
      effectiveType: "curl",
      confidence: "high",
      warnings: []
    };
  }
  if (isLikelyOpenApiText(input)) {
    return {
      detectedAs: "openapi",
      effectiveType: "openapi",
      confidence: "high",
      warnings: []
    };
  }
  return {
    detectedAs: "raw",
    effectiveType: "raw",
    confidence: "low",
    warnings: [AUTO_RAW_FALLBACK_WARNING]
  };
}

function normalizeSourceMode({ sourceType, sourceContent }) {
  if (sourceType === "auto") {
    return detectSourceType(sourceContent);
  }
  if (!["curl", "openapi", "raw"].includes(sourceType)) {
    throw new Error("source_type must be auto, openapi, curl, or raw");
  }
  return {
    detectedAs: sourceType,
    effectiveType: sourceType,
    confidence: "high",
    warnings: []
  };
}

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
  const mode = normalizeSourceMode({ sourceType, sourceContent });
  let parsed;
  if (mode.effectiveType === "curl") {
    parsed = parseCurl(sourceContent);
  } else if (mode.effectiveType === "openapi") {
    parsed = parseOpenApi(sourceContent);
  } else if (mode.effectiveType === "raw") {
    parsed = sourceUrl ? { method: "GET", url: sourceUrl } : parseCurl(sourceContent);
  }

  if (!parsed && sourceType === "auto") {
    parsed = sourceUrl ? { method: "GET", url: sourceUrl } : parseCurl(sourceContent);
  }
  if (!parsed) {
    throw new Error("Unable to parse API source");
  }

  return {
    adapter: {
      api_slug: apiSlug,
      action,
      adapter_schema_version: "1.0",
      logic_version: 1,
      auth_mode: "none",
      target: {
        url: parsed.url,
        method: parsed.method,
        headers: {
          Accept: "application/json"
        },
        query_params: {},
        body: null
      },
      response_mapping: {
        data: "$"
      },
      schema_hint: {},
      policy: {
        timeout_ms: 8000,
        retry: {
          max_attempts: 1
        }
      }
    },
    meta: {
      detected_as: mode.detectedAs,
      effective_source_type: mode.effectiveType,
      confidence: mode.confidence,
      warnings: [...mode.warnings]
    }
  };
}

function buildGenerationMeta({ sourceType, sourceContent }) {
  const mode = normalizeSourceMode({ sourceType, sourceContent });
  return {
    source_type: sourceType,
    detected_as: mode.detectedAs,
    effective_source_type: mode.effectiveType,
    confidence: mode.confidence,
    warnings: [...mode.warnings]
  };
}

function buildWarningPromptSuffix(generationMeta) {
  if (!generationMeta.warnings.length) {
    return "";
  }
  return "注意：该输入未通过严格的格式校验，可能包含混乱的文本片段、不完整的代码或口头描述。请尽你所能提取其中蕴含的 API 逻辑，忽略无关信息。";
}

function buildFallbackFromGeneratedSource({
  apiSlug,
  action,
  sourceType,
  sourceContent,
  sourceUrl,
  generationMeta
}) {
  const fallback = generateAdapterFromSource({
    apiSlug,
    action,
    sourceType,
    sourceContent,
    sourceUrl
  });
  return {
    ...fallback,
    meta: {
      ...fallback.meta,
      ...generationMeta,
      warnings: [...new Set([...(generationMeta.warnings || []), ...(fallback.meta.warnings || [])])]
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

async function resolveSourceContent({ sourceContent, sourceUrl }) {
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
  const normalizeUrl = (value) =>
    typeof value === "string" ? value.trim().replace(/[.,;!?]+$/, "") : value;
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
  if (merged.target?.url) {
    merged.target.url = normalizeUrl(merged.target.url);
  }
  if (!merged.response_mapping) {
    merged.response_mapping = { data: "$" };
  }
  if (!merged.schema_hint || typeof merged.schema_hint !== "object" || Array.isArray(merged.schema_hint)) {
    merged.schema_hint = {};
  }
  if (!merged.policy) {
    merged.policy = { timeout_ms: 8000, retry: { max_attempts: 1 } };
  }
  if (!merged.auth_mode || !["none", "secret"].includes(merged.auth_mode)) {
    const hasSecretPlaceholder = JSON.stringify(merged.target || {}).includes("{{secrets.");
    merged.auth_mode = hasSecretPlaceholder ? "secret" : "none";
  }
  return merged;
}

async function assertTargetReachable(targetUrl) {
  if (!config.enforceTargetReachability) {
    return;
  }
  if (!targetUrl || typeof targetUrl !== "string") {
    throw new Error("target.url is required for reachability check");
  }
  try {
    await assertSafeUrl(targetUrl, { allowPrivateIp: false });
  } catch {
    throw new Error(`target.url unreachable or blocked: ${targetUrl}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), config.targetReachabilityTimeoutMs);
  try {
    const response = await fetch(targetUrl, {
      method: "HEAD",
      redirect: "manual",
      signal: controller.signal
    });
    if (response.status >= 500) {
      return;
    }
    return;
  } catch {
    const controller2 = new AbortController();
    const timer2 = setTimeout(() => controller2.abort("timeout"), config.targetReachabilityTimeoutMs);
    try {
      await fetch(targetUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller2.signal
      });
      return;
    } catch {
      throw new Error(`target.url unreachable or blocked: ${targetUrl}`);
    } finally {
      clearTimeout(timer2);
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function generateAdapterWithLlmOrFallback({
  apiSlug,
  action,
  sourceType,
  sourceContent,
  sourceUrl,
  targetFormat,
  modelProfile,
  resolveApiKey
}) {
  const resolvedContent = await resolveSourceContent({ sourceContent, sourceUrl });
  const generationMeta = buildGenerationMeta({ sourceType, sourceContent: resolvedContent });
  const promptWarningSuffix = buildWarningPromptSuffix(generationMeta);

  if (modelProfile) {
    const systemPrompt =
      modelProfile.system_prompt?.trim() ||
      buildSystemPrompt({ skillInstructions: buildSkillPromptInstructions() });
    const userPrompt = buildUserPrompt({
      apiSlug,
      action,
      sourceType: generationMeta.effective_source_type,
      sourceContent: resolvedContent,
      targetFormat,
      warningPromptSuffix: promptWarningSuffix
    });
    try {
      const generated = await generateAdapterByLlm({
        profile: modelProfile,
        systemPrompt,
        userPrompt,
        resolveApiKey
      });
      const normalized = ensureAdapterDefaults(generated, { apiSlug, action });
      await assertTargetReachable(normalized.target?.url);
      return {
        adapter: normalized,
        generation_mode: "llm",
        source_excerpt: resolvedContent.slice(0, 500),
        generation_meta: generationMeta
      };
    } catch (error) {
      const fallback = buildFallbackFromGeneratedSource({
        apiSlug,
        action,
        sourceType: generationMeta.effective_source_type,
        sourceContent: resolvedContent,
        sourceUrl,
        generationMeta
      });
      await assertTargetReachable(fallback.adapter.target?.url);
      return {
        adapter: fallback.adapter,
        generation_mode: "fallback",
        generation_warning: String(error.message || error),
        source_excerpt: resolvedContent.slice(0, 500),
        generation_meta: fallback.meta
      };
    }
  }

  const fallback = buildFallbackFromGeneratedSource({
    apiSlug,
    action,
    sourceType: generationMeta.effective_source_type,
    sourceContent: resolvedContent,
    sourceUrl,
    generationMeta
  });
  await assertTargetReachable(fallback.adapter.target?.url);
  return {
    adapter: fallback.adapter,
    generation_mode: "fallback",
    source_excerpt: resolvedContent.slice(0, 500),
    generation_meta: fallback.meta
  };
}
