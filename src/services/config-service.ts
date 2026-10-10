import { ConfigStore, DEFAULT_CONFIG } from '#packages/state';
import type { ConfigServiceOptions } from '../types/config.js';

export { DEFAULT_CONFIG };

/**
 * Backward-compatible bridge to ConfigStore from src/packages/state.
 */
export class ConfigService extends ConfigStore {
  constructor(options: ConfigServiceOptions = {}) {
    super(options);
  }
}
