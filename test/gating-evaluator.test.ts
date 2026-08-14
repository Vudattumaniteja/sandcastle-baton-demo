import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GatingEvaluator } from '../src/core/gating-evaluator.js';
import type { GitHubIssue } from '../src/types/github.js';
import type { GitHubService } from '../src/services/github-service.js';

describe('GatingEvaluator', () => {
  let mockGitHubService: {
    getIssue: ReturnType<typeof vi.fn>;
    listIssues: ReturnType<typeof vi.fn>;
  };
  let evaluator: GatingEvaluator;

  beforeEach(() => {
    mockGitHubService = {
      getIssue: vi.fn(),
      listIssues: vi.fn(),
    };
    evaluator = new GatingEvaluator({
      githubService: mockGitHubService as unknown as GitHubService,
    });
  });

  describe('Prerequisite Parsing', () => {
    it('should parse various forms of blocker and prerequisite declarations', () => {
      const sample1 = `
## What to build
Implement something.

## Blocked by
- Blocked by: #22
`;
      expect(evaluator.parsePrerequisites(sample1)).toEqual([22]);

      const sample2 = `
Blocked by: #10, #11, #12
Prerequisite: #15
Depends on #16
`;
      expect(evaluator.parsePrerequisites(sample2)).toEqual([10, 11, 12, 15, 16]);

      const sample3 = `
No prerequisites here. Part of #1 (parent epic, not blocker).
`;
      expect(evaluator.parsePrerequisites(sample3)).toEqual([]);
    });

    it('should ignore duplicate prerequisite references', () => {
      const sample = `
Blocked by: #22
Depends on: #22
Prerequisites: #22, #23
`;
      expect(evaluator.parsePrerequisites(sample)).toEqual([22, 23]);
    });
  });

  describe('Single Issue Evaluation', () => {
    it('should evaluate an issue as READY when open, labeled ready-for-agent + AFK, and has no open blockers', async () => {
      const issue: GitHubIssue = {
        number: 23,
        title: 'feat: Gating Evaluator',
        body: 'Blocked by: #22',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }, { name: 'sandcastle' }],
      };

      mockGitHubService.getIssue.mockResolvedValueOnce({
        number: 22,
        title: 'feat: Foundation',
        body: '',
        state: 'CLOSED',
        labels: [],
      });

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('READY');
      expect(evaluation.isReady).toBe(true);
      expect(evaluation.missingLabels).toEqual([]);
      expect(evaluation.blockingIssueNumbers).toEqual([]);
      expect(evaluation.prerequisiteIssueNumbers).toEqual([22]);
    });

    it('should evaluate case-insensitive AFK label (afk)', async () => {
      const issue: GitHubIssue = {
        number: 24,
        title: 'feat: Runner',
        body: '',
        state: 'OPEN',
        labels: ['ready-for-agent', 'afk'],
      };

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('READY');
      expect(evaluation.isReady).toBe(true);
      expect(evaluation.hasAfkLabel).toBe(true);
    });

    it('should evaluate as UNGATED when missing ready-for-agent or AFK label', async () => {
      const issue: GitHubIssue = {
        number: 25,
        title: 'feat: CLI Doctor',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }], // missing AFK
      };

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('UNGATED');
      expect(evaluation.isReady).toBe(false);
      expect(evaluation.missingLabels).toContain('AFK');
    });

    it('should evaluate as BLOCKED when status blocked label is present', async () => {
      const issue: GitHubIssue = {
        number: 26,
        title: 'feat: Broken feature',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }, { name: 'status blocked' }],
      };

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('BLOCKED');
      expect(evaluation.isReady).toBe(false);
      expect(evaluation.isBlockedLabelPresent).toBe(true);
      expect(evaluation.reasons).toContain("Issue is labeled 'status blocked'.");
    });

    it('should evaluate as WAITING when open prerequisites exist', async () => {
      const issue: GitHubIssue = {
        number: 27,
        title: 'feat: Dependent feature',
        body: 'Blocked by: #22, #23',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      mockGitHubService.getIssue
        .mockResolvedValueOnce({ number: 22, state: 'CLOSED', title: 'Closed', labels: [], body: '' })
        .mockResolvedValueOnce({ number: 23, state: 'OPEN', title: 'Open', labels: [], body: '' });

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('WAITING');
      expect(evaluation.isReady).toBe(false);
      expect(evaluation.prerequisiteIssueNumbers).toEqual([22, 23]);
      expect(evaluation.blockingIssueNumbers).toEqual([23]);
      expect(evaluation.reasons).toContain('Waiting for prerequisite issues to close: #23');
    });

    it('should evaluate as CLOSED when issue state is CLOSED', async () => {
      const issue: GitHubIssue = {
        number: 22,
        title: 'feat: Foundation',
        body: '',
        state: 'CLOSED',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const evaluation = await evaluator.evaluateIssue(issue);

      expect(evaluation.status).toBe('CLOSED');
      expect(evaluation.isReady).toBe(false);
    });
  });

  describe('Backlog Evaluation', () => {
    it('should evaluate an entire backlog graph resolving dependencies in-memory without extra network calls', async () => {
      const backlog: GitHubIssue[] = [
        {
          number: 1,
          title: 'Issue 1',
          body: '',
          state: 'CLOSED',
          labels: ['ready-for-agent', 'AFK'],
        },
        {
          number: 2,
          title: 'Issue 2',
          body: 'Blocked by: #1',
          state: 'OPEN',
          labels: ['ready-for-agent', 'AFK'],
        },
        {
          number: 3,
          title: 'Issue 3',
          body: 'Blocked by: #2',
          state: 'OPEN',
          labels: ['ready-for-agent', 'AFK'],
        },
        {
          number: 4,
          title: 'Issue 4',
          body: '',
          state: 'OPEN',
          labels: ['status blocked'],
        },
        {
          number: 5,
          title: 'Issue 5',
          body: '',
          state: 'OPEN',
          labels: ['ready-for-agent'], // ungated
        },
      ];

      const evaluations = await evaluator.evaluateBacklog(backlog);

      expect(evaluations.get(1)?.status).toBe('CLOSED');
      expect(evaluations.get(2)?.status).toBe('READY');
      expect(evaluations.get(3)?.status).toBe('WAITING');
      expect(evaluations.get(3)?.blockingIssueNumbers).toEqual([2]);
      expect(evaluations.get(4)?.status).toBe('BLOCKED');
      expect(evaluations.get(5)?.status).toBe('UNGATED');

      // Verified in-memory resolution did not need extra getIssue calls
      expect(mockGitHubService.getIssue).not.toHaveBeenCalled();
    });
  });
});
