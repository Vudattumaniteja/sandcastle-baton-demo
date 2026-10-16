import {
  AgyCommandExecutor,
  WorkerExecutionRequest,
  WorkerProcessResult,
  buildWorkerPrompt,
  buildWorkerArgs,
  spawnWorkerProcess,
  defaultProcessSpawner,
} from './lib/process-spawner.js';

export {
  defaultProcessSpawner,
  buildWorkerPrompt,
  buildWorkerArgs,
  spawnWorkerProcess,
  type WorkerProcessResult,
};
import { restoreCursor } from './lib/signal-trap.js';
import {
  isQuotaError,
  resolveQuotaDelay,
  getQuotaSnapshot,
  type StatuslineSnapshot,
} from './lib/quota-evaluator.js';
import { sleep } from './lib/watchdog-timer.js';
import type { SupervisorEvent, SuperviseResult } from '../../types/supervisor.js';

export {
  discoverModels,
  resolveModel,
  DEFAULT_MODEL_ID,
  FALLBACK_MODELS,
  type ModelInfo,
  parseModelsOutput,
} from './models.js';

export {
  TranscriptTailer,
  type TranscriptStep,
  type TranscriptStats,
  type TranscriptSummary,
  type TranscriptTailerOptions,
  type TranscriptTailerEventMap,
  type ParsedToolCall,
} from './transcript.js';

export {
  getQuotaSnapshot,
  resolveQuotaDelay,
  normalizeQuotaInfo,
  normalizeStatuslineSnapshot,
  resolveCandidateQuotaInfo,
  isQuotaError,
  type StatuslineSnapshot,
  type StatuslineQuotaInfo,
} from './quota.js';

export type {
  AgyCommandExecutor,
  WorkerExecutionRequest,
  SupervisorEvent,
};

export type WorkerExecutionResult = SuperviseResult;

export interface WorkerSupervisorOptions {
  customAgyPath?: string;
  appDataDir?: string;
  executor?: AgyCommandExecutor;
  antigravityService?: any;
  maxRetries?: number;
  outerTimeoutMs?: number;
  escalationGracePeriodMs?: number;
  sleeper?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onEvent?: (event: SupervisorEvent) => void;
}

export class WorkerSupervisor {
  private customAgyPath: string;
  private appDataDir?: string;
  private executor: AgyCommandExecutor;
  private antigravityService?: any;
  private maxRetries: number;
  private outerTimeoutMs?: number;
  private escalationGracePeriodMs: number;
  private sleeper: (ms: number, signal?: AbortSignal) => Promise<void>;
  private onEvent?: (event: SupervisorEvent) => void;
  private activeController?: AbortController;

  constructor(options: WorkerSupervisorOptions = {}) {
    this.customAgyPath = options.customAgyPath ?? 'agy';
    this.appDataDir = options.appDataDir;
    this.executor = options.executor ?? defaultProcessSpawner;
    this.antigravityService = options.antigravityService;
    this.maxRetries = options.maxRetries ?? 2;
    this.outerTimeoutMs = options.outerTimeoutMs;
    this.escalationGracePeriodMs = options.escalationGracePeriodMs ?? 5000;
    this.sleeper = options.sleeper ?? ((ms, signal) => this.sleep(ms, signal));
    this.onEvent = options.onEvent;
  }

