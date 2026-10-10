import {
  GitHubClient,
  type GitHubClientOptions,
  defaultExecutor,
  stripAnsi,
  sanitizeBlockerEvidence,
  MAX_BLOCKER_EVIDENCE_LENGTH,
} from '#packages/github';

export type GitHubServiceOptions = GitHubClientOptions;

export {
  defaultExecutor,
  MAX_BLOCKER_EVIDENCE_LENGTH,
  stripAnsi,
  sanitizeBlockerEvidence,
};

/**
 * Backward-compatible bridge to GitHubClient from src/packages/github.
 */
export class GitHubService extends GitHubClient {
  constructor(options: GitHubServiceOptions = {}) {
    super(options);
  }
}
