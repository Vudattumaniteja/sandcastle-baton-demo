/**
 * PROTOTYPE - Visual Baton Handoff Banners & Transition Displays (Issue #37)
 * 
 * Question: What visual format, terminal layout, timing indicators, and next-issue
 * previews should Sandcastle display in the CLI during baton handoff between
 * completed issues and the next queue candidates?
 * 
 * This file is throwaway prototype code. Do not use in production without refactoring.
 */

import pc from 'picocolors';

export interface CompletedIssueSummary {
  number: number;
  title: string;
  durationMs: number;
  prNumber?: number;
  branchName?: string;
  testsPassed: number;
  testsTotal: number;
  tokensUsed: number;
  costUsd: number;
  attempts: number;
  phaseBreakdown: {
    inspectMs: number;
    implementMs: number;
    testMs: number;
    gitPrMs: number;
  };
}

export interface NextIssueCandidate {
  number: number;
  title: string;
  gatingStatus: 'READY' | 'WAITING' | 'BLOCKED' | 'UNGATED';
  labels: string[];
  parentIssue?: {
    number: number;
    title: string;
    childIndex: number;
    totalChildren: number;
  };
  model: string;
  reasoningEffort: 'high' | 'medium' | 'low';
  acceptanceCriteria: Array<{ text: string; done: boolean }>;
  blockingDependencies: number[];
  estimatedDurationSeconds: number;
}

export interface HandoffState {
  variant: 'A' | 'B' | 'C';
  queueIndex: number;
  totalQueue: number;
  completed: CompletedIssueSummary;
  next: NextIssueCandidate;
  countdownSeconds: number;
  isPaused: boolean;
  activeScenarioName: string;
}

export const SAMPLE_HANDOFF_DATA: HandoffState = {
  variant: 'A',
  queueIndex: 2,
  totalQueue: 5,
  completed: {
    number: 36,
    title: 'CLI execution flags (--from, --only, --all) and wizard resumption flow',
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
    title: 'Visual baton handoff banners and transition display between iterations',
    gatingStatus: 'READY',
    labels: ['ready-for-agent', 'AFK', 'wayfinder:prototype'],
    parentIssue: {
      number: 34,
      title: 'Map: Sandcastle Flow, Guardrails, Sequential Resumption & Prompt Customization',
      childIndex: 3,
      totalChildren: 5,
    },
    model: 'gemini-3.7-flash',
    reasoningEffort: 'high',
    acceptanceCriteria: [
      { text: '3 distinct layout variants switchable via URL/CLI', done: true },
      { text: 'Timing breakdown and countdown pacing indicator', done: true },
      { text: 'Interactive CLI simulation switcher', done: false },
    ],
    blockingDependencies: [],
    estimatedDurationSeconds: 45,
  },
  countdownSeconds: 3.0,
  isPaused: false,
  activeScenarioName: 'Sequential Child Execution (#36 -> #37)',
};

/**
 * Format duration helper
 */
function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * VARIANT A: Baton Relay Scorecard (Boxed Telemetry & Milestone Ledger)
 * 
 * Philosophy: Heavy structural double-line box frames. High-density, high-contrast
 * structured scorecard presenting retrospective metrics, animated relay bar, and next target.
 */
