import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ConfigError } from '../core/errors.js';
import { secretsSetHandler } from './secrets.js';

test('secrets set parses key=value and calls backend', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-secrets-'));
  try {
    let captured: { name: string; value: string } | undefined;
    await secretsSetHandler('openai_api_key=sk-123', {
      cwd,
      resolveConfigFn: async () =>
        ({
          backend_url: { value: 'https://backend.local', source: 'env' },
          token: { value: 'token', source: 'env' },
          workspace_id: { value: 'ws-1', source: 'project' },
        }) as never,
      createClient: () => ({
        saveSecret: async (payload: { name: string; value: string }) => {
          captured = payload;
          return { ok: true };
        },
      }),
    });

    assert.deepEqual(captured, { name: 'openai_api_key', value: 'sk-123' });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('secrets set rejects invalid input format', async () => {
  await assert.rejects(
    () => secretsSetHandler('invalid-format'),
    (error: unknown) => error instanceof ConfigError,
  );
});
