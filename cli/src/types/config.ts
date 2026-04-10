export type ConfigSource = 'env' | 'project' | 'global';

export interface ProfileConfig {
  backend_url?: string;
  token?: string;
  default_workspace?: string;
}

export interface GlobalConfig {
  active_profile?: string;
  profiles?: Record<string, ProfileConfig>;
}

export interface ProjectConfig {
  workspace_id?: string;
  adapter_dir?: string;
  preferred_model?: string;
}

export interface EnvConfig {
  backend_url?: string;
  token?: string;
  workspace_id?: string;
  adapter_dir?: string;
  preferred_model?: string;
}

export interface ConfigPayloadBySource {
  env: EnvConfig;
  project: ProjectConfig;
  global: GlobalConfig;
}

export type EffectiveConfig<TSource extends ConfigSource = ConfigSource> = {
  [Source in TSource]: {
    source: Source;
    data: ConfigPayloadBySource[Source];
  };
}[TSource];
