/**
 * PROTOTYPE - Visual Baton Handoff Banners & CLI Integration (Issue #37)
 * 
 * Question: What visual format, terminal layout, timing indicators, and next-issue
 * previews should Sandcastle display across its CLI operational surfaces
 * (run, wizard, watch, and CI stream) during baton handoff?
 * 
 * This file is throwaway prototype code. Do not use in production without refactoring.
 */

import pc from 'picocolors';

export type CliMode = 'run' | 'wizard' | 'watch' | 'ci';

export interface BatonHandoffPayload {
  mode: CliMode;
  queueIndex: number;
  totalQueue: number;
  countdownSeconds: number;
  isPaused: boolean;
  activeScenarioName: string;
  completed: {
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
  };
  next: {
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
  };
}

export const SAMPLE_BATON_PAYLOAD: BatonHandoffPayload = {
  mode: 'run',
  queueIndex: 2,
  totalQueue: 5,
  countdownSeconds: 3.0,
  isPaused: false,
  activeScenarioName: 'Sequential Child Handoff (#36 -> #37)',
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
      { text: 'Adaptive rendering across all 4 CLI operational surfaces', done: true },
      { text: '3s pacing delay with Space pause and Enter fast-forward', done: true },
      { text: 'Next candidate preview with acceptance criteria checkmarks', done: true },
    ],
    blockingDependencies: [],
    estimatedDurationSeconds: 45,
  },
};

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * 1. CLI RUN MODE (Standard stdout stream with Relay Scorecard & Next Preview)
 */
export function renderRunMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const progressPct = Math.round((queueIndex / totalQueue) * 100);
  const countdownText = isPaused
    ? pc.yellow('[PAUSED]')
    : pc.cyan(`${countdownSeconds.toFixed(1)}s`);

  // Completed Issue Milestone Card
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

  // Animated Relay Transfer Bar
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
  lines.push(pc.dim('  Controls: [Space] Pause/Resume  │  [Enter] Launch Now  │  [s] Skip  │  [q] Abort'));

  return lines.join('\n');
}

/**
 * 2. CLACK WIZARD MODE (Interactive note card and spinner lifecycle)
 */
export function renderWizardMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const countdownText = isPaused ? pc.yellow('[PAUSED]') : pc.cyan(`${countdownSeconds.toFixed(1)}s`);

  lines.push(pc.green('✔') + ' ' + pc.bold(`Issue #${completed.number} closed successfully`) + ` in ${formatMs(completed.durationMs)} (PR #${completed.prNumber} merged, ${completed.testsPassed} tests passed)`);
  lines.push('');
  lines.push(pc.cyan('◆') + ' ' + pc.bold('Sandcastle Baton Handoff Note'));
  lines.push(pc.cyan('│'));
  lines.push(pc.cyan('│') + `  ${pc.bold('Completed:')}  #${completed.number} ${completed.title.substring(0, 48)}...`);
  lines.push(pc.cyan('│') + `  ${pc.bold('Progress:')}   ${queueIndex}/${totalQueue} issues closed (${Math.round((queueIndex / totalQueue) * 100)}%)`);
  lines.push(pc.cyan('│') + `  ${pc.bold('Next Up:')}    #${next.number} "${next.title.substring(0, 45)}..." ${pc.green('[READY]')}`);
  if (next.parentIssue) {
    lines.push(pc.cyan('│') + `  ${pc.bold('Parent:')}     #${next.parentIssue.number} (Child ${next.parentIssue.childIndex}/${next.parentIssue.totalChildren})`);
  }
  lines.push(pc.cyan('│') + `  ${pc.bold('Engine:')}     ${next.model} (${next.reasoningEffort} reasoning)`);
  lines.push(pc.cyan('│'));
  lines.push(pc.cyan('└') + ' ' + pc.dim(`Spooling next worker session in ${countdownText}... [Press Space to pause or Enter to start]`));
  lines.push('');
  lines.push(pc.cyan('◓') + ' ' + pc.dim(`[1/6 Inspecting] Fetching requirements for Issue #${next.number}...`));

  return lines.join('\n');
}

/**
 * 3. LIVE WATCH MONITOR MODE (Alternate-screen HUD with in-flight handoff box)
 */
