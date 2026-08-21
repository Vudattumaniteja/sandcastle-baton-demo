import type { GatingStatus } from './gating.js';

export type HandoffRenderMode = 'wizard' | 'run' | 'watch' | 'ci';

export type HandoffAction = 'continue' | 'skip' | 'abort';

export interface HandoffCompletedIssue {
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
  phaseBreakdown?: {
    inspectMs?: number;
    implementMs?: number;
    testMs?: number;
    gitPrMs?: number;
  };
}

export interface HandoffNextIssue {
  number: number;
  title: string;
  gatingStatus: GatingStatus;
  labels?: string[];
  parentIssue?: {
    number: number;
    title?: string;
    childIndex: number;
    totalChildren: number;
  };
  model?: string;
  reasoningEffort?: 'high' | 'medium' | 'low';
  acceptanceCriteria?: Array<{ text: string; done?: boolean }>;
  blockingDependencies?: number[];
  estimatedDurationSeconds?: number;
}

export interface BatonHandoffPayload {
  mode?: HandoffRenderMode;
  queueIndex: number;
  totalQueue: number;
  countdownSeconds: number;
  isPaused: boolean;
  activeScenarioName?: string;
  completed: HandoffCompletedIssue;
  next: HandoffNextIssue;
}

export interface PacingControllerOptions {
  payload: BatonHandoffPayload;
  durationSeconds?: number;
  tickIntervalMs?: number;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream | ((text: string) => void);
  isTTY?: boolean;
  mode?: HandoffRenderMode;
  onTick?: (remaining: number, isPaused: boolean) => void;
  onPause?: () => void;
  onResume?: () => void;
  onFastForward?: () => void;
  onSkip?: () => void;
  onAbort?: () => void;
  prompts?: any;
}
