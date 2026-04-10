import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Command } from 'commander';

import { resolveConfig } from '../core/config.js';
import { ConfigError } from '../core/errors.js';
import { getGlobalConfigPath, getProjectConfigPath } from '../core/paths.js';
import { normalizeGlobalConfig, normalizeProjectConfig } from '../core/validate.js';
import type { GlobalConfig, ProjectConfig } from '../types/config.js';

interface InitOptions {
  backendUrl?: string;
  token?: string;
  workspaceId?: string;
  profile?: string;
  adapterDir?: string;
  preferredModel?: string;
}

const readJsonIfExists = async <T>(filePath: string): Promise<T | undefined> => {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content) as T;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

export const initCommandHandler = async (options: InitOptions): Promise<void> => {
  const cwd = process.cwd();
  const globalPath = getGlobalConfigPath();
  const projectPath = getProjectConfigPath(cwd);

  const globalExisting = normalizeGlobalConfig(await readJsonIfExists(globalPath));
  const profileName = options.profile || globalExisting.active_profile || 'default';
  const profileExisting = globalExisting.profiles?.[profileName] ?? {};

  const globalConfig: GlobalConfig = {
    active_profile: profileName,
    profiles: {
      ...(globalExisting.profiles ?? {}),
      [profileName]: {
        backend_url: options.backendUrl || profileExisting.backend_url,
        token: options.token || profileExisting.token,
        default_workspace: options.workspaceId || profileExisting.default_workspace,
      },
    },
  };
  await writeJson(globalPath, globalConfig);

  const projectExisting = normalizeProjectConfig(await readJsonIfExists(projectPath));
  const projectConfig: ProjectConfig = {
    workspace_id: options.workspaceId || projectExisting.workspace_id,
    adapter_dir: options.adapterDir || projectExisting.adapter_dir,
    preferred_model: options.preferredModel || projectExisting.preferred_model,
  };
  await writeJson(projectPath, projectConfig);

  const resolved = await resolveConfig({ cwd });
  if (!resolved.backend_url.value || !resolved.token.value) {
    throw new ConfigError('Missing backend_url or token after init. Please set --backend-url and --token.');
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        message: 'init completed',
        active_profile: resolved.profile.value,
        backend_url: resolved.backend_url,
        token: resolved.token.source ? { source: resolved.token.source, value: '***' } : resolved.token,
        workspace_id: resolved.workspace_id,
      },
      null,
      2,
    ),
  );
};

export const registerInitCommand = (program: Command): void => {
  program
    .command('init')
    .description('Bootstrap AV CLI configuration')
    .option('--backend-url <url>', 'Backend base URL')
    .option('--token <token>', 'Platform token')
    .option('--workspace-id <id>', 'Workspace id (also saved as default workspace)')
    .option('--profile <name>', 'Global profile name')
    .option('--adapter-dir <dir>', 'Project adapter directory')
    .option('--preferred-model <name>', 'Preferred model')
    .action(initCommandHandler);
};

