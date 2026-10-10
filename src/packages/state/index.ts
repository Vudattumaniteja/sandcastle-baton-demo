export { RunStateStore } from './run-state-store.js';
export { ConfigStore } from './config-store.js';
export { DEFAULT_CONFIG, mergeConfig } from './lib/config-merger.js';
export { InMemoryRunStateStore, InMemoryConfigStore } from './memory.js';
export { writeAtomicSync } from './lib/atomic-file.js';
export {
  resolveStateFilePath,
  resolveLocalConfigPath,
  resolveGlobalConfigPath,
} from './lib/paths.js';
export { readJsonFileSync, writeJsonFileSync } from './lib/json-file.js';

export type {
  SandcastleConfig,
  ConfigKey,
  ConfigResolutionReport,
  ConfigStoreOptions,
  RunStateStoreOptions,
  BatonRunSnapshot,
} from './types.js';
