import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  renderWizardMode,
  renderRunMode,
  renderWatchMode,
  renderCiMode,
  renderHandoffBySurface,
  formatMs,
} from '../src/ui/handoff-formatter.js';
import {
  HandoffTransitionController,
  runHandoffTransition,
} from '../src/ui/handoff-transition.js';
import type { BatonHandoffPayload } from '../src/types/handoff.js';
import { BatonRunner } from '../src/core/baton-runner.js';

describe('Baton Handoff Banners & Interactive Pacing Controller (Issue #45)', () => {
  const samplePayload: BatonHandoffPayload = {
    mode: 'wizard',
    queueIndex: 2,
    totalQueue: 5,
    countdownSeconds: 3.0,
    isPaused: false,
    completed: {
      number: 36,
      title: 'CLI execution flags and wizard resumption flow',
      durationMs: 42800,
      prNumber: 12,
      branchName: 'issue-36-cli-flags',
      testsPassed: 14,
      testsTotal: 14,
      tokensUsed: 18450,
      costUsd: 0.0038,
      attempts: 1,
      phaseBreakdown: {
        inspectMs: 3200,
        implementMs: 22100,
        testMs: 12500,
        gitPrMs: 5000,
      },
    },
    next: {
      number: 37,
      title: 'Visual baton handoff banners and transition display',
      gatingStatus: 'READY',
      labels: ['ready-for-agent', 'AFK'],
      parentIssue: {
        number: 34,
        title: 'Epic: Sandcastle Flow & Guardrails',
        childIndex: 3,
        totalChildren: 5,
      },
      model: 'gemini-3.7-flash',
      reasoningEffort: 'high',
      acceptanceCriteria: [
        { text: 'Adaptive rendering across all 4 CLI operational surfaces', done: true },
        { text: '3s pacing delay with Space pause and Enter fast-forward', done: true },
        { text: 'Next candidate preview with acceptance criteria checkmarks', done: false },
      ],
      blockingDependencies: [],
      estimatedDurationSeconds: 45,
    },
  };

  describe('UI Formatters & Note Cards across surfaces', () => {
    it('should format Clack step note card for wizard mode with completed summary, queue progress, next preview, parent relationship, and model engine', () => {
      const output = renderWizardMode(samplePayload);

      expect(output).toContain('Issue #36 closed successfully');
      expect(output).toContain('42.8s');
      expect(output).toContain('PR #12 merged');
      expect(output).toContain('14 tests passed');

      expect(output).toContain('Sandcastle Baton Handoff Note');
      expect(output).toContain('Completed:');
      expect(output).toContain('#36');
      expect(output).toContain('Progress:');
      expect(output).toContain('2/5');
      expect(output).toContain('40%');
      expect(output).toContain('Next Up:');
      expect(output).toContain('#37');
      expect(output).toContain('[READY]');

      expect(output).toContain('Parent:');
      expect(output).toContain('#34');
      expect(output).toContain('Child 3 of 5');

      expect(output).toContain('Engine:');
      expect(output).toContain('gemini-3.7-flash');
      expect(output).toContain('high');

      expect(output).toContain('3.0s');
    });

    it('should display [PAUSED] when countdown is paused in wizard mode', () => {
      const pausedPayload = { ...samplePayload, isPaused: true };
      const output = renderWizardMode(pausedPayload);
      expect(output).toContain('[PAUSED]');
    });

    it('should render run mode with Boxed Relay Scorecard layout, queue progress bar, next candidate box, and controls hint', () => {
      const output = renderRunMode({ ...samplePayload, mode: 'run' });

      expect(output).toContain('BATON COMPLETED');
      expect(output).toContain('Issue #36');
      expect(output).toContain('PR #12');
      expect(output).toContain('14 passed');

      expect(output).toContain('BATON IN FLIGHT');
      expect(output).toContain('Queue Progress:');
      expect(output).toContain('40%');
      expect(output).toContain('Next Worker Spool:');

      // Next candidate target box
      expect(output).toContain('NEXT BATON TARGET');
      expect(output).toContain('#37');
      expect(output).toContain('[READY]');
      expect(output).toContain('Parent Map:');
      expect(output).toContain('#34 (Child 3 of 5)');
      expect(output).toContain('gemini-3.7-flash');
      expect(output).toContain('Criteria Preview:');
      expect(output).toContain('Adaptive rendering across all 4 CLI');

      expect(output).toContain('Controls:');
      expect(output).toContain('[Space]');
      expect(output).toContain('[Enter]');
      expect(output).toContain('[s]');
      expect(output).toContain('[q]');
    });

    it('should render watch mode with Alternate-screen HUD box', () => {
      const output = renderWatchMode({ ...samplePayload, mode: 'watch' });

      expect(output).toContain('SANDCASTLE');
      expect(output).toContain('LIVE WATCH MONITOR');
      expect(output).toContain('BATON HANDOFF');
      expect(output).toContain('Handoff #36');
      expect(output).toContain('#37');
      expect(output).toContain('Baton In Flight');
      expect(output).toContain('Last Completed:');
      expect(output).toContain('Issue #36');
      expect(output).toContain('Next Candidate:');
      expect(output).toContain('Issue #37');
      expect(output).toContain('[READY]');
      expect(output).toContain('Parent Issue:');
      expect(output).toContain('#34 (Child 3 of 5)');
      expect(output).toContain('gemini-3.7-flash');
    });

    it('should render CI mode with 0-second compact single-line log stream and pipeline breadcrumbs', () => {
      const output = renderCiMode({ ...samplePayload, mode: 'ci' });

      expect(output).toContain('BATON COMPLETED: #36');
      expect(output).toContain('PR #12 merged');
      expect(output).toContain('Pipeline:');
      expect(output).toContain('Instant handoff to #37');
      expect(output).toContain('CI mode: 0s pacing');
      expect(output).toContain('TARGET');
      expect(output).toContain('#37');
      expect(output).toContain('[READY]');
    });

    it('should dispatch correctly via renderHandoffBySurface', () => {
      expect(renderHandoffBySurface(samplePayload, 'wizard')).toContain('Sandcastle Baton Handoff Note');
      expect(renderHandoffBySurface(samplePayload, 'run')).toContain('NEXT BATON TARGET');
      expect(renderHandoffBySurface(samplePayload, 'watch')).toContain('LIVE WATCH MONITOR');
      expect(renderHandoffBySurface(samplePayload, 'ci')).toContain('CI mode: 0s pacing');
    });

    it('should format duration in ms correctly via formatMs', () => {
      expect(formatMs(42800)).toBe('42.8s');
      expect(formatMs(500)).toBe('0.5s');
      expect(formatMs(60000)).toBe('60.0s');
    });

    it('should strictly exclude pink/magenta ANSI codes across all rendering modes', () => {
      const modes: Array<'wizard' | 'run' | 'watch' | 'ci'> = ['wizard', 'run', 'watch', 'ci'];
      for (const mode of modes) {
        const rendered = renderHandoffBySurface(samplePayload, mode);
        // Magenta ANSI color codes: \x1b[35m, \x1b[45m, \x1b[95m, \x1b[105m
        expect(rendered).not.toMatch(/\x1b\[(35|45|95|105)m/);
      }
    });
  });

  describe('Interactive Pacing Controller', () => {
    let mockStdin: any;
    let writtenChunks: string[];
    let mockStdout: (text: string) => void;

    beforeEach(() => {
      mockStdin = new EventEmitter();
      mockStdin.isTTY = true;
      mockStdin.setRawMode = vi.fn();
      mockStdin.resume = vi.fn();
      mockStdin.pause = vi.fn();

      writtenChunks = [];
      mockStdout = (text: string) => writtenChunks.push(text);
    });

    it('should countdown and resolve with continue action when timer expires', async () => {
      vi.useFakeTimers();

      const onTick = vi.fn();
      const controllerPromise = runHandoffTransition({
        payload: samplePayload,
        durationSeconds: 1.0,
        tickIntervalMs: 200,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: true,
        onTick,
      });

      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
      expect(mockStdin.resume).toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1200);

      const result = await controllerPromise;
      expect(result).toBe('continue');
      expect(onTick).toHaveBeenCalled();
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);

      vi.useRealTimers();
    });

    it('should toggle pause with Space and p keypresses', async () => {
      vi.useFakeTimers();

      let isPausedState = false;
      const controller = new HandoffTransitionController({
        payload: samplePayload,
        durationSeconds: 3.0,
        tickIntervalMs: 200,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: true,
        onTick: (_rem, paused) => {
          isPausedState = paused;
        },
      });

      const promise = controller.start();

      mockStdin.emit('data', Buffer.from(' '));
      expect(controller.getIsPaused()).toBe(true);
      expect(isPausedState).toBe(true);

      const remBefore = controller.getRemainingSeconds();
      await vi.advanceTimersByTimeAsync(1000);
      expect(controller.getRemainingSeconds()).toBe(remBefore);

      mockStdin.emit('data', Buffer.from('p'));
      expect(controller.getIsPaused()).toBe(false);

      await vi.advanceTimersByTimeAsync(3200);
      const result = await promise;
      expect(result).toBe('continue');

      vi.useRealTimers();
    });

    it('should fast-forward immediately on Enter keypress', async () => {
      const onFastForward = vi.fn();
      const controllerPromise = runHandoffTransition({
        payload: samplePayload,
        durationSeconds: 10.0,
        tickIntervalMs: 200,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: true,
        onFastForward,
      });

      mockStdin.emit('data', Buffer.from('\r'));

      const result = await controllerPromise;
      expect(result).toBe('continue');
      expect(onFastForward).toHaveBeenCalled();
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
    });

    it('should skip upcoming candidate immediately on "s" keypress', async () => {
      const onSkip = vi.fn();
      const controllerPromise = runHandoffTransition({
        payload: samplePayload,
        durationSeconds: 10.0,
        tickIntervalMs: 200,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: true,
        onSkip,
      });

      mockStdin.emit('data', Buffer.from('s'));

      const result = await controllerPromise;
      expect(result).toBe('skip');
      expect(onSkip).toHaveBeenCalled();
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
    });

    it('should abort cleanly on "q" or Ctrl+C keypress and restore terminal state', async () => {
      const onAbort = vi.fn();
      const controllerPromise = runHandoffTransition({
        payload: samplePayload,
        durationSeconds: 10.0,
        tickIntervalMs: 200,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: true,
        onAbort,
      });

      mockStdin.emit('data', Buffer.from('q'));

      const result = await controllerPromise;
      expect(result).toBe('abort');
      expect(onAbort).toHaveBeenCalled();
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
    });

    it('should execute 0-second instant handoff in non-interactive / CI mode', async () => {
      const result = await runHandoffTransition({
        payload: samplePayload,
        durationSeconds: 3.0,
        stdin: mockStdin,
        stdout: mockStdout,
        isTTY: false,
        mode: 'ci',
      });

      expect(result).toBe('continue');
      const rendered = writtenChunks.join('');
      expect(rendered).toContain('CI mode: 0s pacing');
      expect(mockStdin.setRawMode).not.toHaveBeenCalled();
    });
  });

  describe('BatonRunner sequential handoff integration', () => {
    it('should emit baton:handoff between sequential issues in the queue', async () => {
      const mockIssue1 = {
        number: 1,
        title: 'First Issue',
        body: 'Part of #100',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const mockIssue2 = {
        number: 2,
        title: 'Second Issue',
        body: 'Part of #100',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockImplementation((num: number) => {
          if (num === 1) return Promise.resolve(mockIssue1);
          if (num === 2) return Promise.resolve(mockIssue2);
          return Promise.resolve(null);
        }),
        listIssues: vi.fn().mockResolvedValue([mockIssue1, mockIssue2]),
        syncParentChecklist: vi.fn().mockResolvedValue(true),
        postParentProgressComment: vi.fn().mockResolvedValue(true),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          isReady: true,
          status: 'READY',
          reasons: ['Gate conditions satisfied'],
        }),
        parseParentReferences: vi.fn().mockReturnValue([100]),
      };

      const mockSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          error: undefined,
        }),
      };

      const runner = new BatonRunner({
        issues: [1, 2],
        mode: 'dry-run',
        githubService: mockGitHubService,
        gatingEvaluator: mockGatingEvaluator,
        processSupervisor: mockSupervisor,
      });

      const handoffEvents: BatonHandoffPayload[] = [];
      runner.on('baton:handoff' as any, (payload: BatonHandoffPayload) => {
        handoffEvents.push(payload);
      });

      const result = await runner.run();
      expect(result.success).toBe(true);
      expect(result.closedIssues).toEqual([1, 2]);
      expect(handoffEvents.length).toBeGreaterThanOrEqual(1);
      expect(handoffEvents[0].completed.number).toBe(1);
      expect(handoffEvents[0].next.number).toBe(2);
    });
  });
});
