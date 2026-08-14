import { execa } from 'execa';
import type {
  GitHubIssue,
  GitHubPullRequest,
  CreatePullRequestOptions,
  MergePullRequestOptions,
  ListIssuesOptions,
  CommandExecutor,
} from '../types/github.js';
import type { BlockerReportOptions } from '../types/gating.js';

export interface GitHubServiceOptions {
  repo?: string;
  executor?: CommandExecutor;
}

export const defaultExecutor: CommandExecutor = async (file, args, options = {}) => {
  const { signal, ...rest } = (options || {}) as any;
  const result = await execa(file, args, {
    ...rest,
    ...(signal ? { cancelSignal: signal } : {}),
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 0,
  };
};

export class GitHubService {
  private repo?: string;
  private executor: CommandExecutor;

  constructor(options: GitHubServiceOptions = {}) {
    this.repo = options.repo;
    this.executor = options.executor ?? defaultExecutor;
  }

  /**
   * Resolves the target GitHub repository (owner/repo).
   * If not explicitly set, auto-detects from the local git workspace via gh CLI.
   */
  async getRepo(overrideRepo?: string): Promise<string> {
    if (overrideRepo) {
      return overrideRepo;
    }
    if (this.repo) {
      return this.repo;
    }

    const { stdout } = await this.executor(
      'gh',
      ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
      {}
    );
    this.repo = stdout.trim();
    return this.repo;
  }

  /**
   * Verifies if gh CLI is authenticated and functional.
   */
  async checkAuth(): Promise<boolean> {
    try {
      const result = await this.executor('gh', ['auth', 'status'], {});
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Fetches metadata, labels, body, and comments for an issue.
   */
  async getIssue(issueNumber: number, repo?: string): Promise<GitHubIssue | null> {
    try {
      const targetRepo = await this.getRepo(repo);
      const args = [
        'issue',
        'view',
        String(issueNumber),
        '--repo',
        targetRepo,
        '--json',
        'number,title,body,state,labels,url,comments',
      ];
      const { stdout } = await this.executor('gh', args, {});
      if (!stdout || !stdout.trim()) {
        return null;
      }
      return JSON.parse(stdout) as GitHubIssue;
    } catch {
      return null;
    }
  }

  /**
   * Lists issues in the repository matching the provided filter options.
   */
  async listIssues(options: ListIssuesOptions = {}): Promise<GitHubIssue[]> {
    const targetRepo = await this.getRepo(options.repo);
    const args = ['issue', 'list', '--repo', targetRepo];

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

    const { stdout } = await this.executor('gh', args, {});
    if (!stdout || !stdout.trim()) {
      return [];
    }
    return JSON.parse(stdout) as GitHubIssue[];
  }

  /**
   * Adds one or more labels to an issue.
   */
  async addLabels(issueNumber: number, labels: string[], repo?: string): Promise<void> {
    if (labels.length === 0) return;
    const targetRepo = await this.getRepo(repo);
    const labelArg = labels.join(',');
    const args = ['issue', 'edit', String(issueNumber), '--repo', targetRepo, '--add-label', labelArg];
    await this.executor('gh', args, {});
  }

  /**
   * Removes one or more labels from an issue.
   */
  async removeLabels(issueNumber: number, labels: string[], repo?: string): Promise<void> {
    if (labels.length === 0) return;
    const targetRepo = await this.getRepo(repo);
    const labelArg = labels.join(',');
    const args = ['issue', 'edit', String(issueNumber), '--repo', targetRepo, '--remove-label', labelArg];
    await this.executor('gh', args, {});
  }

  /**
   * Appends a comment to an issue.
   */
  async addComment(issueNumber: number, comment: string, repo?: string): Promise<void> {
    const targetRepo = await this.getRepo(repo);
    const args = ['issue', 'comment', String(issueNumber), '--repo', targetRepo, '--body', comment];
    await this.executor('gh', args, {});
  }

  /**
   * Creates a new Pull Request.
   */
  async createPullRequest(options: CreatePullRequestOptions): Promise<GitHubPullRequest> {
    const targetRepo = await this.getRepo(options.repo);
    const args = [
      'pr',
      'create',
      '--repo',
      targetRepo,
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

    const { stdout } = await this.executor('gh', args, {});
    const url = stdout.trim();
    // Parse PR number from URL like https://github.com/owner/repo/pull/42
    const match = url.match(/\/pull\/(\d+)/);
    const number = match ? parseInt(match[1], 10) : 0;

    return {
      number,
      title: options.title,
      url,
      headRefName: options.head,
      baseRefName: options.base,
    };
  }

  /**
   * Merges a Pull Request by PR number or branch name.
   */
  async mergePullRequest(
    prNumberOrBranch: number | string,
    options: MergePullRequestOptions = {}
  ): Promise<void> {
    const targetRepo = await this.getRepo(options.repo);
    const args = ['pr', 'merge', String(prNumberOrBranch), '--repo', targetRepo];

    const method = options.method ?? 'merge';
    if (method === 'merge') {
      args.push('--merge');
    } else if (method === 'squash') {
      args.push('--squash');
    } else if (method === 'rebase') {
      args.push('--rebase');
    }

    if (options.auto) {
      args.push('--auto');
    }
    if (options.deleteBranch) {
      args.push('--delete-branch');
    }

    await this.executor('gh', args, {});
  }

  /**
   * Closes an issue with an optional closing audit comment.
   */
  async closeIssue(issueNumber: number, comment?: string, repo?: string): Promise<void> {
    const targetRepo = await this.getRepo(repo);
    const args = ['issue', 'close', String(issueNumber), '--repo', targetRepo];
    if (comment) {
      args.push('--comment', comment);
    }
    await this.executor('gh', args, {});
  }

  /**
   * Labels the issue 'status blocked' and posts a structured diagnostic audit comment.
   */
  async reportBlocker(options: BlockerReportOptions): Promise<void> {
    const targetRepo = await this.getRepo(options.repo);
    await this.addLabels(options.issueNumber, ['status blocked'], targetRepo);

    const commentBody = [
      '## 🚫 Sandcastle Baton Blocked',
      '',
      `**Reason:** ${options.reason}`,
      options.evidence ? `\n### Evidence / Output\n\`\`\`\n${options.evidence}\n\`\`\`` : '',
      options.remediation ? `\n### Remediation\n${options.remediation}` : '',
      '',
      '---',
      '_Sandcastle autonomous execution halted to protect repository integrity._',
    ]
      .filter(Boolean)
      .join('\n');

    await this.addComment(options.issueNumber, commentBody, targetRepo);
  }
}
