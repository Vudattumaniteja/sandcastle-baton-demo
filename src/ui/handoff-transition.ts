import type {
  BatonHandoffPayload,
  HandoffAction,
  HandoffRenderMode,
  PacingControllerOptions,
} from '../types/handoff.js';
import { renderHandoffBySurface } from './handoff-formatter.js';

export class HandoffTransitionController {
  private payload: BatonHandoffPayload;
  private durationSeconds: number;
  private remainingSeconds: number;
  private tickIntervalMs: number;
  private stdin: NodeJS.ReadStream;
  private stdout?: NodeJS.WriteStream | ((text: string) => void);
  private isTTY: boolean;
  private mode: HandoffRenderMode;
  private isPaused: boolean;
  private isRunning: boolean;
  private timer?: NodeJS.Timeout;
  private keypressHandler?: (chunk: Buffer | string) => void;
  private resolvePromise?: (action: HandoffAction) => void;
  private options: PacingControllerOptions;

  constructor(options: PacingControllerOptions) {
    this.options = options;
    this.payload = { ...options.payload };
    this.durationSeconds = options.durationSeconds ?? 3.0;
    this.remainingSeconds = this.durationSeconds;
    this.tickIntervalMs = options.tickIntervalMs ?? 100;
    this.stdin = options.stdin ?? process.stdin;
    this.stdout = options.stdout ?? process.stdout;
    this.isTTY =
      options.isTTY !== undefined
        ? options.isTTY
        : Boolean(
            (this.stdout as any)?.isTTY !== undefined
              ? (this.stdout as any)?.isTTY
              : this.stdin.isTTY
          );
    this.mode =
      options.mode ?? options.payload.mode ?? (this.isTTY ? 'run' : 'ci');
    this.isPaused = options.payload.isPaused ?? false;
    this.isRunning = false;
  }

  public getRemainingSeconds(): number {
    return this.remainingSeconds;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  public pause(): void {
    if (!this.isPaused) {
      this.isPaused = true;
      this.payload.isPaused = true;
      if (this.options.onPause) {
        this.options.onPause();
      }
      this.triggerTick();
    }
  }

  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.payload.isPaused = false;
      if (this.options.onResume) {
        this.options.onResume();
      }
      this.triggerTick();
    }
  }

  public togglePause(): void {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  private triggerTick(): void {
    this.payload.countdownSeconds = Math.max(0, this.remainingSeconds);
    this.payload.isPaused = this.isPaused;

    if (this.options.onTick) {
      this.options.onTick(this.remainingSeconds, this.isPaused);
    }
  }

  private write(text: string): void {
    if (!this.stdout) return;
    if (typeof this.stdout === 'function') {
      this.stdout(text);
    } else if (typeof this.stdout.write === 'function') {
      this.stdout.write(text);
    }
  }

  private setupKeyListeners(): void {
    if (!this.stdin) return;

    if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
      try {
        this.stdin.setRawMode(true);
        this.stdin.resume();
      } catch {
        // ignore
      }
    }

    this.keypressHandler = (chunk: Buffer | string) => {
      const key = chunk.toString();

      // Space (' ') or 'p' / 'P' -> Pause/Resume
      if (key === ' ' || key === 'p' || key === 'P') {
        this.togglePause();
        return;
      }

      // Enter ('\r' or '\n') -> Fast-forward / Launch immediately
      if (key === '\r' || key === '\n') {
        if (this.options.onFastForward) {
          this.options.onFastForward();
        }
        this.stop('continue');
        return;
      }

      // 's' or 'S' -> Skip upcoming candidate
      if (key === 's' || key === 'S') {
        if (this.options.onSkip) {
          this.options.onSkip();
        }
        this.stop('skip');
        return;
      }

      // 'q', 'Q', or Ctrl+C ('\u0003') -> Clean abort
      if (key === 'q' || key === 'Q' || key === '\u0003') {
        if (this.options.onAbort) {
          this.options.onAbort();
        }
        this.stop('abort');
        return;
      }
    };

    this.stdin.on('data', this.keypressHandler);
  }

  private cleanupTerminal(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (this.stdin && this.keypressHandler) {
      this.stdin.removeListener('data', this.keypressHandler);
      this.keypressHandler = undefined;
      if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
        try {
          this.stdin.setRawMode(false);
        } catch {
          // ignore
        }
      }
    }
  }

  public stop(action: HandoffAction): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.cleanupTerminal();

    if (this.resolvePromise) {
      const resolve = this.resolvePromise;
      this.resolvePromise = undefined;
      resolve(action);
    }
  }

  public async start(): Promise<HandoffAction> {
    if (this.isRunning) {
      return new Promise<HandoffAction>((resolve) => {
        this.resolvePromise = resolve;
      });
    }

    // Non-interactive / CI mode / 0-duration fast bypass
    if (!this.isTTY || this.mode === 'ci' || this.durationSeconds <= 0) {
      const rendered = renderHandoffBySurface(this.payload, this.mode);
      this.write(`${rendered}\n`);
      return 'continue';
    }

    this.isRunning = true;
    this.remainingSeconds = this.durationSeconds;
    this.setupKeyListeners();
    this.triggerTick();

    return new Promise<HandoffAction>((resolve) => {
      this.resolvePromise = resolve;

      this.timer = setInterval(() => {
        if (!this.isPaused) {
          this.remainingSeconds = Math.max(
            0,
            this.remainingSeconds - this.tickIntervalMs / 1000
          );
          this.triggerTick();

          if (this.remainingSeconds <= 0) {
            this.stop('continue');
          }
        }
      }, this.tickIntervalMs);

      if (this.timer.unref) {
        this.timer.unref();
      }
    });
  }
}

/**
 * Convenience helper to instantiate and run a handoff transition.
 */
export async function runHandoffTransition(
  options: PacingControllerOptions
): Promise<HandoffAction> {
  const controller = new HandoffTransitionController(options);
  return controller.start();
}
