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

  const mockParentIssue21: GitHubIssue = {
    number: 21,
    title: 'Epic: Interactive CLI Experience',
    body: 'Parent epic for Sandcastle wizard and TUI',
    state: 'OPEN',
    labels: [{ name: 'parent' }],
    url: 'https://github.com/owner/repo/issues/21',
  };

  const mockHitlIssue22: GitHubIssue = {
    number: 22,
    title: 'Design Review & Prototype',
    body: 'Human prototype review required',
    state: 'OPEN',
    labels: [{ name: 'wayfinder:prototype' }],
    url: 'https://github.com/owner/repo/issues/22',
  };

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

  const mockOpenIssue28: GitHubIssue = {
    number: 28,
    title: 'Standalone Feature Task',
    body: 'No parent references here',
    state: 'OPEN',
    labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
    url: 'https://github.com/owner/repo/issues/28',
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
      listIssues: vi.fn().mockResolvedValue([
        mockParentIssue21,
        mockHitlIssue22,
        mockOpenIssue26,
        mockOpenIssue27,
        mockOpenIssue28,
      ]),
      getIssue: vi.fn().mockImplementation((num: number) => {
        if (num === 21) return Promise.resolve(mockParentIssue21);
        if (num === 22) return Promise.resolve(mockHitlIssue22);
        if (num === 26) return Promise.resolve(mockOpenIssue26);
        if (num === 27) return Promise.resolve(mockOpenIssue27);
        if (num === 28) return Promise.resolve(mockOpenIssue28);
        return Promise.resolve(null);
      }),
    };

    mockAntigravityService = {
      discoverModels: vi.fn().mockResolvedValue([
        { id: 'Gemini 3.7 Flash (High)', name: 'Gemini 3.7 Flash (High)', isDefault: true },
        { id: 'Gemini 3.1 Pro (High)', name: 'Gemini 3.1 Pro (High)', isDefault: false },
      ]),
      getStatuslineSnapshot: vi.fn().mockResolvedValue({
        quota: {
          'Gemini 3.7 Flash (High)': {
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
      parseParentReferences: vi.fn().mockImplementation((body: string) => {
        if (!body) return [];
        const parentRegex = /(?:Part of|Parent(?: Issue)?|Epic)[:\s]+#(\d+)/gi;
        const matches = Array.from(body.matchAll(parentRegex));
        return matches.map((m) => parseInt(m[1], 10)).filter((n) => !isNaN(n));
      }),
      evaluateIssue: vi.fn().mockImplementation(async (issue: GitHubIssue) => {
        if (issue.number === 21) {
          return {
            issueNumber: 21,
            title: issue.title,
            state: 'OPEN',
            status: 'PARENT',
            isReady: false,
            hasReadyLabel: false,
            hasAfkLabel: false,
            isBlockedLabelPresent: false,
            missingLabels: ['ready-for-agent', 'AFK'],
            prerequisiteIssueNumbers: [],
            blockingIssueNumbers: [],
            reasons: ['Issue is classified as a parent/epic specification.'],
            parentIssueNumbers: [],
          };
        }
        if (issue.number === 22) {
          return {
            issueNumber: 22,
            title: issue.title,
            state: 'OPEN',
            status: 'HITL',
            isReady: false,
            hasReadyLabel: false,
            hasAfkLabel: false,
            isBlockedLabelPresent: false,
            missingLabels: ['ready-for-agent', 'AFK'],
            prerequisiteIssueNumbers: [],
            blockingIssueNumbers: [],
            reasons: ['Issue requires human-in-the-loop interaction.'],
            parentIssueNumbers: [],
          };
        }
        if (issue.number === 26) {
          return {
            issueNumber: 26,
            title: issue.title,
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
            parentIssueNumbers: [21],
          };
        }
        if (issue.number === 27) {
          return {
            issueNumber: 27,
            title: issue.title,
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
            parentIssueNumbers: [],
          };
        }
        if (issue.number === 28) {
          return {
            issueNumber: 28,
            title: issue.title,
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
            parentIssueNumbers: [],
          };
        }
        return {
          issueNumber: issue.number,
          title: issue.title,
          state: issue.state,
          status: 'READY',
          isReady: true,
          hasReadyLabel: true,
          hasAfkLabel: true,
          isBlockedLabelPresent: false,
          missingLabels: [],
          prerequisiteIssueNumbers: [],
          blockingIssueNumbers: [],
          reasons: ['All gate conditions satisfied.'],
          parentIssueNumbers: [],
        };
      }),
      evaluateBacklog: vi.fn().mockImplementation(async (issues: GitHubIssue[]) => {
        const map = new Map();
        for (const issue of issues) {
          map.set(issue.number, await mockGatingEvaluator.evaluateIssue(issue));
        }
        return map;
      }),
    };

    runnerEvents = new EventEmitter();
    mockRunner = {
      run: vi.fn().mockImplementation(async () => {
        runnerEvents.emit('baton:start', {
          repo: 'owner/repo',
          mode: 'afk',
          issues: [26],
          model: 'Gemini 3.7 Flash (High)',
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

  it('should filter out parent and HITL issues from the main issue picker options', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(28) // 1. Pick issue #28 (non-child)
      .mockResolvedValueOnce('only') // 2. Follow-up: 'only'
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)') // 3. Model
      .mockResolvedValueOnce('high') // 4. Effort
      .mockResolvedValueOnce('afk'); // 5. Mode

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true); // Manifest confirmation

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    await wizardCommand({}, deps);

    // Verify the first select call (issue picker)
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: expect.stringMatching(/select.*issue/i),
        options: expect.any(Array),
      })
    );

    const firstSelectArgs = (mockPrompts.select as any).mock.calls[0][0];
    const optionValues = firstSelectArgs.options.map((o: any) => o.value);

    // Should include 'all', 26, 27, 28
    expect(optionValues).toContain('all');
    expect(optionValues).toContain(26);
    expect(optionValues).toContain(27);
    expect(optionValues).toContain(28);

    // Must NOT include parent issue 21 or HITL issue 22
    expect(optionValues).not.toContain(21);
    expect(optionValues).not.toContain(22);
  });

  it('should run 2-step issue selection with "Run only issue #<num>" (default) setting scope: { type: "only", targets: [num] } and manifest target: "Single Issue (#<num>)"', async () => {
    // Select answers:
    // 1. Issue: 26 (child task)
    // 2. Action: 'only' (Default: Run only issue #26)
    // 3. Model: 'Gemini 3.7 Flash (High)'
    // 4. Effort: 'high'
    // 5. Mode: 'afk'
    // Confirm:
    // 1. Parent context: true
    // 2. Launch manifest: true
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26)
      .mockResolvedValueOnce('only')
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi
      .fn()
      .mockResolvedValueOnce(true) // Parent context confirm
      .mockResolvedValueOnce(true); // Launch manifest confirm

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

    expect(mockPrompts.intro).toHaveBeenCalled();
    expect(mockDoctorService.runDiagnostics).toHaveBeenCalled();
    expect(mockGitHubService.listIssues).toHaveBeenCalledWith({ state: 'open' });
    expect(mockGatingEvaluator.evaluateBacklog).toHaveBeenCalled();

    // Verify 2-step issue selection follow-up prompt
    expect(mockPrompts.select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: expect.stringMatching(/#26/i),
        options: expect.arrayContaining([
          expect.objectContaining({ value: 'only', label: 'Run only issue #26' }),
          expect.objectContaining({ value: 'from', label: 'Resume backlog from #26 onward' }),
        ]),
        initialValue: 'only',
      })
    );

    // Verify parent context prompt for child task
    expect(mockPrompts.confirm).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: 'Include parent context in worker prompts?',
        initialValue: true,
      })
    );

    // Verify manifest note formatting
    expect(mockPrompts.note).toHaveBeenCalledWith(
      expect.stringContaining('Single Issue (#26)'),
      expect.stringMatching(/manifest/i)
    );

    expect(result.cancelled).toBe(false);
    expect(result.success).toBe(true);
    expect(result.manifest?.targetDescription).toBe('Single Issue (#26)');
    expect(result.manifest?.scope).toEqual({ type: 'only', targets: [26] });
    expect(result.manifest?.parentContext).toBe('reference');
    expect(createdRunnerOptions?.scope).toEqual({ type: 'only', targets: [26] });
    expect(createdRunnerOptions?.parentContext).toBe('reference');
  });

  it('should run 2-step issue selection with "Resume backlog from #<num> onward" setting scope: { type: "from", target: num } and manifest target: "Backlog Resumption (from #<num> onward)"', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26)
      .mockResolvedValueOnce('from')
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi
      .fn()
      .mockResolvedValueOnce(false) // Parent context confirm: No
      .mockResolvedValueOnce(true); // Launch manifest confirm: Yes

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

    expect(result.cancelled).toBe(false);
    expect(result.success).toBe(true);
    expect(result.manifest?.targetDescription).toBe('Backlog Resumption (from #26 onward)');
    expect(result.manifest?.scope).toEqual({ type: 'from', target: 26 });
    expect(result.manifest?.parentContext).toBe('none');
    expect(createdRunnerOptions?.scope).toEqual({ type: 'from', target: 26 });
    expect(createdRunnerOptions?.parentContext).toBe('none');

    // Verify manifest note card contains formatted target string
    expect(mockPrompts.note).toHaveBeenCalledWith(
      expect.stringContaining('Backlog Resumption (from #26 onward)'),
      expect.stringMatching(/manifest/i)
    );
  });

  it('should advance directly to model selection when "all" ready issues is selected without a follow-up scope prompt, setting scope: { type: "all" } and manifest target: "Full Backlog"', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce('all') // 1. Issue picker: 'all'
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)') // 2. Model (NO follow-up scope prompt!)
      .mockResolvedValueOnce('high') // 3. Effort
      .mockResolvedValueOnce('afk'); // 4. Mode

    mockPrompts.confirm = vi
      .fn()
      .mockResolvedValueOnce(true) // Parent context confirm (since ready queue contains child issue 26)
      .mockResolvedValueOnce(true); // Launch manifest confirm

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
    expect(result.manifest?.scope).toEqual({ type: 'all' });
    expect(result.manifest?.targetDescription).toBe('Full Backlog');
    expect(createdRunnerOptions?.scope).toEqual({ type: 'all' });

    // Verify manifest note card formatting
    expect(mockPrompts.note).toHaveBeenCalledWith(
      expect.stringContaining('Full Backlog'),
      expect.stringMatching(/manifest/i)
    );
  });

  it('should not prompt operator for parent context when executing non-child tasks', async () => {
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(28) // Issue 28 (no parent)
      .mockResolvedValueOnce('only') // Scope: 'only'
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)') // Model
      .mockResolvedValueOnce('high') // Effort
      .mockResolvedValueOnce('afk'); // Mode

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true); // Launch manifest confirm ONLY

    const deps: WizardDependencies = {
      prompts: mockPrompts,
      doctorService: mockDoctorService,
      githubService: mockGitHubService,
      antigravityService: mockAntigravityService,
      gatingEvaluator: mockGatingEvaluator,
      runnerFactory: () => mockRunner,
    };

    const result = await wizardCommand({}, deps);

    expect(result.success).toBe(true);
    expect(result.manifest?.targetDescription).toBe('Single Issue (#28)');
    // Confirm should only have been called once (for launch manifest), not for parent context
    expect(mockPrompts.confirm).toHaveBeenCalledTimes(1);
    expect(mockPrompts.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/launch/i),
      })
    );
  });

  it('should cancel if user cancels at the 2-step scope selection prompt', async () => {
    const cancelSymbol = Symbol('cancel');
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26) // 1. Issue #26
      .mockResolvedValueOnce(cancelSymbol); // 2. Cancel at follow-up prompt

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

  it('should cancel if user cancels at the parent context prompt', async () => {
    const cancelSymbol = Symbol('cancel');
    mockPrompts.select = vi
      .fn()
      .mockResolvedValueOnce(26) // 1. Issue #26
      .mockResolvedValueOnce('only'); // 2. Follow-up: 'only'

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(cancelSymbol); // Cancel at parent context confirm

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
      .mockResolvedValueOnce(28) // Issue 28 (non-child)
      .mockResolvedValueOnce('only')
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)')
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
      .mockResolvedValueOnce(28) // Issue 28 (non-child)
      .mockResolvedValueOnce('only')
      .mockResolvedValueOnce('Gemini 3.7 Flash (High)')
      .mockResolvedValueOnce('high')
      .mockResolvedValueOnce('afk');

    mockPrompts.confirm = vi.fn().mockResolvedValueOnce(true);

    mockRunner.run = vi.fn().mockImplementation(async () => {
      runnerEvents.emit('baton:start', { repo: 'owner/repo', mode: 'afk', issues: [28] });
      runnerEvents.emit('baton:blocked', {
        issueNumber: 28,
        reason: 'Verification failed',
      });
      return {
        success: false,
        totalProcessed: 1,
        closedIssues: [],
        blockedIssues: [28],
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
