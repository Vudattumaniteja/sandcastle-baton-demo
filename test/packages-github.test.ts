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

    it('should build parent progress comment with child details', () => {
      const comment = buildParentProgressComment({
        parentNumber: 10,
        childNumber: 15,
        childTitle: 'Auth token support',
      });
      expect(comment).toContain('## 📋 Child Issue Completed: #15 - Auth token support');
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
  });
});
