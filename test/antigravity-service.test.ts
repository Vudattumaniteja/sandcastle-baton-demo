import { describe, it, expect, vi } from 'vitest';
import { AntigravityService, resolveAgyModel } from '../src/services/antigravity-service.js';
import type { AntigravityWorkerOptions } from '../src/types/antigravity.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('AntigravityService', () => {
  describe('Model Discovery', () => {
    it('should parse models and aliases from agy models CLI output', async () => {
      const mockOutput = `Available models:
  Gemini 3.7 Flash (High)
  Gemini 3.7 Flash (Medium)
  Gemini 3.7 Flash (Low)
  Gemini 3.1 Pro (High)
  Claude Sonnet 4.6 (Thinking)
`;
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });

      const service = new AntigravityService({ executor: mockExecutor });
      const models = await service.discoverModels();

      expect(models).toHaveLength(5);
      expect(models[0]).toEqual({
        id: 'Gemini 3.7 Flash (High)',
        name: 'Gemini 3.7 Flash (High)',
        isDefault: true,
      });
      expect(mockExecutor).toHaveBeenCalledWith('agy', ['models'], expect.any(Object));
    });

    it('should parse tab-separated agy models CLI output with Gemini 3.8 Flash as default', async () => {
      const mockOutput = `Fetching available models...
gemini-3.8-flash-high\tGemini 3.8 Flash (High)
gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)
gemini-3.8-flash-low\tGemini 3.8 Flash (Low)
gemini-3.7-flash-high\tGemini 3.7 Flash (High)
gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)
gemini-3.7-flash-low\tGemini 3.7 Flash (Low)
gemini-3.6-flash-high\tGemini 3.6 Flash (High)
gemini-3.1-pro-high\tGemini 3.1 Pro (High)
claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)
gpt-oss-120b-medium\tGPT-OSS 120B (Medium)
`;
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: mockOutput,
        stderr: '',
        exitCode: 0,
      });

      const service = new AntigravityService({ executor: mockExecutor });
      const models = await service.discoverModels();

      expect(models).toHaveLength(11);
      expect(models[0]).toEqual({
        id: 'gemini-3.8-flash-high',
        name: 'Gemini 3.8 Flash (High)',
        isDefault: true,
      });
      expect(models[1]).toEqual({
        id: 'gemini-3.8-flash-medium',
        name: 'Gemini 3.8 Flash (Medium)',
        isDefault: false,
      });
      expect(models[3]).toEqual({
        id: 'gemini-3.7-flash-high',
        name: 'Gemini 3.7 Flash (High)',
        isDefault: false,
      });
      expect(models[8]).toEqual({
        id: 'claude-sonnet-4-6',
        name: 'Claude Sonnet 4.6 (Thinking)',
        isDefault: false,
      });
    });

    it('should parse space-separated agy models output correctly', () => {
      const service = new AntigravityService();
      const mockOutput = `Fetching available models...
gemini-3.8-flash-high   Gemini 3.8 Flash (High)
gemini-3.8-flash-low    Gemini 3.8 Flash (Low)
`;
      const models = service.parseModelsOutput(mockOutput);
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        id: 'gemini-3.8-flash-high',
        name: 'Gemini 3.8 Flash (High)',
        isDefault: true,
      });
      expect(models[1]).toEqual({
        id: 'gemini-3.8-flash-low',
        name: 'Gemini 3.8 Flash (Low)',
        isDefault: false,
      });
    });

    it('should respect Default model: line when present in agy models output', () => {
      const service = new AntigravityService();
      const mockOutput = `Default model: gemini-3.8-flash-medium
gemini-3.8-flash-high\tGemini 3.8 Flash (High)
gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)
`;
      const models = service.parseModelsOutput(mockOutput);
      expect(models[0].isDefault).toBe(false);
      expect(models[1].isDefault).toBe(true);
    });

    it('should fallback to default models if agy models command fails', async () => {
      const mockExecutor = vi.fn().mockRejectedValue(new Error('Command failed'));
      const service = new AntigravityService({ executor: mockExecutor });
      const models = await service.discoverModels();

      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === 'Gemini 3.8 Flash')).toBe(true);
      expect(models.some((m) => m.id === 'Gemini 3.7 Flash')).toBe(true);
    });

    it('should fallback gracefully when discoverModels times out', async () => {
      const mockExecutor = vi.fn().mockImplementation((_cmd, _args, opts) => {
        return new Promise((_resolve, reject) => {
          if (opts.signal) {
            opts.signal.addEventListener('abort', () => {
              const err: any = new Error('The operation was aborted');
              err.name = 'AbortError';
              reject(err);
            });
          }
        });
      });

      const service = new AntigravityService({ executor: mockExecutor });
      const models = await service.discoverModels(50); // 50ms timeout

      expect(models.length).toBeGreaterThan(0);
      expect(models[0].id).toBe('Gemini 3.8 Flash');
    });

    it('should read statusline snapshot and normalize active quota from last_statusline_input.json', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-statusline-test-'));
      const statuslinePath = path.join(tempDir, 'last_statusline_input.json');

      const futureResetTime = new Date(Date.now() + 3600 * 1000).toISOString();
      const mockData = {
        session_id: 'session-123',
        conversation_id: 'conv-456',
        model: {
          id: 'Gemini 3.7 Flash (High)',
          display_name: 'Gemini 3.7 Flash (High)',
          effort: 'high',
        },
        context_window: {
          total_input_tokens: 50000,
          total_output_tokens: 2000,
          context_window_size: 1000000,
          used_percentage: 5.2,
          remaining_percentage: 94.8,
        },
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.85,
            reset_time: futureResetTime,
            reset_in_seconds: 120, // Stale seconds on disk
          },
        },
        agent_state: 'working',
      };

      fs.writeFileSync(statuslinePath, JSON.stringify(mockData), 'utf-8');

      const service = new AntigravityService({ appDataDir: tempDir });
      const snapshot = await service.getStatuslineSnapshot();

      expect(snapshot).not.toBeNull();
      expect(snapshot?.session_id).toBe('session-123');
      expect(snapshot?.model?.id).toBe('Gemini 3.7 Flash (High)');
      expect(snapshot?.quota?.['gemini-5h']?.remaining_fraction).toBe(0.85);
      // Dynamic countdown recalculated (~3600s instead of stale 120s)
      expect(snapshot?.quota?.['gemini-5h']?.reset_in_seconds).toBeGreaterThanOrEqual(3590);
      expect(snapshot?.quota?.['gemini-5h']?.reset_in_seconds).toBeLessThanOrEqual(3600);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should normalize expired quota pools to 100% and 0s reset when reading statusline snapshot', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-statusline-expired-test-'));
      const statuslinePath = path.join(tempDir, 'last_statusline_input.json');

      const pastResetTime = new Date(Date.now() - 60 * 1000).toISOString();
      const mockData = {
        session_id: 'session-expired',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.0, // Exhausted quota in stale statusline
            reset_time: pastResetTime,
            reset_in_seconds: 300,
          },
        },
      };

      fs.writeFileSync(statuslinePath, JSON.stringify(mockData), 'utf-8');

      const service = new AntigravityService({ appDataDir: tempDir });
      const snapshot = await service.getStatuslineSnapshot();

      expect(snapshot).not.toBeNull();
      expect(snapshot?.quota?.['gemini-5h']?.remaining_fraction).toBe(1.0);
      expect(snapshot?.quota?.['gemini-5h']?.reset_in_seconds).toBe(0);

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return null if last_statusline_input.json does not exist', async () => {
      const service = new AntigravityService({ appDataDir: '/nonexistent/path' });
      const snapshot = await service.getStatuslineSnapshot();
      expect(snapshot).toBeNull();
    });
  });

  describe('Quota Snapshot Normalization & Time Decay', () => {
    it('should normalize expired quota pool to 100% fraction and 0 seconds reset', async () => {
      const { normalizeQuotaInfo } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');
      const expiredInfo = {
        remaining_fraction: 0.0,
        reset_time: '2026-08-21T11:59:00.000Z', // 1 minute in the past
        reset_in_seconds: 60,
      };

      const normalized = normalizeQuotaInfo(expiredInfo, now);
      expect(normalized.remaining_fraction).toBe(1.0);
      expect(normalized.reset_in_seconds).toBe(0);
      expect(normalized.reset_time).toBe('2026-08-21T11:59:00.000Z');
    });

    it('should dynamically calculate remaining seconds for active quota pools', async () => {
      const { normalizeQuotaInfo } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');
      const activeInfo = {
        remaining_fraction: 0.45,
        reset_time: '2026-08-21T12:15:30.000Z', // 15m 30s in the future (930s)
        reset_in_seconds: 10, // Stale seconds
      };

      const normalized = normalizeQuotaInfo(activeInfo, now);
      expect(normalized.remaining_fraction).toBe(0.45);
      expect(normalized.reset_in_seconds).toBe(930);
    });

    it('should handle edge cases gracefully (missing reset_time, invalid timestamps)', async () => {
      const { normalizeQuotaInfo } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');

      // Missing reset_time
      const noResetTime = {
        remaining_fraction: 0.7,
        reset_in_seconds: 500,
      };
      const normalizedNoReset = normalizeQuotaInfo(noResetTime, now);
      expect(normalizedNoReset.remaining_fraction).toBe(0.7);
      expect(normalizedNoReset.reset_in_seconds).toBe(500);

      // Invalid timestamp
      const invalidResetTime = {
        remaining_fraction: 0.3,
        reset_time: 'not-a-valid-date-string',
        reset_in_seconds: 250,
      };
      const normalizedInvalid = normalizeQuotaInfo(invalidResetTime, now);
      expect(normalizedInvalid.remaining_fraction).toBe(0.3);
      expect(normalizedInvalid.reset_in_seconds).toBe(250);
      expect(normalizedInvalid.reset_time).toBe('not-a-valid-date-string');
    });

    it('should normalize full statusline snapshot with multiple pools across time states', async () => {
      const { normalizeStatuslineSnapshot } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');
      const snapshot: any = {
        session_id: 'sess-multi',
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.0,
            reset_time: '2026-08-21T11:30:00.000Z', // Expired 30 min ago
            reset_in_seconds: 1200,
          },
          '3p-5h': {
            remaining_fraction: 0.6,
            reset_time: '2026-08-21T13:00:00.000Z', // Active, resets in 3600s
            reset_in_seconds: 4000,
          },
          'custom-no-time': {
            remaining_fraction: 0.8,
          },
        },
      };

      const normalized = normalizeStatuslineSnapshot(snapshot, now);
      expect(normalized?.quota?.['gemini-5h']?.remaining_fraction).toBe(1.0);
      expect(normalized?.quota?.['gemini-5h']?.reset_in_seconds).toBe(0);

      expect(normalized?.quota?.['3p-5h']?.remaining_fraction).toBe(0.6);
      expect(normalized?.quota?.['3p-5h']?.reset_in_seconds).toBe(3600);

      expect(normalized?.quota?.['custom-no-time']?.remaining_fraction).toBe(0.8);
      expect(normalized?.quota?.['custom-no-time']?.reset_in_seconds).toBeUndefined();
    });

    it('should handle null or undefined snapshots safely in normalizeStatuslineSnapshot', async () => {
      const { normalizeStatuslineSnapshot } = await import('../src/services/antigravity-service.js');
      expect(normalizeStatuslineSnapshot(null)).toBeNull();
      expect(normalizeStatuslineSnapshot(undefined)).toBeNull();
    });

    it('should resolve primary 5-hour operational pool over weekly pool for model options', async () => {
      const { resolveCandidateQuotaInfo } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');
      const snapshot: any = {
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.65,
            reset_time: '2026-08-21T14:00:00.000Z', // 2h countdown
            reset_in_seconds: 7200,
          },
          'gemini-weekly': {
            remaining_fraction: 0.52,
            reset_time: '2026-08-25T18:00:00.000Z',
            reset_in_seconds: 367200,
          },
        },
      };

      const resolved = resolveCandidateQuotaInfo('Gemini 3.7 Flash', snapshot, now);
      expect(resolved).toBeDefined();
      expect(resolved?.remaining_fraction).toBe(0.65);
      expect(resolved?.reset_in_seconds).toBe(7200);
    });

    it('should prioritize 0% exhausted pool and active countdown over non-zero secondary pools', async () => {
      const { resolveCandidateQuotaInfo } = await import('../src/services/antigravity-service.js');
      const now = new Date('2026-08-21T12:00:00.000Z');
      const snapshot: any = {
        quota: {
          'gemini-5h': {
            remaining_fraction: 0.0, // Hit 5-hour limit
            reset_time: '2026-08-21T13:30:00.000Z', // Resets in 90m
            reset_in_seconds: 5400,
          },
          'gemini-weekly': {
            remaining_fraction: 0.85,
            reset_time: '2026-08-28T00:00:00.000Z',
            reset_in_seconds: 561600,
          },
        },
      };

      const resolved = resolveCandidateQuotaInfo('Gemini 3.7 Flash', snapshot, now);
      expect(resolved).toBeDefined();
      expect(resolved?.remaining_fraction).toBe(0.0);
      expect(resolved?.reset_in_seconds).toBe(5400);
    });
  });

  describe('Worker Execution Arguments', () => {
    it('should construct correct CLI args for worker execution with resolved model', () => {
      const service = new AntigravityService();
      const options: AntigravityWorkerOptions = {
        repo: 'owner/repo',
        issueNumber: 42,
        model: 'gemini-3.1-pro',
        reasoningEffort: 'high',
        timeout: '15m',
      };

      const args = service.buildWorkerArgs(options);

      expect(args).toContain('--dangerously-skip-permissions');
      expect(args).toContain('--print-timeout');
      expect(args[args.indexOf('--print-timeout') + 1]).toBe('15m');
      expect(args).toContain('--model');
      expect(args[args.indexOf('--model') + 1]).toBe('Gemini 3.1 Pro (High)');
      expect(args).toContain('--prompt');
      const promptIdx = args.indexOf('--prompt');
      expect(args[promptIdx + 1]).toContain('Repository: owner/repo');
      expect(args[promptIdx + 1]).toContain('Issue: #42');
    });

    it('should allow custom prompt override', () => {
      const service = new AntigravityService();
      const options: AntigravityWorkerOptions = {
        repo: 'owner/repo',
        issueNumber: 42,
        prompt: 'Custom worker prompt for issue 42',
      };

      const args = service.buildWorkerArgs(options);
      const promptIdx = args.indexOf('--prompt');
      expect(args[promptIdx + 1]).toBe('Custom worker prompt for issue 42');
    });

    it('should append --add-dir <cwd> when cwd is present in AntigravityWorkerOptions', () => {
      const service = new AntigravityService();
      const options: AntigravityWorkerOptions = {
        repo: 'owner/repo',
        issueNumber: 42,
        cwd: '/path/to/target/project',
      };

      const args = service.buildWorkerArgs(options);

      expect(args).toContain('--add-dir');
      const addDirIdx = args.indexOf('--add-dir');
      expect(args[addDirIdx + 1]).toBe('/path/to/target/project');
    });

    it('should not append --add-dir when cwd is not provided', () => {
      const service = new AntigravityService();
      const options: AntigravityWorkerOptions = {
        repo: 'owner/repo',
        issueNumber: 42,
      };

      const args = service.buildWorkerArgs(options);

      expect(args).not.toContain('--add-dir');
    });
  });

  describe('Process Execution with Environment & ANSI Color', () => {
    it('should execute agy process injecting FORCE_COLOR and COLORTERM', async () => {
      let passedOptions: any;
      const mockExecutor = vi.fn().mockImplementation(async (_cmd, _args, opts) => {
        passedOptions = opts;
        return {
          stdout: 'Completed issue #42',
          stderr: '',
          exitCode: 0,
        };
      });

      const service = new AntigravityService({ executor: mockExecutor });
      const result = await service.runWorker({
        repo: 'owner/repo',
        issueNumber: 42,
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('Completed issue #42');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(passedOptions?.env?.FORCE_COLOR).toBe('3');
      expect(passedOptions?.env?.COLORTERM).toBe('truecolor');
    });

    it('should invoke onStdout and onStderr callbacks during execution', async () => {
      const stdoutChunks: string[] = [];
      const mockExecutor = vi.fn().mockImplementation(async (_cmd, _args, opts) => {
        if (opts?.onStdout) opts.onStdout('chunk 1\n');
        if (opts?.onStdout) opts.onStdout('chunk 2\n');
        return {
          stdout: 'chunk 1\nchunk 2\n',
          stderr: '',
          exitCode: 0,
        };
      });

      const service = new AntigravityService({ executor: mockExecutor });
      await service.runWorker({
        repo: 'owner/repo',
        issueNumber: 42,
        onStdout: (chunk) => stdoutChunks.push(chunk),
      });

      expect(stdoutChunks).toEqual(['chunk 1\n', 'chunk 2\n']);
    });

    it('should map signal option to cancelSignal for execa without throwing', async () => {
      const { defaultAgyExecutor } = await import('../src/services/antigravity-service.js');
      const controller = new AbortController();
      // Test running a simple command with signal attached
      const result = await defaultAgyExecutor('node', ['-e', 'console.log("hello")'], {
        signal: controller.signal,
      });
      expect(result.stdout.trim()).toBe('hello');
      expect(result.exitCode).toBe(0);
    });
  });
});
