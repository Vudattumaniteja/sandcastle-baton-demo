import type { CommandExecutor } from './github.js';

export interface UpdateCommandOptions {
  check?: boolean;
  ci?: boolean;
  force?: boolean;
  json?: boolean;
  cwd?: string;
  executor?: CommandExecutor;
  commandExecutor?: CommandExecutor;
}

export interface UpdateResult {
  success: boolean;
  updated: boolean;
  currentVersion: string;
  latestVersion: string;
  ciUpdated: boolean;
  message: string;
}
