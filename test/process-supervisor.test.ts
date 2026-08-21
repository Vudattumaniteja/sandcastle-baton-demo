import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessSupervisor } from '../src/core/process-supervisor.js';
import type { AntigravityService } from '../src/services/antigravity-service.js';
import type { SupervisorEvent } from '../src/types/supervisor.js';

describe('ProcessSupervisor', () => {
  let mockAntigravityService: Partial<AntigravityService>;
  let recordedEvents: SupervisorEvent[];

  beforeEach(() => {
    recordedEvents = [];
    mockAntigravityService = {
      runWorker: vi.fn(),
      getStatuslineSnapshot: vi.fn().mockResolvedValue(null),
    };
  });

  describe('Success & Retry Policy', () => {
    it('should complete on first attempt when worker succeeds with exit code 0', async () => {
      mockAntigravityService.runWorker = vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'Success on issue #10',
        stderr: '',
        durationMs: 150,
      });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.attempts).toBe(1);
      expect(mockAntigravityService.runWorker).toHaveBeenCalledTimes(1);

      const successEvent = recordedEvents.find((e) => e.type === 'attempt_success');
      expect(successEvent).toBeDefined();
    });

    it('should retry up to 2 times (3 attempts total) on failure before declaring hard block', async () => {
      mockAntigravityService.runWorker = vi
        .fn()
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Syntax error in tests',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Type error in module',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Assertion failed',
          durationMs: 100,
        });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        maxRetries: 2,
        sleeper: vi.fn().mockResolvedValue(undefined),
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.attempts).toBe(3);
      expect(mockAntigravityService.runWorker).toHaveBeenCalledTimes(3);

      const failedEvents = recordedEvents.filter((e) => e.type === 'attempt_failed');
      expect(failedEvents).toHaveLength(3);

      const blockedEvent = recordedEvents.find((e) => e.type === 'blocked');
      expect(blockedEvent).toBeDefined();
      expect((blockedEvent as any)?.totalAttempts).toBe(3);
    });

    it('should succeed on retry if subsequent attempt passes', async () => {
      mockAntigravityService.runWorker = vi
        .fn()
        .mockResolvedValueOnce({
          exitCode: 1,
          stdout: '',
          stderr: 'Flaky test failure',
          durationMs: 100,
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Fixed on second attempt',
          stderr: '',
          durationMs: 120,
        });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        maxRetries: 2,
        sleeper: vi.fn().mockResolvedValue(undefined),
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.attempts).toBe(2);
      expect(mockAntigravityService.runWorker).toHaveBeenCalledTimes(2);

      // Verify failure context was injected into the second attempt prompt
      const secondCallArgs = (mockAntigravityService.runWorker as any).mock.calls[1][0];
      expect(secondCallArgs.prompt).toContain('Previous attempt failed');
      expect(secondCallArgs.prompt).toContain('Flaky test failure');
    });
  });

  describe('HTTP 429 Quota Rate Limit Handling', () => {
    it('should detect HTTP 429 rate limit, pause with countdown, and resume without consuming failure retries', async () => {
      mockAntigravityService.runWorker = vi
        .fn()
        .mockResolvedValueOnce({
          exitCode: 429,
          stdout: '',
          stderr: 'HTTP 429: RESOURCE_EXHAUSTED Quota exceeded for model',
          durationMs: 50,
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Resumed after quota reset and completed',
          stderr: '',
          durationMs: 200,
        });

      mockAntigravityService.getStatuslineSnapshot = vi.fn().mockResolvedValue({
        quota: {
          'gemini-5h': {
            remaining_fraction: 0,
            reset_in_seconds: 5,
          },
        },
      });

      const mockSleeper = vi.fn().mockResolvedValue(undefined);

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        maxRetries: 2,
        sleeper: mockSleeper,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      // Quota retry did NOT count against failure attempts, so only 1 real attempt was consumed
      expect(result.attempts).toBe(1);

      const pauseEvent = recordedEvents.find((e) => e.type === 'quota_pause');
      expect(pauseEvent).toBeDefined();

      const resumeEvent = recordedEvents.find((e) => e.type === 'quota_resume');
      expect(resumeEvent).toBeDefined();

      expect(mockSleeper).toHaveBeenCalled();
    });

    it('should identify quota errors from stdout, stderr, or statusline', () => {
      const supervisor = new ProcessSupervisor();

      expect(supervisor.isQuotaError({ exitCode: 429, stderr: '', stdout: '' })).toBe(true);
      expect(supervisor.isQuotaError({ exitCode: 1, stderr: 'RESOURCE_EXHAUSTED', stdout: '' })).toBe(true);
      expect(supervisor.isQuotaError({ exitCode: 1, stderr: 'Rate limit reached, retry after 30s', stdout: '' })).toBe(true);
      expect(supervisor.isQuotaError({ exitCode: 1, stderr: 'TypeError: undefined is not a function', stdout: '' })).toBe(false);
    });

    it('should ignore expired quota pools (reset_time <= now) and select active pool for delay', async () => {
      const now = new Date('2026-08-21T12:00:00.000Z');
      mockAntigravityService.getStatuslineSnapshot = vi.fn().mockResolvedValue({
        quota: {
          'gemini-5h': {
            remaining_fraction: 0,
            reset_time: '2026-08-21T11:50:00.000Z', // Expired 10m ago
            reset_in_seconds: 60, // Stale seconds
          },
          'gemini-weekly': {
            remaining_fraction: 0,
            reset_time: '2026-08-21T12:02:00.000Z', // Active, resets in 2m (120s)
            reset_in_seconds: 120,
          },
        },
      });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
      });

      const delayMs = await supervisor.resolveQuotaDelayMs(now);
      expect(delayMs).toBe(120000);
    });

    it('should fallback to default 60s delay when all exhausted quota pools are expired', async () => {
      const now = new Date('2026-08-21T12:00:00.000Z');
      mockAntigravityService.getStatuslineSnapshot = vi.fn().mockResolvedValue({
        quota: {
          'gemini-5h': {
            remaining_fraction: 0,
            reset_time: '2026-08-21T11:45:00.000Z', // Expired 15m ago
            reset_in_seconds: 0,
          },
        },
      });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
      });

      const delayMs = await supervisor.resolveQuotaDelayMs(now);
      expect(delayMs).toBe(60000);
    });
  });

  describe('Outer Watchdog Timeout Enforcement', () => {
    it('should trigger outer watchdog timeout and abort hanging child process', async () => {
      let passedSignal: AbortSignal | undefined;

      mockAntigravityService.runWorker = vi.fn().mockImplementation(async (opts) => {
        passedSignal = opts.signal;
        // Simulate a hanging process that never finishes unless aborted
        return new Promise((resolve) => {
          opts.signal?.addEventListener('abort', () => {
            resolve({
              exitCode: 130,
              stdout: '',
              stderr: 'Aborted by supervisor timeout',
              durationMs: 50,
              aborted: true,
              timedOut: true,
            });
          });
        });
      });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        outerTimeoutMs: 50, // 50ms outer timeout
        maxRetries: 0,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('timed_out');
      expect(passedSignal?.aborted).toBe(true);

      const timeoutEvent = recordedEvents.find((e) => e.type === 'timeout');
      expect(timeoutEvent).toBeDefined();
    });
  });

  describe('Signal Handling & Terminal Cursor Safety', () => {
    it('should restore terminal cursor when restoring or shutting down', () => {
      const writeSpy = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const supervisor = new ProcessSupervisor();

      supervisor.restoreCursor();

      expect(writeSpy).toHaveBeenCalledWith('\x1b[?25h');
      writeSpy.mockRestore();
    });

    it('should abort active running process tree when abortSignal is triggered', async () => {
      const abortController = new AbortController();

      mockAntigravityService.runWorker = vi.fn().mockImplementation(async (opts) => {
        return new Promise((resolve) => {
          opts.signal?.addEventListener('abort', () => {
            resolve({
              exitCode: 130,
              stdout: '',
              stderr: 'Aborted by signal',
              durationMs: 10,
              aborted: true,
            });
          });
        });
      });

      const supervisor = new ProcessSupervisor({
        antigravityService: mockAntigravityService as AntigravityService,
        maxRetries: 0,
        onEvent: (e) => recordedEvents.push(e),
      });

      const runPromise = supervisor.execute(
        {
          repo: 'owner/repo',
          issueNumber: 10,
        },
        abortController.signal
      );

      // Trigger abort immediately
      abortController.abort();

      const result = await runPromise;
      expect(result.success).toBe(false);
      expect(result.status).toBe('aborted');
    });
  });
});
