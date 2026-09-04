import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { doctorCommand } from '../src/commands/doctor.js';
import { statusCommand } from '../src/commands/status.js';
import { configGetCommand, configSetCommand, configListCommand } from '../src/commands/config.js';
import { runCommand } from '../src/commands/run.js';
import { GitHubService } from '../src/services/github-service.js';
import type { BatonRunSnapshot } from '../src/types/baton.js';

describe('POSIX Headless Commands (doctor, status, config, run)', () => {
  let tempDir: string;
  let runJsonPath: string;
  let localConfigPath: string;
  let globalConfigPath: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let processExitSpy: any;
  let getRepoSpy: any;
  let getIssueSpy: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-cmd-test-'));
    runJsonPath = path.join(tempDir, '.sandcastle', 'run.json');
    localConfigPath = path.join(tempDir, '.sandcastle', 'config.json');
    globalConfigPath = path.join(tempDir, 'global', 'config.json');

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    getRepoSpy = vi.spyOn(GitHubService.prototype, 'getRepo').mockResolvedValue('owner/repo');
    getIssueSpy = vi.spyOn(GitHubService.prototype, 'getIssue').mockResolvedValue(null);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    getRepoSpy?.mockRestore();
    getIssueSpy?.mockRestore();
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
    it('should parse positional issue argument as scope: { type: "from", target } and output json when --json is passed', async () => {
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
          scope: { type: 'from', target: 25 },
          from: 25,
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

    it('should support --from <num> flag setting scope: { type: "from", target }', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 1,
          closedIssues: [30],
          blockedIssues: [],
          durationMs: 1000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand(undefined, {
        from: '30',
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'from', target: 30 },
          from: 30,
        })
      );
    });

    it('should support --only flag with single number', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 1,
          closedIssues: [42],
          blockedIssues: [],
          durationMs: 1000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand(undefined, {
        only: '42',
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'only', targets: [42] },
          only: [42],
          issues: [42],
        })
      );
    });

    it('should support --only flag with comma-separated numbers (e.g. 42,45)', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 2,
          closedIssues: [42, 45],
          blockedIssues: [],
          durationMs: 2000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand(undefined, {
        only: '42,45',
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'only', targets: [42, 45] },
          only: [42, 45],
          issues: [42, 45],
        })
      );
    });

    it('should support --only flag with repeated array of values (e.g. ["42", "45"])', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 2,
          closedIssues: [42, 45],
          blockedIssues: [],
          durationMs: 2000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand(undefined, {
        only: ['42', '45'],
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: { type: 'only', targets: [42, 45] },
          only: [42, 45],
          issues: [42, 45],
        })
      );
    });

    it('should support --all flag setting scope: { type: "all" }', async () => {
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
          scope: { type: 'all' },
          all: true,
        })
      );
    });

    it('should forward explicit --cwd <path> option to runner', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 1,
          closedIssues: [25],
          blockedIssues: [],
          durationMs: 1000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand('25', {
        cwd: '/explicit/target/path',
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/explicit/target/path',
        })
      );
    });

    it('should default cwd to process.cwd() when cwd option is omitted', async () => {
      const mockRunner = {
        run: vi.fn().mockResolvedValue({
          success: true,
          totalProcessed: 1,
          closedIssues: [25],
          blockedIssues: [],
          durationMs: 1000,
        }),
        on: vi.fn(),
      };

      const runnerFactory = vi.fn().mockReturnValue(mockRunner);

      await runCommand('25', {
        json: true,
      }, runnerFactory);

      expect(runnerFactory).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });

    it('should validate mutually exclusive options and fail fast with exit code 1', async () => {
      // 1. positional target + --only
      await runCommand('42', { only: '45' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both positional target and --only'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // 2. --from + --only
      await runCommand(undefined, { from: '42', only: '45' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both --from and --only'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // 3. positional target + --from
      await runCommand('42', { from: '45' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both positional target and --from'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // 4. positional target + --all
      await runCommand('42', { all: true });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both positional target and --all'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // 5. --from + --all
      await runCommand(undefined, { from: '42', all: true });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both --from and --all'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // 6. --only + --all
      await runCommand(undefined, { only: '42', all: true });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot specify both --only and --all'));
    });

    it('should redirect zero-argument execution to wizardCommand in interactive TTY', async () => {
      const mockWizard = vi.fn().mockResolvedValue({ success: true });

      await runCommand(undefined, {}, undefined, {
        wizardCommand: mockWizard,
        isTTY: true,
      });

      expect(mockWizard).toHaveBeenCalled();
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should exit with code 1 and usage instructions on zero-argument execution in non-interactive / headless mode', async () => {
      await runCommand(undefined, {}, undefined, {
        isTTY: false,
      });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No issue target or scope specified'));
    });

    it('should fail fast on invalid numbers provided for positional, --from, or --only', async () => {
      // Invalid positional
      await runCommand('abc', {});
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid positional issue target'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // Invalid --from
      await runCommand(undefined, { from: 'invalid' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid issue number provided for --from'));

      processExitSpy.mockClear();
      consoleErrorSpy.mockClear();

      // Invalid --only
      await runCommand(undefined, { only: 'invalid' });
      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid issue number(s) provided for --only'));
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

    describe('Direct Parent Issue Execution', () => {
      const parentIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: 'Epic specification',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      const childIssues = [
        {
          number: 41,
          title: 'Child Task 1',
          body: 'Part of #40',
          state: 'OPEN',
          labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        },
        {
          number: 42,
          title: 'Child Task 2',
          body: 'Part of #40',
          state: 'OPEN',
          labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        },
      ];

      it('should fail with exit code 1 in headless mode when parent issue is run without --expand-children or -y', async () => {
        const mockGitHubService = {
          getRepo: vi.fn().mockResolvedValue('owner/repo'),
          getIssue: vi.fn().mockResolvedValue(parentIssue),
          listIssues: vi.fn().mockResolvedValue(childIssues),
        };

        const mockGatingEvaluator = {
          evaluateIssue: vi.fn().mockResolvedValue({
            issueNumber: 40,
            title: 'Epic: Architecture',
            status: 'PARENT',
            isReady: false,
            reasons: ['Issue is classified as a parent/epic specification.'],
          }),
          parseParentReferences: vi.fn((body: string) => (body.includes('#40') ? [40] : [])),
        };

        const runnerFactory = vi.fn();

        await runCommand(
          '40',
          {},
          runnerFactory,
          {
            isTTY: false,
            githubService: mockGitHubService as any,
            gatingEvaluator: mockGatingEvaluator as any,
          }
        );

        expect(processExitSpy).toHaveBeenCalledWith(1);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Issue #40 is a parent/epic specification and cannot be run directly')
        );
        expect(runnerFactory).not.toHaveBeenCalled();
      });

      it('should expand child queue and execute in headless mode when --expand-children is passed', async () => {
        const mockGitHubService = {
          getRepo: vi.fn().mockResolvedValue('owner/repo'),
          getIssue: vi.fn().mockResolvedValue(parentIssue),
          listIssues: vi.fn().mockResolvedValue(childIssues),
        };

        const mockGatingEvaluator = {
          evaluateIssue: vi.fn().mockResolvedValue({
            issueNumber: 40,
            title: 'Epic: Architecture',
            status: 'PARENT',
            isReady: false,
            reasons: ['Issue is classified as a parent/epic specification.'],
          }),
          parseParentReferences: vi.fn((body: string) => (body.includes('#40') ? [40] : [])),
        };

        const mockRunner = {
          run: vi.fn().mockResolvedValue({
            success: true,
            totalProcessed: 2,
            closedIssues: [41, 42],
            blockedIssues: [],
            durationMs: 1500,
          }),
          on: vi.fn(),
        };

        const runnerFactory = vi.fn().mockReturnValue(mockRunner);

        await runCommand(
          '40',
          { expandChildren: true, json: true },
          runnerFactory,
          {
            isTTY: false,
            githubService: mockGitHubService as any,
            gatingEvaluator: mockGatingEvaluator as any,
          }
        );

        expect(runnerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: { type: 'only', targets: [41, 42] },
            only: [41, 42],
            issues: [41, 42],
          })
        );
        expect(mockRunner.run).toHaveBeenCalled();
      });

      it('should expand child queue and execute in headless mode when -y / --yes is passed', async () => {
        const mockGitHubService = {
          getRepo: vi.fn().mockResolvedValue('owner/repo'),
          getIssue: vi.fn().mockResolvedValue(parentIssue),
          listIssues: vi.fn().mockResolvedValue(childIssues),
        };

        const mockGatingEvaluator = {
          evaluateIssue: vi.fn().mockResolvedValue({
            issueNumber: 40,
            title: 'Epic: Architecture',
            status: 'PARENT',
            isReady: false,
            reasons: ['Issue is classified as a parent/epic specification.'],
          }),
          parseParentReferences: vi.fn((body: string) => (body.includes('#40') ? [40] : [])),
        };

        const mockRunner = {
          run: vi.fn().mockResolvedValue({
            success: true,
            totalProcessed: 2,
            closedIssues: [41, 42],
            blockedIssues: [],
            durationMs: 1500,
          }),
          on: vi.fn(),
        };

        const runnerFactory = vi.fn().mockReturnValue(mockRunner);

        await runCommand(
          '40',
          { yes: true, json: true },
          runnerFactory,
          {
            isTTY: false,
            githubService: mockGitHubService as any,
            gatingEvaluator: mockGatingEvaluator as any,
          }
        );

        expect(runnerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: { type: 'only', targets: [41, 42] },
          })
        );
      });

      it('should prompt for confirmation in interactive mode and run child queue on confirmation', async () => {
        const mockGitHubService = {
          getRepo: vi.fn().mockResolvedValue('owner/repo'),
          getIssue: vi.fn().mockResolvedValue(parentIssue),
          listIssues: vi.fn().mockResolvedValue(childIssues),
        };

        const mockGatingEvaluator = {
          evaluateIssue: vi.fn().mockResolvedValue({
            issueNumber: 40,
            title: 'Epic: Architecture',
            status: 'PARENT',
            isReady: false,
            reasons: ['Issue is classified as a parent/epic specification.'],
          }),
          parseParentReferences: vi.fn((body: string) => (body.includes('#40') ? [40] : [])),
        };

        const mockPrompts = {
          confirm: vi.fn().mockResolvedValue(true),
          isCancel: vi.fn().mockReturnValue(false),
          cancel: vi.fn(),
        };

        const mockRunner = {
          run: vi.fn().mockResolvedValue({
            success: true,
            totalProcessed: 2,
            closedIssues: [41, 42],
            blockedIssues: [],
            durationMs: 1500,
          }),
          on: vi.fn(),
        };

        const runnerFactory = vi.fn().mockReturnValue(mockRunner);

        await runCommand(
          '40',
          {},
          runnerFactory,
          {
            isTTY: true,
            prompts: mockPrompts as any,
            githubService: mockGitHubService as any,
            gatingEvaluator: mockGatingEvaluator as any,
          }
        );

        expect(mockPrompts.confirm).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('Expand parent issue #40 and run 2 child task(s)?'),
          })
        );
        expect(runnerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            scope: { type: 'only', targets: [41, 42] },
          })
        );
      });

      it('should cancel and not run when user declines confirmation in interactive mode', async () => {
        const mockGitHubService = {
          getRepo: vi.fn().mockResolvedValue('owner/repo'),
          getIssue: vi.fn().mockResolvedValue(parentIssue),
          listIssues: vi.fn().mockResolvedValue(childIssues),
        };

        const mockGatingEvaluator = {
          evaluateIssue: vi.fn().mockResolvedValue({
            issueNumber: 40,
            title: 'Epic: Architecture',
            status: 'PARENT',
            isReady: false,
            reasons: ['Issue is classified as a parent/epic specification.'],
          }),
          parseParentReferences: vi.fn((body: string) => (body.includes('#40') ? [40] : [])),
        };

        const mockPrompts = {
          confirm: vi.fn().mockResolvedValue(false),
          isCancel: vi.fn().mockReturnValue(false),
          cancel: vi.fn(),
        };

        const runnerFactory = vi.fn();

        await runCommand(
          '40',
          {},
          runnerFactory,
          {
            isTTY: true,
            prompts: mockPrompts as any,
            githubService: mockGitHubService as any,
            gatingEvaluator: mockGatingEvaluator as any,
          }
        );

        expect(mockPrompts.confirm).toHaveBeenCalled();
        expect(mockPrompts.cancel).toHaveBeenCalledWith('Parent execution cancelled.');
        expect(runnerFactory).not.toHaveBeenCalled();
      });

      it('should pass parentContext mode to runner options', async () => {
        const mockRunner = {
          run: vi.fn().mockResolvedValue({
            success: true,
            totalProcessed: 1,
            closedIssues: [44],
            blockedIssues: [],
            durationMs: 1000,
          }),
          on: vi.fn(),
        };

        const runnerFactory = vi.fn().mockReturnValue(mockRunner);

        await runCommand(
          '44',
          { parentContext: 'inline', json: true },
          runnerFactory,
          {
            githubService: {
              getRepo: vi.fn().mockResolvedValue('owner/repo'),
              getIssue: vi.fn().mockResolvedValue({
                number: 44,
                title: 'Child issue',
                body: '',
                state: 'OPEN',
                labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
              }),
            } as any,
            gatingEvaluator: {
              evaluateIssue: vi.fn().mockResolvedValue({
                issueNumber: 44,
                status: 'READY',
                isReady: true,
                reasons: [],
              }),
              parseParentReferences: vi.fn().mockReturnValue([]),
            } as any,
          }
        );

        expect(runnerFactory).toHaveBeenCalledWith(
          expect.objectContaining({
            parentContext: 'inline',
          })
        );
      });
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
