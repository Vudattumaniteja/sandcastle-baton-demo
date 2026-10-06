export type SupervisorEvent =
  | { type: 'attempt_start'; attempt: number; maxAttempts: number; issueNumber: number }
  | { type: 'attempt_success'; attempt: number; issueNumber: number; durationMs: number }
  | {
      type: 'attempt_failed';
      attempt: number;
      maxAttempts: number;
      issueNumber: number;
      error: string;
      exitCode?: number;
    }
  | { type: 'quota_pause'; pauseDurationMs: number; reason: string; resumeAt: Date }
  | { type: 'quota_tick'; remainingMs: number }
  | { type: 'quota_resume' }
  | { type: 'timeout'; tier: 'inner' | 'outer'; durationMs: number }
  | { type: 'signal_abort'; signal: string; graceful: boolean }
  | { type: 'blocked'; issueNumber: number; reason: string; totalAttempts: number };

export interface ProcessSupervisorOptions {
  antigravityService?: any;
  maxRetries?: number; // default: 2 (meaning 3 total attempts)
  outerTimeoutMs?: number; // Outer supervisor watchdog timeout in ms
  escalationGracePeriodMs?: number; // Escalation window before SIGKILL (default 5000ms)
  sleeper?: (ms: number, signal?: AbortSignal) => Promise<void>;
  onEvent?: (event: SupervisorEvent) => void;
}

export interface SuperviseResult {
  success: boolean;
  status: 'completed' | 'blocked' | 'aborted' | 'timed_out';
  attempts: number;
  totalDurationMs: number;
  lastExitCode?: number;
  lastStdout?: string;
  lastStderr?: string;
  error?: string;
}
