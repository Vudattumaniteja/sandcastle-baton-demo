import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  formatGatingBadge,
  formatIssueOption,
  formatModelOption,
  getReasoningEffortChoices,
  getExecutionModeChoices,
  formatLaunchManifest,
  formatPhaseMessage,
  formatDuration,
  formatProgressBar,
  formatHandoffProgressBar,
  formatMs,
  formatHandoffSummary,
  renderHandoffBySurface,
  HandoffPresenter,
  getEnterAlternateScreenSequence,
  getExitAlternateScreenSequence,
  getClearAndHomeSequence,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
  CURSOR_HOME,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CLEAR_SCREEN,
  KeypressListener,
  getTerminalDimensions,
  truncate,
  padAnsi,
  createBoxCard,
  WatchDashboard,
  WatchMonitor,
  HandoffTransitionController,
  runHandoffTransition,
} from '#packages/terminal';
import type { BatonHandoffPayload } from '../src/types/handoff.js';
import type { GatingEvaluation } from '../src/types/gating.js';
import type { ModelInfo } from '../src/types/antigravity.js';

describe('packages/terminal', () => {
  describe('index.ts formatters & HandoffPresenter', () => {
    it('should format gating badges for all statuses', () => {
      expect(formatGatingBadge('READY')).toContain('[READY]');
      expect(formatGatingBadge('WAITING')).toContain('[WAITING]');
      expect(formatGatingBadge('BLOCKED')).toContain('[BLOCKED]');
      expect(formatGatingBadge('UNGATED')).toContain('[UNGATED]');
      expect(formatGatingBadge('CLOSED')).toContain('[CLOSED]');
      expect(formatGatingBadge('PARENT')).toContain('[PARENT]');
      expect(formatGatingBadge('HITL')).toContain('[HITL]');
    });

    it('should format issue option with hints according to gating status', () => {
      const readyEval: GatingEvaluation = {
        issueNumber: 42,
        title: 'Deep Terminal Module',
        state: 'OPEN',
        isReady: true,
        hasReadyLabel: true,
        hasAfkLabel: true,
        isBlockedLabelPresent: false,
        prerequisiteIssueNumbers: [],
        status: 'READY',
        missingLabels: [],
        blockingIssueNumbers: [],
        reasons: [],
      };
      const opt = formatIssueOption(readyEval);
      expect(opt.value).toBe(42);
      expect(opt.label).toContain('#42 Deep Terminal Module');
      expect(opt.hint).toBe('Ready for autonomous execution');

      const parentEval: GatingEvaluation = {
        ...readyEval,
        issueNumber: 10,
        status: 'PARENT',
        isReady: false,
      };
      expect(formatIssueOption(parentEval).hint).toContain('Parent/epic specification');
    });

    it('should format model options with quota and default flags', () => {
      const model: ModelInfo = {
        id: 'gemini-3.7-flash',
        name: 'Gemini 3.7 Flash',
        isDefault: true,
        aliases: ['flash'],
      };
      const opt = formatModelOption(model, null);
      expect(opt.value).toBe('gemini-3.7-flash');
      expect(opt.label).toContain('[Default]');
    });

    it('should return reasoning effort and execution mode choices', () => {
      const effort = getReasoningEffortChoices();
      expect(effort.map((e) => e.value)).toEqual(['high', 'medium', 'low']);

      const modes = getExecutionModeChoices();
      expect(modes.map((m) => m.value)).toEqual(['afk', 'supervised', 'dry-run']);
    });

    it('should format launch manifest and phase messages', () => {
      const manifest = {
        repo: 'owner/repo',
        branch: 'main',
        targetDescription: 'All issues',
        model: 'gemini-3.7-flash',
        reasoningEffort: 'high' as const,
        mode: 'afk' as const,
        autoPr: true,
        autoMerge: true,
      };
      const text = formatLaunchManifest(manifest);
      expect(text).toContain('Repository:');
      expect(text).toContain('owner/repo');
      expect(text).toContain('High');

      expect(formatPhaseMessage('inspect', 42)).toContain('[1/6 Inspecting] Reading issue #42');
      expect(formatPhaseMessage('implement', 42)).toContain('[2/6 Implementing]');
      expect(formatPhaseMessage('test', 42)).toContain('[3/6 Testing]');
      expect(formatPhaseMessage('commit', 42)).toContain('[4/6 Git]');
      expect(formatPhaseMessage('pr', 42)).toContain('[5/6 PR]');
      expect(formatPhaseMessage('merge', 42)).toContain('[6/6 Merging]');
      expect(formatPhaseMessage('close', 42)).toContain('[Closing]');
    });

    it('should render handoff across surfaces via HandoffPresenter', () => {
      const payload: BatonHandoffPayload = {
        mode: 'run',
        queueIndex: 1,
        totalQueue: 3,
        countdownSeconds: 3.0,
        isPaused: false,
        completed: {
          number: 10,
          title: 'Finished Issue',
          durationMs: 4000,
        },
        next: {
          number: 11,
          title: 'Upcoming Issue',
          gatingStatus: 'READY',
        },
      };

      const runRender = HandoffPresenter.render(payload, 'run');
      expect(runRender).toContain('BATON COMPLETED: Issue #10');
      expect(runRender).toContain('NEXT BATON TARGET: Issue #11');

      const wizardRender = HandoffPresenter.render(payload, 'wizard');
      expect(wizardRender).toContain('Issue #10 closed successfully');

      const ciRender = HandoffPresenter.render(payload, 'ci');
      expect(ciRender).toContain('BATON COMPLETED: #10');

      const summary = HandoffPresenter.renderSummary(payload);
      expect(summary).toBe(runRender);
    });
  });

  describe('lib/alternate-screen.ts', () => {
    it('should construct proper ANSI escape sequences', () => {
      expect(ENTER_ALT_SCREEN).toBe('\x1b[?1049h');
      expect(EXIT_ALT_SCREEN).toBe('\x1b[?1049l');
      expect(CURSOR_HOME).toBe('\x1b[H');
      expect(CURSOR_HIDE).toBe('\x1b[?25l');
      expect(CURSOR_SHOW).toBe('\x1b[?25h');
      expect(CLEAR_SCREEN).toBe('\x1b[2J');

      expect(getEnterAlternateScreenSequence()).toBe('\x1b[?1049h\x1b[H\x1b[?25l');
      expect(getExitAlternateScreenSequence()).toBe('\x1b[?1049l\x1b[?25h');
      expect(getClearAndHomeSequence()).toBe('\x1b[H\x1b[2J');
    });
  });

  describe('lib/ansi-progress.ts', () => {
    it('should format progress bar with and without trailing numbers', () => {
      const barWithPct = formatProgressBar(50, 10, true);
      expect(barWithPct).toContain('50%');
      expect(barWithPct).toContain('█');
      expect(barWithPct).toContain('░');

      const barWithoutPct = formatProgressBar(50, 10, false);
      expect(barWithoutPct).not.toContain('50%');

      const handoffBar = formatHandoffProgressBar(80, 10);
      expect(handoffBar).not.toContain('80%');
    });

    it('should format durations and milliseconds', () => {
      expect(formatDuration(125)).toBe('02:05');
      expect(formatDuration(0)).toBe('00:00');
      expect(formatMs(1500)).toBe('1.5s');
      expect(formatMs(400)).toBe('0.4s');
    });
  });

  describe('lib/layout-calculator.ts', () => {
    it('should calculate terminal dimensions and handle truncation', () => {
      const mockStdout = { columns: 100, rows: 40 } as any;
      const dims = getTerminalDimensions(mockStdout);
      expect(dims.width).toBe(100);
      expect(dims.height).toBe(40);

      expect(truncate('short text', 20)).toBe('short text');
      expect(truncate('a very long line that should be truncated', 15)).toBe('a very long ...');
    });

    it('should pad ANSI text accurately and generate box cards', () => {
      const padded = padAnsi('\x1b[32mhello\x1b[39m', 10);
      expect(padded).toBe('\x1b[32mhello\x1b[39m     ');

      const card = createBoxCard('Test Card', ['Line 1', 'Line 2'], 40);
      expect(card[0]).toContain('Test Card');
      expect(card[1]).toContain('Line 1');
      expect(card[2]).toContain('Line 2');
      expect(card[3]).toContain('─');
    });
  });

  describe('lib/keypress-listener.ts', () => {
    it('should attach and detach cleanly from stdin stream', () => {
      const mockStdin = new EventEmitter() as any;
      mockStdin.isTTY = true;
      mockStdin.setRawMode = vi.fn();
      mockStdin.resume = vi.fn();

      const listener = new KeypressListener({ stdin: mockStdin });
      const capturedKeys: string[] = [];

      listener.start((k) => capturedKeys.push(k));
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);

      mockStdin.emit('data', Buffer.from(' '));
      mockStdin.emit('data', Buffer.from('q'));

      expect(capturedKeys).toEqual([' ', 'q']);

      listener.stop();
      expect(mockStdin.setRawMode).toHaveBeenCalledWith(false);
    });
  });

  describe('transition.ts controller', () => {
    it('should bypass countdown in non-interactive CI mode', async () => {
      const output: string[] = [];
      const payload: BatonHandoffPayload = {
        mode: 'ci',
        queueIndex: 0,
        totalQueue: 1,
        countdownSeconds: 0,
        isPaused: false,
        completed: { number: 1, title: 'T1', durationMs: 1000 },
        next: { number: 2, title: 'T2', gatingStatus: 'READY' },
      };

      const action = await runHandoffTransition({
        payload,
        isTTY: false,
        stdout: (text) => output.push(text),
      });

      expect(action).toBe('continue');
      expect(output.join('')).toContain('BATON COMPLETED: #1');
    });
  });

  describe('monitor.ts', () => {
    it('should export WatchDashboard as alias for WatchMonitor', () => {
      expect(WatchDashboard).toBe(WatchMonitor);
    });
  });
});
