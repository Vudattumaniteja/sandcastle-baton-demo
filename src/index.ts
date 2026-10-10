/**
 * Sandcastle: Autonomous, sequential GitHub issue baton orchestrator for AI coding agents.
 */

export const VERSION: string =
  typeof __SANDCASTLE_VERSION__ !== 'undefined'
    ? __SANDCASTLE_VERSION__
    : '0.1.0';

export interface SandcastleOptions {
  repo?: string;
  startIssue?: number;
  mode?: 'afk' | 'supervised' | 'dry-run';
  model?: string;
  reasoningEffort?: 'high' | 'medium' | 'low';
}

export {
  BatonOrchestrator,
  type BatonOrchestratorOptions,
  type IssueExecutionResult,
  type BatonHandoffEventPayload,
  GatingEngine,
  type GatingEngineOptions,
  PromptEngine,
  parseAcceptanceCriteria,
} from '#packages/orchestrator';

export {
  GitHubClient,
  type GitHubClientOptions,
  sanitizeBlockerEvidence,
} from '#packages/github';

export {
  WorkerSupervisor,
  type WorkerSupervisorOptions,
  type WorkerExecutionRequest,
  type WorkerExecutionResult,
  discoverModels,
  resolveModel,
} from '#packages/worker-runtime';

export {
  RunStateStore,
  type RunStateStoreOptions,
  ConfigStore,
  type ConfigStoreOptions,
  DEFAULT_CONFIG,
  InMemoryRunStateStore,
  InMemoryConfigStore,
} from '#packages/state';

export {
  DoctorEngine,
  type DoctorReport,
  type DoctorCheck,
  UpdateEngine,
} from '#packages/diagnostics';

export {
  formatGatingBadge,
  formatIssueOption,
  formatLaunchManifest,
  HandoffPresenter,
  runHandoffTransition,
  WatchMonitor,
} from '#packages/terminal';
