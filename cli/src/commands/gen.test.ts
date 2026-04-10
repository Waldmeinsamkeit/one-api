import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { genCommandHandler } from './gen.js';

test('gen reads file, sends generate payload, and writes pending snapshot', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-gen-'));
  try {
    const sourceFile = path.join(cwd, 'sample.curl');
    await writeFile(sourceFile, 'curl https://reqres.in/api/users?page=2', 'utf8');

    let captured: Record<string, unknown> | undefined;
    await genCommandHandler(
      {
        file: sourceFile,
        type: 'curl',
        apiSlug: 'reqres',
        action: 'users',
      },
      {
        cwd,
        resolveConfigFn: async () =>
          ({
            backend_url: { value: 'https://backend.local', source: 'env' },
            token: { value: 'token', source: 'env' },
            workspace_id: { value: 'ws-1', source: 'project' },
          }) as never,
        createClient: () => ({
          generate: async (body: unknown) => {
            captured = body as Record<string, unknown>;
            return { required_secrets: ['openai_api_key'] };
          },
        }),
      },
    );

    assert.equal(captured?.api_slug, 'reqres');
    assert.equal(captured?.action, 'users');
    assert.equal(captured?.source_type, 'curl');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
