import type {
  ListIssuesOptions,
  CreatePullRequestOptions,
  MergePullRequestOptions,
} from '../../../types/github.js';

export function buildRepoViewArgs(): string[] {
  return ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'];
}

export function buildAuthStatusArgs(): string[] {
  return ['auth', 'status'];
}

export function buildGetIssueArgs(issueNumber: number, repo: string): string[] {
  return [
    'issue',
    'view',
    String(issueNumber),
    '--repo',
    repo,
    '--json',
    'number,title,body,state,labels,url,comments',
  ];
}

export function buildListIssuesArgs(options: ListIssuesOptions, repo: string): string[] {
  const args = ['issue', 'list', '--repo', repo];

  if (options.state) {
    args.push('--state', options.state);
  }
  if (options.limit) {
    args.push('--limit', String(options.limit));
  }
  if (options.labels && options.labels.length > 0) {
    for (const label of options.labels) {
      args.push('--label', label);
    }
  }

  args.push('--json', 'number,title,body,state,labels,url');
  return args;
}

export function buildAddLabelsArgs(issueNumber: number, labels: string[], repo: string): string[] {
  return [
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repo,
    '--add-label',
    labels.join(','),
  ];
}

export function buildRemoveLabelsArgs(issueNumber: number, labels: string[], repo: string): string[] {
  return [
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repo,
    '--remove-label',
    labels.join(','),
  ];
}

export function buildAddCommentArgs(issueNumber: number, comment: string, repo: string): string[] {
  return [
    'issue',
    'comment',
    String(issueNumber),
    '--repo',
    repo,
    '--body',
    comment,
  ];
}

export function buildCreatePullRequestArgs(
  options: CreatePullRequestOptions,
  repo: string
): string[] {
  const args = [
    'pr',
    'create',
    '--repo',
    repo,
    '--title',
    options.title,
    '--body',
    options.body,
  ];

  if (options.head) {
    args.push('--head', options.head);
  }
  if (options.base) {
    args.push('--base', options.base);
  }
  if (options.draft) {
    args.push('--draft');
  }

  return args;
}

export function buildMergePullRequestArgs(
  prNumberOrBranch: number | string,
  options: MergePullRequestOptions,
  repo: string
): string[] {
  const args = ['pr', 'merge', String(prNumberOrBranch), '--repo', repo];

  const method = options.method ?? options.strategy ?? 'merge';
  if (method === 'merge') {
    args.push('--merge');
  } else if (method === 'squash') {
    args.push('--squash');
  } else if (method === 'rebase') {
    args.push('--rebase');
  }

  if (options.auto || options.autoMerge) {
    args.push('--auto');
  }
  if (options.deleteBranch) {
    args.push('--delete-branch');
  }

  return args;
}

export function buildCloseIssueArgs(
  issueNumber: number,
  repo: string,
  comment?: string
): string[] {
  const args = ['issue', 'close', String(issueNumber), '--repo', repo];
  if (comment) {
    args.push('--comment', comment);
  }
  return args;
}

export function buildUpdateIssueBodyArgs(
  issueNumber: number,
  body: string,
  repo: string
): string[] {
  return [
    'issue',
    'edit',
    String(issueNumber),
    '--repo',
    repo,
    '--body',
    body,
  ];
}