export function renderWatchMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } = state;
  const lines: string[] = [];

  const progressPct = Math.round((queueIndex / totalQueue) * 100);
  const countdownText = isPaused ? pc.yellow('[PAUSED]') : pc.yellow(pc.bold(`${countdownSeconds.toFixed(1)}s`));

  // Header Bar
  const title = pc.bold(pc.bgCyan(pc.black(' SANDCASTLE '))) + pc.bold(pc.cyan(' LIVE WATCH MONITOR '));
  lines.push(`${title}  ${pc.gray('[Elapsed: 01:22]')}`);
  lines.push(pc.gray('─'.repeat(74)));

  // Statusline
  const statusBadge = pc.bgBlue(pc.black(' BATON HANDOFF '));
  lines.push(`  ${statusBadge}  ${pc.bold('Repo:')} ${pc.magenta('Vudattumaniteja/sandcastle-baton-demo')}  ${pc.bold('Session:')} ${pc.gray('baton-live-37')}`);
  lines.push(`  ${pc.bold('Active:')} ${pc.yellow(`Handoff #${completed.number} ➔ #${next.number}`)}  │  ${pc.bold('Progress:')} ${queueIndex}/${totalQueue} closed  ${pc.cyan('████████')}${pc.gray('░░░░░░░░░░░░')} ${progressPct}%`);
  lines.push('');

  // In-flight Handoff Telemetry Card
  lines.push(pc.bold(pc.white('┌─ 🏃 Baton In Flight ──────────────────────────────────────────────────┐')));
  lines.push(`│  ${pc.green('✔ Last Completed:')} Issue #${completed.number} (${formatMs(completed.durationMs)} • PR #${completed.prNumber} • 100% green)`.padEnd(81) + '│');
  lines.push(`│  ${pc.cyan('▶ Next Candidate:')}  Issue #${next.number} [READY] • ${next.model} (${next.reasoningEffort})`.padEnd(81) + '│');
  if (next.parentIssue) {
    lines.push(`│  ${pc.gray('↳ Parent Issue:')}   #${next.parentIssue.number} (Child ${next.parentIssue.childIndex}/${next.parentIssue.totalChildren})`.padEnd(81) + '│');
  }
  const countBar = pc.cyan('█'.repeat(12)) + pc.gray('░'.repeat(8));
  lines.push(`│  ${pc.bold('⏱ Next Session:')}   Spooling in ${countdownText} [${countBar}]`.padEnd(89) + '│');
  lines.push(pc.bold(pc.white('└───────────────────────────────────────────────────────────────────────┘')));

  lines.push('');
  lines.push(pc.bold(pc.white('┌─ Agent Reasoning / Status ────────────────────────────────────────────┐')));
  lines.push(`│ ${pc.italic(pc.cyan('Finalizing git merge for PR #' + completed.prNumber + ' and verifying closure audit comment...'))}`.padEnd(84) + '│');
  lines.push(`│ ${pc.dim('Preparing clean worker context for Issue #' + next.number + '...'.padEnd(68))}│`);
  lines.push(pc.bold(pc.white('└───────────────────────────────────────────────────────────────────────┘')));

  lines.push('');
  lines.push(`  ${pc.bold('Model:')} ${pc.green(next.model)}  │  ${pc.bold('Quota:')} ${pc.cyan('████████')}${pc.gray('░░')} 88%  │  ${pc.bold('Tokens:')} 18.4k`);
  lines.push(pc.gray('─'.repeat(74)));
  lines.push(`  ${pc.bold('[Space]')} Pause   ${pc.bold('[Enter]')} Spool Now   ${pc.bold('[s]')} Skip   ${pc.bold('[q]')} Detach`);

  return lines.join('\n');
}

/**
 * 4. CI / STREAM MODE (Compact single-line stream with horizontal breadcrumbs)
 */
export function renderCiMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue } = state;
  const lines: string[] = [];

  lines.push(pc.green('✔') + ' ' + pc.bold(`BATON COMPLETED: #${completed.number}`) + ` "${completed.title.substring(0, 38)}..." ` + pc.dim(`[${formatMs(completed.durationMs)} • PR #${completed.prNumber} merged • ${completed.testsPassed} tests green]`));
  
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
  lines.push(pc.cyan('  >>> ') + pc.bold(`Instant handoff to #${next.number}...`) + ' ' + pc.dim(`(CI mode: 0s pacing)`));
  lines.push(pc.magenta('  ↳ TARGET ') + pc.bold(`#${next.number}`) + ` "${next.title.substring(0, 48)}..." ` + pc.green(`[${next.gatingStatus}]`));

  return lines.join('\n');
}

/**
 * Master dispatcher by CLI surface
 */
export function renderHandoffBySurface(state: BatonHandoffPayload): string {
  switch (state.mode) {
    case 'run':
      return renderRunMode(state);
    case 'wizard':
      return renderWizardMode(state);
    case 'watch':
      return renderWatchMode(state);
    case 'ci':
      return renderCiMode(state);
    default:
      return renderRunMode(state);
  }
}
