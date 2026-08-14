import { describe, it, expect, vi } from 'vitest';
import { AntigravityService } from '../src/services/antigravity-service.js';
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

    it('should fallback to default models if agy models command fails', async () => {
      const mockExecutor = vi.fn().mockRejectedValue(new Error('Command failed'));
      const service = new AntigravityService({ executor: mockExecutor });
      const models = await service.discoverModels();

      expect(models.length).toBeGreaterThan(0);
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
      expect(models[0].id).toBe('Gemini 3.7 Flash');
    });

    it('should read statusline snapshot from last_statusline_input.json', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-statusline-test-'));
      const statuslinePath = path.join(tempDir, 'last_statusline_input.json');

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
            reset_time: '2026-08-14T22:00:00Z',
            reset_in_seconds: 3600,
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

      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('should return null if last_statusline_input.json does not exist', async () => {
      const service = new AntigravityService({ appDataDir: '/nonexistent/path' });
      const snapshot = await service.getStatuslineSnapshot();
      expect(snapshot).toBeNull();
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
