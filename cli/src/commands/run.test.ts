import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runCommandHandler } from './run.js';
import { ConfigError } from '../core/errors.js';

test('run forwards options.include_hint and payload', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-run-'));
  try {
    let captured: Record<string, unknown> | undefined;
    await runCommandHandler(
      'weather',
      { action: 'current', payload: '{"city":"shanghai"}', includeHint: true },
      {
        cwd,
        resolveConfigFn: async () =>
          ({
            backend_url: { value: 'https://backend.local', source: 'env' },
            token: { value: 'token', source: 'env' },
            workspace_id: { value: 'ws-1', source: 'project' },
          }) as never,
        createClient: () => ({
          execute: async (body: unknown) => {
            captured = body as Record<string, unknown>;
            return { ok: true };
          },
        }),
      },
    );

    assert.equal(captured?.api_slug, 'weather');
    assert.equal(captured?.action, 'current');
    assert.deepEqual(captured?.payload, { city: 'shanghai' });
    assert.deepEqual(captured?.options, { include_hint: true });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('run throws when slug has multiple actions and action not provided', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-run-'));
  try {
    const contextDir = path.join(cwd, '.av-cli', 'context');
    await mkdir(contextDir, { recursive: true });
    await writeFile(
      path.join(contextDir, 'index.json'),
      JSON.stringify(
        {
          snapshots: [
            { slug: 'weather', action: 'current', status: 'pending', updatedAt: new Date().toISOString() },
            { slug: 'weather', action: 'forecast', status: 'pending', updatedAt: new Date().toISOString() },
          ],
        },
        null,
        2,
      ),
      'utf8',
    );

    await assert.rejects(
      () =>
        runCommandHandler('weather', {}, {
          cwd,
          resolveConfigFn: async () =>
            ({
              backend_url: { value: 'https://backend.local', source: 'env' },
              token: { value: 'token', source: 'env' },
              workspace_id: { value: 'ws-1', source: 'project' },
            }) as never,
          createClient: () =>
            ({
              execute: async () => ({}),
            }) as never,
        }),
      (error: unknown) => error instanceof ConfigError,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
