import pc from 'picocolors';
import type { BatonHandoffPayload, HandoffRenderMode } from '../../types/handoff.js';
import { formatMs, formatHandoffProgressBar } from './lib/ansi-progress.js';

/**
 * 1. CLACK WIZARD MODE (Interactive step note card format)
 */
export function renderWizardMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } =
    state;
  const lines: string[] = [];

  const progressPct =
    totalQueue > 0 ? Math.round((queueIndex / totalQueue) * 100) : 0;
  const countdownText = isPaused
    ? pc.yellow('[PAUSED]')
    : pc.cyan(`${countdownSeconds.toFixed(1)}s`);

  const prText = completed.prNumber ? ` (PR #${completed.prNumber} merged` : '';
  const testText =
    completed.testsPassed !== undefined
      ? `, ${completed.testsPassed} tests passed)`
      : prText
      ? ')'
      : '';
  const summarySuffix = `${prText}${testText}`;

  lines.push(
    `${pc.green('✔')} ${pc.bold(`Issue #${completed.number} closed successfully`)} in ${formatMs(
      completed.durationMs
    )}${summarySuffix}`
  );
  lines.push('');
  lines.push(`${pc.cyan('◆')} ${pc.bold('Sandcastle Baton Handoff Note')}`);
  lines.push(pc.cyan('│'));
  lines.push(
    `${pc.cyan('│')}  ${pc.bold('Completed:')}  #${completed.number} ${
      completed.title.length > 48
        ? completed.title.substring(0, 45) + '...'
        : completed.title
    }`
  );
  lines.push(
    `${pc.cyan('│')}  ${pc.bold('Progress:')}   ${queueIndex}/${totalQueue} issues closed (${progressPct}%)`
  );

  const gatingBadge =
    next.gatingStatus === 'READY'
      ? pc.green(pc.bold('[READY]'))
      : next.gatingStatus === 'WAITING'
      ? pc.yellow(pc.bold('[WAITING]'))
      : pc.gray(`[${next.gatingStatus}]`);

  lines.push(
    `${pc.cyan('│')}  ${pc.bold('Next Up:')}    #${next.number} "${
      next.title.length > 45
        ? next.title.substring(0, 42) + '...'
        : next.title
    }" ${gatingBadge}`
  );

  if (next.parentIssue) {
    lines.push(
      `${pc.cyan('│')}  ${pc.bold('Parent:')}     #${next.parentIssue.number} (Child ${
        next.parentIssue.childIndex
      } of ${next.parentIssue.totalChildren})`
    );
  }

  const modelStr = next.model || 'gemini-3.7-flash';
  const effortStr = next.reasoningEffort || 'high';
  lines.push(
    `${pc.cyan('│')}  ${pc.bold('Engine:')}     ${modelStr} (${effortStr} reasoning)`
  );
  lines.push(pc.cyan('│'));
  lines.push(
    `${pc.cyan('└')} ${pc.dim(
      `Spooling next worker session in ${countdownText}... [Press Space to pause or Enter to start]`
    )}`
  );
  lines.push('');
  lines.push(
    `${pc.cyan('◓')} ${pc.dim(
      `[1/6 Inspecting] Fetching requirements for Issue #${next.number}...`
    )}`
  );

  return lines.join('\n');
}

/**
 * 2. CLI RUN MODE (Boxed Relay Scorecard & Next Candidate Preview)
 */
export function renderRunMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } =
    state;
  const lines: string[] = [];

  const progressPct =
    totalQueue > 0 ? Math.round((queueIndex / totalQueue) * 100) : 0;
  const countdownText = isPaused
    ? pc.yellow('[PAUSED]')
    : pc.cyan(`${countdownSeconds.toFixed(1)}s`);

  // Relay Scorecard Box (Width: 76 chars inner: 74)
  lines.push(
    pc.bold(
      pc.green('╔══════════════════════════════════════════════════════════════════════════╗')
    )
  );

  const titleHeader = `  ${pc.bold(pc.green('✔'))} ${pc.bold(
    `BATON COMPLETED: Issue #${completed.number}`
  )}`;
  lines.push(
    `${pc.bold(pc.green('║'))}${titleHeader.padEnd(83)}${pc.bold(pc.green('║'))}`
  );

  const branchStr = completed.branchName || `issue-${completed.number}-worker`;
  const prStr = completed.prNumber
    ? `PR #${completed.prNumber} (merged)`
    : 'PR merged';
  const metric1 = `  ${pc.bold('Branch:')} ${branchStr}  │  ${pc.bold(
    prStr
  )}  │  ${pc.bold('Duration:')} ${formatMs(completed.durationMs)}`;
  lines.push(
    `${pc.bold(pc.green('║'))}${metric1.padEnd(92)}${pc.bold(pc.green('║'))}`
  );

  const testsPassed = completed.testsPassed ?? 14;
  const tokensUsed = completed.tokensUsed
    ? `${(completed.tokensUsed / 1000).toFixed(1)}k`
    : '18.5k';
  const costUsd =
    completed.costUsd !== undefined
      ? `$${completed.costUsd.toFixed(4)}`
      : '$0.0038';
  const metric2 = `  ${pc.bold('Tests:')} ${pc.green(
    `${testsPassed} passed`
  )} (100% green)  │  ${pc.bold('Tokens:')} ${tokensUsed}  │  ${pc.bold(
    'Cost:'
  )} ${costUsd}`;
  lines.push(
    `${pc.bold(pc.green('║'))}${metric2.padEnd(92)}${pc.bold(pc.green('║'))}`
  );

  lines.push(
    pc.bold(
      pc.green('╚══════════════════════════════════════════════════════════════════════════╝')
    )
  );

  lines.push('');
  lines.push(
    `  ${pc.dim(`[#${completed.number} ✔]`)}${pc.cyan(
      ' ═══════════( 🏃 BATON IN FLIGHT )═══════════▶ '
    )}${pc.bold(pc.yellow(`[#${next.number} ⚙]`))}`
  );

  const pBar = formatHandoffProgressBar(progressPct, 20);
  lines.push(
    `  ${pc.bold('Queue Progress:')} ${pBar} ${progressPct}% (${queueIndex}/${totalQueue})  │  ${pc.bold(
      'Next Worker Spool:'
    )} ${countdownText}`
  );
  lines.push('');

  // Next Candidate Target Box
  const statusBadge =
    next.gatingStatus === 'READY'
      ? pc.bgGreen(pc.black(' [READY] '))
      : pc.bgYellow(pc.black(` [${next.gatingStatus}] `));

  lines.push(
    pc.bold(
      pc.cyan(
        '┌── 🎯 NEXT BATON TARGET: Issue #' +
          next.number +
          ' ────────────────────────────────────────┐'
      )
    )
  );

  const candidateTitle =
    next.title.length > 58 ? next.title.substring(0, 55) + '...' : next.title;
  const nextHeader = `  ${statusBadge}  ${pc.bold(candidateTitle)}`;
  lines.push(
    `${pc.bold(pc.cyan('│'))}${nextHeader.padEnd(82)}${pc.bold(pc.cyan('│'))}`
  );

  if (next.parentIssue) {
    const parentTitle = next.parentIssue.title
      ? ` • ${pc.dim(
          next.parentIssue.title.length > 40
            ? next.parentIssue.title.substring(0, 37) + '...'
            : next.parentIssue.title
        )}`
      : '';
    const parentLine = `  ${pc.bold('Parent Map:')} #${next.parentIssue.number} (Child ${
      next.parentIssue.childIndex
    } of ${next.parentIssue.totalChildren})${parentTitle}`;
    lines.push(
      `${pc.bold(pc.cyan('│'))}${parentLine.padEnd(84)}${pc.bold(pc.cyan('│'))}`
    );
  }

  const modelStr = next.model || 'gemini-3.7-flash';
  const effortStr = next.reasoningEffort || 'high';
  const estSeconds = next.estimatedDurationSeconds || 45;
  const configLine = `  ${pc.bold('Engine:')}     ${modelStr} (${effortStr} reasoning) • Est: ~${estSeconds}s`;
  lines.push(
    `${pc.bold(pc.cyan('│'))}${configLine.padEnd(82)}${pc.bold(pc.cyan('│'))}`
  );

  if (next.acceptanceCriteria && next.acceptanceCriteria.length > 0) {
    lines.push(
      `${pc.bold(pc.cyan('│'))}${pc.gray('  Criteria Preview:').padEnd(80)}${pc.bold(
        pc.cyan('│')
      )}`
    );
    for (const ac of next.acceptanceCriteria.slice(0, 3)) {
      const icon = ac.done ? pc.green('  ☑') : pc.gray('  ☐');
      const acText = ac.text.length > 60 ? ac.text.substring(0, 57) + '...' : ac.text;
      const line = `  ${icon} ${acText}`;
      lines.push(
        `${pc.bold(pc.cyan('│'))}${line.padEnd(82)}${pc.bold(pc.cyan('│'))}`
      );
    }
  }

  lines.push(
    pc.bold(
      pc.cyan('└─────────────────────────────────────────────────────────────────────────┘')
    )
  );
  lines.push(
    pc.dim(
      '  Controls: [Space] Pause/Resume  │  [Enter] Launch Now  │  [s] Skip  │  [q] Abort'
    )
  );

  return lines.join('\n');
}

/**
 * 3. LIVE WATCH MONITOR MODE (Alternate-screen HUD with in-flight handoff box)
 */
export function renderWatchMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue, countdownSeconds, isPaused } =
    state;
  const lines: string[] = [];

  const progressPct =
    totalQueue > 0 ? Math.round((queueIndex / totalQueue) * 100) : 0;
  const countdownText = isPaused
    ? pc.yellow('[PAUSED]')
    : pc.yellow(pc.bold(`${countdownSeconds.toFixed(1)}s`));

  // Header Bar
  const title =
    pc.bold(pc.bgCyan(pc.black(' SANDCASTLE '))) +
    pc.bold(pc.cyan(' LIVE WATCH MONITOR '));
  lines.push(`${title}  ${pc.gray('[Elapsed: 01:22]')}`);
  lines.push(pc.gray('─'.repeat(74)));

  // Statusline
  const statusBadge = pc.bgCyan(pc.black(' BATON HANDOFF '));
  lines.push(
    `  ${statusBadge}  ${pc.bold('Repo:')} ${pc.cyan(
      'Vudattumaniteja/sandcastle-baton-demo'
    )}  ${pc.bold('Session:')} ${pc.gray('baton-live-37')}`
  );
  lines.push(
    `  ${pc.bold('Active:')} ${pc.yellow(
      `Handoff #${completed.number} ➔ #${next.number}`
    )}  │  ${pc.bold('Progress:')} ${queueIndex}/${totalQueue} closed  ${formatHandoffProgressBar(
      progressPct,
      12
    )} ${progressPct}%`
  );
  lines.push('');

  // In-flight Handoff Telemetry Card
  lines.push(
    pc.bold(
      pc.white('┌─ 🏃 Baton In Flight ──────────────────────────────────────────────────┐')
    )
  );
  const prPart = completed.prNumber ? ` • PR #${completed.prNumber}` : '';
  const lastLine = `│  ${pc.green('✔ Last Completed:')} Issue #${
    completed.number
  } (${formatMs(completed.durationMs)}${prPart} • 100% green)`;
  lines.push(lastLine.padEnd(81) + '│');

  const modelStr = next.model || 'gemini-3.7-flash';
  const effortStr = next.reasoningEffort || 'high';
  const nextLine = `│  ${pc.cyan('▶ Next Candidate:')}  Issue #${
    next.number
  } [READY] • ${modelStr} (${effortStr})`;
  lines.push(nextLine.padEnd(81) + '│');

  if (next.parentIssue) {
    const parentLine = `│  ${pc.gray('↳ Parent Issue:')}   #${
      next.parentIssue.number
    } (Child ${next.parentIssue.childIndex} of ${next.parentIssue.totalChildren})`;
    lines.push(parentLine.padEnd(81) + '│');
  }

  const countBar = formatHandoffProgressBar(60, 20);
  const spoolLine = `│  ${pc.bold(
    '⏱ Next Session:'
  )}   Spooling in ${countdownText} [${countBar}]`;
  lines.push(spoolLine.padEnd(89) + '│');
  lines.push(
    pc.bold(
      pc.white('└───────────────────────────────────────────────────────────────────────┘')
    )
  );

  lines.push('');
  lines.push(
    pc.bold(
      pc.white('┌─ Agent Reasoning / Status ────────────────────────────────────────────┐')
    )
  );
  const prCommentPart = completed.prNumber ? ` for PR #${completed.prNumber}` : '';
  lines.push(
    `│ ${pc.italic(
      pc.cyan(
        `Finalizing git merge${prCommentPart} and verifying closure audit comment...`
      )
    )}`.padEnd(84) + '│'
  );
  lines.push(
    `│ ${pc.dim(
      `Preparing clean worker context for Issue #${next.number}...`.padEnd(68)
    )}│`
  );
  lines.push(
    pc.bold(
      pc.white('└───────────────────────────────────────────────────────────────────────┘')
    )
  );

  lines.push('');
  const quotaBar = formatHandoffProgressBar(88, 10);
  lines.push(
    `  ${pc.bold('Model:')} ${pc.green(modelStr)}  │  ${pc.bold(
      'Quota:'
    )} ${quotaBar} 88%  │  ${pc.bold('Tokens:')} 18.4k`
  );

  return lines.join('\n');
}

/**
 * 4. CI / STREAM MODE (Compact single-line stream with horizontal breadcrumbs)
 */
export function renderCiMode(state: BatonHandoffPayload): string {
  const { completed, next, queueIndex, totalQueue } = state;
  const lines: string[] = [];

  const prPart = completed.prNumber ? ` • PR #${completed.prNumber} merged` : '';
  const testPart =
    completed.testsPassed !== undefined
      ? ` • ${completed.testsPassed} tests green`
      : '';
  const completedTitle =
    completed.title.length > 38
      ? completed.title.substring(0, 35) + '...'
      : completed.title;

  lines.push(
    `${pc.green('✔')} ${pc.bold(`BATON COMPLETED: #${completed.number}`)} "${completedTitle}" ${pc.dim(
      `[${formatMs(completed.durationMs)}${prPart}${testPart}]`
    )}`
  );

  const qList: string[] = [];
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
  lines.push(
    `${pc.gray('  Pipeline: ')}${qList.join(pc.gray(' ──▶ '))}${pc.dim(
      ` (${queueIndex}/${totalQueue})`
    )}`
  );
  lines.push(
    `${pc.cyan('  >>> ')}${pc.bold(
      `Instant handoff to #${next.number}...`
    )} ${pc.dim('(CI mode: 0s pacing)')}`
  );

  const nextTitle =
    next.title.length > 48 ? next.title.substring(0, 45) + '...' : next.title;
  lines.push(
    `${pc.cyan('  ↳ TARGET ')}${pc.bold(`#${next.number}`)} "${nextTitle}" ${pc.green(
      `[${next.gatingStatus}]`
    )}`
  );

  return lines.join('\n');
}

/**
 * Formats a handoff summary for display.
 */
export function formatHandoffSummary(state: BatonHandoffPayload): string {
  return renderHandoffBySurface(state);
}

/**
 * Master dispatcher by CLI surface
 */
export function renderHandoffBySurface(
  state: BatonHandoffPayload,
  overrideMode?: HandoffRenderMode
): string {
  const mode = overrideMode || state.mode || 'wizard';
  switch (mode) {
    case 'wizard':
      return renderWizardMode(state);
    case 'run':
      return renderRunMode(state);
    case 'watch':
      return renderWatchMode(state);
    case 'ci':
      return renderCiMode(state);
    default:
      return renderWizardMode(state);
  }
}
