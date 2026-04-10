import type { Command } from 'commander';

import { resolveConfig } from '../core/config.js';
import { refreshReadinessAfterSecretSet } from '../core/context.js';
import { ConfigError } from '../core/errors.js';
import { ApiHttpClient } from '../core/http.js';
import type { SaveSecretInput } from '../types/http.js';

const parseSecretArg = (raw: string): { name: string; value: string } => {
  const idx = raw.indexOf('=');
  if (idx <= 0 || idx === raw.length - 1) {
    throw new ConfigError('Invalid secret format. Use key=value');
  }
  return {
    name: raw.slice(0, idx),
    value: raw.slice(idx + 1),
  };
};

interface SecretsDeps {
  cwd?: string;
  resolveConfigFn?: typeof resolveConfig;
  createClient?: (args: {
    backend_url: string;
    token: string;
    workspace_id?: string;
  }) => {
    saveSecret: (body: SaveSecretInput) => Promise<unknown>;
  };
}

export const secretsSetHandler = async (raw: string, deps: SecretsDeps = {}): Promise<void> => {
  const { name, value } = parseSecretArg(raw);
  const cwd = deps.cwd ?? process.cwd();
  const resolveConfigFn = deps.resolveConfigFn ?? resolveConfig;
  const resolved = await resolveConfigFn({ cwd });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new ConfigError('Missing backend_url or token. Run `av-cli init` first.');
  }

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
  await client.saveSecret({ name, value });
  const readiness = await refreshReadinessAfterSecretSet({
    cwd,
    secret_name: name,
  });
  console.log(JSON.stringify({ success: true, saved: name, readiness }, null, 2));
};

export const registerSecretsCommand = (program: Command): void => {
  const secrets = program.command('secrets').description('Manage adapter secrets');
  secrets
    .command('set')
    .description('Set a secret key/value pair')
    .argument('<pair>', 'key=value')
    .action(secretsSetHandler);
};
