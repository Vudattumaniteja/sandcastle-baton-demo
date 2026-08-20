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

    it('should parse various forms of parent and epic references', () => {
      const sample = `
Part of #40
Parent: #41
Parent Issue: #42
Epic: #43
Epic #44
`;
      expect(evaluator.parseParentReferences(sample)).toEqual([40, 41, 42, 43, 44]);
    });

    it('should exclude parent/epic references from prerequisite blockers', () => {
      const sample = `
Part of #40
Blocked by: #22, #40
`;
      const parentRefs = evaluator.parseParentReferences(sample);
      const prereqs = evaluator.parsePrerequisites(sample).filter((p) => !parentRefs.includes(p));
      expect(parentRefs).toEqual([40]);
      expect(prereqs).toEqual([22]);
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

    it('should evaluate an issue as PARENT when parent or epic label is present', async () => {
      const parentIssue1: GitHubIssue = {
        number: 40,
        title: 'Epic: Sandcastle Autonomous Baton Phase 2',
        body: 'Parent epic specification',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      const eval1 = await evaluator.evaluateIssue(parentIssue1);
      expect(eval1.status).toBe('PARENT');
      expect(eval1.isReady).toBe(false);
      expect(eval1.reasons[0]).toContain('parent');

      const parentIssue2: GitHubIssue = {
        number: 41,
        title: 'Map: Navigation Architecture',
        body: '',
        state: 'OPEN',
        labels: ['wayfinder:map'],
      };

      const eval2 = await evaluator.evaluateIssue(parentIssue2);
      expect(eval2.status).toBe('PARENT');
      expect(eval2.isReady).toBe(false);
    });

    it('should evaluate an issue as HITL when human-in-the-loop labels are present', async () => {
      const hitlIssue: GitHubIssue = {
        number: 42,
        title: 'Grilling: Clarify Gating Protocol',
        body: 'Interactive interview required',
        state: 'OPEN',
        labels: ['wayfinder:grilling', 'ready-for-agent', 'AFK'],
      };

      const evaluation = await evaluator.evaluateIssue(hitlIssue);
      expect(evaluation.status).toBe('HITL');
      expect(evaluation.isReady).toBe(false);
      expect(evaluation.reasons[0]).toContain('human-in-the-loop');
    });

    it('should allow child issues to run while parent issues remain open (non-blocking parent resolution)', async () => {
      const childIssue: GitHubIssue = {
        number: 43,
        title: 'feat: Child Feature',
        body: 'Part of #40\nBlocked by: #22',
        state: 'OPEN',
        labels: ['ready-for-agent', 'AFK'],
      };

      mockGitHubService.getIssue.mockResolvedValueOnce({
        number: 22,
        title: 'feat: Foundation',
        state: 'CLOSED',
        labels: [],
      });

      const evaluation = await evaluator.evaluateIssue(childIssue);
      expect(evaluation.status).toBe('READY');
      expect(evaluation.isReady).toBe(true);
      expect(evaluation.prerequisiteIssueNumbers).toEqual([22]);
      expect(evaluation.blockingIssueNumbers).toEqual([]);
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
        {
          number: 40,
          title: 'Epic: Architecture',
          body: 'Structural specification',
          state: 'OPEN',
          labels: ['epic'],
        },
        {
          number: 41,
          title: 'Child Task',
          body: 'Part of #40',
          state: 'OPEN',
          labels: ['ready-for-agent', 'AFK'],
        },
        {
          number: 42,
          title: 'HITL Task',
          body: '',
          state: 'OPEN',
          labels: ['wayfinder:prototype'],
        },
      ];

      const evaluations = await evaluator.evaluateBacklog(backlog);

      expect(evaluations.get(1)?.status).toBe('CLOSED');
      expect(evaluations.get(2)?.status).toBe('READY');
      expect(evaluations.get(3)?.status).toBe('WAITING');
      expect(evaluations.get(3)?.blockingIssueNumbers).toEqual([2]);
      expect(evaluations.get(4)?.status).toBe('BLOCKED');
      expect(evaluations.get(5)?.status).toBe('UNGATED');
      expect(evaluations.get(40)?.status).toBe('PARENT');
      expect(evaluations.get(41)?.status).toBe('READY');
      expect(evaluations.get(42)?.status).toBe('HITL');

      // Verified in-memory resolution did not need extra getIssue calls
      expect(mockGitHubService.getIssue).not.toHaveBeenCalled();
    });
  });
});
