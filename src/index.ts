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