export function renderVariantA(state: HandoffState): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const progressPct = Math.round((queueIndex / totalQueue) * 100);
  const countdownText = isPaused
    ? pc.yellow('[PAUSED]')
    : pc.cyan(`${countdownSeconds.toFixed(1)}s`);

  // Top Completed Scorecard
  lines.push(pc.bold(pc.green('╔══ 🏁 BATON PASSED: Issue #' + completed.number + ' (' + queueIndex + '/' + totalQueue + ' complete) ══════════════════════════════════════╗')));
  lines.push(pc.bold(pc.green('║')) + '  ' + pc.bold(completed.title.length > 70 ? completed.title.substring(0, 67) + '...' : completed.title.padEnd(70)) + ' ' + pc.bold(pc.green('║')));
  lines.push(pc.bold(pc.green('║')) + pc.gray('─'.repeat(74)) + pc.bold(pc.green('║')));
  
  const metric1 = `  ${pc.bold('Duration:')} ${formatMs(completed.durationMs)} ${pc.gray(`(Insp: ${formatMs(completed.phaseBreakdown.inspectMs)} | Impl: ${formatMs(completed.phaseBreakdown.implementMs)} | Test: ${formatMs(completed.phaseBreakdown.testMs)} | PR: ${formatMs(completed.phaseBreakdown.gitPrMs)})`)}`;
  lines.push(pc.bold(pc.green('║')) + metric1.padEnd(95) + pc.bold(pc.green('║')));

  const metric2 = `  ${pc.bold('Artifacts:')} PR #${completed.prNumber} (${pc.green('merged')}) • Branch: ${pc.cyan(completed.branchName || 'main')}`;
  lines.push(pc.bold(pc.green('║')) + metric2.padEnd(85) + pc.bold(pc.green('║')));

  const metric3 = `  ${pc.bold('Quality:')}   ${pc.green(`✔ ${completed.testsPassed}/${completed.testsTotal} tests passed (100% green)`)} • ${completed.tokensUsed.toLocaleString()} tokens (${pc.yellow('$' + completed.costUsd.toFixed(4))})`;
  lines.push(pc.bold(pc.green('║')) + metric3.padEnd(92) + pc.bold(pc.green('║')));

  lines.push(pc.bold(pc.green('╚══════════════════════════════════════════════════════════════════════════╝')));

  // Center Relay Transfer Bar
  lines.push('');
  lines.push('  ' + pc.dim(`[#${completed.number} ✔]`) + pc.cyan(' ═══════════( 🏃 BATON IN FLIGHT )═══════════▶ ') + pc.bold(pc.yellow(`[#${next.number} ⚙]`)));
  
  const pBar = pc.cyan('█'.repeat(Math.min(20, Math.round(progressPct / 5)))) + pc.gray('░'.repeat(Math.max(0, 20 - Math.round(progressPct / 5))));
  lines.push(`  ${pc.bold('Queue Progress:')} ${pBar} ${progressPct}% (${queueIndex}/${totalQueue})  │  ${pc.bold('Next Worker Spool:')} ${countdownText}`);
  lines.push('');

  // Next Candidate Target Box
  const statusBadge = next.gatingStatus === 'READY'
    ? pc.bgGreen(pc.black(' READY '))
    : pc.bgYellow(pc.black(` ${next.gatingStatus} `));

  lines.push(pc.bold(pc.cyan('┌── 🎯 NEXT BATON TARGET: Issue #' + next.number + ' ────────────────────────────────────────┐')));
  lines.push(pc.bold(pc.cyan('│')) + `  ${statusBadge}  ${pc.bold(next.title.length > 60 ? next.title.substring(0, 57) + '...' : next.title)}`.padEnd(82) + pc.bold(pc.cyan('│')));
  
  if (next.parentIssue) {
    const parentLine = `  ${pc.bold('Parent Map:')} #${next.parentIssue.number} (Child ${next.parentIssue.childIndex}/${next.parentIssue.totalChildren}) • ${pc.dim(next.parentIssue.title.substring(0, 42) + '...')}`;
    lines.push(pc.bold(pc.cyan('│')) + parentLine.padEnd(84) + pc.bold(pc.cyan('│')));
  }

  const configLine = `  ${pc.bold('Engine:')}     ${next.model} (${next.reasoningEffort} reasoning) • Est: ~${next.estimatedDurationSeconds}s`;
  lines.push(pc.bold(pc.cyan('│')) + configLine.padEnd(82) + pc.bold(pc.cyan('│')));

  lines.push(pc.bold(pc.cyan('│')) + pc.gray('  Criteria Preview:') .padEnd(80) + pc.bold(pc.cyan('│')));
  for (const ac of next.acceptanceCriteria.slice(0, 3)) {
    const icon = ac.done ? pc.green('  ☑') : pc.gray('  ☐');
    const line = `  ${icon} ${ac.text}`;
    lines.push(pc.bold(pc.cyan('│')) + line.padEnd(82) + pc.bold(pc.cyan('│')));
  }

  lines.push(pc.bold(pc.cyan('└─────────────────────────────────────────────────────────────────────────┘')));
  lines.push(pc.dim('  Controls: [Space] Launch Now  │  [p] Pause/Resume  │  [s] Skip  │  [q] Abort'));

  return lines.join('\n');
}

/**
 * VARIANT B: Compact Stage Pipeline (Horizontal Stream & Fast Ticker)
 * 
 * Philosophy: Minimal terminal height footprint. Continuous stream-friendly
 * horizontal breadcrumbs with instantaneous ticker for high-velocity CI/CD or compact views.
 */
