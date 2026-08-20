import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { doctorCommand } from '../src/commands/doctor.js';
import { statusCommand } from '../src/commands/status.js';
import { configGetCommand, configSetCommand, configListCommand } from '../src/commands/config.js';
import { runCommand } from '../src/commands/run.js';
import type { BatonRunSnapshot } from '../src/types/baton.js';

describe('POSIX Headless Commands (doctor, status, config, run)', () => {
  let tempDir: string;
  let runJsonPath: string;
  let localConfigPath: string;
  let globalConfigPath: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-cmd-test-'));
    runJsonPath = path.join(tempDir, '.sandcastle', 'run.json');
    localConfigPath = path.join(tempDir, '.sandcastle', 'config.json');
    globalConfigPath = path.join(tempDir, 'global', 'config.json');

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('doctor command', () => {
    it('should output json report when --json flag is passed', async () => {
      const mockDoctorService = {
        runDiagnostics: vi.fn().mockResolvedValue({
          healthy: true,
          checks: [
            { id: 'node', name: 'Node.js', passed: true, message: 'v22.0.0' },
          ],
        }),
      };

      await doctorCommand({ json: true }, mockDoctorService as any);

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.healthy).toBe(true);
      expect(output.checks[0].id).toBe('node');
    });

    it('should exit with code 1 when doctor diagnostics report unhealthy', async () => {
      const mockDoctorService = {
        runDiagnostics: vi.fn().mockResolvedValue({
          healthy: false,
          checks: [
            { id: 'git', name: 'Git Workspace', passed: false, message: 'Not a git repo', fatal: true },
          ],
        }),
      };

      await doctorCommand({}, mockDoctorService as any);

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('status command', () => {
    it('should report idle status when run.json does not exist', async () => {
      await statusCommand({ json: true, stateFilePath: runJsonPath });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.status).toBe('idle');
    });

    it('should output snapshot details when run.json exists', async () => {
      const snapshot: BatonRunSnapshot = {
        sessionId: 'test-session-123',
        startTime: new Date().toISOString(),
        status: 'completed',
        repo: 'owner/repo',
        mode: 'afk',
        totalIssues: 1,
        closedCount: 1,
        blockedCount: 0,
        processedIssues: [
          { number: 25, title: 'Core Baton Runner', status: 'completed', durationMs: 1200 },
        ],
        lastUpdated: new Date().toISOString(),
      };

      fs.mkdirSync(path.dirname(runJsonPath), { recursive: true });
      fs.writeFileSync(runJsonPath, JSON.stringify(snapshot));

      await statusCommand({ json: true, stateFilePath: runJsonPath });

      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.sessionId).toBe('test-session-123');
      expect(output.closedCount).toBe(1);
      expect(output.processedIssues[0].number).toBe(25);
    });
  });

  describe('config command', () => {
    it('should get, set, and list configurations', async () => {
      const configService = {
        get: vi.fn().mockReturnValue('gemini-3.7-flash'),
        set: vi.fn(),
        list: vi.fn().mockReturnValue({
          defaults: { model: 'Gemini 3.7 Flash' },
          local: { model: 'gemini-3.7-flash' },
          resolved: { model: 'gemini-3.7-flash' },
        }),
      };

      configGetCommand('model', { json: true }, configService as any);
      expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify({ key: 'model', value: 'gemini-3.7-flash' }, null, 2));

      configSetCommand('model', 'gemini-3.7-pro', { global: false }, configService as any);
      expect(configService.set).toHaveBeenCalledWith('model', 'gemini-3.7-pro', false);

      configListCommand({ json: true }, configService as any);
      expect(configService.list).toHaveBeenCalled();
    });
  });

  describe('run command', () => {
    it('should parse issue and flags, run BatonRunner, and output json when --json is passed', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 1,
          closedIssues: [25],
          blockedIssues: [],
          durationMs: 1500,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand('25', {
        json: true,
        model: 'gemini-3.7-pro',
        mode: 'afk',
        retries: '3',
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: [25],
          model: 'gemini-3.7-pro',
          mode: 'afk',
          retries: 3,
        })
      );
      expect(mockRunner.run).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalled();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.success).toBe(true);
      expect(output.closedIssues).toEqual([25]);
    });

    it('should support --all flag without positional issue argument', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 2,
          closedIssues: [1, 2],
          blockedIssues: [],
          durationMs: 3000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand(undefined, {
        all: true,
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          all: true,
          issues: undefined,
        })
      );
    });

    it('should pass promptTemplate option to runner and handle runner errors by exiting with code 1', async () => {
      const mockRunner = {
        run: vi.fn().mockRejectedValue(new Error('Explicit prompt template not found on disk: ./missing.md')),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand('42', {
        promptTemplate: './missing.md',
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          promptTemplate: './missing.md',
        })
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('watch command', () => {
    it('should output json report when --json flag is passed', async () => {
      const { watchCommand } = await import('../src/commands/watch.js');
      await watchCommand({ json: true, cwd: tempDir, stateFilePath: runJsonPath });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(output.status).toBe('idle');
      expect(output.timestamp).toBeDefined();
    });
  });
});
