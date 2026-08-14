import type { GitHubIssue } from '../types/github.js';
import type { GatingEvaluation, GatingStatus } from '../types/gating.js';
import type { GitHubService } from '../services/github-service.js';

export interface GatingEvaluatorOptions {
  githubService?: GitHubService;
}

export class GatingEvaluator {
  private githubService?: GitHubService;

  constructor(options: GatingEvaluatorOptions = {}) {
    this.githubService = options.githubService;
  }

  /**
   * Extracts prerequisite/blocker issue numbers from issue markdown body.
   * Matches variations of 'Blocked by: #12', 'Depends on #13', 'Prerequisites: #14, #15'.
   */
  parsePrerequisites(body: string): number[] {
    if (!body || !body.trim()) {
      return [];
    }

    const prereqNumbers = new Set<number>();
    const lines = body.split(/\r?\n/);

    const blockerLineRegex =
      /^\s*(?:[-*#>]+\s*)?(?:blocked\s+by|depends\s+on|prerequisites?|requires?)\s*[:=-]?\s*(.*)$/i;

    for (const line of lines) {
      const match = line.match(blockerLineRegex);
      if (match && match[1]) {
        const remainingText = match[1].trim();
        if (!remainingText) continue;

        const numberMatches = remainingText.matchAll(/#(\d+)|\b(\d+)\b/g);
        for (const numMatch of numberMatches) {
          const rawNum = numMatch[1] ?? numMatch[2];
          const num = parseInt(rawNum, 10);
          if (!isNaN(num) && num > 0) {
            prereqNumbers.add(num);
          }
        }
      }
    }

    return Array.from(prereqNumbers);
  }

  /**
   * Evaluates safety gates and dependency state for a single issue.
   */
  async evaluateIssue(
    issue: GitHubIssue,
    repo?: string,
    backlogMap?: Map<number, GitHubIssue>
  ): Promise<GatingEvaluation> {
    const isClosed = issue.state === 'CLOSED';
    const labelNames = (issue.labels || []).map((l) =>
      typeof l === 'string' ? l.toLowerCase() : l.name.toLowerCase()
    );

    const hasReadyLabel = labelNames.includes('ready-for-agent');
    const hasAfkLabel = labelNames.includes('afk');
    const isBlockedLabelPresent = labelNames.includes('status blocked');

    const missingLabels: string[] = [];
    if (!hasReadyLabel) missingLabels.push('ready-for-agent');
    if (!hasAfkLabel) missingLabels.push('AFK');

    const reasons: string[] = [];
    const prerequisiteIssueNumbers = this.parsePrerequisites(issue.body || '');
    const blockingIssueNumbers: number[] = [];

    // Evaluate prerequisites if issue is open
    if (!isClosed && prerequisiteIssueNumbers.length > 0) {
      for (const prereqNum of prerequisiteIssueNumbers) {
        if (backlogMap && backlogMap.has(prereqNum)) {
          const prereqIssue = backlogMap.get(prereqNum)!;
          if (prereqIssue.state === 'OPEN') {
            blockingIssueNumbers.push(prereqNum);
          }
        } else if (this.githubService) {
          const prereqIssue = await this.githubService.getIssue(prereqNum, repo);
          if (prereqIssue && prereqIssue.state === 'OPEN') {
            blockingIssueNumbers.push(prereqNum);
          }
        }
      }
    }

    let status: GatingStatus;
    let isReady = false;

    if (isClosed) {
      status = 'CLOSED';
      reasons.push('Issue is already closed.');
    } else if (isBlockedLabelPresent) {
      status = 'BLOCKED';
      reasons.push("Issue is labeled 'status blocked'.");
    } else if (missingLabels.length > 0) {
      status = 'UNGATED';
      reasons.push(`Missing required gate labels: ${missingLabels.join(', ')}`);
    } else if (blockingIssueNumbers.length > 0) {
      status = 'WAITING';
      reasons.push(
        `Waiting for prerequisite issues to close: #${blockingIssueNumbers.join(', #')}`
      );
    } else {
      status = 'READY';
      isReady = true;
      reasons.push('All gate conditions satisfied.');
    }

    return {
      issueNumber: issue.number,
      title: issue.title,
      state: issue.state,
      status,
      isReady,
      hasReadyLabel,
      hasAfkLabel,
      isBlockedLabelPresent,
      missingLabels,
      prerequisiteIssueNumbers,
      blockingIssueNumbers,
      reasons,
    };
  }

  /**
   * Evaluates an entire backlog of issues resolving prerequisite states in memory.
   */
  async evaluateBacklog(
    issues: GitHubIssue[],
    repo?: string
  ): Promise<Map<number, GatingEvaluation>> {
    const backlogMap = new Map<number, GitHubIssue>(issues.map((i) => [i.number, i]));
    const evaluationMap = new Map<number, GatingEvaluation>();

    for (const issue of issues) {
      const evaluation = await this.evaluateIssue(issue, repo, backlogMap);
      evaluationMap.set(issue.number, evaluation);
    }

    return evaluationMap;
  }
}
