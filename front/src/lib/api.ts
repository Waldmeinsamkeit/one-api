import type {
  AdapterRecord,
  ApiEnvelope,
  ExecuteResult,
  ExecutionRecord,
  ModelProfile,
  PlatformTokenInfo,
  SecretRecord
} from "./types";

export class ApiClient {
  constructor(
    private baseUrl: string,
    private token: string,
    private workspaceId: string
  ) {}

  setAuth(token: string, workspaceId: string) {
    this.token = token;
    this.workspaceId = workspaceId;
  }

  async request<T>(path: string, options: RequestInit = {}, unwrapEnvelope = true): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.token}`,
        "x-workspace-id": this.workspaceId,
        ...(options.headers || {})
      }
    });
    const json = await response.json();
    if (!response.ok) {
      throw new Error(json?.error?.message ?? `请求失败: ${response.status}`);
    }
    if (unwrapEnvelope && typeof json.success === "boolean" && "data" in json && !("meta" in json)) {
      const envelope = json as ApiEnvelope<T>;
      return envelope.data;
    }
    return json as T;
  }

  listAdapters() {
    return this.request<AdapterRecord[]>("/v1/adapters");
  }

  generateAdapter(payload: Record<string, unknown>) {
    return this.request<AdapterRecord>("/v1/adapters/generate", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  publishAdapter(adapterId: string) {
    return this.request<AdapterRecord>("/v1/adapters/publish", {
      method: "POST",
      body: JSON.stringify({ adapter_id: adapterId })
    });
  }

  dryRun(adapter: unknown, payload: Record<string, unknown>, tempSecrets: Record<string, string>) {
    return this.request<ExecuteResult>("/v1/adapters/dry-run", {
      method: "POST",
      body: JSON.stringify({ adapter, payload, temp_secrets: tempSecrets })
    }, false);
  }

  listSecrets() {
    return this.request<SecretRecord[]>("/v1/secrets");
  }

  saveSecret(name: string, value: string) {
    return this.request<{ name: string; updated_at: string }>("/v1/secrets", {
      method: "POST",
      body: JSON.stringify({ name, value })
    });
  }

  deleteSecret(name: string) {
    return this.request<{ name: string; deleted: boolean }>("/v1/secrets/delete", {
      method: "POST",
      body: JSON.stringify({ name })
    });
  }

  listExecutions(limit = 100) {
    return this.request<ExecutionRecord[]>(`/v1/executions?limit=${limit}`);
  }

  getExecution(id: string) {
    return this.request<ExecutionRecord>(`/v1/executions/${id}`);
  }

  listModels() {
    return this.request<ModelProfile[]>("/v1/models");
  }

  getActiveModel() {
    return this.request<ModelProfile | null>("/v1/models/active");
  }

  activateModel(modelProfileId: string) {
    return this.request<ModelProfile>("/v1/models/activate", {
      method: "POST",
      body: JSON.stringify({ model_profile_id: modelProfileId })
    });
  }

  getPlatformTokenInfo() {
    return this.request<PlatformTokenInfo>("/v1/platform-token");
  }

  rotatePlatformToken() {
    return this.request<{ token: string; masked: string; rotated_at: string }>("/v1/platform-token/rotate", {
      method: "POST",
      body: JSON.stringify({})
    });
  }
}