  /**
   * Cancellable delay using AbortSignal. Active timers are cleared immediately on abort.
   */
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return sleep(ms, signal);
  }

  /**
   * Emits structured supervisor event to subscriber if attached.
   */
  private emit(event: SupervisorEvent): void {
    if (this.onEvent) {
      this.onEvent(event);
    }
  }

  /**
   * Restores terminal cursor visibility (\x1b[?25h).
   */
  restoreCursor(): void {
    restoreCursor();
  }

  /**
   * Registers central signal trap handlers for graceful cleanup.
   */
  registerSignalHandlers(): () => void {
    const handleSignal = (sig: string) => {
      this.restoreCursor();
      this.emit({ type: 'signal_abort', signal: sig, graceful: true });

      if (this.activeController) {
        this.activeController.abort();
      }

      const forceTimer = setTimeout(() => {
        this.emit({ type: 'signal_abort', signal: sig, graceful: false });
        process.exit(130);
      }, this.escalationGracePeriodMs);

      if (forceTimer.unref) {
        forceTimer.unref();
      }
    };

    const sigintListener = () => handleSignal('SIGINT');
    const sigtermListener = () => handleSignal('SIGTERM');

    process.on('SIGINT', sigintListener);
    process.on('SIGTERM', sigtermListener);

    const cleanup = () => {
      process.removeListener('SIGINT', sigintListener);
      process.removeListener('SIGTERM', sigtermListener);
    };

    return cleanup;
  }

  /**
   * Evaluates if a worker result indicates an HTTP 429 / Quota limit error.
   */
  isQuotaError(result: { exitCode?: number; stderr?: string; stdout?: string }): boolean {
    return isQuotaError(result);
  }

  /**
   * Calculates quota backoff delay using statusline snapshot or fallback duration.
   */
  async resolveQuotaDelayMs(now: number | Date = Date.now()): Promise<number> {
    try {
      let snapshot: StatuslineSnapshot | null = null;
      if (this.antigravityService?.getStatuslineSnapshot) {
        snapshot = await this.antigravityService.getStatuslineSnapshot(now);
      } else {
        snapshot = await getQuotaSnapshot(this.appDataDir, now);
      }
      return resolveQuotaDelay(snapshot, now);
    } catch {
      return 60000;
    }
  }

  /**
   * Executes an issue worker under supervised retries, dual-tier timeouts, and quota handling.
   */
  async execute(
    workerOptions: WorkerExecutionRequest,
    parentSignal?: AbortSignal
  ): Promise<WorkerExecutionResult> {
    const maxAttempts = 1 + this.maxRetries;
    let attempt = 1;
    let consecutiveQuotaPauses = 0;
    let totalDurationMs = 0;
    let lastResult: WorkerProcessResult | undefined;
    let failureFeedback = '';

    const cleanupSignals = this.registerSignalHandlers();

    try {
      while (attempt <= maxAttempts) {
        if (parentSignal?.aborted) {
          this.restoreCursor();
          return {
            success: false,
            status: 'aborted',
            attempts: attempt,
            totalDurationMs,
            error: 'Execution aborted by parent signal.',
          };
        }

        this.emit({
          type: 'attempt_start',
          attempt,
          maxAttempts,
          issueNumber: workerOptions.issueNumber,
        });

        const controller = new AbortController();
        this.activeController = controller;

        const onParentAbort = () => controller.abort();
        if (parentSignal) {
          parentSignal.addEventListener('abort', onParentAbort);
        }

        let isTimedOut = false;
        let timeoutHandle: NodeJS.Timeout | undefined;

        if (this.outerTimeoutMs && this.outerTimeoutMs > 0) {
          timeoutHandle = setTimeout(() => {
            isTimedOut = true;
            this.emit({
              type: 'timeout',
              tier: 'outer',
              durationMs: this.outerTimeoutMs!,
            });
            controller.abort();
          }, this.outerTimeoutMs);
        }

        let prompt = workerOptions.prompt;
        if (!prompt) {
          if (typeof this.antigravityService?.buildWorkerPrompt === 'function') {
            prompt = this.antigravityService.buildWorkerPrompt(
              workerOptions.repo,
              workerOptions.issueNumber
            );
          } else {
            prompt = buildWorkerPrompt(
              workerOptions.repo,
              workerOptions.issueNumber
            );
          }
        }

        if (failureFeedback) {
          prompt +=
            `\n\n[Sandcastle Retry Context - Attempt ${attempt}/${maxAttempts}]\n` +
            `Previous attempt failed. Error output:\n${failureFeedback}\n` +
            `Please fix the issue and ensure all tests pass.`;
        }

        let runResult: WorkerProcessResult;
        if (this.antigravityService?.runWorker) {
          runResult = await this.antigravityService.runWorker({
            ...workerOptions,
            prompt,
            signal: controller.signal,
          });
        } else {
          runResult = await spawnWorkerProcess(
            {
              ...workerOptions,
              prompt,
              signal: controller.signal,
            },
            {
              customAgyPath: this.customAgyPath,
              executor: this.executor,
            }
          );
        }

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (parentSignal) {
          parentSignal.removeEventListener('abort', onParentAbort);
        }
        this.activeController = undefined;

        lastResult = runResult;
        totalDurationMs += runResult.durationMs;

        if (isTimedOut || runResult.timedOut) {
          this.restoreCursor();
          return {
            success: false,
            status: 'timed_out',
            attempts: attempt,
            totalDurationMs,
            lastExitCode: runResult.exitCode,
            lastStdout: runResult.stdout,
            lastStderr: runResult.stderr,
            error: 'Process exceeded outer watchdog timeout.',
          };
        }

        if (parentSignal?.aborted || runResult.aborted) {
          this.restoreCursor();
          return {
            success: false,
            status: 'aborted',
            attempts: attempt,
            totalDurationMs,
            lastExitCode: runResult.exitCode,
            lastStdout: runResult.stdout,
            lastStderr: runResult.stderr,
            error: 'Process was aborted by signal.',
          };
        }

        if (this.isQuotaError(runResult)) {
          if (consecutiveQuotaPauses >= 3) {
            failureFeedback =
              runResult.stderr || 'Quota rate limit exceeded maximum consecutive pauses (3)';
            this.emit({
              type: 'attempt_failed',
              attempt,
              maxAttempts,
              issueNumber: workerOptions.issueNumber,
              error: failureFeedback,
              exitCode: runResult.exitCode,
            });
            this.emit({
              type: 'blocked',
              issueNumber: workerOptions.issueNumber,
              reason: `Exceeded maximum consecutive quota pauses (3). Final error: ${failureFeedback}`,
              totalAttempts: attempt,
            });
            this.restoreCursor();
            const quotaErrorMessage = `Exceeded maximum consecutive quota pauses (3). Final error: ${failureFeedback}`;
            return {
              success: false,
              status: 'blocked',
              attempts: attempt,
              totalDurationMs,
              lastExitCode: runResult.exitCode,
              lastStdout: runResult.stdout,
              lastStderr: runResult.stderr,
              error: quotaErrorMessage,
            };
          }

          consecutiveQuotaPauses++;
          const pauseDelayMs = await this.resolveQuotaDelayMs();
          const resumeAt = new Date(Date.now() + pauseDelayMs);

          this.emit({
            type: 'quota_pause',
            pauseDurationMs: pauseDelayMs,
            reason: runResult.stderr || runResult.stdout || 'Quota rate limit (HTTP 429)',
            resumeAt,
          });

          const pauseController = new AbortController();
          this.activeController = pauseController;

          const onParentAbort = () => pauseController.abort();
          if (parentSignal) {
            if (parentSignal.aborted) {
              pauseController.abort();
            } else {
              parentSignal.addEventListener('abort', onParentAbort);
            }
          }

          try {
            await this.sleeper(pauseDelayMs, pauseController.signal);
          } catch (err) {
            if (parentSignal?.aborted || pauseController.signal.aborted) {
              this.restoreCursor();
              return {
                success: false,
                status: 'aborted',
                attempts: attempt,
                totalDurationMs,
                lastExitCode: runResult.exitCode,
                lastStdout: runResult.stdout,
                lastStderr: runResult.stderr,
                error: 'Process was aborted by signal.',
              };
            }
            throw err;
          } finally {
            if (parentSignal) {
              parentSignal.removeEventListener('abort', onParentAbort);
            }
            this.activeController = undefined;
          }

          this.emit({ type: 'quota_resume' });
          // Retry without consuming attempt
          continue;
        }

        consecutiveQuotaPauses = 0;

        if (runResult.exitCode === 0) {
          this.emit({
            type: 'attempt_success',
            attempt,
            issueNumber: workerOptions.issueNumber,
            durationMs: runResult.durationMs,
          });
          this.restoreCursor();
          return {
            success: true,
            status: 'completed',
            attempts: attempt,
            totalDurationMs,
            lastExitCode: 0,
            lastStdout: runResult.stdout,
            lastStderr: runResult.stderr,
          };
        }

        // Code / Verification failure
        failureFeedback = runResult.stderr || runResult.stdout || `Exit code ${runResult.exitCode}`;

        this.emit({
          type: 'attempt_failed',
          attempt,
          maxAttempts,
          issueNumber: workerOptions.issueNumber,
          error: failureFeedback,
          exitCode: runResult.exitCode,
        });

        if (attempt < maxAttempts) {
          attempt++;
        } else {
          // Exhausted all retries
          this.emit({
            type: 'blocked',
            issueNumber: workerOptions.issueNumber,
            reason: `Exhausted ${maxAttempts} attempts. Final error: ${failureFeedback}`,
            totalAttempts: maxAttempts,
          });
          this.restoreCursor();
          return {
            success: false,
            status: 'blocked',
            attempts: maxAttempts,
            totalDurationMs,
            lastExitCode: runResult.exitCode,
            lastStdout: runResult.stdout,
            lastStderr: runResult.stderr,
            error: failureFeedback,
          };
        }
      }

      this.restoreCursor();
      return {
        success: false,
        status: 'blocked',
        attempts: maxAttempts,
        totalDurationMs,
        lastExitCode: lastResult?.exitCode ?? 1,
        lastStdout: lastResult?.stdout,
        lastStderr: lastResult?.stderr,
        error: failureFeedback || 'Execution failed',
      };
    } finally {
      cleanupSignals();
      this.restoreCursor();
    }
  }
}
