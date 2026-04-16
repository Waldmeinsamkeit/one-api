export type ViewKey = "adapters" | "secrets" | "llm" | "logs" | "playground" | "guide";
export type SourceType = "auto" | "curl" | "openapi" | "raw";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
};

export type AdapterRecord = {
  id: string;
  api_slug: string;
  action: string;
  status: "draft" | "active" | "archived";
  logic_version: number;
  adapter_schema_version: string;
  generation_mode?: "llm" | "fallback";
  generation_warning?: string | null;
  spec: Record<string, unknown>;
  updated_at: string;
};

export type AdapterGenerateMeta = {
  detected_as?: "curl" | "openapi" | "raw";
  confidence?: "high" | "medium" | "low";
  warnings?: string[];
};

export type AdapterGenerateResponse = {
  success: boolean;
  data: AdapterRecord;
  meta?: AdapterGenerateMeta;
};

export type SecretRecord = {
  name: string;
  algorithm: string;
  updated_at: string;
};

export type ExecutionRecord = {
  id: string;
  api_slug: string;
  action: string;
  dry_run?: boolean;
  upstream_status: number;
  latency_ms: number;
  created_at: string;
  trace_snapshot?: unknown;
  request_snapshot?: unknown;
  upstream_response?: unknown;
  final_output?: unknown;
};

export type ExecuteResult = {
  success: boolean;
  data: unknown;
  error: unknown;
  meta: Record<string, unknown>;
};

export type ModelProfile = {
  id: string;
  provider: string;
  model: string;
  status: string;
  system_prompt?: string;
  schema_id?: string;
  api_key_configured: boolean;
};

export type PlatformTokenInfo = {
  masked: string;
  length: number;
};
