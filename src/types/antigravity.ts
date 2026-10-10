import type {
  ModelInfo,
  StatuslineQuotaInfo,
  StatuslineSnapshot,
  AgyCommandExecutor,
  WorkerExecutionRequest,
  WorkerProcessResult,
} from '#packages/worker-runtime';

export type {
  ModelInfo,
  StatuslineQuotaInfo,
  StatuslineSnapshot,
  AgyCommandExecutor,
};

export type AntigravityWorkerOptions = WorkerExecutionRequest;
export type AntigravityWorkerResult = WorkerProcessResult;

export interface AntigravityServiceOptions {
  customAgyPath?: string;
  appDataDir?: string;
  executor?: AgyCommandExecutor;
}
