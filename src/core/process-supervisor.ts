import { AntigravityService } from '../services/antigravity-service.js';
import type {
  AntigravityWorkerOptions,
  AntigravityWorkerResult,
} from '../types/antigravity.js';
import type {
  SupervisorEvent,
  ProcessSupervisorOptions,
  SuperviseResult,
} from '../types/supervisor.js';

export class ProcessSupervisor {
  private antigravityService: AntigravityService;
  private maxRetries: number;
  private outerTimeoutMs?: number;
  private escalationGracePeriodMs: number;
  private sleeper: (ms: number, signal?: AbortSignal) => Promise<void>;
  private onEvent?: (event: SupervisorEvent) => void;
  private activeController?: AbortController;
  private signalCleanup?: () => void;

  constructor(options: ProcessSupervisorOptions = {}) {
    this.antigravityService = options.antigravityService ?? new AntigravityService();
    this.maxRetries = options.maxRetries ?? 2;
    this.outerTimeoutMs = options.outerTimeoutMs;
    this.escalationGracePeriodMs = options.escalationGracePeriodMs ?? 5000;
    this.sleeper =
      options.sleeper ?? ((ms, signal) => this.sleep(ms, signal));
    this.onEvent = options.onEvent;
  }

  /**
   * Cancellable delay using AbortSignal. Active timers are cleared immediately on abort.
   */
  async sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason ?? new Error('Aborted'));
        return;
      }

      let timer: NodeJS.Timeout | undefined;
      const onAbort = () => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(signal?.reason ?? new Error('Aborted'));
      };

      timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      }, ms);

      signal?.addEventListener('abort', onAbort, { once: true });
    });
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
    try {
      process.stdout.write('\x1b[?25h');
    } catch {
      // Ignore if stdout is unavailable
    }
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

    this.signalCleanup = cleanup;
    return cleanup;
  }

  /**
   * Evaluates if a worker result indicates an HTTP 429 / Quota limit error.
   */
  isQuotaError(result: { exitCode?: number; stderr?: string; stdout?: string }): boolean {
    if (result.exitCode === undefined || result.exitCode === 0) {
      return false;
    }
    if (result.exitCode === 429) {
      return true;
    }
    const stderr = result.stderr || '';
    const quotaRegex = /(?:RESOURCE_EXHAUSTED|\(code 429\)|quota reached)/i;
    return quotaRegex.test(stderr);
  }

  /**
   * Calculates quota backoff delay using statusline snapshot or fallback duration.
   */
  async resolveQuotaDelayMs(now: number | Date = Date.now()): Promise<number> {
    try {
      const nowMs = typeof now === 'number' ? now : now.getTime();
      const snapshot = await this.antigravityService.getStatuslineSnapshot(now);
      if (snapshot?.quota) {
        for (const key of Object.keys(snapshot.quota)) {
          const q = snapshot.quota[key];
          if (!q) continue;

          // Ignore expired quota pools (reset_time <= now)
          if (q.reset_time && typeof q.reset_time === 'string') {
            const resetMs = new Date(q.reset_time).getTime();
            if (!isNaN(resetMs) && resetMs <= nowMs) {
              continue;
            }
          }

          if (q.remaining_fraction === 0) {
            let delaySeconds = q.reset_in_seconds;
            if (q.reset_time && typeof q.reset_time === 'string') {
              const resetMs = new Date(q.reset_time).getTime();
              if (!isNaN(resetMs)) {
                delaySeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
              }
            }

            if (delaySeconds && delaySeconds > 0) {
              return Math.min(delaySeconds * 1000, 300000); // capped at 5 minutes
            }
          }
        }
      }
    } catch {
      // ignore
    }
    return 60000; // default 60s backoff
  }

  /**
   * Executes an issue worker under supervised retries, dual-tier timeouts, and quota handling.
   */
  async execute(
    workerOptions: AntigravityWorkerOptions,
    parentSignal?: AbortSignal
  ): Promise<SuperviseResult> {
    const maxAttempts = 1 + this.maxRetries;
    let attempt = 1;
    let consecutiveQuotaPauses = 0;
    let totalDurationMs = 0;
    let lastResult: AntigravityWorkerResult | undefined;
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
            prompt =
              `Use sandcastle skill. Repository: ${workerOptions.repo} Issue: #${workerOptions.issueNumber}. ` +
              `Follow the Sandcastle worker contract: read issue, implement minimal clean solution, ` +
              `verify with tests, commit, push branch, open PR, merge PR, and close issue #${workerOptions.issueNumber}.`;
          }
        }

        if (failureFeedback) {
          prompt +=
            `\n\n[Sandcastle Retry Context - Attempt ${attempt}/${maxAttempts}]\n` +
            `Previous attempt failed. Error output:\n${failureFeedback}\n` +
            `Please fix the issue and ensure all tests pass.`;
        }

        const runResult = await this.antigravityService.runWorker({
          ...workerOptions,
          prompt,
          signal: controller.signal,
        });

        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        if (parentSignal) {
          parentSignal.removeEventListener('abort', onParentAbort);
        }
        this.activeController = undefined;

        lastResult = runResult;
        totalDurationMs += runResult.durationMs;

        // Check if aborted or timed out
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

        // Check for HTTP 429 Quota Rate Limit
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
            return {
              success: false,
              status: 'blocked',
              attempts: attempt,
              totalDurationMs,
              lastExitCode: runResult.exitCode,
              lastStdout: runResult.stdout,
              lastStderr: runResult.stderr,
              error: failureFeedback,
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

        // Check success
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
