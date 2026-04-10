import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';

import { resolveConfig } from '../core/config.js';
import { upsertPendingSnapshotFromGen } from '../core/context.js';
import { ConfigError } from '../core/errors.js';
import { ApiHttpClient } from '../core/http.js';
import type { GenerateAdapterInput } from '../types/http.js';

interface GenOptions {
  file: string;
  type?: 'curl' | 'openapi' | 'raw';
  apiSlug: string;
  action: string;
  sourceUrl?: string;
  targetFormat?: string;
}

interface GenDeps {
  cwd?: string;
  readFileFn?: typeof readFile;
  resolveConfigFn?: typeof resolveConfig;
  createClient?: (args: {
    backend_url: string;
    token: string;
    workspace_id?: string;
  }) => {
    generate: (body: GenerateAdapterInput) => Promise<unknown>;
  };
}

export const genCommandHandler = async (options: GenOptions, deps: GenDeps = {}): Promise<void> => {
  if (!options.file) {
    throw new ConfigError('Missing --file');
  }
  const cwd = deps.cwd ?? process.cwd();
  const resolveConfigFn = deps.resolveConfigFn ?? resolveConfig;
  const readFileFn = deps.readFileFn ?? readFile;
  const resolved = await resolveConfigFn({ cwd });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new ConfigError('Missing backend_url or token. Run `av-cli init` first.');
  }

  const sourceContent = await readFileFn(options.file, 'utf8');
  const payload: GenerateAdapterInput = {
    api_slug: options.apiSlug,
    action: options.action,
    source_type: options.type || 'curl',
    source_content: sourceContent,
    source_url: options.sourceUrl,
    target_format: options.targetFormat,
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
  const data = await client.generate(payload);

  await upsertPendingSnapshotFromGen({
    cwd,
    api_slug: options.apiSlug,
    action: options.action,
    generated_adapter: data,
  });

  console.log(JSON.stringify({ success: true, data }, null, 2));
};

export const registerGenCommand = (program: Command): void => {
  program
    .command('gen')
    .description('Generate an adapter from the provided source')
    .requiredOption('-f, --file <path>', 'Source file path')
    .requiredOption('--api-slug <slug>', 'API slug')
    .requiredOption('--action <action>', 'Action name')
    .option('-t, --type <type>', 'Source type: curl|openapi|raw', 'curl')
    .option('--source-url <url>', 'Optional source url')
    .option('--target-format <format>', 'Optional target format')
    .action(genCommandHandler);
};
