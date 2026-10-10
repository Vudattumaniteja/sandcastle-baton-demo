import type { BatonRunSnapshot } from '../../types/baton.js';
import type {
  SandcastleConfig,
  ConfigKey,
  ConfigResolutionReport,
} from './types.js';
import { DEFAULT_CONFIG, mergeConfig } from './lib/config-merger.js';

/**
 * Zero-disk in-memory adapter for BatonRunSnapshot persistence.
 * Useful for fast, hermetic unit tests.
 */
export class InMemoryRunStateStore {
  private snapshot: BatonRunSnapshot | null;

  constructor(initialSnapshot: BatonRunSnapshot | null = null) {
    this.snapshot = initialSnapshot ? JSON.parse(JSON.stringify(initialSnapshot)) : null;
  }

  getStateFilePath(): string {
    return ':memory:';
  }

  read(): BatonRunSnapshot | null {
    return this.snapshot ? JSON.parse(JSON.stringify(this.snapshot)) : null;
  }

  write(snapshot: BatonRunSnapshot): void {
    this.snapshot = JSON.parse(JSON.stringify(snapshot));
  }

  get(): BatonRunSnapshot | null {
    return this.read();
  }

  set(snapshot: BatonRunSnapshot): void {
    this.write(snapshot);
  }

  clear(): void {
    this.snapshot = null;
  }

  exists(): boolean {
    return this.snapshot !== null;
  }
}

/**
 * Zero-disk in-memory adapter for configuration storage and resolution.
 * Useful for fast, hermetic unit tests.
 */
export class InMemoryConfigStore {
  private localConfig: Partial<SandcastleConfig>;
  private globalConfig: Partial<SandcastleConfig>;

  constructor(initial?: {
    local?: Partial<SandcastleConfig>;
    global?: Partial<SandcastleConfig>;
  }) {
    this.localConfig = { ...(initial?.local ?? {}) };
    this.globalConfig = { ...(initial?.global ?? {}) };
  }

  getLocalConfig(): Partial<SandcastleConfig> {
    return { ...this.localConfig };
  }

  getGlobalConfig(): Partial<SandcastleConfig> {
    return { ...this.globalConfig };
  }

  resolve(cliOverrides: Partial<SandcastleConfig> = {}): Required<SandcastleConfig> {
    return mergeConfig({
      defaults: DEFAULT_CONFIG,
      global: this.globalConfig,
      local: this.localConfig,
      cli: cliOverrides,
    });
  }

  get<K extends ConfigKey>(key: K): Required<SandcastleConfig>[K] {
    const resolved = this.resolve();
    return resolved[key];
  }

  set<K extends ConfigKey>(
    key: K,
    value: SandcastleConfig[K],
    isGlobal: boolean = false
  ): void {
    if (isGlobal) {
      this.globalConfig[key] = value;
    } else {
      this.localConfig[key] = value;
    }
  }

  list(): ConfigResolutionReport {
    return {
      defaults: DEFAULT_CONFIG,
      global: this.getGlobalConfig(),
      local: this.getLocalConfig(),
      resolved: this.resolve(),
    };
  }

  clear(): void {
    this.localConfig = {};
    this.globalConfig = {};
  }
}
