import type { GlobalConfig, ProfileConfig, ProjectConfig } from '../types/config.js';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toOptionalString = (value: unknown): string | undefined => {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

const normalizeProfile = (value: unknown): ProfileConfig | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    backend_url: toOptionalString(value.backend_url),
    token: toOptionalString(value.token),
    default_workspace: toOptionalString(value.default_workspace),
  };
};

export const normalizeGlobalConfig = (value: unknown): GlobalConfig => {
  if (!isRecord(value)) {
    return {};
  }

  const rawProfiles = isRecord(value.profiles) ? value.profiles : {};
  const profiles: Record<string, ProfileConfig> = {};
  for (const [name, profile] of Object.entries(rawProfiles)) {
    const normalized = normalizeProfile(profile);
    if (normalized) {
      profiles[name] = normalized;
    }
  }

  return {
    active_profile: toOptionalString(value.active_profile),
    profiles,
  };
};

export const normalizeProjectConfig = (value: unknown): ProjectConfig => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    workspace_id: toOptionalString(value.workspace_id),
    adapter_dir: toOptionalString(value.adapter_dir),
    preferred_model: toOptionalString(value.preferred_model),
  };
};
