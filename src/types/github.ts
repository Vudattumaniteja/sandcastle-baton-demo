export interface GitHubLabel {
  id?: string;
  name: string;
  description?: string;
  color?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'OPEN' | 'CLOSED';
  labels: (GitHubLabel | string)[];
  url?: string;
  comments?: Array<{
    id?: string;
    body: string;
    author?: { login: string };
  }>;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  url: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  headRefName?: string;
  baseRefName?: string;
}

export interface CreatePullRequestOptions {
  title: string;
  body: string;
  head?: string;
  base?: string;
  repo?: string;
  draft?: boolean;
}

export interface MergePullRequestOptions {
  method?: 'merge' | 'squash' | 'rebase';
  auto?: boolean;
  deleteBranch?: boolean;
  repo?: string;
}

export interface ListIssuesOptions {
  state?: 'open' | 'closed' | 'all';
  limit?: number;
  labels?: string[];
  repo?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandExecutor = (
  file: string,
  args: string[],
  options?: Record<string, unknown>
) => Promise<CommandResult>;
