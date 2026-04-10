import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { logsCommandHandler } from './logs.js';

test('logs deduplicates by id across polling cycles', async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'av-cli-logs-'));
  const rows = [
    [{ id: '1', status: 'success' }],
    [{ id: '1', status: 'success' }, { id: '2', status: 'failed' }],
  ];
  const printed: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (...args: unknown[]) => {
      printed.push(args.join(' '));
    };

    await logsCommandHandler(
      { tail: '10' },
      {
        cwd,
        maxPolls: 2,
        sleepFn: async () => {},
        resolveConfigFn: async () =>
          ({
            backend_url: { value: 'https://backend.local', source: 'env' },
            token: { value: 'token', source: 'env' },
            workspace_id: { value: 'ws-1', source: 'project' },
          }) as never,
        createClient: () => ({
          executions: async () => rows.shift() ?? [],
        }),
      },
    );

    assert.equal(printed.length, 2);
    assert.ok(printed[0].includes('"id":"1"'));
    assert.ok(printed[1].includes('"id":"2"'));
  } finally {
    console.log = originalLog;
    await rm(cwd, { recursive: true, force: true });
  }
});
