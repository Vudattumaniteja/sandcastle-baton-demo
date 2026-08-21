import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import type {
  WatchMonitorOptions,
  WatchDashboardData,
} from '../types/watch.js';
import type { BatonRunSnapshot } from '../types/baton.js';
import { TranscriptTailer } from '../core/transcript-tailer.js';
import {
  AntigravityService,
  resolveCandidateQuotaInfo,
} from '../services/antigravity-service.js';

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const padMins = mins.toString().padStart(2, '0');
  const padSecs = secs.toString().padStart(2, '0');
  return `${padMins}:${padSecs}`;
}

export function formatProgressBar(percent: number, width: number = 20): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillCount = Math.round((clamped / 100) * width);
  const emptyCount = width - fillCount;
  const filled = '█'.repeat(fillCount);
  const empty = '░'.repeat(emptyCount);
  return `${pc.cyan(filled)}${pc.gray(empty)} ${clamped}%`;
}

export class WatchMonitor {
  private options: WatchMonitorOptions;
  private cwd: string;
  private stateFilePath: string;
  private writer: (text: string) => void;
  private stdin?: NodeJS.ReadStream;
  private refreshIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private tailer?: TranscriptTailer;
  private antigravityService: AntigravityService;
  private isRunning = false;
  private cleanupSignals?: () => void;
  private keypressHandler?: (chunk: Buffer | string) => void;

  constructor(options: WatchMonitorOptions = {}) {
    this.options = options;
    this.cwd = options.cwd ?? process.cwd();
    this.stateFilePath =
      options.stateFilePath ?? path.join(this.cwd, '.sandcastle', 'run.json');
    this.writer =
      options.writer ?? ((text: string) => process.stdout.write(text));
    this.stdin = options.stdin ?? process.stdin;
    this.refreshIntervalMs = options.refreshIntervalMs ?? 500;
    this.antigravityService = new AntigravityService();

    if (options.transcriptPath || options.conversationId) {
      this.tailer = new TranscriptTailer({
        filePath: options.transcriptPath,
        conversationId: options.conversationId,
        pollIntervalMs: Math.max(100, Math.floor(this.refreshIntervalMs / 2)),
      });
    } else {
      this.tailer = new TranscriptTailer({
        pollIntervalMs: Math.max(100, Math.floor(this.refreshIntervalMs / 2)),
      });
    }
  }

  /**
   * Enters the alternate screen buffer and hides the terminal cursor.
   */
  enterAlternateScreen(): void {
    // \x1b[?1049h: switch to alternate screen buffer, \x1b[H: move cursor home, \x1b[?25l: hide cursor
    this.writer('\x1b[?1049h\x1b[H\x1b[?25l');
  }

  /**
   * Exits the alternate screen buffer and restores cursor visibility.
   */
  exitAlternateScreen(): void {
    // \x1b[?1049l: restore primary screen buffer, \x1b[?25h: restore cursor visibility
    this.writer('\x1b[?1049l\x1b[?25h');
  }

  /**
   * Reads and parses current baton state snapshot from run.json.
   */
  readSnapshot(): BatonRunSnapshot | null {
    if (!fs.existsSync(this.stateFilePath)) {
      return null;
    }
    try {
      const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
      if (!raw.trim()) return null;
      return JSON.parse(raw) as BatonRunSnapshot;
    } catch {
      return null;
    }
  }

  /**
   * Configures keyboard input listeners for detachment and shortcuts.
   */
  setupKeypressHandler(): void {
    if (!this.stdin) return;

    if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
      try {
        this.stdin.setRawMode(true);
        this.stdin.resume();
      } catch {
        // ignore
      }
    }

    this.keypressHandler = (chunk: Buffer | string) => {
      const key = chunk.toString();
      // 'q', 'Q', or Ctrl+C (\u0003)
      if (key === 'q' || key === 'Q' || key === '\u0003') {
        this.stop();
        if (this.options.onExit) {
          this.options.onExit();
        }
      } else if (key === 'r' || key === 'R') {
        this.render().catch(() => {});
      }
    };

