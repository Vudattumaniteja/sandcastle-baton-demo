import pc from 'picocolors';
import type { GatingEvaluation, GatingStatus } from '../../types/gating.js';
import type { ModelInfo, StatuslineSnapshot } from '../../types/antigravity.js';
import { resolveCandidateQuotaInfo } from '#packages/worker-runtime';
import type {
  WizardPromptOption,
  WizardManifest,
} from '../../types/wizard.js';
import type { BatonHandoffPayload, HandoffRenderMode } from '../../types/handoff.js';
import { formatMs, formatProgressBar, formatHandoffProgressBar, formatDuration } from './lib/ansi-progress.js';

export { formatDuration, formatProgressBar, formatMs, formatHandoffProgressBar };

/**
 * Returns a styled terminal badge for an issue's gating status.
 */
export function formatGatingBadge(status: GatingStatus): string {
  switch (status) {
    case 'READY':
      return pc.green(pc.bold('[READY]'));
    case 'WAITING':
      return pc.yellow(pc.bold('[WAITING]'));
    case 'BLOCKED':
      return pc.red(pc.bold('[BLOCKED]'));
    case 'UNGATED':
      return pc.dim('[UNGATED]');
    case 'CLOSED':
      return pc.gray('[CLOSED]');
    case 'PARENT':
      return pc.cyan(pc.bold('[PARENT]'));
    case 'HITL':
      return pc.cyan(pc.bold('[HITL]'));
    default:
      return pc.dim(`[${status}]`);
  }
}

/**
 * Formats an issue gating evaluation into a select prompt option.
 */
export function formatIssueOption(
  evaluation: GatingEvaluation
): WizardPromptOption<number> {
  const badge = formatGatingBadge(evaluation.status);
  const label = `#${evaluation.issueNumber} ${evaluation.title} ${badge}`;

  let hint: string | undefined;
  if (evaluation.status === 'READY') {
    hint = 'Ready for autonomous execution';
  } else if (evaluation.status === 'WAITING') {
    hint = `Waiting on #${evaluation.blockingIssueNumbers.join(', #')}`;
  } else if (evaluation.status === 'UNGATED') {
    hint = `Missing ${evaluation.missingLabels.join(', ')}`;
  } else if (evaluation.status === 'BLOCKED') {
    hint = `Blocked: ${evaluation.reasons[0] || 'status blocked'}`;
  } else if (evaluation.status === 'CLOSED') {
    hint = 'Already closed';
  } else if (evaluation.status === 'PARENT') {
    hint = 'Parent/epic specification (skipped in baton)';
  } else if (evaluation.status === 'HITL') {
    hint = 'Human-in-the-loop required (skipped in baton)';
  }

  return {
    value: evaluation.issueNumber,
    label,
    hint,
  };
}

/**
 * Formats a model info and quota snapshot into a select prompt option.
 */
export function formatModelOption(
  model: ModelInfo,
  snapshot?: StatuslineSnapshot | null,
  now: number | Date = Date.now()
): WizardPromptOption<string> {
  const isDefault = Boolean(model.isDefault);
  let quotaBadge = '';
  let resetHint = '';

  const selectedEntry = resolveCandidateQuotaInfo(model, snapshot, now);

  if (selectedEntry && typeof selectedEntry.remaining_fraction === 'number') {
    const pct = Math.round(selectedEntry.remaining_fraction * 100);
    quotaBadge = `[${pct}% quota]`;
    if (selectedEntry.reset_in_seconds && selectedEntry.reset_in_seconds > 0) {
      const mins = Math.max(1, Math.round(selectedEntry.reset_in_seconds / 60));
      resetHint = `Resets in ${mins}m`;
    }
  }

  let label = model.id;
  if (isDefault) {
    label += ` ${pc.cyan('[Default]')}`;
  }
  if (quotaBadge) {
    label += ` ${pc.green(quotaBadge)}`;
  }

  let hint: string | undefined;
  if (resetHint) {
    hint = resetHint;
  } else if (model.aliases && model.aliases.length > 0) {
    hint = `Aliases: ${model.aliases.join(', ')}`;
  }

  return {
    value: model.id,
    label,
    hint,
  };
}

/**
 * Returns prompt options for reasoning effort selection.
 */
export function getReasoningEffortChoices(): WizardPromptOption<'high' | 'medium' | 'low'>[] {
  return [
    {
      value: 'high',
      label: 'High [Recommended for AFK Coding]',
      hint: 'Deep reasoning for complex implementation & debugging',
    },
    {
      value: 'medium',
      label: 'Medium',
      hint: 'Balanced reasoning speed and verification',
    },
    {
      value: 'low',
      label: 'Low',
      hint: 'Fast generation for simple, localized tasks',
    },
  ];
}

