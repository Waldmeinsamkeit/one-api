import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

import { resolveConfig } from '../core/config.js';
import { ConfigError } from '../core/errors.js';
import { ApiHttpClient } from '../core/http.js';
import type { ContextIndex } from '../types/context.js';
import type { ExecuteInput } from '../types/http.js';

interface RunOptions {
  action?: string;
  payload?: string;
  includeHint?: boolean;
}

const readContextIndex = async (cwd: string): Promise<ContextIndex | undefined> => {
  const indexPath = path.join(cwd, '.av-cli', 'context', 'index.json');
  try {
    const content = await readFile(indexPath, 'utf8');
    return JSON.parse(content) as ContextIndex;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const resolveAction = async (cwd: string, slug: string, action?: string): Promise<string> => {
  if (action) {
    return action;
  }
  const index = await readContextIndex(cwd);
  const matched = index?.snapshots.filter((item) => item.slug === slug) ?? [];
  if (matched.length === 1) {
    return matched[0].action;
  }
  if (matched.length > 1) {
    throw new ConfigError(`Multiple actions found for slug "${slug}", please specify --action.`);
  }
  throw new ConfigError(`Missing --action and no local snapshot found for slug "${slug}".`);
};

const parsePayload = (raw?: string): unknown => {
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Invalid --payload JSON: ${message}`);
  }
};

interface RunDeps {
  cwd?: string;
  resolveConfigFn?: typeof resolveConfig;
  createClient?: (args: {
    backend_url: string;
    token: string;
    workspace_id?: string;
  }) => {
    execute: (body: ExecuteInput) => Promise<unknown>;
  };
}

export const runCommandHandler = async (
  slug: string,
  options: RunOptions,
  deps: RunDeps = {},
): Promise<void> => {
  const cwd = deps.cwd ?? process.cwd();
  const resolveConfigFn = deps.resolveConfigFn ?? resolveConfig;
  const resolved = await resolveConfigFn({ cwd });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new ConfigError('Missing backend_url or token. Run `av-cli init` first.');
  }

  const action = await resolveAction(cwd, slug, options.action);
  const payload = parsePayload(options.payload);
  const body: ExecuteInput = {
    api_slug: slug,
    action,
    payload,
    options: options.includeHint ? { include_hint: true } : undefined,
  };

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
  const data = await client.execute(body);
  console.log(JSON.stringify({ success: true, data }, null, 2));
};

export const registerRunCommand = (program: Command): void => {
  program
    .command('run')
    .description('Run an adapter action')
    .argument('<slug>', 'API slug')
    .option('--action <action>', 'Action name')
    .option('--payload <json>', 'JSON payload')
    .option('--include-hint', 'Forward options.include_hint=true')
    .action(runCommandHandler);
};
