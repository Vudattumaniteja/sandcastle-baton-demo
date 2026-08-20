#!/usr/bin/env node
/**
 * PROTOTYPE RUNNER: Visual Baton Handoff across CLI Surfaces (Issue #37)
 * 
 * Simulates how the handoff banner displays across all 4 Sandcastle CLI execution surfaces:
 * 1. 'run'    - Standard Headless / stdout stream with Relay Scorecard
 * 2. 'wizard' - Clack interactive guided wizard TUI flow
 * 3. 'watch'  - Alternate-screen Live Monitor HUD
 * 4. 'ci'     - Compact single-line pipeline stream
 * 
 * Run with: npm run prototype:handoff
 * Or: node scripts/prototype-handoff.mjs --mode=wizard
 */

import readline from 'node:readline';
import pc from 'picocolors';

const SCENARIOS = [
  {
    name: 'Sequential Child Handoff (#36 -> #37 under Map #34)',
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
        { text: 'Adaptive rendering across all 4 CLI operational surfaces', done: true },
        { text: '3s pacing delay with Space pause and Enter fast-forward', done: true },
        { text: 'Next candidate preview with acceptance criteria checkmarks', done: true },
      ],
      blockingDependencies: [],
      estimatedDurationSeconds: 45,
    },
  },
  {
    name: 'Parent Issue Map Initiation (#35 -> #36 under Map #34)',
    queueIndex: 1,
    totalQueue: 5,
    completed: {
      number: 35,
      title: 'Parent issue label conventions and queue skip status evaluation',
      durationMs: 38200,
      prNumber: 11,
      branchName: 'issue-35-parent-labels',
      testsPassed: 18,
      testsTotal: 18,
      tokensUsed: 14200,
      costUsd: 0.0029,
      attempts: 1,
      phaseBreakdown: {
        inspectMs: 4100,
        implementMs: 18500,
        testMs: 11200,
        gitPrMs: 4400,
      },
    },
    next: {
      number: 36,
      title: 'CLI execution flags (--from, --only, --all) and wizard resumption flow',
      gatingStatus: 'READY',
      labels: ['ready-for-agent', 'AFK'],
      parentIssue: {
        number: 34,
        title: 'Map: Sandcastle Flow, Guardrails, Sequential Resumption',
        childIndex: 2,
        totalChildren: 5,
      },
      model: 'gemini-3.7-flash',
      reasoningEffort: 'high',
      acceptanceCriteria: [
        { text: '--from <num> starting index', done: true },
        { text: '--only <issues...> cherry-picking', done: true },
        { text: 'Zero-arg wizard resumption prompt', done: true },
      ],
      blockingDependencies: [],
      estimatedDurationSeconds: 50,
    },
  },
  {
    name: 'Blocked Dependency Warning Gate (#37 -> #38)',
    queueIndex: 3,
    totalQueue: 5,
    completed: {
      number: 37,
      title: 'Visual baton handoff banners and transition display',
      durationMs: 44100,
      prNumber: 13,
      branchName: 'issue-37-handoff-banner',
      testsPassed: 20,
      testsTotal: 20,
      tokensUsed: 19100,
      costUsd: 0.0039,
      attempts: 1,
      phaseBreakdown: {
        inspectMs: 3500,
        implementMs: 24000,
        testMs: 11500,
        gitPrMs: 5100,
      },
    },
    next: {
      number: 38,
      title: 'Dynamic per-issue prompt overrides via issue comments',
      gatingStatus: 'WAITING',
      labels: ['ready-for-agent'],
      parentIssue: {
        number: 34,
        title: 'Map: Sandcastle Flow, Guardrails',
        childIndex: 4,
        totalChildren: 5,
      },
      model: 'gemini-3.7-flash',
      reasoningEffort: 'high',
      acceptanceCriteria: [
        { text: 'Parse markdown comments for prompt overrides', done: false },
        { text: 'Fallback to default worker contract if absent', done: false },
      ],
      blockingDependencies: [37],
      estimatedDurationSeconds: 60,
    },
  },
];

