import { config } from "../config.js";
import { validateAdapterSchema } from "./adapterSchema.js";
import { generateAdapterWithLlmOrFallback } from "./adapterGenerator.js";
import { encryptSecret, decryptSecret } from "../lib/cryptoVault.js";
import { renderTemplate } from "../lib/template.js";
import { mapResponse } from "../lib/jsonPath.js";
import { executeHttpRequest } from "../lib/httpExecutor.js";

function sanitizeTrace(trace) {
  return trace.map((item) => ({
    field: item.field,
    expression: item.expression,
    output_preview:
      item.expression.includes("secrets.") || item.field.toLowerCase().includes("authorization")
        ? "[REDACTED]"
        : item.output_preview
  }));
}

function sanitizeHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === "authorization" || k.toLowerCase().includes("api-key")) {
      out[k] = "[REDACTED]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

function collectSecretNames(value, out = new Set()) {
  if (typeof value === "string") {
    const matches = [...value.matchAll(/\{\{\s*secrets\.([a-zA-Z0-9_]+)\s*\}\}/g)];
    for (const match of matches) {
      out.add(match[1]);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectSecretNames(item, out);
    }
    return out;
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) {
      collectSecretNames(nested, out);
    }
  }
  return out;
}

export class PlatformService {
  constructor({ repositories, modelRegistry }) {
    this.repositories = repositories;
    this.modelRegistry = modelRegistry;
  }

  listModelProfiles() {
    return this.modelRegistry.list();
  }

  getActiveModelProfile(workspaceId) {
    const active = this.modelRegistry.getActive(workspaceId);
    if (!active) {
      return null;
    }
    return {
      ...active,
      api_key_configured: this.modelRegistry.isApiKeyConfigured(active.provider)
    };
  }

  activateModelProfile({ workspaceId, modelProfileId }) {
    return this.modelRegistry.setActive(workspaceId, modelProfileId);
  }

  updateModelPrompt({ modelProfileId, systemPrompt }) {
    return this.modelRegistry.updateSystemPrompt(modelProfileId, systemPrompt);
  }

  async generateAdapter({
    workspaceId,
    apiSlug,
    action,
    sourceType,
    sourceContent,
    sourceUrl,
    targetFormat
  }) {
    const profile = this.modelRegistry.getActive(workspaceId);
    // eslint-disable-next-line no-console
    console.log(
      `[adapter.generate] workspace=${workspaceId} provider=${profile?.provider ?? "none"} model=${
        profile?.model ?? "none"
      }`
    );
    const generation = await generateAdapterWithLlmOrFallback({
      apiSlug,
      action,
      sourceType,
      sourceContent,
      sourceUrl,
      targetFormat,
      modelProfile: profile
    });
    validateAdapterSchema(generation.adapter);
    const logicVersion = this.repositories.nextLogicVersion(workspaceId, apiSlug, action);
    const created = this.repositories.createAdapter({
      workspace_id: workspaceId,
      api_slug: generation.adapter.api_slug,
      action: generation.adapter.action,
      adapter_schema_version: generation.adapter.adapter_schema_version,
      logic_version: logicVersion,
      model_profile_id: profile?.id ?? null,
      spec: generation.adapter
    });
    return {
      ...created,
      generation_mode: generation.generation_mode,
      generation_warning: generation.generation_warning ?? null,
      source_excerpt: generation.source_excerpt
    };
  }

  validateAdapter(spec) {
    validateAdapterSchema(spec);
    return { valid: true };
  }

  publishAdapter({ workspaceId, adapterId }) {
    const record = this.repositories.getAdapterById(adapterId);
    if (!record || record.workspace_id !== workspaceId) {
      throw new Error("Adapter not found");
    }
    validateAdapterSchema(record.spec);
    return this.repositories.publishAdapter(workspaceId, adapterId);
  }

  listAdapters(workspaceId) {
    return this.repositories.listAdapters(workspaceId);
  }

  saveSecret({ workspaceId, name, value }) {
    const encrypted = encryptSecret(value, config.masterKey);
    const saved = this.repositories.upsertSecret({
      workspace_id: workspaceId,
      name,
      ...encrypted
    });
    return { name: saved.name, updated_at: saved.updated_at };
  }

  listSecrets(workspaceId) {
    return this.repositories.listSecrets(workspaceId);
  }

  deleteSecret({ workspaceId, name }) {
    if (!name || !String(name).trim()) {
      throw new Error("Secret name is required");
    }
    const deleted = this.repositories.deleteSecret(workspaceId, String(name).trim());
    if (!deleted) {
      throw new Error("Secret not found");
    }
    return { name: String(name).trim(), deleted: true };
  }

  async dryRun({ workspaceId, adapter, payload, tempSecrets = {} }) {
    validateAdapterSchema(adapter);
    const result = await this.executeAdapter({
      workspaceId,
      adapterRecord: {
        id: "dry-run",
        api_slug: adapter.api_slug,
        action: adapter.action,
        adapter_schema_version: adapter.adapter_schema_version,
        logic_version: adapter.logic_version ?? 0,
        spec: adapter
      },
      payload,
      tempSecrets,
      persistExecution: true,
      dryRun: true
    });
    return result;
  }

