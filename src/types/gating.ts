
export type GatingStatus =
  | 'READY'
  | 'WAITING'
  | 'BLOCKED'
  | 'UNGATED'
  | 'CLOSED'
  | 'PARENT'
  | 'HITL';

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
  parentIssueNumbers?: number[];
}

export interface BlockerReportOptions {
  issueNumber: number;
  reason: string;
  evidence?: string;
  remediation?: string;
  repo?: string;
}
