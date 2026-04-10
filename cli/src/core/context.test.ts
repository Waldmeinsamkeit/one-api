import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { refreshReadinessAfterSecretSet, upsertPendingSnapshotFromGen } from './context.js';

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
};

test('upsertPendingSnapshotFromGen writes detail and index files', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-context-'));
  try {
    await upsertPendingSnapshotFromGen({
      cwd,
      api_slug: 'weather',
      action: 'current',
      generated_adapter: {
        required_secrets: ['openai_api_key'],
      },
    });

    const detail = await readJson<{
      status: string;
      capability: { is_ready: boolean; missing_secrets: string[] };
    }>(path.join(cwd, '.av-cli', 'context', 'weather.current.json'));
    assert.equal(detail.status, 'pending');
    assert.equal(detail.capability.is_ready, false);
    assert.deepEqual(detail.capability.missing_secrets, ['openai_api_key']);

    const index = await readJson<{
      snapshots: Array<{ slug: string; action: string; status: string }>;
    }>(path.join(cwd, '.av-cli', 'context', 'index.json'));
    assert.equal(index.snapshots.length, 1);
    assert.equal(index.snapshots[0].slug, 'weather');
    assert.equal(index.snapshots[0].action, 'current');
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('upsertPendingSnapshotFromGen updates existing snapshot instead of duplicating', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-context-'));
  try {
    await upsertPendingSnapshotFromGen({
      cwd,
      api_slug: 'weather',
      action: 'current',
      generated_adapter: {
        required_secrets: ['openai_api_key'],
      },
    });

    await upsertPendingSnapshotFromGen({
      cwd,
      api_slug: 'weather',
      action: 'current',
      generated_adapter: {
        required_secrets: ['deepseek_api_key'],
      },
    });

    const index = await readJson<{
      snapshots: Array<{ slug: string; action: string; capability: { missing_secrets: string[] } }>;
    }>(path.join(cwd, '.av-cli', 'context', 'index.json'));
    assert.equal(index.snapshots.length, 1);
    assert.deepEqual(index.snapshots[0].capability.missing_secrets, ['deepseek_api_key']);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('refreshReadinessAfterSecretSet updates readiness and index', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-context-'));
  try {
    await upsertPendingSnapshotFromGen({
      cwd,
      api_slug: 'weather',
      action: 'current',
      generated_adapter: {
        required_secrets: ['openai_api_key'],
      },
    });

    const result = await refreshReadinessAfterSecretSet({
      cwd,
      secret_name: 'openai_api_key',
    });
    assert.equal(result.updated, 1);
    assert.equal(result.ready, 1);

    const detail = await readJson<{
      capability: { is_ready: boolean; missing_secrets: string[] };
    }>(path.join(cwd, '.av-cli', 'context', 'weather.current.json'));
    assert.equal(detail.capability.is_ready, true);
    assert.deepEqual(detail.capability.missing_secrets, []);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
