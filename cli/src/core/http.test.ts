import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiHttpClient, HttpClientError } from './http.js';

test('ApiHttpClient sends auth and workspace headers', async () => {
  let capturedHeaders: HeadersInit | undefined;
  let capturedBody = '';

  const client = new ApiHttpClient({
    backend_url: 'https://example.com/',
    token: 'token-1',
    workspace_id: 'ws-1',
    fetch_impl: async (_url, init) => {
      capturedHeaders = init?.headers;
      capturedBody = String(init?.body ?? '');
      return new Response(
        JSON.stringify({
          success: true,
          data: { ok: true },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  await client.generate({
    api_slug: 'users',
    action: 'list',
    source_type: 'curl',
    source_content: 'curl https://example.com',
  });

  const headers = capturedHeaders as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer token-1');
  assert.equal(headers['x-workspace-id'], 'ws-1');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(JSON.parse(capturedBody).api_slug, 'users');
});

test('ApiHttpClient executes and unwraps error payload', async () => {
  const client = new ApiHttpClient({
    backend_url: 'https://example.com',
    token: 'token-2',
    fetch_impl: async () =>
      new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid token',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
  });

  await assert.rejects(
    () => client.execute({ api_slug: 'users', action: 'list', payload: {} }),
    (error: unknown) =>
      error instanceof HttpClientError &&
      error.code === 'UNAUTHORIZED' &&
      error.status === 401 &&
      error.message === 'Invalid token',
  );
});

test('ApiHttpClient executions appends limit query', async () => {
  let capturedUrl = '';
  const client = new ApiHttpClient({
    backend_url: 'https://example.com',
    token: 'token-3',
    fetch_impl: async (url) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          success: true,
          data: [{ id: '1' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  await client.executions(25);
  assert.equal(capturedUrl, 'https://example.com/v1/executions?limit=25');
});

test('ApiHttpClient adapters hits list endpoint', async () => {
  let capturedUrl = '';
  const client = new ApiHttpClient({
    backend_url: 'https://example.com/',
    token: 'token-3',
    fetch_impl: async (url) => {
      capturedUrl = String(url);
      return new Response(
        JSON.stringify({
          success: true,
          data: [],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  await client.adapters();
  assert.equal(capturedUrl, 'https://example.com/v1/adapters');
});

test('ApiHttpClient allows empty success payloads', async () => {
  const client = new ApiHttpClient({
    backend_url: 'https://example.com',
    token: 'token-4',
    fetch_impl: async () =>
      new Response(null, {
        status: 204,
      }),
  });

  const result = await client.saveSecret({ name: 'openai_api_key', value: 'x' });
  assert.equal(result, undefined);
});

test('ApiHttpClient maps fetch failures to NETWORK_ERROR', async () => {
  const client = new ApiHttpClient({
    backend_url: 'https://example.com',
    token: 'token-5',
    fetch_impl: async () => {
      throw new Error('socket hang up');
    },
  });

  await assert.rejects(
    () => client.executions(),
    (error: unknown) =>
      error instanceof HttpClientError &&
      error.code === 'NETWORK_ERROR' &&
      error.message.includes('socket hang up'),
  );
});

test('ApiHttpClient reports INVALID_BODY on unserializable payload', async () => {
  const cyc: { self?: unknown } = {};
  cyc.self = cyc;

  const client = new ApiHttpClient({
    backend_url: 'https://example.com',
    token: 'token-6',
    fetch_impl: async () =>
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  await assert.rejects(
    () => client.execute({ api_slug: 'users', payload: cyc }),
    (error: unknown) => error instanceof HttpClientError && error.code === 'INVALID_BODY',
  );
});
