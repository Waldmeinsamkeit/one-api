import os from 'node:os';
import path from 'node:path';

export interface PathContext {
  platform?: NodeJS.Platform;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export const getGlobalConfigPath = (context: PathContext = {}): string => {
  const platform = context.platform ?? process.platform;
  const homeDir = context.homeDir ?? os.homedir();
  const env = context.env ?? process.env;
  const pathApi = platform === 'win32' ? path.win32 : path.posix;

  if (platform === 'win32') {
    const appData = env.APPDATA || pathApi.join(homeDir, 'AppData', 'Roaming');
    return pathApi.join(appData, 'av-cli', 'config.json');
  }

  if (platform === 'darwin') {
    return pathApi.join(homeDir, 'Library', 'Application Support', 'av-cli', 'config.json');
  }

  return pathApi.join(homeDir, '.config', 'av-cli', 'config.json');
};

export const getProjectConfigPath = (cwd: string): string => {
  return path.join(cwd, '.av-cli.json');
};
