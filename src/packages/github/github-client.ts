import type {
  GitHubIssue,
  GitHubPullRequest,
  CreatePullRequestOptions,
  MergePullRequestOptions,
  ListIssuesOptions,
  ParentProgressCommentOptions,
  CommandExecutor,
} from '../../types/github.js';
import type { BlockerReportOptions } from '../../types/gating.js';
import { defaultExecutor } from './lib/cli-executor.js';
import { syncParentChecklistText } from './lib/checklist-sync.js';
import { buildBlockerComment, buildParentProgressComment } from './lib/comment-builder.js';
import {
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

export interface GitHubClientOptions {
  repo?: string;
  executor?: CommandExecutor;
}

export class GitHubClient {
  protected repo?: string;
  protected executor: CommandExecutor;

  constructor(options: GitHubClientOptions = {}) {
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

    const { stdout } = await this.executor('gh', buildRepoViewArgs(), {});
    this.repo = stdout.trim();
    return this.repo;
  }

  /**
   * Verifies if gh CLI is authenticated and functional.
   */
  async checkAuth(): Promise<boolean> {
    try {
      const result = await this.executor('gh', buildAuthStatusArgs(), {});
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
      const args = buildGetIssueArgs(issueNumber, targetRepo);
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
    const args = buildListIssuesArgs(options, targetRepo);
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
    const args = buildAddLabelsArgs(issueNumber, labels, targetRepo);
    await this.executor('gh', args, {});
  }

  /**
   * Removes one or more labels from an issue.
   */
  async removeLabels(issueNumber: number, labels: string[], repo?: string): Promise<void> {
    if (labels.length === 0) return;
    const targetRepo = await this.getRepo(repo);
    const args = buildRemoveLabelsArgs(issueNumber, labels, targetRepo);
    await this.executor('gh', args, {});
  }

  /**
   * Appends a comment to an issue.
   */
  async addComment(issueNumber: number, comment: string, repo?: string): Promise<void> {
    const targetRepo = await this.getRepo(repo);
    const args = buildAddCommentArgs(issueNumber, comment, targetRepo);
    await this.executor('gh', args, {});
  }

  /**
   * Creates a new Pull Request.
   */
  async createPullRequest(options: CreatePullRequestOptions): Promise<GitHubPullRequest> {
    const targetRepo = await this.getRepo(options.repo);
    const args = buildCreatePullRequestArgs(options, targetRepo);
    const { stdout } = await this.executor('gh', args, {});
    const url = stdout.trim();
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
    const args = buildMergePullRequestArgs(prNumberOrBranch, options, targetRepo);
    await this.executor('gh', args, {});
  }

  /**
   * Closes an issue with an optional closing audit comment.
   */
  async closeIssue(issueNumber: number, comment?: string, repo?: string): Promise<void> {
    const targetRepo = await this.getRepo(repo);
    const args = buildCloseIssueArgs(issueNumber, targetRepo, comment);
    await this.executor('gh', args, {});
  }

  /**
   * Labels the issue 'status blocked' and posts a structured diagnostic audit comment.
   */
  async reportBlocker(options: BlockerReportOptions): Promise<void> {
    const targetRepo = await this.getRepo(options.repo);
    await this.addLabels(options.issueNumber, ['status blocked'], targetRepo);
    const commentBody = buildBlockerComment(options);
    await this.addComment(options.issueNumber, commentBody, targetRepo);
  }

  /**
   * Updates an issue's body markdown text.
   */
  async updateIssueBody(issueNumber: number, body: string, repo?: string): Promise<void> {
    const targetRepo = await this.getRepo(repo);
    const args = buildUpdateIssueBodyArgs(issueNumber, body, targetRepo);
    await this.executor('gh', args, {});
  }

  /**
   * Checks off a child task checkbox `- [x] #<childNumber>` in parent issue body if present.
   * Returns true if a checkbox was found and updated, false otherwise.
   */
  async syncParentChecklist(
    parentNumber: number,
    childNumber: number,
    repo?: string
  ): Promise<boolean> {
    const targetRepo = await this.getRepo(repo);
    const parentIssue = await this.getIssue(parentNumber, targetRepo);
    if (!parentIssue || !parentIssue.body) {
      return false;
    }

    const { updated, body } = syncParentChecklistText(parentIssue.body, childNumber);
    if (updated) {
      await this.updateIssueBody(parentNumber, body, targetRepo);
      return true;
    }

    return false;
  }

  /**
   * Posts a structured progress audit comment on a parent issue when a child task completes.
   */
  async postParentProgressComment(options: ParentProgressCommentOptions): Promise<void> {
    const targetRepo = await this.getRepo(options.repo);
    const commentBody = buildParentProgressComment(options);
    await this.addComment(options.parentNumber, commentBody, targetRepo);
  }
}
