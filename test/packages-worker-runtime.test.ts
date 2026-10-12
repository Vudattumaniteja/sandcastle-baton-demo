import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  WorkerSupervisor,
  discoverModels,
  resolveModel,
  FALLBACK_MODELS,
  parseModelsOutput,
  TranscriptTailer,
  getQuotaSnapshot,
  resolveQuotaDelay,
  normalizeQuotaInfo,
  isQuotaError,
  type SupervisorEvent,
} from '#packages/worker-runtime';

describe('packages/worker-runtime', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-worker-runtime-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('models entry point', () => {
    it('should resolve models correctly with aliases and defaults', () => {
      expect(resolveModel('gemini-2.5-flash')).toBe('gemini-2.5-flash');
      expect(resolveModel('2.5-flash')).toBe('gemini-2.5-flash');
      expect(resolveModel('flash')).toBe('gemini-2.5-flash');
      expect(resolveModel('gemini-2.5-pro')).toBe('gemini-2.5-pro');
      expect(resolveModel('pro')).toBe('gemini-2.5-pro');
      expect(resolveModel('claude-3.7')).toBe('claude-3-7-sonnet');
      expect(resolveModel('claude-sonnet')).toBe('claude-3-7-sonnet');
      expect(resolveModel('claude-3.5')).toBe('claude-3-5-sonnet');
      expect(resolveModel('gpt-4o')).toBe('gpt-4o');
      expect(resolveModel('4o')).toBe('gpt-4o');
      expect(resolveModel(undefined)).toBe('gemini-2.5-flash');
    });

    it('should parse models CLI output and mark default', () => {
      const output = `Available models:
  gemini-2.5-flash
  gemini-2.5-pro
  claude-3-7-sonnet
`;
      const models = parseModelsOutput(output);
      expect(models.length).toBe(3);
      expect(models[0].name).toBe('gemini-2.5-flash');
      expect(models[0].isDefault).toBe(true);
      expect(models[1].isDefault).toBe(false);
    });

    it('should discover models via executor or return FALLBACK_MODELS on error', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: 'Available models:\n  gemini-2.5-flash\n',
        stderr: '',
        exitCode: 0,
      });

      const discovered = await discoverModels(1000, 'agy', mockExecutor);
      expect(discovered.length).toBe(1);
      expect(discovered[0].name).toBe('gemini-2.5-flash');

      const failingExecutor = vi.fn().mockRejectedValue(new Error('CLI error'));
      const fallback = await discoverModels(1000, 'agy', failingExecutor);
      expect(fallback).toEqual(FALLBACK_MODELS);
    });
  });

  describe('quota entry point', () => {
    it('should detect quota rate limit errors', () => {
      expect(isQuotaError({ exitCode: 429, stderr: '' })).toBe(true);
      expect(isQuotaError({ exitCode: 1, stderr: 'RESOURCE_EXHAUSTED: rate exceeded' })).toBe(true);
      expect(isQuotaError({ exitCode: 1, stderr: 'quota reached, please wait' })).toBe(true);
      expect(isQuotaError({ exitCode: 0, stderr: 'quota reached' })).toBe(false);
      expect(isQuotaError({ exitCode: 1, stderr: 'Command not found' })).toBe(false);
    });

    it('should normalize expired quota pool to 100% and 0s reset', () => {
      const now = new Date('2026-10-09T12:00:00Z');
      const expired = {
        remaining_fraction: 0,
        reset_time: '2026-10-09T11:50:00Z',
        reset_in_seconds: 600,
      };

      const normalized = normalizeQuotaInfo(expired, now);
      expect(normalized.remaining_fraction).toBe(1.0);
      expect(normalized.reset_in_seconds).toBe(0);
    });

    it('should resolve quota backoff delay based on exhausted pools', () => {
      const now = new Date('2026-10-09T12:00:00Z');
      const snapshot = {
        quota: {
          'gemini-5h': {
            remaining_fraction: 0,
            reset_time: '2026-10-09T12:02:00Z', // 120s remaining
            reset_in_seconds: 120,
          },
        },
      };

      const delayMs = resolveQuotaDelay(snapshot, now);
      expect(delayMs).toBe(120000);
    });

    it('should read snapshot from disk via getQuotaSnapshot', async () => {
      const statuslineFile = path.join(tempDir, 'last_statusline_input.json');
      fs.writeFileSync(
        statuslineFile,
        JSON.stringify({
          session_id: 'test-session',
          quota: {
            'gemini-5h': {
              remaining_fraction: 0.8,
              reset_in_seconds: 1800,
            },
          },
        })
      );

      const snapshot = await getQuotaSnapshot(tempDir);
      expect(snapshot).not.toBeNull();
      expect(snapshot?.session_id).toBe('test-session');
      expect(snapshot?.quota?.['gemini-5h']?.remaining_fraction).toBe(0.8);
    });
  });

  describe('transcript entry point', () => {
    it('should tail JSONL transcript and emit events', async () => {
      const logFile = path.join(tempDir, 'transcript.jsonl');
      const line1 = JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: new Date().toISOString(),
        content: '<thought>Inspecting repository setup</thought>',
        token_count: 150,
      });
      const line2 = JSON.stringify({
        step_index: 2,
        source: 'SYSTEM',
        type: 'TOOL_EXECUTION',
        status: 'DONE',
        created_at: new Date().toISOString(),
        tool_calls: [
          {
            name: 'run_command',
            args: { CommandLine: 'npm test' },
            toolSummary: 'Run tests',
          },
        ],
      });

      fs.writeFileSync(logFile, `${line1}\n${line2}\n`);

      const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
      const emittedSteps: any[] = [];
      const emittedThoughts: string[] = [];
      const emittedTools: any[] = [];

      tailer.on('step', (step) => emittedSteps.push(step));
      tailer.on('thought', (th) => emittedThoughts.push(th));
      tailer.on('tool_call', (tc) => emittedTools.push(tc));

      await tailer.poll();

      expect(emittedSteps.length).toBe(2);
      expect(emittedThoughts.length).toBe(1);
      expect(emittedThoughts[0]).toBe('Inspecting repository setup');
      expect(emittedTools.length).toBe(1);
      expect(emittedTools[0].name).toBe('run_command');

      const stats = tailer.getStats();
      expect(stats.totalSteps).toBe(2);
      expect(stats.latestThought).toBe('Inspecting repository setup');
      expect(stats.tokenUsage?.total).toBe(150);
    });
  });

  describe('WorkerSupervisor', () => {
    let recordedEvents: SupervisorEvent[];

    beforeEach(() => {
      recordedEvents = [];
    });

    it('should execute worker successfully on first attempt with custom executor', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: 'Success on issue #42',
        stderr: '',
        exitCode: 0,
      });

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 42,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.attempts).toBe(1);
      expect(mockExecutor).toHaveBeenCalledTimes(1);

      const successEvent = recordedEvents.find((e) => e.type === 'attempt_success');
      expect(successEvent).toBeDefined();
    });

    it('should retry on failure and pass if retry succeeds', async () => {
      const mockExecutor = vi
        .fn()
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'Temporary build error',
          exitCode: 1,
        })
        .mockResolvedValueOnce({
          stdout: 'Fixed build',
          stderr: '',
          exitCode: 0,
        });

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        maxRetries: 2,
        sleeper: vi.fn().mockResolvedValue(undefined),
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 15,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.attempts).toBe(2);
      expect(mockExecutor).toHaveBeenCalledTimes(2);

      const failedEvents = recordedEvents.filter((e) => e.type === 'attempt_failed');
      expect(failedEvents.length).toBe(1);
    });

    it('should handle quota limit errors and pause before retry', async () => {
      const mockExecutor = vi
        .fn()
        .mockResolvedValueOnce({
          stdout: '',
          stderr: 'RESOURCE_EXHAUSTED: Quota limit reached (code 429)',
          exitCode: 429,
        })
        .mockResolvedValueOnce({
          stdout: 'Completed after quota pause',
          stderr: '',
          exitCode: 0,
        });

      const mockSleeper = vi.fn().mockResolvedValue(undefined);

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        sleeper: mockSleeper,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 20,
      });

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(mockSleeper).toHaveBeenCalledTimes(1);

      const pauseEvent = recordedEvents.find((e) => e.type === 'quota_pause');
      const resumeEvent = recordedEvents.find((e) => e.type === 'quota_resume');
      expect(pauseEvent).toBeDefined();
      expect(resumeEvent).toBeDefined();
    });

    it('should respect parent abort signal immediately', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const supervisor = new WorkerSupervisor();
      const result = await supervisor.execute(
        { repo: 'owner/repo', issueNumber: 5 },
        abortController.signal
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('aborted');
      expect(result.error).toContain('Execution aborted by parent signal.');
    });

    it('should retry up to 2 times (3 attempts total) on failure before declaring hard block', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: '',
        stderr: 'Persistent compilation failure',
        exitCode: 1,
      });

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        maxRetries: 2,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 10,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.attempts).toBe(3);
      expect(mockExecutor).toHaveBeenCalledTimes(3);

      const blockEvent = recordedEvents.find((e) => e.type === 'blocked');
      expect(blockEvent).toBeDefined();
    });

    it('should enforce hard ceiling of 3 consecutive quota pauses and block execution', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: '',
        stderr: 'Quota limit exceeded (HTTP 429)',
        exitCode: 429,
      });

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        sleeper: vi.fn().mockResolvedValue(undefined),
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 11,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('blocked');
      expect(result.error).toContain('Exceeded maximum consecutive quota pauses (3)');
    });

    it('should trigger outer watchdog timeout and abort hanging child process', async () => {
      const mockExecutor = vi.fn().mockImplementation((_file, _args, options) => {
        return new Promise((_resolve, reject) => {
          if (options?.signal) {
            options.signal.addEventListener('abort', () => {
              const err: any = new Error('Process aborted');
              err.name = 'AbortError';
              err.timedOut = true;
              reject(err);
            });
          }
        });
      });

      const supervisor = new WorkerSupervisor({
        executor: mockExecutor,
        outerTimeoutMs: 50,
        onEvent: (e) => recordedEvents.push(e),
      });

      const result = await supervisor.execute({
        repo: 'owner/repo',
        issueNumber: 12,
      });

      expect(result.success).toBe(false);
      expect(result.status).toBe('timed_out');
      expect(result.error).toContain('Process exceeded outer watchdog timeout.');
    });
  });
});
