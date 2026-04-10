import type { ExecuteInput, GenerateAdapterInput, SaveSecretInput } from '../types/http.js';
import { CliError } from './errors.js';

interface HttpClientOptions {
  backend_url: string;
  token: string;
  workspace_id?: string;
  fetch_impl?: typeof fetch;
}

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
}

interface ApiErrorPayload {
  success?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
}

export class HttpClientError extends CliError {
  code: string;
  status: number;

  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message, { code: options?.code ?? 'HTTP_ERROR', exit_code: 1 });
    this.name = 'HttpClientError';
    this.code = options?.code ?? 'HTTP_ERROR';
    this.status = options?.status ?? 0;
  }
}

const trimSlash = (value: string): string => value.replace(/\/+$/, '');

const toHeaders = (token: string, workspaceId?: string): HeadersInit => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (workspaceId) {
    headers['x-workspace-id'] = workspaceId;
  }
  return headers;
};

const parseErrorPayload = (value: unknown): ApiErrorPayload => {
  if (!value || typeof value !== 'object') {
    return {};
  }
  const payload = value as ApiErrorPayload;
  return payload;
};

const parseMaybeJson = async (response: Response): Promise<unknown | undefined> => {
  if (response.status === 204) {
    return undefined;
  }
  const contentType = response.headers.get('content-type') || '';
  const rawText = await response.text();
  if (!rawText.trim()) {
    return undefined;
  }
  if (!contentType.toLowerCase().includes('json')) {
    throw new HttpClientError('Backend returned non-JSON response', {
      status: response.status,
      code: 'INVALID_RESPONSE',
    });
  }
  return JSON.parse(rawText);
};

const unwrapResponse = async <T>(response: Response): Promise<T | undefined> => {
  let parsed: unknown;
  try {
    parsed = await parseMaybeJson(response);
  } catch {
    if (response.ok) {
      throw new HttpClientError('Backend returned non-JSON response', {
        status: response.status,
        code: 'INVALID_RESPONSE',
      });
    }
    throw new HttpClientError(`Request failed with status ${response.status}`, {
      status: response.status,
      code: 'HTTP_ERROR',
    });
  }

  const payload = parseErrorPayload(parsed);
  if (!response.ok || payload.success === false) {
    throw new HttpClientError(payload.error?.message ?? `Request failed with status ${response.status}`, {
      status: response.status,
      code: payload.error?.code ?? 'HTTP_ERROR',
    });
  }

  if (parsed === undefined) {
    return undefined;
  }

  if (!('data' in (parsed as Record<string, unknown>))) {
    return undefined;
  }

  return (parsed as { data?: T }).data;
};

export class ApiHttpClient {
  private baseUrl: string;
  private token: string;
  private workspaceId?: string;
  private fetchImpl: typeof fetch;

  constructor(options: HttpClientOptions) {
    this.baseUrl = trimSlash(options.backend_url);
    this.token = options.token;
    this.workspaceId = options.workspace_id;
    this.fetchImpl = options.fetch_impl ?? fetch;
  }

  private async request<T>(options: RequestOptions): Promise<T | undefined> {
    const url = `${this.baseUrl}${options.path}`;
    let requestBody: string | undefined;
    if (options.body !== undefined) {
      try {
        requestBody = JSON.stringify(options.body);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new HttpClientError(`Failed to serialize request body: ${message}`, {
          code: 'INVALID_BODY',
        });
      }
    }

    try {
      const response = await this.fetchImpl(url, {
        method: options.method,
        headers: toHeaders(this.token, this.workspaceId),
        body: requestBody,
      });
      return await unwrapResponse<T>(response);
    } catch (error) {
      if (error instanceof HttpClientError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new HttpClientError(`Failed to connect backend: ${message}`, {
        code: 'NETWORK_ERROR',
      });
    }
  }

  generate<T = unknown>(body: GenerateAdapterInput): Promise<T | undefined> {
    return this.request({
      method: 'POST',
      path: '/v1/adapters/generate',
      body,
    });
  }

  execute<T = unknown>(body: ExecuteInput): Promise<T | undefined> {
    return this.request({
      method: 'POST',
      path: '/v1/execute',
      body,
    });
  }

  executions<T = unknown>(limit = 10): Promise<T[] | undefined> {
    const query = new URLSearchParams({ limit: String(limit) }).toString();
    return this.request({
      method: 'GET',
      path: `/v1/executions?${query}`,
    });
  }

  adapters<T = unknown>(): Promise<T[] | undefined> {
    return this.request({
      method: 'GET',
      path: '/v1/adapters',
    });
  }

  saveSecret<T = unknown>(body: SaveSecretInput): Promise<T | undefined> {
    return this.request({
      method: 'POST',
      path: '/v1/secrets',
      body,
    });
  }
}
