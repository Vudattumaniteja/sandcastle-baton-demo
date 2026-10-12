import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GitHubClient,
  stripAnsi,
  sanitizeBlockerEvidence,
  syncParentChecklistText,
  buildBlockerComment,
  buildParentProgressComment,
  type CommandExecutor,
} from '#packages/github';

describe('packages/github', () => {
  let mockExecutor: ReturnType<typeof vi.fn<CommandExecutor>>;

  beforeEach(() => {
    mockExecutor = vi.fn<CommandExecutor>();
  });

  describe('evidence-sanitizer', () => {
    it('should strip ansi codes from string', () => {
      const formatted = '\x1b[31mRed Alert\x1b[0m';
      expect(stripAnsi(formatted)).toBe('Red Alert');
    });

    it('should truncate blocker evidence exceeding limit', () => {
      const longText = 'a'.repeat(40000);
      const sanitized = sanitizeBlockerEvidence(longText, 100);
      expect(sanitized?.length).toBe(100);
    });
  });

  describe('checklist-sync', () => {
    it('should update checkbox for child issue', () => {
      const body = 'Parent issue body\n- [ ] #10 Child task\n- [ ] #11 Other task';
      const result = syncParentChecklistText(body, 10);
      expect(result.updated).toBe(true);
      expect(result.body).toContain('- [x] #10 Child task');
      expect(result.body).toContain('- [ ] #11 Other task');
    });

    it('should not update if child issue is not unchecked checkbox', () => {
      const body = 'Parent issue body\n- [x] #10 Child task';
      const result = syncParentChecklistText(body, 10);
      expect(result.updated).toBe(false);
    });
  });

  describe('comment-builder', () => {
    it('should build blocker comment with reason and remediation', () => {
      const comment = buildBlockerComment({
        issueNumber: 1,
        reason: 'Missing API key',
        remediation: 'Configure API key in environment',
      });
      expect(comment).toContain('## 🚫 Sandcastle Baton Blocked');
      expect(comment).toContain('**Reason:** Missing API key');
      expect(comment).toContain('### Remediation');
    });

    it('should build parent progress comment with child details and no fake telemetry defaults', () => {
      const comment = buildParentProgressComment({
        parentNumber: 10,
        childNumber: 15,
        childTitle: 'Auth token support',
      });
      expect(comment).toContain('## 📋 Child Issue Completed: #15 - Auth token support');
      expect(comment).toContain('No automated verification telemetry recorded.');
      expect(comment).not.toContain('100% green');
      expect(comment).not.toContain('0 failures');
    });
  });

  describe('GitHubClient', () => {
    it('should interact with gh CLI via executor', async () => {
      mockExecutor.mockResolvedValueOnce({
        stdout: JSON.stringify({ number: 5, title: 'Test issue', body: '', state: 'OPEN', labels: [] }),
        stderr: '',
        exitCode: 0,
      });

      const client = new GitHubClient({ repo: 'owner/repo', executor: mockExecutor });
      const issue = await client.getIssue(5);

      expect(issue?.number).toBe(5);
      expect(issue?.title).toBe('Test issue');
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'view', '5']),
        expect.any(Object)
      );
    });

    it('should create and merge PR with strategy', async () => {
      mockExecutor
        .mockResolvedValueOnce({
          stdout: 'https://github.com/owner/repo/pull/15\n',
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const client = new GitHubClient({ repo: 'owner/repo', executor: mockExecutor });
      const pr = await client.createPullRequest({
        title: 'Feature PR',
        body: 'Closes #5',
        head: 'issue-5',
        base: 'main',
      });

      expect(pr.number).toBe(15);
      expect(pr.url).toBe('https://github.com/owner/repo/pull/15');

      await client.mergePullRequest(15, { strategy: 'squash', autoMerge: true, deleteBranch: true });
      expect(mockExecutor).toHaveBeenLastCalledWith(
        'gh',
        expect.arrayContaining(['pr', 'merge', '15', '--squash', '--delete-branch']),
        expect.any(Object)
      );
    });

    it('should label issue blocked and post audit comment via reportBlocker', async () => {
      mockExecutor
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const client = new GitHubClient({ repo: 'owner/repo', executor: mockExecutor });
      await client.reportBlocker({
        issueNumber: 20,
        reason: 'Build failed after 3 attempts',
      });

      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'edit', '20', '--add-label', 'status blocked']),
        expect.any(Object)
      );
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'comment', '20']),
        expect.any(Object)
      );
    });

    it('should sync parent checklist and update parent issue body', async () => {
      mockExecutor
        .mockResolvedValueOnce({
          stdout: JSON.stringify({
            number: 10,
            title: 'Parent',
            body: '- [ ] #5 Child task',
            state: 'OPEN',
          }),
          stderr: '',
          exitCode: 0,
        })
        .mockResolvedValueOnce({
          stdout: '',
          stderr: '',
          exitCode: 0,
        });

      const client = new GitHubClient({ repo: 'owner/repo', executor: mockExecutor });
      const updated = await client.syncParentChecklist(10, 5);
      expect(updated).toBe(true);
      expect(mockExecutor).toHaveBeenCalledWith(
        'gh',
        expect.arrayContaining(['issue', 'edit', '10', '--body', '- [x] #5 Child task']),
        expect.any(Object)
      );
    });
  });
});
