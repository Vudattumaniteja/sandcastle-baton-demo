export interface SandcastleConfig {
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  mode?: 'afk' | 'supervised' | 'dry-run';
  timeout?: string;
  retries?: number;
  autoPr?: boolean;
  autoMerge?: boolean;
  repo?: string;
}

export type ConfigKey = keyof SandcastleConfig;

export interface ConfigServiceOptions {
  localConfigPath?: string;
  globalConfigPath?: string;
  cwd?: string;
}
