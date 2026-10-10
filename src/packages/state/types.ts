import type { BatonRunSnapshot } from '../../types/baton.js';

export interface SandcastleConfig {
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  mode?: 'afk' | 'supervised' | 'dry-run';
  timeout?: string;
  retries?: number;
  autoPr?: boolean;
  autoMerge?: boolean;
  repo?: string;
  parentLabels?: string[];
  hitlLabels?: string[];
  promptTemplate?: string;
  parentContext?: 'reference' | 'inline' | 'none';
}

export type ConfigKey = keyof SandcastleConfig;

export interface ConfigStoreOptions {
  localConfigPath?: string;
  globalConfigPath?: string;
  cwd?: string;
}

export interface ConfigResolutionReport {
  defaults: Required<SandcastleConfig>;
  global: Partial<SandcastleConfig>;
  local: Partial<SandcastleConfig>;
  resolved: Required<SandcastleConfig>;
}

export interface RunStateStoreOptions {
  stateFilePath?: string;
  cwd?: string;
}

export type { BatonRunSnapshot };
