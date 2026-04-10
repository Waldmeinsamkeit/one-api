import type { Command } from 'commander';

import { resolveConfig } from '../core/config.js';
import { ConfigError } from '../core/errors.js';
import { ApiHttpClient } from '../core/http.js';

interface LogsOptions {
  tail?: string;
}

const sleep = async (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const toArray = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
};

interface LogsDeps {
  cwd?: string;
  resolveConfigFn?: typeof resolveConfig;
  createClient?: (args: {
    backend_url: string;
    token: string;
    workspace_id?: string;
  }) => {
    executions: (limit?: number) => Promise<unknown>;
  };
  sleepFn?: (ms: number) => Promise<void>;
  maxPolls?: number;
}

export const logsCommandHandler = async (options: LogsOptions, deps: LogsDeps = {}): Promise<void> => {
  const cwd = deps.cwd ?? process.cwd();
  const resolveConfigFn = deps.resolveConfigFn ?? resolveConfig;
  const resolved = await resolveConfigFn({ cwd });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new ConfigError('Missing backend_url or token. Run `av-cli init` first.');
  }

  const tail = Number(options.tail || '10');
  const client =
    deps.createClient?.({
      backend_url: resolved.backend_url.value,
      token: resolved.token.value,
      workspace_id: resolved.workspace_id.value,
    }) ??
    new ApiHttpClient({
      backend_url: resolved.backend_url.value,
      token: resolved.token.value,
      workspace_id: resolved.workspace_id.value,
    });
  const sleepFn = deps.sleepFn ?? sleep;

  const seen = new Set<string>();
  let stopped = false;
  let polls = 0;
  const onSigint = (): void => {
    stopped = true;
  };
  process.on('SIGINT', onSigint);

  try {
    while (!stopped) {
      if (deps.maxPolls !== undefined && polls >= deps.maxPolls) {
        break;
      }
      const rows = toArray(await client.executions(tail));
      for (const row of rows) {
        const id = String(row.id ?? '');
        if (!id || seen.has(id)) {
          continue;
        }
        seen.add(id);
        console.log(JSON.stringify(row));
      }
      polls += 1;
      await sleepFn(2000);
    }
  } finally {
    process.off('SIGINT', onSigint);
  }
};

export const registerLogsCommand = (program: Command): void => {
  program
    .command('logs')
    .description('Stream recent execution logs')
    .option('--tail <n>', 'Number of logs to pull each poll', '10')
    .action(logsCommandHandler);
};
