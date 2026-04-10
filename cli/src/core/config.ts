import { readFile } from 'node:fs/promises';

import type { ConfigSource, EnvConfig, GlobalConfig, ProjectConfig } from '../types/config.js';
import { ConfigError } from './errors.js';
import { getGlobalConfigPath, getProjectConfigPath, type PathContext } from './paths.js';
import { normalizeGlobalConfig, normalizeProjectConfig } from './validate.js';

interface ResolveConfigOptions extends PathContext {
  cwd: string;
}

interface ResolvedField<T> {
  value: T | undefined;
  source: ConfigSource | undefined;
}

export interface ResolvedConfig {
  profile: ResolvedField<string>;
  backend_url: ResolvedField<string>;
  token: ResolvedField<string>;
  workspace_id: ResolvedField<string>;
  adapter_dir: ResolvedField<string>;
  preferred_model: ResolvedField<string>;
  default_workspace: ResolvedField<string>;
  meta: {
    global_config_path: string;
    project_config_path: string;
    has_global_config: boolean;
    has_project_config: boolean;
  };
}

const readJsonFile = async (filePath: string): Promise<unknown | undefined> => {
  try {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      return undefined;
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Failed to read config file "${filePath}": ${message}`);
  }
};

const fieldFrom = <T>(value: T | undefined, source: ConfigSource | undefined): ResolvedField<T> => ({
  value,
  source: value === undefined ? undefined : source,
});

const pick = <T>(
  entries: Array<{ value: T | undefined; source: ConfigSource }>,
): ResolvedField<T> => {
  for (const entry of entries) {
    if (entry.value !== undefined) {
      return fieldFrom(entry.value, entry.source);
    }
  }
  return fieldFrom<T>(undefined, undefined);
};

const readEnvConfig = (env: NodeJS.ProcessEnv): EnvConfig => {
  const normalized = (value: string | undefined): string | undefined => {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };
  return {
    backend_url: normalized(env.AV_CLI_BACKEND_URL),
    token: normalized(env.AV_CLI_TOKEN),
    workspace_id: normalized(env.AV_CLI_WORKSPACE_ID),
    adapter_dir: normalized(env.AV_CLI_ADAPTER_DIR),
    preferred_model: normalized(env.AV_CLI_PREFERRED_MODEL),
  };
};

export const resolveConfig = async (options: ResolveConfigOptions): Promise<ResolvedConfig> => {
  const env = options.env ?? process.env;
  const globalConfigPath = getGlobalConfigPath(options);
  const projectConfigPath = getProjectConfigPath(options.cwd);

  const globalRaw = await readJsonFile(globalConfigPath);
  const projectRaw = await readJsonFile(projectConfigPath);

  const globalConfig: GlobalConfig = normalizeGlobalConfig(globalRaw);
  const projectConfig: ProjectConfig = normalizeProjectConfig(projectRaw);
  const envConfig = readEnvConfig(env);

  const selectedProfileName = env.AV_CLI_PROFILE || globalConfig.active_profile;
  const selectedProfile = selectedProfileName
    ? globalConfig.profiles?.[selectedProfileName]
    : undefined;
  if (selectedProfileName && !selectedProfile) {
    throw new ConfigError(`Profile "${selectedProfileName}" not found in global config`);
  }
  const defaultWorkspace = selectedProfile?.default_workspace;

  const profile = fieldFrom(
    selectedProfileName,
    env.AV_CLI_PROFILE ? 'env' : selectedProfileName ? 'global' : undefined,
  );

  return {
    profile,
    backend_url: pick([
      { value: envConfig.backend_url, source: 'env' },
      { value: selectedProfile?.backend_url, source: 'global' },
    ]),
    token: pick([
      { value: envConfig.token, source: 'env' },
      { value: selectedProfile?.token, source: 'global' },
    ]),
    workspace_id: pick([
      { value: envConfig.workspace_id, source: 'env' },
      { value: projectConfig.workspace_id, source: 'project' },
      { value: defaultWorkspace, source: 'global' },
    ]),
    adapter_dir: pick([
      { value: envConfig.adapter_dir, source: 'env' },
      { value: projectConfig.adapter_dir, source: 'project' },
    ]),
    preferred_model: pick([
      { value: envConfig.preferred_model, source: 'env' },
      { value: projectConfig.preferred_model, source: 'project' },
    ]),
    default_workspace: fieldFrom(defaultWorkspace, defaultWorkspace ? 'global' : undefined),
    meta: {
      global_config_path: globalConfigPath,
      project_config_path: projectConfigPath,
      has_global_config: globalRaw !== undefined,
      has_project_config: projectRaw !== undefined,
    },
  };
};
