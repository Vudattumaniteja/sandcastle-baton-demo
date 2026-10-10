export { GitHubClient, type GitHubClientOptions } from './github-client.js';

export {
  defaultExecutor,
} from './lib/cli-executor.js';

export {
  stripAnsi,
  sanitizeBlockerEvidence,
  MAX_BLOCKER_EVIDENCE_LENGTH,
} from './lib/evidence-sanitizer.js';

export {
  syncParentChecklistText,
} from './lib/checklist-sync.js';

export {
  buildBlockerComment,
  buildParentProgressComment,
} from './lib/comment-builder.js';

export {
  buildRepoViewArgs,
  buildAuthStatusArgs,
  buildGetIssueArgs,
  buildListIssuesArgs,
  buildAddLabelsArgs,
  buildRemoveLabelsArgs,
  buildAddCommentArgs,
  buildCreatePullRequestArgs,
  buildMergePullRequestArgs,
  buildCloseIssueArgs,
  buildUpdateIssueBodyArgs,
} from './lib/gh-args-builder.js';

export type {
  GitHubIssue,
  GitHubPullRequest,
  ListIssuesOptions,
  CreatePullRequestOptions,
  MergePullRequestOptions,
  ParentProgressCommentOptions,
  CommandExecutor,
  CommandResult,
} from '../../types/github.js';

export type {
  BlockerReportOptions,
} from '../../types/gating.js';