  async execute({ workspaceId, apiSlug, action, payload }) {
    const adapterRecord = this.repositories.findActiveAdapter(workspaceId, apiSlug, action);
    if (!adapterRecord) {
      throw new Error("Active adapter not found");
    }
    return this.executeAdapter({
      workspaceId,
      adapterRecord,
      payload,
      persistExecution: true,
      dryRun: false
    });
  }

  async executeAdapter({
    workspaceId,
    adapterRecord,
    payload,
    tempSecrets = null,
    persistExecution,
    dryRun = false
  }) {
    const started = Date.now();
    const trace = [];
    const context = {
      payload: payload ?? {},
      secrets: tempSecrets ?? this.resolveSecrets(workspaceId, adapterRecord.spec),
      meta: {
        workspace_id: workspaceId
      }
    };
    const spec = adapterRecord.spec;
    const renderedTarget = renderTemplate(spec.target, context, trace, "$.target");
    const headers = renderedTarget.headers ?? {};
    const url = new URL(renderedTarget.url);
    const queryParams = renderedTarget.query_params ?? {};
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const upstream = await executeHttpRequest({
      method: String(renderedTarget.method ?? "GET").toUpperCase(),
      url: url.toString(),
      headers,
      body: renderedTarget.body,
      timeoutMs: spec.policy?.timeout_ms ?? config.requestTimeoutMs,
      maxRedirects: config.maxRedirects,
      retryAttempts: spec.policy?.retry?.max_attempts ?? 1,
      allowPrivateIp: config.allowPrivateUpstream
    });

    const responseData = mapResponse(upstream.body, spec.response_mapping);
    const latencyMs = Date.now() - started;
    const unified = {
      success: upstream.status >= 200 && upstream.status < 300,
      data: responseData,
      error:
        upstream.status >= 200 && upstream.status < 300
          ? null
          : { code: "UPSTREAM_ERROR", message: "Upstream request failed", status: upstream.status },
      meta: {
        upstream_status: upstream.status,
        adapter_version: adapterRecord.logic_version,
        latency_ms: latencyMs
      }
    };

    if (persistExecution) {
      const expiration = new Date(Date.now() + config.traceRetentionDays * 24 * 60 * 60 * 1000);
      const execution = this.repositories.createExecution({
        workspace_id: workspaceId,
        api_slug: adapterRecord.api_slug,
        action: adapterRecord.action,
        dry_run: dryRun,
        success: unified.success,
        upstream_status: upstream.status,
        latency_ms: latencyMs,
        request_snapshot: {
          payload: payload ?? {},
          method: renderedTarget.method,
          url: url.toString(),
          headers: sanitizeHeaders(headers)
        },
        upstream_response: {
          status: upstream.status,
          headers: sanitizeHeaders(upstream.headers),
          body: upstream.body
        },
        final_output: unified,
        trace_snapshot: sanitizeTrace(trace),
        trace_enabled: true,
        trace_expire_at: expiration.toISOString(),
        response_meta: unified.meta
      });
      unified.meta.request_id = execution.id;
      unified.meta.trace_id = execution.id;
    } else {
      unified.meta.trace = sanitizeTrace(trace);
    }
    return unified;
  }

  resolveSecrets(workspaceId, spec) {
    const secrets = {};
    const secretNames = [...collectSecretNames(spec.target)];
    for (const secretName of secretNames) {
      const record = this.repositories.getSecret(workspaceId, secretName);
      if (!record) {
        throw new Error(`Missing secret: ${secretName}`);
      }
      secrets[secretName] = decryptSecret(record, config.masterKey);
    }
    return secrets;
  }

  getExecution(executionId) {
    this.repositories.cleanupExpiredTraces();
    const execution = this.repositories.getExecution(executionId);
    if (!execution) {
      return null;
    }
    return execution;
  }

  listExecutions(workspaceId, limit = 100) {
    this.repositories.cleanupExpiredTraces();
    return this.repositories.listExecutions(workspaceId, limit);
  }

  listGallery() {
    return this.repositories.listGallery();
  }

  cloneFromGallery({ workspaceId, adapterId }) {
    return this.repositories.cloneAdapterToWorkspace(adapterId, workspaceId);
  }

  submitPublicAdapter({ workspaceId, adapterId }) {
    return this.repositories.submitAdapterForPublicReview(workspaceId, adapterId);
  }

  reviewPublicAdapter({ adapterId, approved }) {
    return this.repositories.reviewAdapter(adapterId, approved);
  }

  deleteWorkspaceData(workspaceId) {
    if (!workspaceId) {
      throw new Error("workspaceId is required");
    }
    return this.repositories.deleteWorkspaceData(workspaceId);
  }
}
