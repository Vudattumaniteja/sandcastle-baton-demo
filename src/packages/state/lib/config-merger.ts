import type { SandcastleConfig } from '../types.js';

export const DEFAULT_CONFIG: Required<SandcastleConfig> = {
  model: 'gemini-2.5-flash',
  reasoningEffort: 'high',
  mode: 'afk',
  timeout: '30m',
  retries: 2,
  autoPr: true,
  autoMerge: true,
  repo: '',
  parentLabels: ['parent', 'epic', 'wayfinder:map'],
  hitlLabels: ['wayfinder:grilling', 'wayfinder:prototype'],
  promptTemplate: '',
  parentContext: 'reference',
};

export interface ConfigMergeInputs {
  defaults?: Required<SandcastleConfig>;
  global?: Partial<SandcastleConfig>;
  local?: Partial<SandcastleConfig>;
  cli?: Partial<SandcastleConfig>;
}

/**
 * Removes undefined keys from a config object so they don't overwrite valid values during merge.
 */
export function cleanConfig<T extends Record<string, any>>(obj?: T): Partial<T> {
  if (!obj) return {};
  const cleaned: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (cleaned as any)[key] = value;
    }
  }
  return cleaned;
}

/**
 * Resolves 3-tier configuration precedence:
 * CLI overrides > Local project config > Global user config > System defaults
 */
export function mergeConfig(inputs: ConfigMergeInputs = {}): Required<SandcastleConfig> {
  const defaults = inputs.defaults ?? DEFAULT_CONFIG;
  const global = cleanConfig(inputs.global);
  const local = cleanConfig(inputs.local);
  const cli = cleanConfig(inputs.cli);

  return {
    ...defaults,
    ...global,
    ...local,
    ...cli,
  };
}
