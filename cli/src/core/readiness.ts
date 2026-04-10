import type { SnapshotCapability } from '../types/context.js';

const SECRET_PATTERN = /secrets\.([A-Za-z0-9_]+)/g;

export const extractRequiredSecrets = (value: unknown): string[] => {
  if (!value) {
    return [];
  }

  const direct =
    (value as { required_secrets?: unknown }).required_secrets ??
    (value as { requiredSecrets?: unknown }).requiredSecrets;

  if (Array.isArray(direct)) {
    return Array.from(new Set(direct.filter((item): item is string => typeof item === 'string' && item.length > 0)));
  }

  const text = JSON.stringify(value);
  const found: string[] = [];
  let match: RegExpExecArray | null = null;
  while ((match = SECRET_PATTERN.exec(text)) !== null) {
    if (match[1]) {
      found.push(match[1]);
    }
  }
  return Array.from(new Set(found));
};

export const buildCapability = (requiredSecrets: string[], availableSecrets: Set<string>): SnapshotCapability => {
  const missing = requiredSecrets.filter((name) => !availableSecrets.has(name));
  return {
    is_ready: missing.length === 0,
    missing_secrets: missing,
  };
};
