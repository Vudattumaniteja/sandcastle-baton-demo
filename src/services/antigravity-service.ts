import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  discoverModels,
  resolveModel,
  FALLBACK_MODELS,
  parseModelsOutput,
  getQuotaSnapshot,
  normalizeQuotaInfo,
  normalizeStatuslineSnapshot,
  resolveCandidateQuotaInfo,
  type ModelInfo,
  type StatuslineSnapshot,
  type StatuslineQuotaInfo,
  type AgyCommandExecutor,
  defaultProcessSpawner,
  buildWorkerPrompt,
  buildWorkerArgs,
  spawnWorkerProcess,
} from '#packages/worker-runtime';
import type {
  AntigravityWorkerOptions,
  AntigravityWorkerResult,
  AntigravityServiceOptions,
} from '../types/antigravity.js';

export const defaultAgyExecutor: AgyCommandExecutor = defaultProcessSpawner;
export const resolveAgyModel = resolveModel;

export {
  FALLBACK_MODELS,
  normalizeQuotaInfo,
  normalizeStatuslineSnapshot,
  resolveCandidateQuotaInfo,
};

export type {
  ModelInfo,
  StatuslineSnapshot,
  StatuslineQuotaInfo,
  AntigravityWorkerOptions,
  AntigravityWorkerResult,
  AntigravityServiceOptions,
  AgyCommandExecutor,
};

/**
 * Backward-compatible bridge to worker-runtime package.
 */
export class AntigravityService {
  private customAgyPath: string;
  private appDataDir?: string;
  private executor: AgyCommandExecutor;

  constructor(options: AntigravityServiceOptions = {}) {
    this.customAgyPath = options.customAgyPath ?? 'agy';
    this.appDataDir = options.appDataDir;
    this.executor = options.executor ?? defaultAgyExecutor;
  }

  /**
   * Resolves the Antigravity CLI application data directory.
   */
  getAppDataDir(): string {
    if (this.appDataDir) {
      return this.appDataDir;
    }
    if (process.env.GEMINI_APP_DIR) {
      return process.env.GEMINI_APP_DIR;
    }
    const home = os.homedir();
    const primaryPath = path.join(home, '.gemini', 'antigravity-cli');
    if (fs.existsSync(primaryPath)) {
      return primaryPath;
    }
    return path.join(home, '.gemini', 'antigravity');
  }

  /**
   * Discovers available local Antigravity models and aliases.
   */
  async discoverModels(timeoutMs: number = 2500): Promise<ModelInfo[]> {
    return discoverModels(timeoutMs, this.customAgyPath, this.executor);
  }

  /**
   * Parses output from `agy models`.
   */
  parseModelsOutput(output: string): ModelInfo[] {
    return parseModelsOutput(output);
  }

  /**
   * Normalizes a StatuslineSnapshot with time-decay and reset awareness.
   */
  normalizeQuotaSnapshot(
    snapshot: StatuslineSnapshot | null | undefined,
    now: number | Date = Date.now()
  ): StatuslineSnapshot | null {
    return normalizeStatuslineSnapshot(snapshot, now);
  }

  /**
   * Reads live state and quota from `last_statusline_input.json`.
   */
  async getStatuslineSnapshot(
    now: number | Date = Date.now()
  ): Promise<StatuslineSnapshot | null> {
    return getQuotaSnapshot(this.appDataDir, now);
  }

  /**
   * Generates the standard Sandcastle worker contract prompt.
   */
  buildWorkerPrompt(repo: string, issueNumber: number): string {
    return buildWorkerPrompt(repo, issueNumber);
  }

  /**
   * Builds typed CLI arguments for `agy`.
   */
  buildWorkerArgs(options: AntigravityWorkerOptions): string[] {
    return buildWorkerArgs(options);
  }

  /**
   * Launches an isolated Antigravity CLI subagent process.
   */
  async runWorker(
    options: AntigravityWorkerOptions
  ): Promise<AntigravityWorkerResult> {
    return spawnWorkerProcess(options, {
      customAgyPath: this.customAgyPath,
      executor: this.executor,
    });
  }
}
