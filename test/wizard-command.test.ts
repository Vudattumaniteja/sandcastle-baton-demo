import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wizardCommand } from '../src/commands/wizard.js';
import type {
  WizardPrompts,
  WizardDependencies,
} from '../src/types/wizard.js';
import type { GitHubIssue } from '../src/types/github.js';
import { EventEmitter } from 'events';

describe('Interactive Guided Wizard (Variant A TUI Flow)', () => {
  let mockPrompts: WizardPrompts;
  let mockSpinner: {
    start: any;
    stop: any;
    message: any;
  };
  let mockGitHubService: any;
  let mockAntigravityService: any;
  let mockDoctorService: any;
  let mockGatingEvaluator: any;
  let mockRunner: any;
  let runnerEvents: EventEmitter;

  const mockOpenIssue26: GitHubIssue = {
    number: 26,
    title: 'Interactive Guided Wizard',
    body: 'Part of #21\nBlocked by: #25',
    state: 'OPEN',
    labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }, { name: 'sandcastle' }],
    url: 'https://github.com/owner/repo/issues/26',
  };

  const mockOpenIssue27: GitHubIssue = {
    number: 27,
    title: 'Terminal Watch Monitor',
    body: 'Blocked by: #26',
    state: 'OPEN',
    labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
    url: 'https://github.com/owner/repo/issues/27',
  };

  beforeEach(() => {
    mockSpinner = {
      start: vi.fn(),
      stop: vi.fn(),
      message: vi.fn(),
    };

    mockPrompts = {
      intro: vi.fn(),
      outro: vi.fn(),
      spinner: vi.fn().mockReturnValue(mockSpinner),
      select: vi.fn(),
      confirm: vi.fn(),
      note: vi.fn(),
      cancel: vi.fn(),
      isCancel: vi.fn((val: unknown): val is symbol => typeof val === 'symbol'),
      log: {
        info: vi.fn(),
        success: vi.fn(),
        warning: vi.fn(),
        error: vi.fn(),
        step: vi.fn(),
      },
    };

    mockGitHubService = {
      getRepo: vi.fn().mockResolvedValue('owner/repo'),
      checkAuth: vi.fn().mockResolvedValue(true),
      listIssues: vi.fn().mockResolvedValue([mockOpenIssue26, mockOpenIssue27]),
      getIssue: vi.fn().mockImplementation((num: number) => {
        if (num === 26) return Promise.resolve(mockOpenIssue26);
        if (num === 27) return Promise.resolve(mockOpenIssue27);
        return Promise.resolve(null);
      }),
    };

    mockAntigravityService = {
      discoverModels: vi.fn().mockResolvedValue([
        { id: 'gemini-3.7-flash-thinking', name: 'gemini-3.7-flash-thinking', isDefault: true },
        { id: 'gemini-3.7-pro', name: 'gemini-3.7-pro', isDefault: false },
      ]),
      getStatuslineSnapshot: vi.fn().mockResolvedValue({
        quota: {
          'gemini-3.7-flash-thinking': {
            remaining_fraction: 1.0,
            reset_in_seconds: 0,
          },
        },
      }),
    };

    mockDoctorService = {
      runDiagnostics: vi.fn().mockResolvedValue({
        healthy: true,
        checks: [
          { id: 'git', name: 'Git Workspace', passed: true, message: 'Valid Git repo (Active branch: main)' },
          { id: 'gh-auth', name: 'GitHub CLI Auth', passed: true, message: 'gh is authenticated' },
        ],
      }),
    };

    mockGatingEvaluator = {
      evaluateBacklog: vi.fn().mockResolvedValue(
        new Map([
          [
            26,
            {
              issueNumber: 26,
              title: 'Interactive Guided Wizard',
              state: 'OPEN',
              status: 'READY',
              isReady: true,
              hasReadyLabel: true,
              hasAfkLabel: true,
              isBlockedLabelPresent: false,
              missingLabels: [],
              prerequisiteIssueNumbers: [],
              blockingIssueNumbers: [],
              reasons: ['All gate conditions satisfied.'],
            },
          ],
          [
            27,
            {
              issueNumber: 27,
              title: 'Terminal Watch Monitor',
              state: 'OPEN',
              status: 'WAITING',
              isReady: false,
              hasReadyLabel: true,
              hasAfkLabel: true,
              isBlockedLabelPresent: false,
              missingLabels: [],
              prerequisiteIssueNumbers: [26],
              blockingIssueNumbers: [26],
              reasons: ['Waiting for prerequisite issues to close: #26'],
            },
          ],
        ])
      ),
    };

    runnerEvents = new EventEmitter();
    mockRunner = {
      run: vi.fn().mockImplementation(async () => {
        runnerEvents.emit('baton:start', {
          repo: 'owner/repo',
          mode: 'afk',
          issues: [26],
          model: 'gemini-3.7-flash-thinking',
        });
        runnerEvents.emit('baton:gating', {
          issueNumber: 26,
          evaluation: { isReady: true, status: 'READY', reasons: ['All gate conditions satisfied.'] },
        });
        runnerEvents.emit('worker:start', {
          issueNumber: 26,
          title: 'Interactive Guided Wizard',
          attempt: 1,
          maxAttempts: 3,
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'inspect',
          message: 'Reading issue requirements',
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'implement',
          message: 'Writing minimal clean code',
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'test',
          message: 'Running tests',
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'commit',
          message: 'Committing changes',
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'pr',
          message: 'Opening PR',
        });
        runnerEvents.emit('worker:phase', {
          issueNumber: 26,
          phase: 'merge',
          message: 'Merging PR',
        });
        runnerEvents.emit('worker:complete', {
          issueNumber: 26,
          durationMs: 4200,
        });
        runnerEvents.emit('baton:finish', {
          success: true,
          totalProcessed: 1,
          closedIssues: [26],
          blockedIssues: [],
          durationMs: 4500,
        });

        return {
          success: true,
          totalProcessed: 1,
          closedIssues: [26],
          blockedIssues: [],
          durationMs: 4500,
        };
      }),
      on: vi.fn().mockImplementation((event: string, listener: any) => {
        runnerEvents.on(event, listener);
        return mockRunner;
      }),
    };
  });

  it('should run full guided wizard flow and execute baton successfully', async () => {
    // Select answers:
    // 1. Issue: 26
    // 2. Model: 'gemini-3.7-flash-thinking'
    // 3. Effort: 'high'
    // 4. Mode: 'afk'
    // 5. Confirm manifest: true
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26)
      .mockResolvedValueOnce('gemini-3.7-flash-thinking')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true);

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(mockPrompts.intro).toHaveBeenCalled();
    expect(mockDoctorService.runDiagnostics).toHaveBeenCalled();
    expect(mockGitHubService.listIssues).toHaveBeenCalledWith({ state: 'open' });
    expect(mockGatingEvaluator.evaluateBacklog).toHaveBeenCalled();
    expect(mockAntigravityService.discoverModels).toHaveBeenCalled();

    // Verify issue select was called with formatted options
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: expect.stringMatching(/select.*issue/i),
        options: expect.arrayContaining([
          expect.objectContaining({ value: 26, label: expect.stringContaining('#26') }),
        ]),
      })
    );

    // Verify model select
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: expect.stringMatching(/select.*model/i),
      })
    );

    // Verify effort select
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        message: expect.stringMatching(/reasoning effort/i),
      })
    );

    // Verify mode select
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        message: expect.stringMatching(/execution mode/i),
      })
    );

    // Verify manifest note and confirm
    expect(mockPrompts.note).toHaveBeenCalledWith(
      expect.stringContaining('owner/repo'),
      expect.stringMatching(/manifest/i)
    );
    expect(mockPrompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/launch/i),
      })
    );

    // Verify spinner updates across phases
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockSpinner.message).toHaveBeenCalled();
    expect(mockRunner.run).toHaveBeenCalled();
    expect(mockSpinner.stop).toHaveBeenCalled();
    expect(mockPrompts.outro).toHaveBeenCalledWith(
      expect.stringMatching(/completed|success/i)
    );

    expect(result.cancelled).toBe(false);
    expect(result.success).toBe(true);
    expect(result.manifest?.model).toBe('gemini-3.7-flash-thinking');
    expect(result.manifest?.reasoningEffort).toBe('high');
    expect(result.manifest?.mode).toBe('afk');
  });

  it('should support selecting "all" ready issues in queue', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce('all')
      .mockResolvedValueOnce('gemini-3.7-flash-thinking')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true);

    let createdRunnerOptions: any = null;
    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: (opts) => {
        createdRunnerOptions = opts;
        return mockRunner;
      },
    };

    const result = await wizardCommand({}, deps);

    expect(result.success).toBe(true);
    expect(result.manifest?.all).toBe(true);
    expect(createdRunnerOptions?.all).toBe(true);
  });

  it('should halt and cancel when preflight validation fails (e.g. not a git repo or gh auth fails)', async () => {
    mockDoctorService.runDiagnostics.mockResolvedValueOnce({
      healthy: false,
      checks: [
        { id: 'git', name: 'Git Workspace', passed: false, message: 'Not a git repo', fatal: true },
      ],
    });

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(mockSpinner.stop).toHaveBeenCalledWith(
      expect.stringMatching(/failed/i)
    );
    expect(mockPrompts.cancel).toHaveBeenCalled();
    expect(result.cancelled).toBe(true);
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('should cancel gracefully if no open issues exist in repository', async () => {
    mockGitHubService.listIssues.mockResolvedValueOnce([]);

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(mockPrompts.cancel).toHaveBeenCalledWith(
      expect.stringMatching(/no open issues/i)
    );
    expect(result.cancelled).toBe(true);
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('should handle cancellation at issue selection step', async () => {
    const cancelSymbol = Symbol('cancel');
    mockPrompts.select = vi.fn().mockResolvedValueOnce(cancelSymbol);

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(mockPrompts.cancel).toHaveBeenCalledWith(
      expect.stringMatching(/cancelled/i)
    );
    expect(result.cancelled).toBe(true);
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('should handle cancellation when user declines launch confirmation card', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26)
      .mockResolvedValueOnce('gemini-3.7-flash-thinking')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(false);

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(mockPrompts.cancel).toHaveBeenCalledWith(
      expect.stringMatching(/launch cancelled/i)
    );
    expect(result.cancelled).toBe(true);
    expect(mockRunner.run).not.toHaveBeenCalled();
  });

  it('should report failure outro when baton runner encounters a blocker', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26)
      .mockResolvedValueOnce('gemini-3.7-flash-thinking')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true);

    mockRunner.run = vi.fn().mockImplementation(async () => {
      runnerEvents.emit('baton:start', { repo: 'owner/repo', mode: 'afk', issues: [26] });
      runnerEvents.emit('baton:blocked', {
        issueNumber: 26,
        reason: 'Verification failed',
      });
      return {
        success: false,
        totalProcessed: 1,
        closedIssues: [],
        blockedIssues: [26],
        durationMs: 1200,
      };
    });

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(result.success).toBe(false);
    expect(mockPrompts.outro).toHaveBeenCalledWith(
      expect.stringMatching(/halted|blocker/i)
    );
  });
});