export function renderVariantB(state: HandoffState): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const countdownText = isPaused ? pc.yellow('PAUSED') : `${countdownSeconds.toFixed(1)}s`;

  // 1-line completion stamp
  lines.push(pc.green('✔') + ' ' + pc.bold(`BATON COMPLETED: #${completed.number}`) + ` "${completed.title.substring(0, 38)}..." ` + pc.dim(`[${formatMs(completed.durationMs)} • PR #${completed.prNumber} merged • ${completed.testsPassed} tests green]`));
  
  // Pipeline breadcrumbs
  const qList = [];
  for (let i = 1; i <= totalQueue; i++) {
    if (i < queueIndex) {
      qList.push(pc.green(`[#${34 + i} ✔]`));
    } else if (i === queueIndex) {
      qList.push(pc.green(`[#${completed.number} ✔]`));
    } else if (i === queueIndex + 1) {
      qList.push(pc.yellow(pc.bold(`[#${next.number} ⚙ NEXT]`)));
    } else {
      qList.push(pc.gray(`[#${34 + i} ⏳]`));
    }
  }
  lines.push(pc.gray('  Pipeline: ') + qList.join(pc.gray(' ──▶ ')) + pc.dim(` (${queueIndex}/${totalQueue})`));

  // Ticker countdown
  lines.push(pc.cyan('  >>> ') + pc.bold(`Transferring baton in ${countdownText}...`) + ' ' + pc.dim('[Space: Run now | s: Skip | q: Stop]'));

  // 2-line target preview
  lines.push(pc.magenta('  ↳ TARGET ') + pc.bold(`#${next.number}`) + ` "${next.title.substring(0, 48)}..." ` + pc.green(`[${next.gatingStatus}]`));
  const parentTag = next.parentIssue ? `Parent #${next.parentIssue.number} (${next.parentIssue.childIndex}/${next.parentIssue.totalChildren}) • ` : '';
  lines.push(pc.dim(`    ${parentTag}Model: ${next.model} (${next.reasoningEffort}) • Est: ~${next.estimatedDurationSeconds}s • 0 blockers`));

  return lines.join('\n');
}

/**
 * VARIANT C: Split-Pane Telemetry HUD (Two-Column Retrospective & Pre-flight Diagnostics)
 * 
 * Philosophy: Rich power-user HUD. Side-by-side retrospective analysis and pre-flight
 * verification checks with phase latency breakdown bars and active pacing bar.
 */
export function renderVariantC(state: HandoffState): string {
  const { completed, next, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const countdownText = isPaused ? pc.yellow('PAUSED') : `${countdownSeconds.toFixed(1)}s`;

  lines.push(pc.bold(pc.white('┌─ 📊 Retrospective (#' + completed.number + ' Completed) ────────┬─ 🎯 Pre-flight Readiness (#' + next.number + ' Target) ─────┐')));

  // Row 1
  const left1 = ` Issue:    #${completed.number} (${formatMs(completed.durationMs)})`;
  const right1 = ` Target:   #${next.number} ${pc.green('[READY]')}`;
  lines.push(pc.white('│') + left1.padEnd(46) + pc.white('│') + right1.padEnd(46) + pc.white('│'));

  // Row 2
  const left2 = ` Branch:   ${completed.branchName || 'main'} (PR #${completed.prNumber})`;
  const right2 = ` Title:    ${next.title.substring(0, 34)}...`;
  lines.push(pc.white('│') + left2.padEnd(46) + pc.white('│') + right2.padEnd(46) + pc.white('│'));

  // Row 3
  const left3 = ` Quality:  ${completed.testsPassed}/${completed.testsTotal} green (${completed.tokensUsed} tok)`;
  const right3 = next.parentIssue
    ? ` Parent:   #${next.parentIssue.number} (Child ${next.parentIssue.childIndex}/${next.parentIssue.totalChildren})`
    : ' Parent:   None (Root issue)';
  lines.push(pc.white('│') + left3.padEnd(46) + pc.white('│') + right3.padEnd(46) + pc.white('│'));

  // Row 4 - Phase breakdown vs Engine
  const left4 = ` Phases:   Insp ${formatMs(completed.phaseBreakdown.inspectMs)} │ Impl ${formatMs(completed.phaseBreakdown.implementMs)}`;
  const right4 = ` Model:    ${next.model} (${next.reasoningEffort})`;
  lines.push(pc.white('│') + left4.padEnd(46) + pc.white('│') + right4.padEnd(46) + pc.white('│'));

  // Row 5 - Verify breakdown vs Gating
  const left5 = `           Test ${formatMs(completed.phaseBreakdown.testMs)} │ Git ${formatMs(completed.phaseBreakdown.gitPrMs)}`;
  const right5 = ` Labels:   ${next.labels.slice(0, 2).join(', ')}`;
  lines.push(pc.white('│') + left5.padEnd(46) + pc.white('│') + right5.padEnd(46) + pc.white('│'));

  lines.push(pc.white('├──────────────────────────────────────────────┴──────────────────────────────────────────────┤'));
  
  const pacingBar = pc.cyan('█'.repeat(16)) + pc.gray('░'.repeat(8));
  const footer = ` ◴ Passing Baton: ${countdownText} [${pacingBar}]  [Space] Launch  [p] Pause  [s] Skip `;
  lines.push(pc.white('│') + footer.padEnd(101) + pc.white('│'));
  lines.push(pc.bold(pc.white('└─────────────────────────────────────────────────────────────────────────────────────────────┘')));

  return lines.join('\n');
}

/**
 * Master dispatcher rendering whatever variant is selected in state.
 */
export function renderHandoffBanner(state: HandoffState): string {
  switch (state.variant) {
    case 'A':
      return renderVariantA(state);
    case 'B':
      return renderVariantB(state);
    case 'C':
      return renderVariantC(state);
    default:
      return renderVariantA(state);
  }
}
