import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { BatonRunner, buildDefaultWorkerPrompt } from '../src/core/baton-runner.js';
import type { GitHubIssue } from '../src/types/github.js';
import type { BatonRunSnapshot } from '../src/types/baton.js';

describe('BatonRunner & Worker Prompt Construction', () => {
  let tempDir: string;
  let stateFilePath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-baton-test-'));
    stateFilePath = path.join(tempDir, '.sandcastle', 'run.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('buildDefaultWorkerPrompt', () => {
    it('should dynamically construct prompt with issue number, URL, and explicit implement/tdd instructions', () => {
      const prompt = buildDefaultWorkerPrompt('owner/repo', 25, 'https://github.com/owner/repo/issues/25');

      expect(prompt).toContain('issue #25');
      expect(prompt).toContain('https://github.com/owner/repo/issues/25');
      expect(prompt).toContain('implement');
      expect(prompt).toContain('tdd');
      expect(prompt).toContain('100% green');
      expect(prompt).toContain('gh pr create');
      expect(prompt).toContain('gh pr merge --merge');
      expect(prompt).toContain('gh issue close 25');
    });

    it('should generate fallback issue URL if not explicitly provided', () => {
      const prompt = buildDefaultWorkerPrompt('owner/repo', 10);
      expect(prompt).toContain('https://github.com/owner/repo/issues/10');
    });
  });

  describe('BatonRunner Event-Driven State Machine', () => {
    it('should run a single ready issue through the full worker lifecycle and emit all typed events', async () => {
      const mockIssue: GitHubIssue = {
        number: 25,
        title: 'Core Baton Runner',
        body: 'Implement BatonRunner',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/25',
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        listIssues: vi.fn().mockResolvedValue([mockIssue]),
        closeIssue: vi.fn().mockResolvedValue(undefined),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
        addComment: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 25,
          title: 'Core Baton Runner',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          hasReadyLabel: true,
          hasAfkLabel: true,
          isBlockedLabelPresent: false,
          missingLabels: [],
          prerequisiteIssueNumbers: [],
          blockingIssueNumbers: [],
          reasons: ['All gate conditions satisfied.'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 1500,
          lastExitCode: 0,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [25],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const eventsReceived: string[] = [];
      runner.on('baton:start', (p) => eventsReceived.push(`baton:start:${p.issues.join(',')}`));
      runner.on('baton:gating', (p) => eventsReceived.push(`baton:gating:${p.issueNumber}:${p.evaluation.status}`));
      runner.on('worker:start', (p) => eventsReceived.push(`worker:start:${p.issueNumber}`));
      runner.on('worker:phase', (p) => eventsReceived.push(`worker:phase:${p.issueNumber}:${p.phase}`));
      runner.on('worker:complete', (p) => eventsReceived.push(`worker:complete:${p.issueNumber}`));
      runner.on('baton:finish', (p) => eventsReceived.push(`baton:finish:${p.success}`));

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(1);
      expect(result.closedIssues).toEqual([25]);
      expect(result.blockedIssues).toEqual([]);

      expect(eventsReceived).toContain('baton:start:25');
      expect(eventsReceived).toContain('baton:gating:25:READY');
      expect(eventsReceived).toContain('worker:start:25');
      expect(eventsReceived).toContain('worker:complete:25');
      expect(eventsReceived).toContain('baton:finish:true');

      // Verify snapshot was written to state file
      expect(fs.existsSync(stateFilePath)).toBe(true);
      const snapshot: BatonRunSnapshot = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(snapshot.status).toBe('completed');
      expect(snapshot.closedCount).toBe(1);
      expect(snapshot.processedIssues[0].number).toBe(25);
    });

    it('should halt and emit baton:blocked when issue fails gating', async () => {
      const mockIssue: GitHubIssue = {
        number: 30,
        title: 'Ungated Issue',
        body: 'Missing labels',
        state: 'OPEN',
        labels: [],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 30,
          title: 'Ungated Issue',
          state: 'OPEN',
          status: 'UNGATED',
          isReady: false,
          missingLabels: ['ready-for-agent', 'AFK'],
          reasons: ['Missing required gate labels: ready-for-agent, AFK'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn(),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [30],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
      });

      const blockedEvents: any[] = [];
      runner.on('baton:blocked', (p) => blockedEvents.push(p));

      const result = await runner.run();

      expect(result.success).toBe(false);
      expect(result.blockedIssues).toEqual([30]);
      expect(blockedEvents.length).toBe(1);
      expect(blockedEvents[0].issueNumber).toBe(30);
      expect(mockProcessSupervisor.execute).not.toHaveBeenCalled();
      expect(mockGitHubService.reportBlocker).toHaveBeenCalled();
    });

    it('should handle dry-run mode without spawning process supervisor or mutating github', async () => {
      const mockIssue: GitHubIssue = {
        number: 42,
        title: 'Dry Run Issue',
        body: 'No execution',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        reportBlocker: vi.fn(),
        closeIssue: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 42,
          title: 'Dry Run Issue',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          missingLabels: [],
          reasons: ['All gate conditions satisfied.'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn(),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [42],
        mode: 'dry-run',
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(mockProcessSupervisor.execute).not.toHaveBeenCalled();
      expect(mockGitHubService.closeIssue).not.toHaveBeenCalled();

      const snapshot: BatonRunSnapshot = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(snapshot.mode).toBe('dry-run');
    });

    it('should automatically discover all open issues when all=true', async () => {
      const mockIssues: GitHubIssue[] = [
        {
          number: 1,
          title: 'Issue 1',
          body: '',
          state: 'OPEN',
          labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        },
        {
          number: 2,
          title: 'Issue 2',
          body: '',
          state: 'OPEN',
          labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        },
      ];

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => Promise.resolve(mockIssues.find((i) => i.number === num))),
        listIssues: vi.fn().mockResolvedValue(mockIssues),
        reportBlocker: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn((issue: GitHubIssue) =>
          Promise.resolve({
            issueNumber: issue.number,
            title: issue.title,
            state: 'OPEN',
            status: 'READY',
            isReady: true,
            missingLabels: [],
            reasons: [],
          })
        ),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 500,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        all: true,
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(2);
      expect(result.closedIssues).toEqual([1, 2]);
    });

    it('should skip PARENT and HITL issues with informational skip message and advance cleanly', async () => {
      const parentIssue: GitHubIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: 'Parent epic specification',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      const hitlIssue: GitHubIssue = {
        number: 41,
        title: 'Interview: Spec alignment',
        body: 'Needs human review',
        state: 'OPEN',
        labels: [{ name: 'wayfinder:grilling' }],
      };

      const childIssue: GitHubIssue = {
        number: 42,
        title: 'feat: Child Implementation',
        body: 'Part of #40',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => {
          if (num === 40) return Promise.resolve(parentIssue);
          if (num === 41) return Promise.resolve(hitlIssue);
          if (num === 42) return Promise.resolve(childIssue);
          return Promise.resolve(undefined);
        }),
        reportBlocker: vi.fn(),
        closeIssue: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn((issue: GitHubIssue) => {
          if (issue.number === 40) {
            return Promise.resolve({
              issueNumber: 40,
              title: issue.title,
              state: 'OPEN',
              status: 'PARENT',
              isReady: false,
              missingLabels: [],
              prerequisiteIssueNumbers: [],
              blockingIssueNumbers: [],
              reasons: ['Issue is classified as a parent/epic specification.'],
            });
          }
          if (issue.number === 41) {
            return Promise.resolve({
              issueNumber: 41,
              title: issue.title,
              state: 'OPEN',
              status: 'HITL',
              isReady: false,
              missingLabels: [],
              prerequisiteIssueNumbers: [],
              blockingIssueNumbers: [],
              reasons: ['Issue requires human-in-the-loop interaction.'],
            });
          }
          return Promise.resolve({
            issueNumber: 42,
            title: issue.title,
            state: 'OPEN',
            status: 'READY',
            isReady: true,
            missingLabels: [],
            prerequisiteIssueNumbers: [],
            blockingIssueNumbers: [],
            reasons: ['All gate conditions satisfied.'],
          });
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 800,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [40, 41, 42],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const blockedEvents: any[] = [];
      runner.on('baton:blocked', (p) => blockedEvents.push(p));

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.closedIssues).toEqual([42]);
      expect(result.blockedIssues).toEqual([]);
      expect(blockedEvents).toEqual([]);
      expect(mockGitHubService.reportBlocker).not.toHaveBeenCalled();
      expect(mockProcessSupervisor.execute).toHaveBeenCalledTimes(1);

      // Verify skip logs
      const logCalls = consoleSpy.mock.calls.map((call) => call[0]);
      expect(logCalls.some((msg) => typeof msg === 'string' && msg.includes('[SKIP] Skipping parent/HITL issue #40'))).toBe(true);
      expect(logCalls.some((msg) => typeof msg === 'string' && msg.includes('[SKIP] Skipping parent/HITL issue #41'))).toBe(true);

      // Verify state snapshot
      const snapshot: BatonRunSnapshot = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(snapshot.status).toBe('completed');
      expect(snapshot.processedIssues).toHaveLength(3);
      expect(snapshot.processedIssues[0]).toMatchObject({ number: 40, status: 'skipped' });
      expect(snapshot.processedIssues[1]).toMatchObject({ number: 41, status: 'skipped' });
      expect(snapshot.processedIssues[2]).toMatchObject({ number: 42, status: 'completed' });

      consoleSpy.mockRestore();
    });

    it('should interpolate custom prompt template when specified in BatonRunner options', async () => {
      const templatePath = path.join(tempDir, 'custom-worker-prompt.md');
      fs.writeFileSync(
        templatePath,
        'Custom prompt for #{{issue.number}}: {{issue.title}} on repo {{repo}} under branch {{branch.name}}'
      );

      const mockIssue: GitHubIssue = {
        number: 42,
        title: 'Prompt Engine Support',
        body: 'Part of #40',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/42',
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 42,
          title: 'Prompt Engine Support',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      let executedPrompt = '';
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          executedPrompt = workerOptions.prompt;
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 500,
          });
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [42],
        promptTemplate: templatePath,
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledTimes(1);
      expect(executedPrompt).toContain('Custom prompt for #42: Prompt Engine Support on repo owner/repo');
      expect(executedPrompt).toContain('under branch issue-42-prompt-engine-support');
    });

    it('should resolve queue for scope { type: "from", target } starting from target when open and record scope in snapshot', async () => {
      const mockIssues: GitHubIssue[] = [
        { number: 10, title: 'Old Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
        { number: 20, title: 'Target Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
        { number: 25, title: 'Future Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
      ];

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => Promise.resolve(mockIssues.find((i) => i.number === num))),
        listIssues: vi.fn().mockResolvedValue(mockIssues),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn((issue: GitHubIssue) =>
          Promise.resolve({
            issueNumber: issue.number,
            title: issue.title,
            state: 'OPEN',
            status: 'READY',
            isReady: true,
            reasons: ['Ready'],
          })
        ),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 300,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        scope: { type: 'from', target: 20 },
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(2);
      expect(result.closedIssues).toEqual([20, 25]);

      // Check snapshot
      const snapshot: BatonRunSnapshot = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(snapshot.scope).toEqual({ type: 'from', target: 20 });
    });

    it('should resolve queue for scope { type: "from", target } starting from next lowest open issue if target is closed', async () => {
      // Issue 20 is closed, so listIssues only returns open issues: 10, 22, 25
      const mockIssues: GitHubIssue[] = [
        { number: 10, title: 'Old Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
        { number: 22, title: 'Next Open Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
        { number: 25, title: 'Future Issue', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
      ];

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => Promise.resolve(mockIssues.find((i) => i.number === num))),
        listIssues: vi.fn().mockResolvedValue(mockIssues),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn((issue: GitHubIssue) =>
          Promise.resolve({
            issueNumber: issue.number,
            title: issue.title,
            state: 'OPEN',
            status: 'READY',
            isReady: true,
            reasons: ['Ready'],
          })
        ),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 300,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        from: 20,
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(2);
      expect(result.closedIssues).toEqual([22, 25]);
    });

    it('should resolve queue for scope { type: "only", targets } in exact specified order and halt', async () => {
      const mockIssues: GitHubIssue[] = [
        { number: 45, title: 'Issue 45', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
        { number: 42, title: 'Issue 42', body: '', state: 'OPEN', labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] },
      ];

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => Promise.resolve(mockIssues.find((i) => i.number === num))),
        listIssues: vi.fn().mockResolvedValue(mockIssues),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn((issue: GitHubIssue) =>
          Promise.resolve({
            issueNumber: issue.number,
            title: issue.title,
            state: 'OPEN',
            status: 'READY',
            isReady: true,
            reasons: ['Ready'],
          })
        ),
      };

      const executedIssues: number[] = [];
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          executedIssues.push(workerOptions.issueNumber);
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 300,
          });
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        scope: { type: 'only', targets: [45, 42] },
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.totalProcessed).toBe(2);
      expect(result.closedIssues).toEqual([45, 42]);
      expect(executedIssues).toEqual([45, 42]);

      const snapshot: BatonRunSnapshot = JSON.parse(fs.readFileSync(stateFilePath, 'utf-8'));
      expect(snapshot.scope).toEqual({ type: 'only', targets: [45, 42] });
    });
  });
});
