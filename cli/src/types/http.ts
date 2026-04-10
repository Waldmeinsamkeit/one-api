export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
}

export interface GenerateAdapterInput {
  api_slug: string;
  action: string;
  source_type: 'curl' | 'openapi' | 'raw';
  source_content?: string;
  source_url?: string;
  target_format?: string;
}

export interface ExecuteInput {
  api_slug: string;
  action?: string;
  payload?: unknown;
  options?: {
    include_hint?: boolean;
  };
}

export interface SaveSecretInput {
  name: string;
  value: string;
}
