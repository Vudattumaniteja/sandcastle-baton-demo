import type { GitHubIssue } from './github.js';

export type GatingStatus = 'READY' | 'WAITING' | 'BLOCKED' | 'UNGATED' | 'CLOSED';

export interface GatingEvaluation {
  issueNumber: number;
  title: string;
  state: 'OPEN' | 'CLOSED';
  status: GatingStatus;
  isReady: boolean;
  hasReadyLabel: boolean;
  hasAfkLabel: boolean;
  isBlockedLabelPresent: boolean;
  missingLabels: string[];
  prerequisiteIssueNumbers: number[];
  blockingIssueNumbers: number[];
  reasons: string[];
}

export interface BlockerReportOptions {
  issueNumber: number;
  reason: string;
  evidence?: string;
  remediation?: string;
  repo?: string;
}
