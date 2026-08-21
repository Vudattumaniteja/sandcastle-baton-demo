import type { GatingEvaluation } from './gating.js';
import type { SandcastleConfig } from './config.js';
import type { BatonHandoffPayload } from './handoff.js';

export type WorkerPhase =
  | 'inspect'
  | 'implement'
  | 'test'
  | 'commit'
  | 'pr'
  | 'merge'
  | 'close';

export type ExecutionScope =
  | { type: 'from'; target: number }
  | { type: 'only'; targets: number[] }
  | { type: 'all' };

export interface BatonStartPayload {
  repo: string;
  mode: 'afk' | 'supervised' | 'dry-run';
  issues: number[];
  scope?: ExecutionScope;
  model?: string;
  autoPr?: boolean;
  autoMerge?: boolean;
}

export interface BatonGatingPayload {
  issueNumber: number;
  evaluation: GatingEvaluation;
}

export interface WorkerStartPayload {
  issueNumber: number;
  title: string;
  attempt: number;
  maxAttempts: number;
}

export interface WorkerPhasePayload {
  issueNumber: number;
  phase: WorkerPhase;
  message: string;
}

export interface WorkerRetryPayload {
  issueNumber: number;
  attempt: number;
  maxAttempts: number;
  error: string;
}

export interface WorkerCompletePayload {
  issueNumber: number;
  durationMs: number;
  prUrl?: string;
}

export interface BatonBlockedPayload {
  issueNumber: number;
  reason: string;
  remediation?: string;
  evidence?: string;
}

export interface BatonFinishPayload {
  success: boolean;
  totalProcessed: number;
  closedIssues: number[];
  blockedIssues: number[];
  durationMs: number;
}

export type BatonEventMap = {
  'baton:start': (payload: BatonStartPayload) => void;
  'baton:gating': (payload: BatonGatingPayload) => void;
  'worker:start': (payload: WorkerStartPayload) => void;
  'worker:phase': (payload: WorkerPhasePayload) => void;
  'worker:retry': (payload: WorkerRetryPayload) => void;
  'worker:complete': (payload: WorkerCompletePayload) => void;
  'baton:blocked': (payload: BatonBlockedPayload) => void;
  'baton:finish': (payload: BatonFinishPayload) => void;
  'baton:handoff': (payload: BatonHandoffPayload) => void;
};

export interface ProcessedIssueSummary {
  number: number;
  title: string;
  status: 'completed' | 'blocked' | 'skipped';
  durationMs: number;
  prUrl?: string;
  error?: string;
}

export interface BatonRunSnapshot {
  sessionId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'blocked' | 'aborted' | 'idle';
  repo: string;
  mode: string;
  scope?: ExecutionScope;
  currentIssue?: number;
  processedIssues: ProcessedIssueSummary[];
  totalIssues: number;
  closedCount: number;
  blockedCount: number;
  lastUpdated: string;
  handoff?: BatonHandoffPayload;
}

export interface BatonRunnerOptions extends Partial<SandcastleConfig> {
  issues?: number[];
  all?: boolean;
  from?: number;
  only?: number[];
  scope?: ExecutionScope;
  githubService?: any;
  antigravityService?: any;
  gatingEvaluator?: any;
  processSupervisor?: any;
  promptTemplateEngine?: any;
  configService?: any;
  cwd?: string;
  stateFilePath?: string;
  signal?: AbortSignal;
  pacingSeconds?: number;
  interactivePacing?: boolean;
}
