import type {
  SandcastleConfig,
  ConfigKey,
  ConfigStoreOptions,
  ConfigResolutionReport,
} from './types.js';
import { resolveLocalConfigPath, resolveGlobalConfigPath } from './lib/paths.js';
import { DEFAULT_CONFIG, mergeConfig } from './lib/config-merger.js';
import { readJsonFileSync, writeJsonFileSync } from './lib/json-file.js';

export class ConfigStore {
  protected localConfigPath: string;
  protected globalConfigPath: string;

  constructor(options: ConfigStoreOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    this.localConfigPath = resolveLocalConfigPath(cwd, options.localConfigPath);
    this.globalConfigPath = resolveGlobalConfigPath(options.globalConfigPath);
  }

  getLocalConfigPath(): string {
    return this.localConfigPath;
  }

  getGlobalConfigPath(): string {
    return this.globalConfigPath;
  }

  /**
   * Reads the global config file.
   */
  getGlobalConfig(): Partial<SandcastleConfig> {
    return readJsonFileSync<Partial<SandcastleConfig>>(this.globalConfigPath) ?? {};
  }

  /**
   * Reads the local project config file.
   */
  getLocalConfig(): Partial<SandcastleConfig> {
    return readJsonFileSync<Partial<SandcastleConfig>>(this.localConfigPath) ?? {};
  }

  /**
   * Resolves the effective 3-tier configuration:
   * CLI overrides > Local config > Global config > Defaults
   */
  resolve(cliOverrides: Partial<SandcastleConfig> = {}): Required<SandcastleConfig> {
    return mergeConfig({
      defaults: DEFAULT_CONFIG,
      global: this.getGlobalConfig(),
      local: this.getLocalConfig(),
      cli: cliOverrides,
    });
  }

  /**
   * Gets a specific config key's resolved value.
   */
  get<K extends ConfigKey>(key: K): Required<SandcastleConfig>[K] {
    const resolved = this.resolve();
    return resolved[key];
  }

  /**
   * Sets a configuration key in local or global config file.
   */
  set<K extends ConfigKey>(
    key: K,
    value: SandcastleConfig[K],
    isGlobal: boolean = false
  ): void {
    const targetPath = isGlobal ? this.globalConfigPath : this.localConfigPath;
    const current = (readJsonFileSync<Partial<SandcastleConfig>>(targetPath) ?? {}) as any;
    current[key] = value;
    writeJsonFileSync(targetPath, current, false);
  }

  /**
   * Returns a breakdown of configuration across all tiers.
   */
  list(): ConfigResolutionReport {
    return {
      defaults: DEFAULT_CONFIG,
      global: this.getGlobalConfig(),
      local: this.getLocalConfig(),
      resolved: this.resolve(),
    };
  }
}