/**
 * Returns prompt options for execution mode selection.
 */
export function getExecutionModeChoices(): WizardPromptOption<'afk' | 'supervised' | 'dry-run'>[] {
  return [
    {
      value: 'afk',
      label: 'Autonomous AFK',
      hint: 'Full autonomy - implement, verify, PR, merge, close',
    },
    {
      value: 'supervised',
      label: 'Supervised',
      hint: 'Pause for user confirmation before git/PR mutations',
    },
    {
      value: 'dry-run',
      label: 'Dry Run',
      hint: 'Simulate gating & execution without modifying git or spawning agents',
    },
  ];
}

/**
 * Formats launch manifest summary card.
 */
export function formatLaunchManifest(manifest: WizardManifest): string {
  const effortLabels: Record<string, string> = {
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  };

  const modeLabels: Record<string, string> = {
    afk: 'Autonomous AFK',
    supervised: 'Supervised',
    'dry-run': 'Dry Run',
  };

  const lines = [
    `${pc.bold('Repository:')}      ${manifest.repo}`,
    `${pc.bold('Active Branch:')}   ${manifest.branch}`,
    `${pc.bold('Target:')}          ${manifest.targetDescription}`,
    `${pc.bold('Model:')}           ${manifest.model}`,
    `${pc.bold('Reasoning:')}       ${effortLabels[manifest.reasoningEffort] || manifest.reasoningEffort}`,
    `${pc.bold('Mode:')}            ${modeLabels[manifest.mode] || manifest.mode}`,
    `${pc.bold('Auto PR/Merge:')}   ${manifest.autoPr ? 'Enabled' : 'Disabled'} / ${manifest.autoMerge ? 'Enabled' : 'Disabled'}`,
  ];

  return lines.join('\n');
}

/**
 * Formats worker contract phase messages across the 6 phases.
 */
export function formatPhaseMessage(
  phase: string,
  issueNumber?: number
): string {
  const target = issueNumber ? ` #${issueNumber}` : '';
  switch (phase.toLowerCase()) {
    case 'inspect':
    case 'read_and_inspect':
      return `[1/6 Inspecting] Reading issue${target} requirements & context...`;
    case 'implement':
    case 'minimal_implementation':
      return `[2/6 Implementing] Writing minimal clean solution...`;
    case 'test':
    case 'local_verification':
      return `[3/6 Testing] Running test suites & linters...`;
    case 'commit':
    case 'git_branch_and_commit':
      return `[4/6 Git] Creating branch & committing changes...`;
    case 'pr':
    case 'pull_request':
      return `[5/6 PR] Creating Pull Request...`;
    case 'merge':
    case 'merge_pull_request':
      return `[6/6 Merging] Merging Pull Request...`;
    case 'close':
      return `[Closing] Verifying closure & recording audit log...`;
    default:
      return `[Phase: ${phase}] Executing issue${target}...`;
  }
}

export {
  renderWizardMode,
  renderRunMode,
  renderWatchMode,
  renderCiMode,
  renderHandoffBySurface,
  formatHandoffSummary,
} from './handoff-renderers.js';
import {
  renderHandoffBySurface,
  formatHandoffSummary,
} from './handoff-renderers.js';

/**
 * HandoffPresenter: facade object for presenting handoff states across surfaces.
 */
export class HandoffPresenter {
  static render(state: BatonHandoffPayload, mode?: HandoffRenderMode): string {
    return renderHandoffBySurface(state, mode);
  }

  static renderSummary(state: BatonHandoffPayload): string {
    return formatHandoffSummary(state);
  }
}


export { HandoffTransitionController, runHandoffTransition } from './transition.js';
export { WatchMonitor, WatchDashboard } from './monitor.js';
export {
  getEnterAlternateScreenSequence,
  getExitAlternateScreenSequence,
  getClearAndHomeSequence,
  ENTER_ALT_SCREEN,
  EXIT_ALT_SCREEN,
  CURSOR_HOME,
  CURSOR_HIDE,
  CURSOR_SHOW,
  CLEAR_SCREEN,
} from './lib/alternate-screen.js';
export { KeypressListener, type KeypressListenerOptions } from './lib/keypress-listener.js';
export {
  getTerminalDimensions,
  truncate,
  padAnsi,
  createBoxCard,
} from './lib/layout-calculator.js';
