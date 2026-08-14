import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  SandcastleConfig,
  ConfigKey,
  ConfigServiceOptions,
} from '../types/config.js';

export const DEFAULT_CONFIG: Required<SandcastleConfig> = {
  model: 'Gemini 3.7 Flash',
  reasoningEffort: 'high',
  mode: 'afk',
  timeout: '30m',
  retries: 2,
  autoPr: true,
  autoMerge: true,
  repo: '',
};

export class ConfigService {
  private localConfigPath: string;
  private globalConfigPath: string;

  constructor(options: ConfigServiceOptions = {}) {
    const cwd = options.cwd ?? process.cwd();
    this.localConfigPath =
      options.localConfigPath ?? path.join(cwd, '.sandcastle', 'config.json');
    this.globalConfigPath =
      options.globalConfigPath ??
      path.join(os.homedir(), '.sandcastle', 'config.json');
  }

  /**
   * Reads a JSON config file safely, returning empty object if not found or malformed.
   */
  private readConfigFile(filePath: string): Partial<SandcastleConfig> {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (raw && raw.trim()) {
          return JSON.parse(raw) as Partial<SandcastleConfig>;
        }
      }
    } catch {
      // Ignore parse or read errors
    }
    return {};
  }

  /**
   * Writes a JSON config file safely, creating parent directories if needed.
   */
  private writeConfigFile(
    filePath: string,
    config: Partial<SandcastleConfig>
  ): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Reads the global config file.
   */
  getGlobalConfig(): Partial<SandcastleConfig> {
    return this.readConfigFile(this.globalConfigPath);
  }

  /**
   * Reads the local project config file.
   */
  getLocalConfig(): Partial<SandcastleConfig> {
    return this.readConfigFile(this.localConfigPath);
  }

  /**
   * Resolves the effective 3-tier configuration:
   * CLI overrides > Local config > Global config > Defaults
   */
  resolve(cliOverrides: Partial<SandcastleConfig> = {}): Required<SandcastleConfig> {
    const globalConfig = this.getGlobalConfig();
    const localConfig = this.getLocalConfig();

    // Clean undefined values from cliOverrides
    const cleanCliOverrides: Partial<SandcastleConfig> = {};
    for (const [key, value] of Object.entries(cliOverrides)) {
      if (value !== undefined) {
        (cleanCliOverrides as any)[key] = value;
      }
    }

    return {
      ...DEFAULT_CONFIG,
      ...globalConfig,
      ...localConfig,
      ...cleanCliOverrides,
    };
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
    const current = this.readConfigFile(targetPath);
    (current as any)[key] = value;
    this.writeConfigFile(targetPath, current);
  }

  /**
   * Returns a breakdown of configuration across all tiers.
   */
  list() {
    return {
      defaults: DEFAULT_CONFIG,
      global: this.getGlobalConfig(),
      local: this.getLocalConfig(),
      resolved: this.resolve(),
    };
  }
}
