import fs from 'fs';
import type { BatonRunSnapshot } from '../../types/baton.js';
import type { RunStateStoreOptions } from './types.js';
import { resolveStateFilePath } from './lib/paths.js';
import { readJsonFileSync, writeJsonFileSync } from './lib/json-file.js';

export class RunStateStore {
  private stateFilePath: string;

  constructor(options: RunStateStoreOptions = {}) {
    this.stateFilePath = resolveStateFilePath(options.cwd, options.stateFilePath);
  }

  getStateFilePath(): string {
    return this.stateFilePath;
  }

  /**
   * Reads and parses current baton state snapshot from run.json.
   * Returns null if file does not exist or cannot be parsed.
   */
  read(): BatonRunSnapshot | null {
    return readJsonFileSync<BatonRunSnapshot>(this.stateFilePath);
  }

  /**
   * Atomically writes current baton execution snapshot to state file.
   */
  write(snapshot: BatonRunSnapshot): void {
    try {
      writeJsonFileSync(this.stateFilePath, snapshot, true);
    } catch {
      // Non-fatal: write errors do not interrupt orchestrator execution
    }
  }

  /**
   * Alias for read().
   */
  get(): BatonRunSnapshot | null {
    return this.read();
  }

  /**
   * Alias for write().
   */
  set(snapshot: BatonRunSnapshot): void {
    this.write(snapshot);
  }

  /**
   * Removes state file if it exists.
   */
  clear(): void {
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch {
      // Tolerates ENOENT or file lock race during cleanup
    }
  }

  /**
   * Checks whether the state file exists.
   */
  exists(): boolean {
    return fs.existsSync(this.stateFilePath);
  }
}
