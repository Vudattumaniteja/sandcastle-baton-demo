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
export * from './services/config-service.js';
export * from './services/doctor-service.js';
export * from './core/gating-evaluator.js';
export * from './core/process-supervisor.js';
export * from './core/baton-runner.js';
export * from './core/prompt-template.js';
export * from './core/transcript-tailer.js';
export * from './ui/formatters.js';
export * from './ui/handoff-formatter.js';
export * from './ui/handoff-transition.js';
export * from './ui/watch-monitor.js';
export * from './commands/wizard.js';
export * from './commands/run.js';
export * from './commands/status.js';
export * from './commands/doctor.js';
export * from './commands/config.js';
export * from './commands/watch.js';
