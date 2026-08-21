import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GitHubService } from '../src/services/github-service.js';
import type { CommandExecutor, CommandResult } from '../src/types/github.js';

describe('GitHubService', () => {
  let mockExecutor: ReturnType<typeof vi.fn<CommandExecutor>>;

  beforeEach(() => {
    mockExecutor = vi.fn<CommandExecutor>();
  });

  describe('Repository resolution and auth', () => {
    it('should return explicitly passed repo', async () => {
      const service = new GitHubService({ repo: 'owner/custom-repo', executor: mockExecutor });
      const repo = await service.getRepo();
      expect(repo).toBe('owner/custom-repo');
      expect(mockExecutor).not.toHaveBeenCalled();
    });

    it('should detect repo via gh CLI when not explicitly passed', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: 'detected-owner/detected-repo\n',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ executor: mockExecutor });
      const repo = await service.getRepo();

      expect(repo).toBe('detected-owner/detected-repo');
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner'],
        expect.any(Object)
      );
    });

    it('should verify auth status returning true on success', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: 'Logged in to github.com as user',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ executor: mockExecutor });
      const isAuthed = await service.checkAuth();
      expect(isAuthed).toBe(true);
      expect(mockExecutor).toHaveBeenCalledWith('gh', ['auth', 'status'], expect.any(Object));
    });

    it('should verify auth status returning false on error', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Not logged in'));

      const service = new GitHubService({ executor: mockExecutor });
      const isAuthed = await service.checkAuth();
      expect(isAuthed).toBe(false);
    });
  });

  describe('Issue Operations', () => {
    it('should fetch single issue metadata as typed GitHubIssue', async () => {
      const issuePayload = {
        number: 23,
        title: 'feat: Gating Evaluator & GitHub Service Adapter',
        body: 'Implement gating engine\nBlocked by: #22',
        state: 'OPEN',
        labels: [
          { name: 'ready-for-agent' },
          { name: 'AFK' },
          { name: 'sandcastle' },
        ],
        url: 'https://github.com/owner/repo/issues/23',
        comments: [],
      };

      mockExecutor.mockResolvedValueOnce({
        stdout: JSON.stringify(issuePayload),
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const issue = await service.getIssue(23);

      expect(issue).toEqual(issuePayload);
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'issue',
          'view',
          '23',
          '--repo',
          'owner/repo',
          '--json',
          'number,title,body,state,labels,url,comments',
        ],
        expect.any(Object)
      );
    });

    it('should return null when issue is not found or fails to fetch', async () => {
      mockExecutor.mockRejectedValueOnce(new Error('Issue not found'));

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const issue = await service.getIssue(999);

      expect(issue).toBeNull();
    });

    it('should list issues with filtering options', async () => {
      const issuesPayload = [
        {
          number: 22,
          title: 'feat: Foundation',
          body: '',
          state: 'CLOSED',
          labels: [{ name: 'sandcastle' }],
          url: 'https://github.com/owner/repo/issues/22',
        },
        {
          number: 23,
          title: 'feat: Gating',
          body: '',
          state: 'OPEN',
          labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
          url: 'https://github.com/owner/repo/issues/23',
        },
      ];

      mockExecutor.mockResolvedValueOnce({
        stdout: JSON.stringify(issuesPayload),
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const issues = await service.listIssues({
        state: 'all',
        limit: 50,
        labels: ['sandcastle'],
      });

      expect(issues).toHaveLength(2);
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'issue',
          'list',
          '--repo',
          'owner/repo',
          '--state',
          'all',
          '--limit',
          '50',
          '--label',
          'sandcastle',
          '--json',
          'number,title,body,state,labels,url',
        ],
        expect.any(Object)
      );
    });

    it('should add labels to an issue', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.addLabels(23, ['status blocked', 'needs-review']);

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['issue', 'edit', '23', '--repo', 'owner/repo', '--add-label', 'status blocked,needs-review'],
        expect.any(Object)
      );
    });

    it('should remove labels from an issue', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.removeLabels(23, ['status blocked']);

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['issue', 'edit', '23', '--repo', 'owner/repo', '--remove-label', 'status blocked'],
        expect.any(Object)
      );
    });

    it('should add comment to an issue', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.addComment(23, 'Autonomous verification passing.');

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['issue', 'comment', '23', '--repo', 'owner/repo', '--body', 'Autonomous verification passing.'],
        expect.any(Object)
      );
    });

    it('should close an issue with an optional comment', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: '',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.closeIssue(23, 'Completed autonomously via Sandcastle.');

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'issue',
          'close',
          '23',
          '--repo',
          'owner/repo',
          '--comment',
          'Completed autonomously via Sandcastle.',
        ],
        expect.any(Object)
      );
    });
  });

  describe('Pull Request Operations', () => {
    it('should create a PR and return parsed GitHubPullRequest', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: 'https://github.com/owner/repo/pull/42\n',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const pr = await service.createPullRequest({
        title: 'feat: implement gating evaluator',
        body: 'Closes #23',
        head: 'issue-23-gating',
        base: 'main',
      });

      expect(pr.number).toBe(42);
      expect(pr.url).toBe('https://github.com/owner/repo/pull/42');
      expect(pr.title).toBe('feat: implement gating evaluator');
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'pr',
          'create',
          '--repo',
          'owner/repo',
          '--title',
          'feat: implement gating evaluator',
          '--body',
          'Closes #23',
          '--head',
          'issue-23-gating',
          '--base',
          'main',
        ],
        expect.any(Object)
      );
    });

    it('should merge PR with specified strategy and delete branch', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: 'Merged pull request #42',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.mergePullRequest(42, {
        method: 'merge',
        auto: true,
        deleteBranch: true,
      });

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['pr', 'merge', '42', '--repo', 'owner/repo', '--merge', '--auto', '--delete-branch'],
        expect.any(Object)
      );
    });

    it('should merge PR with squash strategy when configured', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: 'Squashed and merged pull request #42',
        stderr: '',
        exitCode: 0,
      });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.mergePullRequest('issue-23-gating', {
        method: 'squash',
      });

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        ['pr', 'merge', 'issue-23-gating', '--repo', 'owner/repo', '--squash'],
        expect.any(Object)
      );
    });
  });

  describe('Diagnostic Blocker Reporting', () => {
    it('should label issue status blocked and post formatted audit comment', async () => {
      mockExecutor
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }) // edit add-label
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // comment

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.reportBlocker({
        issueNumber: 23,
        reason: 'Prerequisite issue #22 is still OPEN',
        evidence: 'gh issue view 22 state: OPEN',
        remediation: 'Merge and close issue #22 before resuming issue #23.',
      });

      expect(mockExecutor).toHaveBeenNthCalledWith(
        1,
        'gh',
        ['issue', 'edit', '23', '--repo', 'owner/repo', '--add-label', 'status blocked'],
        expect.any(Object)
      );

      expect(mockExecutor).toHaveBeenNthCalledWith(
        2,
        'gh',
        [
          'issue',
          'comment',
          '23',
          '--repo',
          'owner/repo',
          '--body',
          expect.stringContaining('## 🚫 Sandcastle Baton Blocked'),
        ],
        expect.any(Object)
      );
    });
  });

  describe('Parent Issue Progress Synchronization & Audit Comments', () => {
    it('should check off child task in parent issue body when checkbox line exists', async () => {
      const parentIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: '## Roadmap\n- [ ] #41: Parent classification\n- [ ] #42: Prompt template engine\n- [ ] #43: CLI execution scopes\n',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      mockExecutor
        .mockResolvedValueOnce({ stdout: JSON.stringify(parentIssue), stderr: '', exitCode: 0 }) // getIssue
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 }); // issue edit --body

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const updated = await service.syncParentChecklist(40, 42);

      expect(updated).toBe(true);
      expect(mockExecutor).toHaveBeenNthCalledWith(
        1,
        'gh',
        ['issue', 'view', '40', '--repo', 'owner/repo', '--json', 'number,title,body,state,labels,url,comments'],
        expect.any(Object)
      );
      expect(mockExecutor).toHaveBeenNthCalledWith(
        2,
        'gh',
        [
          'issue',
          'edit',
          '40',
          '--repo',
          'owner/repo',
          '--body',
          '## Roadmap\n- [ ] #41: Parent classification\n- [x] #42: Prompt template engine\n- [ ] #43: CLI execution scopes\n',
        ],
        expect.any(Object)
      );
    });

    it('should handle asterisk checkboxes and markdown link references for child tasks', async () => {
      const parentIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: '## Tasks\n* [ ] [#44: Parent direct run](https://github.com/owner/repo/issues/44)\n',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      mockExecutor
        .mockResolvedValueOnce({ stdout: JSON.stringify(parentIssue), stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const updated = await service.syncParentChecklist(40, 44);

      expect(updated).toBe(true);
      expect(mockExecutor).toHaveBeenNthCalledWith(
        2,
        'gh',
        [
          'issue',
          'edit',
          '40',
          '--repo',
          'owner/repo',
          '--body',
          '## Tasks\n* [x] [#44: Parent direct run](https://github.com/owner/repo/issues/44)\n',
        ],
        expect.any(Object)
      );
    });

    it('should return false and avoid edit when checkbox is already checked or no checkbox exists', async () => {
      const parentIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: '## Tasks\n- [x] #42: Already completed\n- Part of #43 without checkbox\n',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      mockExecutor.mockResolvedValueOnce({ stdout: JSON.stringify(parentIssue), stderr: '', exitCode: 0 });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      const updated = await service.syncParentChecklist(40, 42);

      expect(updated).toBe(false);
      expect(mockExecutor).toHaveBeenCalledTimes(1); // Only getIssue
    });

    it('should post a structured progress comment on the parent issue with changes, verification, and testing notes', async () => {
      mockExecutor.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const service = new GitHubService({ repo: 'owner/repo', executor: mockExecutor });
      await service.postParentProgressComment({
        parentNumber: 40,
        childNumber: 44,
        childTitle: 'feat: Parent Issue Direct Execution',
        changes: 'Implemented child expansion, parent checklist sync, and parentContext modes.',
        verification: '100% green unit tests and verification builds passed.',
        testingNotes: 'All 18 test suites passing cleanly with 0 regressions.',
      });

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        [
          'issue',
          'comment',
          '40',
          '--repo',
          'owner/repo',
          '--body',
          expect.stringContaining('## 📋 Child Issue Completed: #44 - feat: Parent Issue Direct Execution'),
        ],
        expect.any(Object)
      );

      const commentArg = mockExecutor.mock.calls[0][1][6];
      expect(commentArg).toContain('### Changes Implemented');
      expect(commentArg).toContain('Implemented child expansion, parent checklist sync, and parentContext modes.');
      expect(commentArg).toContain('### Verification Results');
      expect(commentArg).toContain('100% green unit tests and verification builds passed.');
      expect(commentArg).toContain('### Testing Notes');
      expect(commentArg).toContain('All 18 test suites passing cleanly with 0 regressions.');
      expect(commentArg).toContain('_Sandcastle autonomous parent progress synchronization._');
    });
  });
});

