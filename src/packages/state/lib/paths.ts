import path from 'path';
import os from 'os';

/**
 * Returns the directory for sandcastle workspace state (.sandcastle).
 */
export function resolveStateDir(cwd?: string): string {
  return path.join(cwd ?? process.cwd(), '.sandcastle');
}

/**
 * Resolves the path to .sandcastle/run.json.
 */
export function resolveStateFilePath(cwd?: string, customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  return path.join(resolveStateDir(cwd), 'run.json');
}

/**
 * Resolves the path to the local project .sandcastle/config.json.
 */
export function resolveLocalConfigPath(cwd?: string, customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  return path.join(resolveStateDir(cwd), 'config.json');
}

/**
 * Returns the directory for sandcastle global user configuration (~/.sandcastle).
 */
export function resolveGlobalConfigDir(): string {
  return path.join(os.homedir(), '.sandcastle');
}

/**
 * Resolves the path to the global user ~/.sandcastle/config.json.
 */
export function resolveGlobalConfigPath(customPath?: string): string {
  if (customPath) {
    return customPath;
  }
  return path.join(resolveGlobalConfigDir(), 'config.json');
}
