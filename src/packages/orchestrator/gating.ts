import type { GitHubIssue } from '../../types/github.js';
import type { GatingEvaluation, GatingStatus } from '../../types/gating.js';
import {
  parseParentReferences,
  parsePrerequisites,
} from './lib/dependency-parser.js';

export { parseParentReferences, parsePrerequisites } from './lib/dependency-parser.js';
export type { GatingEvaluation, GatingStatus };

export interface GatingEngineOptions {
  githubClient?: any;
  githubService?: any;
  parentLabels?: string[];
  hitlLabels?: string[];
}

export class GatingEngine {
  private client?: any;
  private parentLabels: string[];
  private hitlLabels: string[];

  constructor(options: GatingEngineOptions = {}) {
    this.client = options.githubClient ?? options.githubService;
    this.parentLabels = options.parentLabels ?? ['parent', 'epic', 'wayfinder:map'];
    this.hitlLabels = options.hitlLabels ?? ['wayfinder:grilling', 'wayfinder:prototype'];
  }

  /**
   * Extracts parent / epic issue numbers from issue markdown body.
   */
  parseParentReferences(body: string): number[] {
    return parseParentReferences(body);
  }

  /**
   * Extracts prerequisite/blocker issue numbers from issue markdown body.
   */
  parsePrerequisites(body: string): number[] {
    return parsePrerequisites(body);
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

    const parentLabelsLower = this.parentLabels.map((l) => l.toLowerCase());
    const hitlLabelsLower = this.hitlLabels.map((l) => l.toLowerCase());

    const hasParentLabel = labelNames.some((l) => parentLabelsLower.includes(l));
    const hasHitlLabel = labelNames.some((l) => hitlLabelsLower.includes(l));

    const hasReadyLabel = labelNames.includes('ready-for-agent');
    const hasAfkLabel = labelNames.includes('afk');
    const isBlockedLabelPresent = labelNames.includes('status blocked');

    const missingLabels: string[] = [];
    if (!hasReadyLabel) missingLabels.push('ready-for-agent');
    if (!hasAfkLabel) missingLabels.push('AFK');

    const reasons: string[] = [];
    const parentIssueNumbers = this.parseParentReferences(issue.body || '');
    const rawPrereqs = this.parsePrerequisites(issue.body || '');
    const prerequisiteIssueNumbers = rawPrereqs.filter(
      (prereqNum) => !parentIssueNumbers.includes(prereqNum)
    );
    const blockingIssueNumbers: number[] = [];

    // Helper to check if an issue is a parent issue by labels
    const isIssueParent = (item: GitHubIssue) => {
      const labels = (item.labels || []).map((l) =>
        typeof l === 'string' ? l.toLowerCase() : l.name.toLowerCase()
      );
      return labels.some((l) => parentLabelsLower.includes(l));
    };

    // Evaluate prerequisites if issue is open
    if (!isClosed && prerequisiteIssueNumbers.length > 0) {
      for (const prereqNum of prerequisiteIssueNumbers) {
        if (backlogMap && backlogMap.has(prereqNum)) {
          const prereqIssue = backlogMap.get(prereqNum)!;
          if (prereqIssue.state === 'OPEN' && !isIssueParent(prereqIssue)) {
            blockingIssueNumbers.push(prereqNum);
          }
        } else if (this.client) {
          const prereqIssue = await this.client.getIssue(prereqNum, repo);
          if (prereqIssue && prereqIssue.state === 'OPEN' && !isIssueParent(prereqIssue)) {
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
    } else if (hasParentLabel) {
      status = 'PARENT';
      reasons.push('Issue is classified as a parent/epic specification.');
    } else if (hasHitlLabel) {
      status = 'HITL';
      reasons.push('Issue requires human-in-the-loop interaction.');
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
      parentIssueNumbers,
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