    this.stdin.on('data', this.keypressHandler);
  }

  /**
   * Registers central signal trap handlers to guarantee terminal restoration.
   */
  registerSignalHandlers(): () => void {
    const handleExit = () => {
      this.exitAlternateScreen();
    };

    const sigintListener = () => {
      this.stop();
      if (this.options.onExit) {
        this.options.onExit();
      } else {
        process.exit(130);
      }
    };

    const sigtermListener = () => {
      this.stop();
      if (this.options.onExit) {
        this.options.onExit();
      } else {
        process.exit(143);
      }
    };

    process.on('SIGINT', sigintListener);
    process.on('SIGTERM', sigtermListener);
    process.on('exit', handleExit);

    return () => {
      process.removeListener('SIGINT', sigintListener);
      process.removeListener('SIGTERM', sigtermListener);
      process.removeListener('exit', handleExit);
    };
  }

  /**
   * Compiles dashboard data and renders a full redraw in the alternate screen.
   */
  async render(): Promise<void> {
    const snapshot = this.readSnapshot();
    if (this.tailer) {
      await this.tailer.poll();
    }
    const transcriptSummary = this.tailer ? this.tailer.getSummary() : null;
    const statusline =
      this.options.statuslineSnapshot ??
      (await this.antigravityService.getStatuslineSnapshot());

    let elapsedSeconds = 0;
    if (snapshot?.startTime) {
      const start = new Date(snapshot.startTime).getTime();
      const end = snapshot.endTime ? new Date(snapshot.endTime).getTime() : Date.now();
      elapsedSeconds = Math.max(0, (end - start) / 1000);
    }

    const data: WatchDashboardData = {
      snapshot,
      transcript: transcriptSummary,
      statusline,
      elapsedSeconds,
    };

    const rendered = this.formatDashboard(data);
    // Home cursor and overwrite screen
    this.writer(`\x1b[H\x1b[2J${rendered}`);
  }

  /**
   * Formats the complete alternate-screen dashboard layout string.
   */
  formatDashboard(data: WatchDashboardData): string {
    const { snapshot, transcript, statusline, elapsedSeconds } = data;
    const lines: string[] = [];

    // Header Bar
    const title = pc.bold(pc.bgCyan(pc.black(' SANDCASTLE '))) + pc.bold(pc.cyan(' LIVE WATCH MONITOR '));
    const timerStr = pc.yellow(pc.bold(formatDuration(elapsedSeconds)));
    lines.push(`${title}  ${pc.gray(`[Elapsed: ${timerStr}]`)}`);
    lines.push(pc.gray('─'.repeat(72)));

    if (!snapshot) {
      lines.push('');
      lines.push(pc.yellow('  ⏳ No active Sandcastle baton run detected in this workspace.'));
      lines.push(pc.gray(`     Looking at state file: ${this.stateFilePath}`));
      lines.push(pc.gray('     Waiting for session to initialize...'));
      lines.push('');
      lines.push(pc.gray('─'.repeat(72)));
      lines.push(`  ${pc.dim('[q] Detach / Quit')}   ${pc.dim('[r] Refresh')}   ${pc.dim('Auto-updating every ' + this.refreshIntervalMs + 'ms')}`);
      return lines.join('\n');
    }

    // Status & Session Details
    const statusBadge =
      snapshot.status === 'running'
        ? pc.bgGreen(pc.black(' RUNNING '))
        : snapshot.status === 'completed'
        ? pc.bgBlue(pc.black(' COMPLETED '))
        : snapshot.status === 'blocked'
        ? pc.bgRed(pc.white(' BLOCKED '))
        : pc.bgYellow(pc.black(` ${snapshot.status.toUpperCase()} `));

    const repoStr = pc.cyan(snapshot.repo || 'unknown/repo');
    const sessStr = pc.gray(snapshot.sessionId || 'none');
    lines.push(`  ${statusBadge}  ${pc.bold('Repo:')} ${repoStr}  ${pc.bold('Session:')} ${sessStr}`);

    // Active Issue & Overall Progress
    const activeIssueStr = snapshot.handoff
      ? pc.yellow(`Handoff #${snapshot.handoff.completed.number} ➔ #${snapshot.handoff.next.number}`)
      : snapshot.currentIssue
      ? pc.bold(pc.cyan(`Issue #${snapshot.currentIssue}`))
      : pc.gray('Idle / None');

    const progressPct =
      snapshot.totalIssues > 0
        ? Math.round((snapshot.closedCount / snapshot.totalIssues) * 100)
        : 0;
    const progressText = `${snapshot.closedCount}/${snapshot.totalIssues} closed (${snapshot.blockedCount} blocked)`;

    lines.push(`  ${pc.bold('Active:')} ${activeIssueStr}  │  ${pc.bold('Progress:')} ${progressText}  ${formatProgressBar(progressPct, 12)}`);
    lines.push('');

    if (snapshot.handoff) {
      const h = snapshot.handoff;
      const countText = h.isPaused
        ? pc.yellow('[PAUSED]')
        : pc.yellow(pc.bold(`${h.countdownSeconds.toFixed(1)}s`));
      const countBar = formatProgressBar(60, 12);
      const prPart = h.completed.prNumber ? ` • PR #${h.completed.prNumber}` : '';
      const modelStr = h.next.model || 'gemini-3.7-flash';
      const effortStr = h.next.reasoningEffort || 'high';

      lines.push(pc.bold(pc.white('┌─ 🏃 Baton In Flight ──────────────────────────────────────────────────┐')));
      const lastLine = `│  ${pc.green('✔ Last Completed:')} Issue #${h.completed.number} (${(h.completed.durationMs / 1000).toFixed(1)}s${prPart} • 100% green)`;
      lines.push(lastLine.padEnd(81) + '│');
      const nextLine = `│  ${pc.cyan('▶ Next Candidate:')}  Issue #${h.next.number} [${h.next.gatingStatus}] • ${modelStr} (${effortStr})`;
      lines.push(nextLine.padEnd(81) + '│');
      if (h.next.parentIssue) {
        const parentLine = `│  ${pc.gray('↳ Parent Issue:')}   #${h.next.parentIssue.number} (Child ${h.next.parentIssue.childIndex} of ${h.next.parentIssue.totalChildren})`;
        lines.push(parentLine.padEnd(81) + '│');
      }
      const spoolLine = `│  ${pc.bold('⏱ Next Session:')}   Spooling in ${countText} [${countBar}]`;
      lines.push(spoolLine.padEnd(89) + '│');
      lines.push(pc.bold(pc.white('└───────────────────────────────────────────────────────────────────────┘')));
      lines.push('');
    }

    // Phase Indicator Bar
    const phases = ['Inspect', 'Implement', 'Test', 'Commit', 'PR', 'Merge', 'Close'];
    const phaseFormatted = phases
      .map((p) => {
        return pc.dim(`[${p}]`);
      })
      .join(pc.gray(' → '));
    lines.push(`  ${pc.bold('Worker Contract:')} ${phaseFormatted}`);
    lines.push(pc.gray('─'.repeat(72)));

    // Agent Live Reasoning Box
    lines.push(pc.bold(pc.white('┌─ Agent Live Reasoning ────────────────────────────────────────────────┐')));
    const thought = transcript?.latestThought;
    if (thought) {
      // Split into clean lines
      const thoughtLines = thought.split('\n').slice(0, 3);
      for (const tLine of thoughtLines) {
        const truncated = tLine.length > 68 ? tLine.substring(0, 65) + '...' : tLine;
        lines.push(`│ ${pc.italic(pc.cyan(truncated.padEnd(70)))} │`);
      }
    } else {
      lines.push(`│ ${pc.gray('Streaming reasoning tokens and planner thoughts...'.padEnd(70))} │`);
    }
    lines.push(pc.bold(pc.white('└───────────────────────────────────────────────────────────────────────┘')));

    // Tool Calls Section
    lines.push('');
    lines.push(pc.bold(pc.white('┌─ Recent Tool Calls ───────────────────────────────────────────────────┐')));
    const toolCalls = transcript?.recentToolCalls || [];
    if (toolCalls.length === 0) {
      lines.push(`│ ${pc.gray('No tool calls recorded yet in active session.'.padEnd(70))} │`);
    } else {
      const recent = toolCalls.slice(-5);
      for (const tc of recent) {
        const rawIcon =
          tc.status === 'completed'
            ? '✔'
            : tc.status === 'error'
            ? '✖'
            : '●';
        const colorFn =
          tc.status === 'completed'
            ? pc.green
            : tc.status === 'error'
            ? pc.red
            : pc.cyan;
        const desc = tc.action || tc.summary || '';
        let target = '';
        if (tc.args?.AbsolutePath) {
          target = path.basename(tc.args.AbsolutePath);
        } else if (tc.args?.TargetFile) {
          target = path.basename(tc.args.TargetFile);
        } else if (tc.args?.CommandLine) {
          target = tc.args.CommandLine;
        } else if (Object.keys(tc.args).length > 0) {
          const firstVal = String(Object.values(tc.args)[0]);
          target = firstVal.length > 25 ? firstVal.substring(0, 22) + '...' : firstVal;
        }

        const callName = tc.name + (target ? `(${target})` : '');
        const sep = desc ? ' - ' : '';
        const plainText = `${rawIcon} ${callName}${sep}${desc}`;
        const maxLen = 70;
        const truncatedPlain =
          plainText.length > maxLen
            ? plainText.substring(0, maxLen - 3) + '...'
            : plainText;
        const paddedPlain = truncatedPlain.padEnd(maxLen);
        const coloredLine = paddedPlain.replace(rawIcon, colorFn(rawIcon));
        lines.push(`│ ${coloredLine} │`);
      }
    }
    lines.push(pc.bold(pc.white('└───────────────────────────────────────────────────────────────────────┘')));

    // Resource, Token & Quota Bar
    lines.push('');
    const modelName = statusline?.model?.id || 'Gemini 3.7 Flash (High)';
    let quotaInfo = '';
    if (statusline?.quota) {
      const activeModelId = statusline.model?.id || modelName;
      const modelQuota = resolveCandidateQuotaInfo(activeModelId, statusline);
      if (modelQuota && typeof modelQuota.remaining_fraction === 'number') {
        const pct = Math.round(modelQuota.remaining_fraction * 100);
        quotaInfo = `  │  ${pc.bold('Quota:')} ${formatProgressBar(pct, 8)}`;
      }
    }
    const tokenInfo = transcript?.tokenUsage?.total
      ? `  │  ${pc.bold('Tokens:')} ${transcript.tokenUsage.total}`
      : '';

    lines.push(`  ${pc.bold('Model:')} ${pc.green(modelName)}${quotaInfo}${tokenInfo}`);
    lines.push(pc.gray('─'.repeat(72)));
    lines.push(`  ${pc.bold('[q]')} Detach / Quit   ${pc.bold('[r]')} Refresh   ${pc.dim('Auto-updating every ' + this.refreshIntervalMs + 'ms')}`);

    return lines.join('\n');
  }

  /**
   * Starts the live watch monitor loop.
   */
  start(): this {
    if (this.isRunning) return this;
    this.isRunning = true;

    this.cleanupSignals = this.registerSignalHandlers();
    this.enterAlternateScreen();
    this.setupKeypressHandler();

    if (this.tailer) {
      this.tailer.start();
    }

    this.render().catch(() => {});

    if (!this.options.renderOnce) {
      this.timer = setInterval(() => {
        this.render().catch(() => {});
      }, this.refreshIntervalMs);

      if (this.timer.unref) {
        this.timer.unref();
      }
    }

    return this;
  }

  /**
   * Stops the live watch monitor and restores the primary terminal buffer.
   */
  stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    if (this.tailer) {
      this.tailer.stop();
    }

    if (this.stdin && this.keypressHandler) {
      this.stdin.removeListener('data', this.keypressHandler);
      if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
        try {
          this.stdin.setRawMode(false);
        } catch {
          // ignore
        }
      }
    }

    if (this.cleanupSignals) {
      this.cleanupSignals();
      this.cleanupSignals = undefined;
    }

    this.exitAlternateScreen();
  }
}