const MODES = [
  { id: 'run', name: '1. run CLI (Relay Scorecard)' },
  { id: 'wizard', name: '2. wizard TUI (Clack Flow)' },
  { id: 'watch', name: '3. watch Monitor (Alternate Screen)' },
  { id: 'ci', name: '4. ci Stream (Compact Single-line)' },
];

let currentMode = 'run';
const cliArg = process.argv.find(arg => arg.startsWith('--mode=') || arg.startsWith('-m='));
if (cliArg) {
  const m = cliArg.split('=')[1].toLowerCase();
  if (['run', 'wizard', 'watch', 'ci'].includes(m)) {
    currentMode = m;
  }
}

let currentScenarioIndex = 0;
let countdownSeconds = 3.0;
let isPaused = false;
let showStateDump = false;

function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function renderRun(state) {
  const { completed, next, queueIndex, totalQueue, countdown, paused } = state;
  const lines = [];
  const progressPct = Math.round((queueIndex / totalQueue) * 100);
  const countdownText = paused ? pc.yellow('[PAUSED]') : pc.cyan(`${countdown.toFixed(1)}s`);

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

  lines.push('');
  lines.push('  ' + pc.dim(`[#${completed.number} ✔]`) + pc.cyan(' ═══════════( 🏃 BATON IN FLIGHT )═══════════▶ ') + pc.bold(pc.yellow(`[#${next.number} ⚙]`)));
  
  const pBar = pc.cyan('█'.repeat(Math.min(20, Math.round(progressPct / 5)))) + pc.gray('░'.repeat(Math.max(0, 20 - Math.round(progressPct / 5))));
  lines.push(`  ${pc.bold('Queue Progress:')} ${pBar} ${progressPct}% (${queueIndex}/${totalQueue})  │  ${pc.bold('Next Worker Spool:')} ${countdownText}`);
  lines.push('');

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
  return lines.join('\n');
}

