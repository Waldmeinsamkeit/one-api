import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { resolveConfig } from './config.js';
import { ConfigError } from './errors.js';
import { getGlobalConfigPath } from './paths.js';

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const createSandbox = async (): Promise<{
  rootDir: string;
  projectDir: string;
  homeDir: string;
  appDataDir: string;
  cleanup: () => Promise<void>;
}> => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'av-cli-config-'));
  const projectDir = path.join(rootDir, 'project');
  const homeDir = path.join(rootDir, 'home');
  const appDataDir = path.join(rootDir, 'appdata', 'Roaming');

  await mkdir(projectDir, { recursive: true });
  await mkdir(homeDir, { recursive: true });
  await mkdir(appDataDir, { recursive: true });

  return {
    rootDir,
    projectDir,
    homeDir,
    appDataDir,
    cleanup: () => rm(rootDir, { recursive: true, force: true }),
  };
};

test('getGlobalConfigPath returns platform-specific config locations', () => {
  assert.equal(
    getGlobalConfigPath({ platform: 'linux', homeDir: '/home/alice', env: {} }),
    '/home/alice/.config/av-cli/config.json',
  );
  assert.equal(
    getGlobalConfigPath({ platform: 'darwin', homeDir: '/Users/alice', env: {} }),
    '/Users/alice/Library/Application Support/av-cli/config.json',
  );
  assert.equal(
    getGlobalConfigPath({
      platform: 'win32',
      homeDir: 'C:\\Users\\Alice',
      env: { APPDATA: 'C:\\Users\\Alice\\AppData\\Roaming' },
    }),
    'C:\\Users\\Alice\\AppData\\Roaming\\av-cli\\config.json',
  );
});

test('resolveConfig applies ENV over project over global and tracks field sources', async () => {
  const sandbox = await createSandbox();

  try {
    const globalPath = getGlobalConfigPath({
      platform: 'win32',
      homeDir: sandbox.homeDir,
      env: { APPDATA: sandbox.appDataDir },
    });

    await writeJson(globalPath, {
      active_profile: 'team-a',
      profiles: {
        'team-a': {
          backend_url: 'https://global.example.com',
          token: 'global-token',
          default_workspace: 'global-workspace',
        },
      },
    });

    await writeJson(path.join(sandbox.projectDir, '.av-cli.json'), {
      workspace_id: 'project-workspace',
      adapter_dir: './adapters',
      preferred_model: 'gpt-4.1-mini',
    });

    const config = await resolveConfig({
      cwd: sandbox.projectDir,
      homeDir: sandbox.homeDir,
      platform: 'win32',
      env: {
        APPDATA: sandbox.appDataDir,
        AV_CLI_BACKEND_URL: 'https://env.example.com',
        AV_CLI_TOKEN: 'env-token',
        AV_CLI_WORKSPACE_ID: 'env-workspace',
        AV_CLI_ADAPTER_DIR: './env-adapters',
      },
    });

    assert.equal(config.profile.value, 'team-a');
    assert.equal(config.profile.source, 'global');
    assert.equal(config.backend_url.value, 'https://env.example.com');
    assert.equal(config.backend_url.source, 'env');
    assert.equal(config.token.value, 'env-token');
    assert.equal(config.token.source, 'env');
    assert.equal(config.workspace_id.value, 'env-workspace');
    assert.equal(config.workspace_id.source, 'env');
    assert.equal(config.adapter_dir.value, './env-adapters');
    assert.equal(config.adapter_dir.source, 'env');
    assert.equal(config.preferred_model.value, 'gpt-4.1-mini');
    assert.equal(config.preferred_model.source, 'project');
    assert.equal(config.default_workspace.value, 'global-workspace');
    assert.equal(config.default_workspace.source, 'global');
  } finally {
    await sandbox.cleanup();
  }
});

test('resolveConfig ignores token-like keys in project config', async () => {
  const sandbox = await createSandbox();

  try {
    await writeJson(path.join(sandbox.projectDir, '.av-cli.json'), {
      workspace_id: 'project-workspace',
      token: 'should-not-be-read',
    });

    const config = await resolveConfig({
      cwd: sandbox.projectDir,
      homeDir: sandbox.homeDir,
      platform: 'win32',
      env: { APPDATA: sandbox.appDataDir },
    });

    assert.equal(config.workspace_id.value, 'project-workspace');
    assert.equal(config.token.value, undefined);
    assert.equal(config.token.source, undefined);
  } finally {
    await sandbox.cleanup();
  }
});

