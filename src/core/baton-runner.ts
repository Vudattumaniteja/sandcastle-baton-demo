import type { BatonRunnerOptions } from '../types/baton.js';
import type { BatonHandoffPayload } from '../types/handoff.js';
import { runHandoffTransition } from '../ui/handoff-transition.js';
import {
  BatonOrchestrator,
  parseAcceptanceCriteria,
  PromptEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  type BatonOrchestratorOptions,
} from '#packages/orchestrator';

export { parseAcceptanceCriteria };

/**
 * Builds the default worker prompt string for an issue.
 */
export function buildDefaultWorkerPrompt(
  repo: string,
  issueNumber: number,
  issueUrl?: string
): string {
  const engine = new PromptEngine();
  const url = issueUrl || `https://github.com/${repo}/issues/${issueNumber}`;
  return engine.interpolate(DEFAULT_WORKER_PROMPT_TEMPLATE, {
    issue: {
      number: issueNumber,
      url,
    },
  });
}

/**
 * Backward-compatible bridge class for BatonOrchestrator with interactive UI pacing.
 */
export class BatonRunner extends BatonOrchestrator {
  constructor(options: BatonRunnerOptions = {}) {
    const handoffHandler = options.interactivePacing
      ? async (payload: BatonHandoffPayload) => {
          return runHandoffTransition({
            payload,
            durationSeconds: options.pacingSeconds ?? 3.0,
            mode: options.mode === 'supervised' ? 'wizard' : 'run',
            stdin: (options as any).stdin,
            stdout: (options as any).stdout,
          });
        }
      : (options as any).handoffHandler;

    super({
      ...options,
      handoffHandler,
    } as BatonOrchestratorOptions);
  }
}