function renderWizard(state) {
  const { completed, next, queueIndex, totalQueue, countdown, paused } = state;
  const lines = [];
  const countdownText = paused ? pc.yellow('[PAUSED]') : pc.cyan(`${countdown.toFixed(1)}s`);

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

function renderWatch(state) {
  const { completed, next, queueIndex, totalQueue, countdown, paused } = state;
  const lines = [];
  const progressPct = Math.round((queueIndex / totalQueue) * 100);
  const countdownText = paused ? pc.yellow('[PAUSED]') : pc.yellow(pc.bold(`${countdown.toFixed(1)}s`));

  const title = pc.bold(pc.bgCyan(pc.black(' SANDCASTLE '))) + pc.bold(pc.cyan(' LIVE WATCH MONITOR '));
  lines.push(`${title}  ${pc.gray('[Elapsed: 01:22]')}`);
  lines.push(pc.gray('─'.repeat(74)));

  const statusBadge = pc.bgBlue(pc.black(' BATON HANDOFF '));
  lines.push(`  ${statusBadge}  ${pc.bold('Repo:')} ${pc.magenta('Vudattumaniteja/sandcastle-baton-demo')}  ${pc.bold('Session:')} ${pc.gray('baton-live-37')}`);
  lines.push(`  ${pc.bold('Active:')} ${pc.yellow(`Handoff #${completed.number} ➔ #${next.number}`)}  │  ${pc.bold('Progress:')} ${queueIndex}/${totalQueue} closed  ${pc.cyan('████████')}${pc.gray('░░░░░░░░░░░░')} ${progressPct}%`);
  lines.push('');

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

  return lines.join('\n');
}

function renderCi(state) {
  const { completed, next, queueIndex, totalQueue } = state;
  const lines = [];

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

function renderScreen() {
  const scenario = SCENARIOS[currentScenarioIndex];
  const state = {
    ...scenario,
    mode: currentMode,
    countdown: countdownSeconds,
    paused: isPaused,
  };

  console.clear();
  console.log(pc.bold(pc.bgMagenta(pc.black(' SANDCASTLE '))) + pc.bold(pc.cyan(' — BATON HANDOFF ARCHITECTURE PROTOTYPE (Issue #37)')));
  console.log(pc.gray('━'.repeat(78)));
  
  const modePills = MODES.map(m => {
    const isCur = m.id === currentMode;
    return isCur ? pc.bgCyan(pc.black(` [${m.id}] ${m.name.split('(')[0].trim()} `)) : pc.dim(` [${m.id}] `);
  }).join(' ');

  console.log(`CLI Surface Mode: ${modePills}`);
  console.log(pc.yellow(`Active Scenario [${currentScenarioIndex + 1}/${SCENARIOS.length}]: `) + pc.bold(scenario.name));
  console.log(pc.gray('─'.repeat(78)));
  console.log('');

  if (currentMode === 'run') {
    console.log(renderRun(state));
  } else if (currentMode === 'wizard') {
    console.log(renderWizard(state));
  } else if (currentMode === 'watch') {
    console.log(renderWatch(state));
  } else {
    console.log(renderCi(state));
  }

  console.log('');
  console.log(pc.gray('─'.repeat(78)));
  console.log(`  ${pc.bold('Keyboard Shortcuts:')}
    [1 / 2 / 3 / 4] or [← / →] : Switch Surface (1: run, 2: wizard, 3: watch, 4: ci)
    [Space / p]                : Pause / Resume Countdown (${isPaused ? pc.yellow('PAUSED') : pc.green('RUNNING')})
    [Enter]                    : Spool Next Worker Immediately (Fast-Forward)
    [n]                        : Switch Test Scenario (${currentScenarioIndex + 1}/${SCENARIOS.length})
    [d]                        : Toggle Full State Dump (${showStateDump ? pc.green('ON') : pc.dim('OFF')})
    [q / Ctrl+C]               : Exit Prototype`);

  if (showStateDump) {
    console.log('');
    console.log(pc.bold(pc.yellow('--- Current Baton Handoff State Dump ---')));
    console.log(JSON.stringify(state, null, 2));
  }
}

// Start interactive loop
renderScreen();

if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  process.stdin.on('keypress', (str, key) => {
    if (key.ctrl && key.name === 'c') {
      process.exit(0);
    }

    if (key.name === 'q') {
      process.exit(0);
    }

    if (key.name === '1' || str === '1') {
      currentMode = 'run';
      renderScreen();
    } else if (key.name === '2' || str === '2') {
      currentMode = 'wizard';
      renderScreen();
    } else if (key.name === '3' || str === '3') {
      currentMode = 'watch';
      renderScreen();
    } else if (key.name === '4' || str === '4') {
      currentMode = 'ci';
      renderScreen();
    } else if (key.name === 'left') {
      const modeKeys = ['run', 'wizard', 'watch', 'ci'];
      const idx = modeKeys.indexOf(currentMode);
      currentMode = modeKeys[(idx - 1 + modeKeys.length) % modeKeys.length];
      renderScreen();
    } else if (key.name === 'right') {
      const modeKeys = ['run', 'wizard', 'watch', 'ci'];
      const idx = modeKeys.indexOf(currentMode);
      currentMode = modeKeys[(idx + 1) % modeKeys.length];
      renderScreen();
    } else if (key.name === 'space' || key.name === 'p') {
      isPaused = !isPaused;
      renderScreen();
    } else if (key.name === 'return') {
      // Fast forward to next issue
      countdownSeconds = 3.0;
      currentScenarioIndex = (currentScenarioIndex + 1) % SCENARIOS.length;
      renderScreen();
    } else if (key.name === 'n') {
      currentScenarioIndex = (currentScenarioIndex + 1) % SCENARIOS.length;
      countdownSeconds = 3.0;
      renderScreen();
    } else if (key.name === 'd') {
      showStateDump = !showStateDump;
      renderScreen();
    }
  });

  const timer = setInterval(() => {
    if (!isPaused && currentMode !== 'ci') {
      countdownSeconds -= 0.2;
      if (countdownSeconds <= 0) {
        countdownSeconds = 3.0;
        currentScenarioIndex = (currentScenarioIndex + 1) % SCENARIOS.length;
      }
      renderScreen();
    }
  }, 200);

  timer.unref();
}
