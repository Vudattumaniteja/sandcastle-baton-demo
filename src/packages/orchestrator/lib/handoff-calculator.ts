import type {
  BatonHandoffPayload,
  HandoffCompletedIssue,
  HandoffNextIssue,
  HandoffRenderMode,
} from '../../../types/handoff.js';
import type { GatingStatus } from '../../../types/gating.js';
import { parseAcceptanceCriteria } from './dependency-parser.js';

export interface PhaseBreakdown {
  inspectMs?: number;
  implementMs?: number;
  testMs?: number;
  gitPrMs?: number;
}

/**
 * Calculates phase durations from real timestamps or returns undefined when unavailable.
 */
export function calculatePhaseBreakdown(
  _totalDurationMs?: number,
  measured?: Partial<PhaseBreakdown>
): PhaseBreakdown {
  return {
    inspectMs: measured?.inspectMs,
    implementMs: measured?.implementMs,
    testMs: measured?.testMs,
    gitPrMs: measured?.gitPrMs,
  };
}

export interface AssembleHandoffOptions {
  mode?: HandoffRenderMode;
  queueIndex: number;
  totalQueue: number;
  countdownSeconds?: number;
  currentIssue: {
    number: number;
    title: string;
    durationMs: number;
    prNumber?: number;
    prUrl?: string;
    branchName?: string;
    testsPassed?: number;
    testsTotal?: number;
    tokensUsed?: number;
    costUsd?: number;
    attempts?: number;
    phaseBreakdown?: PhaseBreakdown;
  };
  nextIssue: {
    number: number;
    title: string;
    gatingStatus?: GatingStatus;
    labels?: string[];
    parentIssue?: {
      number: number;
      title?: string;
      childIndex: number;
      totalChildren: number;
    };
    model?: string;
    reasoningEffort?: 'high' | 'medium' | 'low';
    body?: string;
    acceptanceCriteria?: Array<{ text: string; done?: boolean }>;
    blockingDependencies?: number[];
    estimatedDurationSeconds?: number;
  };
}

/**
 * Assembles a strongly-typed BatonHandoffPayload with duration breakdowns and next issue preview.
 */
export function assembleHandoffPayload(
  options: AssembleHandoffOptions
): BatonHandoffPayload {
  const current = options.currentIssue;
  const next = options.nextIssue;

  const phaseBreakdown = current.phaseBreakdown;

  const completed: HandoffCompletedIssue = {
    number: current.number,
    title: current.title,
    durationMs: current.durationMs,
    prNumber: current.prNumber,
    prUrl: current.prUrl,
    branchName: current.branchName ?? `issue-${current.number}-worker`,
    testsPassed: current.testsPassed,
    testsTotal: current.testsTotal,
    tokensUsed: current.tokensUsed,
    costUsd: current.costUsd,
    attempts: current.attempts ?? 1,
    phaseBreakdown,
  };

  const acceptanceCriteria =
    next.acceptanceCriteria ??
    (next.body ? parseAcceptanceCriteria(next.body) : []);

  const nextPreview: HandoffNextIssue = {
    number: next.number,
    title: next.title,
    gatingStatus: next.gatingStatus ?? 'READY',
    labels: next.labels ?? [],
    parentIssue: next.parentIssue,
    model: next.model ?? 'gemini-3.8-flash-medium',
    reasoningEffort: next.reasoningEffort ?? 'high',
    acceptanceCriteria,
    blockingDependencies: next.blockingDependencies ?? [],
    estimatedDurationSeconds: next.estimatedDurationSeconds ?? 45,
  };

  return {
    mode: options.mode ?? 'run',
    queueIndex: options.queueIndex,
    totalQueue: options.totalQueue,
    countdownSeconds: options.countdownSeconds ?? 3.0,
    isPaused: false,
    completed,
    next: nextPreview,
  };
}
