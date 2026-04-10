import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { ContextIndex, SnapshotCapability, SnapshotDetail } from '../types/context.js';
import { buildCapability, extractRequiredSecrets } from './readiness.js';

export interface UpsertPendingSnapshotInput {
  cwd: string;
  api_slug: string;
  action: string;
  generated_adapter?: unknown;
}

export interface RefreshReadinessInput {
  cwd: string;
  secret_name: string;
}

const INDEX_FILE_NAME = 'index.json';

const nowIso = (): string => new Date().toISOString();

const ensureContextDir = async (cwd: string): Promise<string> => {
  const contextDir = path.join(cwd, '.av-cli', 'context');
  await mkdir(contextDir, { recursive: true });
  return contextDir;
};

const detailFileName = (slug: string, action: string): string => `${slug}.${action}.json`;

const detailPath = (contextDir: string, slug: string, action: string): string =>
  path.join(contextDir, detailFileName(slug, action));

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

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const toIndexItem = (snapshot: SnapshotDetail): SnapshotDetail => ({
  slug: snapshot.slug,
  action: snapshot.action,
  status: snapshot.status,
  capability: snapshot.capability,
  updatedAt: snapshot.updatedAt,
});

const readIndex = async (contextDir: string): Promise<ContextIndex> => {
  const indexPath = path.join(contextDir, INDEX_FILE_NAME);
  const existing = await readJsonIfExists<ContextIndex>(indexPath);
  if (existing) {
    return existing;
  }
  return { snapshots: [], lastUpdated: nowIso() };
};

const writeIndex = async (contextDir: string, index: ContextIndex): Promise<void> => {
  await writeJson(path.join(contextDir, INDEX_FILE_NAME), index);
};

const mergeIndexItem = (index: ContextIndex, item: SnapshotDetail): ContextIndex => {
  const filtered = index.snapshots.filter(
    (entry) => !(entry.slug === item.slug && entry.action === item.action),
  );
  return {
    snapshots: [...filtered, toIndexItem(item)].sort((a, b) =>
      `${a.slug}:${a.action}`.localeCompare(`${b.slug}:${b.action}`),
    ),
    lastUpdated: nowIso(),
  };
};

export const upsertPendingSnapshotFromGen = async (
  input: UpsertPendingSnapshotInput,
): Promise<SnapshotDetail> => {
  const contextDir = await ensureContextDir(input.cwd);
  const existing =
    (await readJsonIfExists<SnapshotDetail>(detailPath(contextDir, input.api_slug, input.action))) ?? undefined;

  const requiredSecrets = extractRequiredSecrets(input.generated_adapter);
  const capability: SnapshotCapability = buildCapability(requiredSecrets, new Set());
  const snapshot: SnapshotDetail = {
    slug: input.api_slug,
    action: input.action,
    status: 'pending',
    capability,
    updatedAt: nowIso(),
  };

  const merged: SnapshotDetail = {
    ...existing,
    ...snapshot,
  };

  await writeJson(detailPath(contextDir, input.api_slug, input.action), merged);
  const index = await readIndex(contextDir);
  await writeIndex(contextDir, mergeIndexItem(index, merged));
  return merged;
};

export const refreshReadinessAfterSecretSet = async (
  input: RefreshReadinessInput,
): Promise<{ updated: number; ready: number }> => {
  const contextDir = await ensureContextDir(input.cwd);
  const files = await readdir(contextDir);
  const detailFiles = files.filter((file) => file.endsWith('.json') && file !== INDEX_FILE_NAME);

  let updated = 0;
  let ready = 0;
  const snapshots: SnapshotDetail[] = [];

  for (const file of detailFiles) {
    const filePath = path.join(contextDir, file);
    const snapshot = await readJsonIfExists<SnapshotDetail>(filePath);
    if (!snapshot) {
      continue;
    }
    const missing = snapshot.capability?.missing_secrets ?? [];
    const nextMissing = missing.filter((name) => name !== input.secret_name);
    const nextCapability: SnapshotCapability = {
      is_ready: nextMissing.length === 0,
      missing_secrets: nextMissing,
    };
    const changed = nextMissing.length !== missing.length || snapshot.capability?.is_ready !== nextCapability.is_ready;
    const nextSnapshot: SnapshotDetail = changed
      ? { ...snapshot, capability: nextCapability, updatedAt: nowIso() }
      : snapshot;

    if (changed) {
      updated += 1;
      await writeJson(filePath, nextSnapshot);
    }
    if (nextSnapshot.capability?.is_ready) {
      ready += 1;
    }
    snapshots.push(nextSnapshot);
  }

  const index: ContextIndex = {
    snapshots: snapshots
      .map((item) => toIndexItem(item))
      .sort((a, b) => `${a.slug}:${a.action}`.localeCompare(`${b.slug}:${b.action}`)),
    lastUpdated: nowIso(),
  };
  await writeIndex(contextDir, index);
  return { updated, ready };
};
