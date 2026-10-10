import { execa } from 'execa';
import { resolveModel } from './model-parser.js';

export type AgyCommandExecutor = (
  file: string,
  args: string[],
  options?: any
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface WorkerExecutionRequest {
  repo: string;
  issueNumber: number;
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  timeout?: string | number;
  prompt?: string;
  dangerouslySkipPermissions?: boolean;
  additionalArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface WorkerProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
  aborted?: boolean;
}

export const defaultProcessSpawner: AgyCommandExecutor = async (
  file,
  args,
  options = {}
) => {
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

/**
 * Generates the standard Sandcastle worker contract prompt.
 */
export function buildWorkerPrompt(repo: string, issueNumber: number): string {
  return (
    `Use sandcastle skill. Repository: ${repo} Issue: #${issueNumber}. ` +
    `Follow the Sandcastle worker contract: read issue, implement minimal clean solution, ` +
    `verify with tests, commit, push branch, open PR, merge PR, and close issue #${issueNumber}.`
  );
}

/**
 * Builds typed CLI arguments for `agy`.
 */
export function buildWorkerArgs(options: WorkerExecutionRequest): string[] {
  const args: string[] = [];

  if (options.dangerouslySkipPermissions !== false) {
    args.push('--dangerously-skip-permissions');
  }

  const timeout =
    typeof options.timeout === 'number'
      ? `${Math.round(options.timeout / 60000)}m`
      : options.timeout ?? '30m';
  args.push('--print-timeout', timeout);

  const resolvedModel = resolveModel(options.model, options.reasoningEffort);
  args.push('--model', resolvedModel);

  const prompt =
    options.prompt ?? buildWorkerPrompt(options.repo, options.issueNumber);
  args.push('--prompt', prompt);

  if (options.cwd) {
    args.push('--add-dir', options.cwd);
  }

  if (options.additionalArgs && options.additionalArgs.length > 0) {
    args.push(...options.additionalArgs);
  }

  return args;
}

export interface SpawnWorkerOptions {
  customAgyPath?: string;
  executor?: AgyCommandExecutor;
}

/**
 * Spawns an isolated Antigravity worker process with killDescendants, env configuration,
 * and stdio streaming.
 */
export async function spawnWorkerProcess(
  request: WorkerExecutionRequest,
  options: SpawnWorkerOptions = {}
): Promise<WorkerProcessResult> {
  const executor = options.executor ?? defaultProcessSpawner;
  const customAgyPath = options.customAgyPath ?? 'agy';
  const args = buildWorkerArgs(request);

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    FORCE_COLOR: '3',
    COLORTERM: 'truecolor',
    ...(request.env || {}),
  };

  const startTime = Date.now();

  try {
    const result = await executor(customAgyPath, args, {
      cwd: request.cwd,
      env,
      signal: request.signal,
      onStdout: request.onStdout,
      onStderr: request.onStderr,
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
    const isAborted = request.signal?.aborted || err?.name === 'AbortError';
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
