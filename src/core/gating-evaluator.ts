import {
  GatingEngine,
  type GatingEngineOptions,
} from '#packages/orchestrator';

export interface GatingEvaluatorOptions extends GatingEngineOptions {
  githubService?: any;
}

/**
 * Backward-compatible bridge class for GatingEngine.
 */
export class GatingEvaluator extends GatingEngine {
  constructor(options: GatingEvaluatorOptions = {}) {
    super(options);
  }
}
