import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  ModelInfo,
  StatuslineSnapshot,
  AntigravityWorkerOptions,
  AntigravityWorkerResult,
  AntigravityServiceOptions,
  AgyCommandExecutor,
} from '../types/antigravity.js';

export const defaultAgyExecutor: AgyCommandExecutor = async (file, args, options = {}) => {
  const subprocess = execa(file, args, {
    ...options,
    killDescendants: true,
  });

  if (options.onStdout && subprocess.stdout) {
    subprocess.stdout.on('data', (chunk: Buffer | string) => {
      options.onStdout(chunk.toString());
    });
  }

  if (options.onStderr && subprocess.stderr) {
    subprocess.stderr.on('data', (chunk: Buffer | string) => {
      options.onStderr(chunk.toString());
    });
  }

  const result = await subprocess;
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 0,
  };
};

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.7-flash-thinking',
    name: 'gemini-3.7-flash-thinking',
    aliases: ['flash-thinking', '3.7-flash-thinking'],
    isDefault: true,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'gemini-3.7-flash',
    aliases: ['flash', '3.7-flash'],
    isDefault: false,
  },
  {
    id: 'gemini-3.7-pro',
    name: 'gemini-3.7-pro',
    aliases: ['pro', '3.7-pro'],
    isDefault: false,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'gemini-2.5-flash',
    aliases: ['2.5-flash'],
    isDefault: false,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'gemini-2.5-pro',
    aliases: ['2.5-pro'],
    isDefault: false,
  },
];

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
  async discoverModels(): Promise<ModelInfo[]> {
    try {
      const { stdout } = await this.executor(this.customAgyPath, ['models'], {});
      const models = this.parseModelsOutput(stdout);
      if (models.length > 0) {
        return models;
      }
    } catch {
      // Fallback on error
    }

    return [...FALLBACK_MODELS];
  }

  /**
   * Parses output from `agy models`.
   */
  parseModelsOutput(output: string): ModelInfo[] {
    if (!output || !output.trim()) {
      return [];
    }

    const models: ModelInfo[] = [];
    const lines = output.split(/\r?\n/);
    let defaultModelId = '';

    // Search for default model indicator
    for (const line of lines) {
      const defaultMatch = line.match(/Default\s+model:\s*([^\s]+)/i);
      if (defaultMatch && defaultMatch[1]) {
        defaultModelId = defaultMatch[1].trim();
      }
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('-')) continue;

      // Format: - <id> (alias: <a1>, <a2>)
      const modelMatch = trimmed.match(/^-\s*([^\s(]+)(?:\s*\((?:alias:\s*)?([^)]+)\))?/i);
      if (modelMatch && modelMatch[1]) {
        const id = modelMatch[1].trim();
        const rawAliases = modelMatch[2] ? modelMatch[2].replace(/^alias:\s*/i, '').trim() : '';
        const aliases = rawAliases
          ? rawAliases.split(',').map((a) => a.trim()).filter(Boolean)
          : [];

        models.push({
          id,
          name: id,
          aliases: aliases.length > 0 ? aliases : undefined,
          isDefault: defaultModelId ? id === defaultModelId : false,
        });
      }
    }

    return models;
  }

  /**
   * Reads live state and quota from `last_statusline_input.json`.
   */
  async getStatuslineSnapshot(): Promise<StatuslineSnapshot | null> {
    try {
      const appDir = this.getAppDataDir();
      const statuslineFile = path.join(appDir, 'last_statusline_input.json');
      if (!fs.existsSync(statuslineFile)) {
        return null;
      }
      const raw = fs.readFileSync(statuslineFile, 'utf-8');
      if (!raw || !raw.trim()) {
        return null;
      }
      return JSON.parse(raw) as StatuslineSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Generates the standard Sandcastle worker contract prompt.
   */
  buildWorkerPrompt(repo: string, issueNumber: number): string {
    return (
      `Use sandcastle skill. Repository: ${repo} Issue: #${issueNumber}. ` +
      `Follow the Sandcastle worker contract: read issue, implement minimal clean solution, ` +
      `verify with tests, commit, push branch, open PR, merge PR, and close issue #${issueNumber}.`
    );
  }

  /**
   * Builds typed CLI arguments for `agy`.
   */
  buildWorkerArgs(options: AntigravityWorkerOptions): string[] {
    const args: string[] = [];

    if (options.dangerouslySkipPermissions !== false) {
      args.push('--dangerously-skip-permissions');
    }

    const timeout = typeof options.timeout === 'number' ? `${Math.round(options.timeout / 60000)}m` : options.timeout ?? '30m';
    args.push('--print-timeout', timeout);

    if (options.reasoningEffort) {
      args.push('--effort', options.reasoningEffort);
    }

    if (options.model) {
      args.push('--model', options.model);
    }

    const prompt = options.prompt ?? this.buildWorkerPrompt(options.repo, options.issueNumber);
    args.push('--prompt', prompt);

    if (options.additionalArgs && options.additionalArgs.length > 0) {
      args.push(...options.additionalArgs);
    }

    return args;
  }

  /**
   * Launches an isolated Antigravity CLI subagent process.
   */
  async runWorker(options: AntigravityWorkerOptions): Promise<AntigravityWorkerResult> {
    const args = this.buildWorkerArgs(options);
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      FORCE_COLOR: '3',
      COLORTERM: 'truecolor',
      ...(options.env || {}),
    };

    const startTime = Date.now();

    try {
      const result = await this.executor(this.customAgyPath, args, {
        cwd: options.cwd,
        env,
        signal: options.signal,
        onStdout: options.onStdout,
        onStderr: options.onStderr,
      });

      const durationMs = Date.now() - startTime;
      return {
        exitCode: result.exitCode ?? 0,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs,
      };
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      const isAborted = options.signal?.aborted || err?.name === 'AbortError';
      const timedOut = err?.timedOut || false;

      return {
        exitCode: err?.exitCode ?? (isAborted ? 130 : 1),
        stdout: err?.stdout ?? '',
        stderr: err?.stderr ?? err?.message ?? '',
        durationMs,
        aborted: isAborted,
        timedOut,
      };
    }
  }
}