test('resolveConfig uses the active global profile when no explicit profile is provided', async () => {
  const sandbox = await createSandbox();

  try {
    const globalPath = getGlobalConfigPath({
      platform: 'win32',
      homeDir: sandbox.homeDir,
      env: { APPDATA: sandbox.appDataDir },
    });

    await writeJson(globalPath, {
      active_profile: 'alpha',
      profiles: {
        alpha: {
          backend_url: 'https://alpha.example.com',
          token: 'alpha-token',
          default_workspace: 'alpha-workspace',
        },
        prod: {
          backend_url: 'https://prod.example.com',
          token: 'prod-token',
          default_workspace: 'prod-workspace',
        },
      },
    });

    const config = await resolveConfig({
      cwd: sandbox.projectDir,
      homeDir: sandbox.homeDir,
      platform: 'win32',
      env: { APPDATA: sandbox.appDataDir },
    });

    assert.equal(config.profile.value, 'alpha');
    assert.equal(config.backend_url.value, 'https://alpha.example.com');
    assert.equal(config.token.value, 'alpha-token');
    assert.equal(config.workspace_id.value, 'alpha-workspace');
    assert.equal(config.workspace_id.source, 'global');
  } finally {
    await sandbox.cleanup();
  }
});

test('resolveConfig lets AV_CLI_PROFILE override the active global profile', async () => {
  const sandbox = await createSandbox();

  try {
    const globalPath = getGlobalConfigPath({
      platform: 'win32',
      homeDir: sandbox.homeDir,
      env: { APPDATA: sandbox.appDataDir },
    });

    await writeJson(globalPath, {
      active_profile: 'alpha',
      profiles: {
        alpha: {
          backend_url: 'https://alpha.example.com',
          token: 'alpha-token',
          default_workspace: 'alpha-workspace',
        },
        prod: {
          backend_url: 'https://prod.example.com',
          token: 'prod-token',
          default_workspace: 'prod-workspace',
        },
      },
    });

    const config = await resolveConfig({
      cwd: sandbox.projectDir,
      homeDir: sandbox.homeDir,
      platform: 'win32',
      env: {
        APPDATA: sandbox.appDataDir,
        AV_CLI_PROFILE: 'prod',
      },
    });

    assert.equal(config.profile.value, 'prod');
    assert.equal(config.profile.source, 'env');
    assert.equal(config.backend_url.value, 'https://prod.example.com');
    assert.equal(config.token.value, 'prod-token');
    assert.equal(config.workspace_id.value, 'prod-workspace');
  } finally {
    await sandbox.cleanup();
  }
});

test('resolveConfig throws when selected profile does not exist', async () => {
  const sandbox = await createSandbox();

  try {
    const globalPath = getGlobalConfigPath({
      platform: 'win32',
      homeDir: sandbox.homeDir,
      env: { APPDATA: sandbox.appDataDir },
    });

    await writeJson(globalPath, {
      active_profile: 'missing',
      profiles: {
        alpha: {
          backend_url: 'https://alpha.example.com',
          token: 'alpha-token',
        },
      },
    });

    await assert.rejects(
      () =>
        resolveConfig({
          cwd: sandbox.projectDir,
          homeDir: sandbox.homeDir,
          platform: 'win32',
          env: { APPDATA: sandbox.appDataDir },
        }),
      (error: unknown) =>
        error instanceof ConfigError && error.message.includes('Profile "missing" not found'),
    );
  } finally {
    await sandbox.cleanup();
  }
});

test('resolveConfig treats empty env vars as unset and falls back to lower precedence', async () => {
  const sandbox = await createSandbox();

  try {
    const globalPath = getGlobalConfigPath({
      platform: 'win32',
      homeDir: sandbox.homeDir,
      env: { APPDATA: sandbox.appDataDir },
    });

    await writeJson(globalPath, {
      active_profile: 'team-a',
      profiles: {
        'team-a': {
          backend_url: 'https://global.example.com',
          token: 'global-token',
          default_workspace: 'global-workspace',
        },
      },
    });

    await writeJson(path.join(sandbox.projectDir, '.av-cli.json'), {
      workspace_id: 'project-workspace',
    });

    const config = await resolveConfig({
      cwd: sandbox.projectDir,
      homeDir: sandbox.homeDir,
      platform: 'win32',
      env: {
        APPDATA: sandbox.appDataDir,
        AV_CLI_TOKEN: '',
        AV_CLI_WORKSPACE_ID: '',
      },
    });

    assert.equal(config.token.value, 'global-token');
    assert.equal(config.token.source, 'global');
    assert.equal(config.workspace_id.value, 'project-workspace');
    assert.equal(config.workspace_id.source, 'project');
  } finally {
    await sandbox.cleanup();
  }
});
