import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  ModelInfo,
  StatuslineSnapshot,
  StatuslineQuotaInfo,
  AntigravityWorkerOptions,
  AntigravityWorkerResult,
  AntigravityServiceOptions,
  AgyCommandExecutor,
} from '../types/antigravity.js';

export const defaultAgyExecutor: AgyCommandExecutor = async (file, args, options = {}) => {
  const { signal, onStdout, onStderr, ...execaOptions } = options;
  const subprocess = execa(file, args, {
    ...execaOptions,
    ...(signal ? { cancelSignal: signal } : {}),
    killDescendants: true,
  });

  if (onStdout && subprocess.stdout) {
    subprocess.stdout.on('data', (chunk: Buffer | string) => {
      onStdout(chunk.toString());
    });
  }

  if (onStderr && subprocess.stderr) {
    subprocess.stderr.on('data', (chunk: Buffer | string) => {
      onStderr(chunk.toString());
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
    id: 'Gemini 3.7 Flash',
    name: 'Gemini 3.7 Flash',
    aliases: ['3.7-flash', 'flash', 'gemini-3.7-flash', 'default'],
    isDefault: true,
  },
  {
    id: 'Gemini 3.1 Pro',
    name: 'Gemini 3.1 Pro',
    aliases: ['3.1-pro', 'pro', 'gemini-3.1-pro'],
    isDefault: false,
  },
  {
    id: 'Gemini 3.6 Flash',
    name: 'Gemini 3.6 Flash',
    aliases: ['3.6-flash', 'gemini-3.6-flash'],
    isDefault: false,
  },
  {
    id: 'Gemini 3.5 Flash',
    name: 'Gemini 3.5 Flash',
    aliases: ['3.5-flash', 'gemini-3.5-flash'],
    isDefault: false,
  },
  {
    id: 'Claude Sonnet 4.6 (Thinking)',
    name: 'Claude Sonnet 4.6 (Thinking)',
    aliases: ['claude-sonnet', 'sonnet', 'claude-3.7-sonnet'],
    isDefault: false,
  },
  {
    id: 'Claude Opus 4.6 (Thinking)',
    name: 'Claude Opus 4.6 (Thinking)',
    aliases: ['claude-opus', 'opus'],
    isDefault: false,
  },
  {
    id: 'GPT-OSS 120B (Medium)',
    name: 'GPT-OSS 120B (Medium)',
    aliases: ['gpt-oss', 'gpt-120b'],
    isDefault: false,
  },
];

/**
 * Normalizes any model identifier or alias into an exact agy-recognized model name.
 */
export function resolveAgyModel(modelName?: string, effort?: string): string {
  if (!modelName) {
    if (effort === 'medium') return 'Gemini 3.7 Flash (Medium)';
    if (effort === 'low') return 'Gemini 3.7 Flash (Low)';
    return 'Gemini 3.7 Flash (High)';
  }

  const trimmed = modelName.trim();

  // If already exact model with parenthesized effort/mode, check if it needs effort override or return as is
  if (/\([^)]+\)$/.test(trimmed)) {
    if (
      effort &&
      (trimmed.startsWith('Gemini 3.7 Flash') ||
        trimmed.startsWith('Gemini 3.6 Flash') ||
        trimmed.startsWith('Gemini 3.5 Flash'))
    ) {
      const prefix = trimmed.replace(/\s*\([^)]+\)$/, '');
      const eff =
        effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
      return `${prefix} (${eff})`;
    }
    if (effort && trimmed.startsWith('Gemini 3.1 Pro')) {
      const eff = effort === 'low' ? 'Low' : 'High';
      return `Gemini 3.1 Pro (${eff})`;
    }
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (
    (lower.includes('3.7') && lower.includes('flash')) ||
    lower === 'flash' ||
    lower === 'gemini-3.7-flash' ||
    lower === 'default'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.7 Flash (${eff})`;
  }
  if (
    (lower.includes('3.6') && lower.includes('flash')) ||
    lower === '3.6-flash' ||
    lower === 'gemini-3.6-flash'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.6 Flash (${eff})`;
  }
  if (
    (lower.includes('3.5') && lower.includes('flash')) ||
    lower === '3.5-flash' ||
    lower === 'gemini-3.5-flash'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.5 Flash (${eff})`;
  }
  if (
    (lower.includes('3.1') && lower.includes('pro')) ||
    lower === 'pro' ||
    lower === 'gemini-3.1-pro' ||
    lower === 'gemini-pro'
  ) {
    const eff = effort === 'low' ? 'Low' : 'High';
    return `Gemini 3.1 Pro (${eff})`;
  }
  if (
    lower.includes('sonnet') ||
    lower.includes('claude-3.7') ||
    lower.includes('claude-sonnet')
  ) {
    return 'Claude Sonnet 4.6 (Thinking)';
  }
  if (lower.includes('opus') || lower.includes('claude-opus')) {
    return 'Claude Opus 4.6 (Thinking)';
  }
  if (lower.includes('gpt') || lower.includes('120b')) {
    return 'GPT-OSS 120B (Medium)';
  }

  // Check alias match from FALLBACK_MODELS
  for (const m of FALLBACK_MODELS) {
    if (
      m.id.toLowerCase() === lower ||
      m.aliases?.some((a) => a.toLowerCase() === lower)
    ) {
      return m.id;
    }
  }

  return trimmed;
}

/**
 * Normalizes a single quota info object based on current timestamp and reset_time.
 */
export function normalizeQuotaInfo(
  info: StatuslineQuotaInfo,
  now: number | Date = Date.now()
): StatuslineQuotaInfo {
  if (!info || typeof info !== 'object') {
    return info;
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();

  if (info.reset_time && typeof info.reset_time === 'string') {
    const resetDate = new Date(info.reset_time);
    const resetMs = resetDate.getTime();

    if (!isNaN(resetMs)) {
      if (resetMs <= nowMs) {
        return {
          ...info,
          remaining_fraction: 1.0,
          reset_in_seconds: 0,
        };
      } else {
        const remainingSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
        return {
          ...info,
          reset_in_seconds: remainingSeconds,
        };
      }
    }
  }

  return { ...info };
}

/**
 * Normalizes all quota pools in a StatuslineSnapshot based on time-decay and reset timestamps.
 */
export function normalizeStatuslineSnapshot(
  snapshot: StatuslineSnapshot | null | undefined,
  now: number | Date = Date.now()
): StatuslineSnapshot | null {
  if (!snapshot) {
    return null;
  }

  if (!snapshot.quota || typeof snapshot.quota !== 'object') {
    return { ...snapshot };
  }

  const normalizedQuota: Record<string, StatuslineQuotaInfo> = {};
  for (const [poolKey, poolInfo] of Object.entries(snapshot.quota)) {
    if (poolInfo && typeof poolInfo === 'object') {
      normalizedQuota[poolKey] = normalizeQuotaInfo(poolInfo, now);
    } else {
      normalizedQuota[poolKey] = poolInfo;
    }
  }

  return {
    ...snapshot,
    quota: normalizedQuota,
  };
}

/**
 * Resolves candidate quota pool info for a given model or identifier from a statusline snapshot.
 */
export function resolveCandidateQuotaInfo(
  model?: ModelInfo | string,
  snapshot?: StatuslineSnapshot | null,
  now: number | Date = Date.now()
): StatuslineQuotaInfo | undefined {
  if (!snapshot?.quota) {
    return undefined;
  }

  const modelId = typeof model === 'string' ? model : model?.id;
  const modelAliases = typeof model === 'object' && model ? model.aliases : undefined;

  const candidateKeys: string[] = [];

  // 1. Direct match on model ID and lower-case
  if (modelId) {
    candidateKeys.push(modelId);
    if (!candidateKeys.includes(modelId.toLowerCase())) {
      candidateKeys.push(modelId.toLowerCase());
    }
  }

  // 2. Model aliases
  if (modelAliases && Array.isArray(modelAliases)) {
    for (const alias of modelAliases) {
      if (alias && !candidateKeys.includes(alias)) {
        candidateKeys.push(alias);
      }
      if (alias && !candidateKeys.includes(alias.toLowerCase())) {
        candidateKeys.push(alias.toLowerCase());
      }
    }
  }

  // 3. Pool-based resolution for Antigravity quota tiers
  const lowerId = (modelId || '').toLowerCase();
  const isGeminiFamily =
    lowerId.startsWith('gemini') ||
    lowerId.includes('flash') ||
    lowerId.includes('pro') ||
    (modelAliases?.some((a) => {
      const al = a.toLowerCase();
      return al.startsWith('gemini') || al.includes('flash') || al.includes('pro');
    }) ?? false);

  const is3pFamily =
    lowerId.startsWith('claude') ||
    lowerId.startsWith('gpt') ||
    lowerId.startsWith('3p') ||
    lowerId.includes('sonnet') ||
    lowerId.includes('opus') ||
    lowerId.includes('oss') ||
    (modelAliases?.some((a) => {
      const al = a.toLowerCase();
      return (
        al.startsWith('claude') ||
        al.startsWith('gpt') ||
        al.startsWith('3p') ||
        al.includes('sonnet') ||
        al.includes('opus')
      );
    }) ?? false);

  if (isGeminiFamily) {
    for (const key of ['gemini-5h', 'gemini-weekly', 'gemini']) {
      if (!candidateKeys.includes(key)) {
        candidateKeys.push(key);
      }
    }
  } else if (is3pFamily) {
    for (const key of ['3p-5h', '3p-weekly', '3p']) {
      if (!candidateKeys.includes(key)) {
        candidateKeys.push(key);
      }
    }
  }

  // Evaluate all candidate pools present in the snapshot
  const evaluatedCandidates: StatuslineQuotaInfo[] = [];

  for (const key of candidateKeys) {
    const rawEntry = snapshot.quota[key];
    if (rawEntry && typeof rawEntry === 'object' && typeof rawEntry.remaining_fraction === 'number') {
      const normalized = normalizeQuotaInfo(rawEntry, now);
      evaluatedCandidates.push(normalized);
    }
  }

  // If no candidates matched by model name/family, evaluate any remaining pools in snapshot as fallback
  if (evaluatedCandidates.length === 0) {
    for (const rawEntry of Object.values(snapshot.quota)) {
      if (rawEntry && typeof rawEntry === 'object' && typeof rawEntry.remaining_fraction === 'number') {
        evaluatedCandidates.push(normalizeQuotaInfo(rawEntry, now));
      }
    }
  }

  // Multi-tier quota resolution:
  // A model is constrained by the bottleneck (minimum remaining_fraction) among all its candidate pools.
  // E.g., if a 5-hour pool is at 0% (exhausted), the model cannot be used (0% quota) with its 5h countdown.
  // If a 5-hour pool is replenished (100%) but weekly pool is at 52%, the actual available quota is 52%.
  // If fractions are tied, pick the candidate with an active reset countdown (> 0).
  if (evaluatedCandidates.length === 0) {
    return undefined;
  }

  return evaluatedCandidates.reduce((bottleneck, current) => {
    if (current.remaining_fraction < bottleneck.remaining_fraction) {
      return current;
    }
    if (current.remaining_fraction === bottleneck.remaining_fraction) {
      const currentReset = current.reset_in_seconds ?? 0;
      const bottleneckReset = bottleneck.reset_in_seconds ?? 0;
      if (currentReset > 0 && bottleneckReset === 0) {
        return current;
      }
    }
    return bottleneck;
  });
}

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
    try {
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        const { stdout } = await this.executor(this.customAgyPath, ['models'], {
          signal: abortController.signal,
        });
        const models = this.parseModelsOutput(stdout);
        if (models.length > 0) {
          return models;
        }
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Fallback on error or timeout
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

    let inAvailableBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.toLowerCase().startsWith('available models:')) {
        inAvailableBlock = true;
        continue;
      }

      // Format 1: - <id> (alias: <a1>, <a2>)
      if (trimmed.startsWith('-')) {
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
            isDefault: defaultModelId ? id === defaultModelId : id === 'Gemini 3.7 Flash (High)',
          });
        }
      } else if (inAvailableBlock && (trimmed.startsWith('Gemini') || trimmed.startsWith('Claude') || trimmed.startsWith('GPT'))) {
        // Format 2: Indented model names from agy
        const id = trimmed;
        models.push({
          id,
          name: id,
          isDefault: id === 'Gemini 3.7 Flash (High)',
        });
      }
    }

    return models;
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
  async getStatuslineSnapshot(now: number | Date = Date.now()): Promise<StatuslineSnapshot | null> {
    const candidateDirs: string[] = [];
    if (this.appDataDir) {
      candidateDirs.push(this.appDataDir);
    } else {
      if (process.env.GEMINI_APP_DIR) {
        candidateDirs.push(process.env.GEMINI_APP_DIR);
      }
      const home = os.homedir();
      candidateDirs.push(path.join(home, '.gemini', 'antigravity-cli'));
      candidateDirs.push(path.join(home, '.gemini', 'antigravity'));
      candidateDirs.push(path.join(home, '.antigravity'));
    }

    for (const dir of candidateDirs) {
      try {
        const statuslineFile = path.join(dir, 'last_statusline_input.json');
        if (fs.existsSync(statuslineFile)) {
          const raw = fs.readFileSync(statuslineFile, 'utf-8');
          if (raw && raw.trim()) {
            const parsed = JSON.parse(raw) as StatuslineSnapshot;
            return this.normalizeQuotaSnapshot(parsed, now);
          }
        }
      } catch {
        // Continue checking other candidates
      }
    }

    return null;
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

    const resolvedModel = resolveAgyModel(options.model, options.reasoningEffort);
    args.push('--model', resolvedModel);

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
