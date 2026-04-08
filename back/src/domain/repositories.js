import crypto from "node:crypto";

function nowIso() {
  return new Date().toISOString();
}

function keyFor(workspaceId, apiSlug, action) {
  return `${workspaceId}::${apiSlug}::${action}`;
}

export class InMemoryRepositories {
  constructor() {
    this.adapters = [];
    this.secrets = [];
    this.executions = [];
  }

  nextLogicVersion(workspaceId, apiSlug, action) {
    const list = this.adapters.filter(
      (a) => a.workspace_id === workspaceId && a.api_slug === apiSlug && a.action === action
    );
    const max = list.reduce((acc, item) => Math.max(acc, item.logic_version ?? 0), 0);
    return max + 1;
  }

  createAdapter(adapter) {
    const record = {
      id: crypto.randomUUID(),
      status: "draft",
      is_public: false,
      review_status: "private",
      created_at: nowIso(),
      updated_at: nowIso(),
      ...adapter
    };
    this.adapters.push(record);
    return record;
  }

  updateAdapter(id, patch) {
    const idx = this.adapters.findIndex((a) => a.id === id);
    if (idx < 0) {
      return null;
    }
    this.adapters[idx] = { ...this.adapters[idx], ...patch, updated_at: nowIso() };
    return this.adapters[idx];
  }

  submitAdapterForPublicReview(workspaceId, adapterId) {
    const adapter = this.getAdapterById(adapterId);
    if (!adapter || adapter.workspace_id !== workspaceId) {
      throw new Error("Adapter not found");
    }
    adapter.review_status = "pending";
    adapter.updated_at = nowIso();
    return adapter;
  }

  reviewAdapter(adapterId, approved) {
    const adapter = this.getAdapterById(adapterId);
    if (!adapter) {
      throw new Error("Adapter not found");
    }
    adapter.review_status = approved ? "approved" : "rejected";
    adapter.is_public = approved;
    adapter.updated_at = nowIso();
    return adapter;
  }

  getAdapterById(id) {
    return this.adapters.find((a) => a.id === id) ?? null;
  }

  publishAdapter(workspaceId, adapterId) {
    const target = this.getAdapterById(adapterId);
    if (!target || target.workspace_id !== workspaceId) {
      throw new Error("Adapter not found");
    }
    for (const item of this.adapters) {
      if (
        item.workspace_id === workspaceId &&
        item.api_slug === target.api_slug &&
        item.action === target.action &&
        item.status === "active"
      ) {
        item.status = "archived";
      }
    }
    target.status = "active";
    target.updated_at = nowIso();
    return target;
  }

  findActiveAdapter(workspaceId, apiSlug, action) {
    return (
      this.adapters.find(
        (a) =>
          a.workspace_id === workspaceId &&
          a.api_slug === apiSlug &&
          a.action === action &&
          a.status === "active"
      ) ?? null
    );
  }

  listAdapters(workspaceId) {
    return this.adapters
      .filter((a) => a.workspace_id === workspaceId)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  listGallery() {
    return this.adapters.filter(
      (a) => a.status === "active" && a.is_public && a.review_status === "approved"
    );
  }

  cloneAdapterToWorkspace(adapterId, workspaceId) {
    const source = this.getAdapterById(adapterId);
    if (!source || !source.is_public || source.review_status !== "approved") {
      throw new Error("Public adapter not found");
    }
    return this.createAdapter({
      workspace_id: workspaceId,
      api_slug: source.api_slug,
      action: source.action,
      adapter_schema_version: source.adapter_schema_version,
      logic_version: this.nextLogicVersion(workspaceId, source.api_slug, source.action),
      spec: source.spec
    });
  }

  upsertSecret(secret) {
    const idx = this.secrets.findIndex(
      (s) => s.workspace_id === secret.workspace_id && s.name === secret.name
    );
    const record = { ...secret, updated_at: nowIso(), created_at: nowIso() };
    if (idx >= 0) {
      this.secrets[idx] = { ...this.secrets[idx], ...record };
      return this.secrets[idx];
    }
    this.secrets.push(record);
    return record;
  }

  getSecret(workspaceId, name) {
    return this.secrets.find((s) => s.workspace_id === workspaceId && s.name === name) ?? null;
  }

  listSecrets(workspaceId) {
    return this.secrets
      .filter((s) => s.workspace_id === workspaceId)
      .map((s) => ({
        workspace_id: s.workspace_id,
        name: s.name,
        algorithm: s.algorithm,
        created_at: s.created_at,
        updated_at: s.updated_at
      }))
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  createExecution(execution) {
    const record = {
      id: crypto.randomUUID(),
      created_at: nowIso(),
      ...execution
    };
    this.executions.push(record);
    return record;
  }

  getExecution(id) {
    return this.executions.find((e) => e.id === id) ?? null;
  }

  listExecutions(workspaceId, limit = 100) {
    return this.executions
      .filter((e) => e.workspace_id === workspaceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, limit);
  }

  cleanupExpiredTraces(now = Date.now()) {
    for (const execution of this.executions) {
      if (execution.trace_expire_at && now > new Date(execution.trace_expire_at).getTime()) {
        execution.trace_snapshot = null;
      }
    }
  }
}

export { keyFor };
