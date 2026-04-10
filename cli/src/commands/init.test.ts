import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { initCommandHandler } from './init.js';

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
};

test('init writes global profile and project config', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'av-cli-init-'));
  const cwd = path.join(tmp, 'repo');
  const home = path.join(tmp, 'home');
  const appData = path.join(tmp, 'roaming');
  await rm(cwd, { recursive: true, force: true }).catch(() => {});
  await rm(home, { recursive: true, force: true }).catch(() => {});
  await rm(appData, { recursive: true, force: true }).catch(() => {});
  await mkdir(cwd, { recursive: true });
  await mkdir(home, { recursive: true });
  await mkdir(appData, { recursive: true });

  const prevCwd = process.cwd();
  const prevHome = process.env.HOME;
  const prevAppData = process.env.APPDATA;
  try {
    process.chdir(cwd);
    process.env.HOME = home;
    process.env.APPDATA = appData;
    await initCommandHandler({
      profile: 'default',
      backendUrl: 'https://api.example.com',
      token: 'token-123',
      workspaceId: 'ws-1',
      adapterDir: './adapters',
      preferredModel: 'gpt-5',
    });

    const globalPath = path.join(appData, 'av-cli', 'config.json');
    const projectPath = path.join(cwd, '.av-cli.json');
    const global = await readJson<{
      active_profile: string;
      profiles: Record<string, { backend_url: string; token: string; default_workspace: string }>;
    }>(globalPath);
    const project = await readJson<{
      workspace_id: string;
      adapter_dir: string;
      preferred_model: string;
    }>(projectPath);

    assert.equal(global.active_profile, 'default');
    assert.equal(global.profiles.default.backend_url, 'https://api.example.com');
    assert.equal(global.profiles.default.token, 'token-123');
    assert.equal(global.profiles.default.default_workspace, 'ws-1');
    assert.equal(project.workspace_id, 'ws-1');
    assert.equal(project.adapter_dir, './adapters');
    assert.equal(project.preferred_model, 'gpt-5');
  } finally {
    process.chdir(prevCwd);
    if (prevHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = prevHome;
    }
    if (prevAppData === undefined) {
      delete process.env.APPDATA;
    } else {
      process.env.APPDATA = prevAppData;
    }
    await rm(tmp, { recursive: true, force: true });
  }
});
