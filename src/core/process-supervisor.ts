import {
  WorkerSupervisor,
  type WorkerSupervisorOptions,
} from '#packages/worker-runtime';
import type {
  SupervisorEvent,
  ProcessSupervisorOptions,
  SuperviseResult,
} from '../types/supervisor.js';

export { WorkerSupervisor };
export type { ProcessSupervisorOptions, SuperviseResult, SupervisorEvent };

/**
 * Backward-compatible bridge to WorkerSupervisor from src/packages/worker-runtime.
 */
export class ProcessSupervisor extends WorkerSupervisor {
  constructor(options: ProcessSupervisorOptions = {}) {
    super(options);
  }
}
