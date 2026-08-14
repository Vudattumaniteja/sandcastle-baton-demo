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

export * from './types/index.js';
export * from './services/github-service.js';
export * from './services/antigravity-service.js';
export * from './core/gating-evaluator.js';
export * from './core/process-supervisor.js';
