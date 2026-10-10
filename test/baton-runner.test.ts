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
        execute: vi.fn().mockImplementation(() => {
          mockIssue.state = 'CLOSED';
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 1500,
            lastExitCode: 0,
          });
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
        execute: vi.fn().mockImplementation((workerOptions) => {
          const matched = mockIssues.find((i) => i.number === workerOptions.issueNumber);
          if (matched) matched.state = 'CLOSED';
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
        execute: vi.fn().mockImplementation(() => {
          childIssue.state = 'CLOSED';
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 800,
          });
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
          mockIssue.state = 'CLOSED';
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
        execute: vi.fn().mockImplementation((workerOptions) => {
          const matched = mockIssues.find((i) => i.number === workerOptions.issueNumber);
          if (matched) matched.state = 'CLOSED';
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
        execute: vi.fn().mockImplementation((workerOptions) => {
          const matched = mockIssues.find((i) => i.number === workerOptions.issueNumber);
          if (matched) matched.state = 'CLOSED';
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
          const matched = mockIssues.find((i) => i.number === workerOptions.issueNumber);
          if (matched) matched.state = 'CLOSED';
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

    it('should inject parent reference metadata into prompt context under parentContext: "reference" mode', async () => {
      const parentIssue: GitHubIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: 'Epic specification body',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
        url: 'https://github.com/owner/repo/issues/40',
      };

      const childIssue: GitHubIssue = {
        number: 44,
        title: 'Child Implementation',
        body: 'Part of #40\nRequirements here.',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/44',
      };

      const templatePath = path.join(tempDir, 'parent-ref-prompt.md');
      fs.writeFileSync(
        templatePath,
        'Issue: #{{issue.number}}\nParent: #{{parent.number}} - {{parent.title}}\nParentBody: {{parent.body}}'
      );

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => {
          if (num === 40) return Promise.resolve(parentIssue);
          if (num === 44) return Promise.resolve(childIssue);
          return Promise.resolve(null);
        }),
        syncParentChecklist: vi.fn().mockResolvedValue(true),
        postParentProgressComment: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        parseParentReferences: vi.fn().mockReturnValue([40]),
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 44,
          title: 'Child Implementation',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      let generatedPrompt = '';
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          generatedPrompt = workerOptions.prompt;
          childIssue.state = 'CLOSED';
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
        issues: [44],
        promptTemplate: templatePath,
        parentContext: 'reference',
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(generatedPrompt).toContain('Issue: #44');
      expect(generatedPrompt).toContain('Parent: #40 - Epic: Architecture');
      // In reference mode, parent.body is not inlined
      expect(generatedPrompt).toContain('ParentBody: ');
      expect(generatedPrompt).not.toContain('Epic specification body');
      expect(mockGitHubService.syncParentChecklist).toHaveBeenCalledWith(40, 44, 'owner/repo');
      expect(mockGitHubService.postParentProgressComment).toHaveBeenCalledWith(
        expect.objectContaining({
          parentNumber: 40,
          childNumber: 44,
          childTitle: 'Child Implementation',
          repo: 'owner/repo',
        })
      );
    });

    it('should inline parent issue body into prompt context under parentContext: "inline" mode', async () => {
      const parentIssue: GitHubIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: 'Full architecture specification and requirements.',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
        url: 'https://github.com/owner/repo/issues/40',
      };

      const childIssue: GitHubIssue = {
        number: 44,
        title: 'Child Implementation',
        body: 'Part of #40',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/44',
      };

      const templatePath = path.join(tempDir, 'parent-inline-prompt.md');
      fs.writeFileSync(
        templatePath,
        'Issue: #{{issue.number}}\nParent: #{{parent.number}} - {{parent.title}}\nParent Body Content:\n{{parent.body}}'
      );

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => {
          if (num === 40) return Promise.resolve(parentIssue);
          if (num === 44) return Promise.resolve(childIssue);
          return Promise.resolve(null);
        }),
        syncParentChecklist: vi.fn().mockResolvedValue(true),
        postParentProgressComment: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        parseParentReferences: vi.fn().mockReturnValue([40]),
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 44,
          title: 'Child Implementation',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      let generatedPrompt = '';
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          generatedPrompt = workerOptions.prompt;
          childIssue.state = 'CLOSED';
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
        issues: [44],
        promptTemplate: templatePath,
        parentContext: 'inline',
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(generatedPrompt).toContain('Issue: #44');
      expect(generatedPrompt).toContain('Parent: #40 - Epic: Architecture');
      expect(generatedPrompt).toContain('Full architecture specification and requirements.');
    });

    it('should omit parent issue metadata from prompt context under parentContext: "none" mode', async () => {
      const parentIssue: GitHubIssue = {
        number: 40,
        title: 'Epic: Architecture',
        body: 'Full architecture specification.',
        state: 'OPEN',
        labels: [{ name: 'epic' }],
      };

      const childIssue: GitHubIssue = {
        number: 44,
        title: 'Child Implementation',
        body: 'Part of #40',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const templatePath = path.join(tempDir, 'parent-none-prompt.md');
      fs.writeFileSync(
        templatePath,
        'Issue: #{{issue.number}}\nParentNum: {{parent.number}}\nParentTitle: {{parent.title}}'
      );

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn((num: number) => {
          if (num === 40) return Promise.resolve(parentIssue);
          if (num === 44) return Promise.resolve(childIssue);
          return Promise.resolve(null);
        }),
        syncParentChecklist: vi.fn().mockResolvedValue(true),
        postParentProgressComment: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        parseParentReferences: vi.fn().mockReturnValue([40]),
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 44,
          title: 'Child Implementation',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      let generatedPrompt = '';
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          generatedPrompt = workerOptions.prompt;
          childIssue.state = 'CLOSED';
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
        issues: [44],
        promptTemplate: templatePath,
        parentContext: 'none',
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(generatedPrompt).toContain('Issue: #44');
      expect(generatedPrompt).toContain('ParentNum: \n');
      expect(generatedPrompt).toContain('ParentTitle: ');
    });

    it('should forward explicit cwd to processSupervisor.execute', async () => {
      const mockIssue: GitHubIssue = {
        number: 50,
        title: 'CWD Forwarding Test',
        body: 'Testing cwd forwarding',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/50',
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 50,
          title: 'CWD Forwarding Test',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation(() => {
          mockIssue.state = 'CLOSED';
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 500,
          });
        }),
      };

      const targetCwd = path.join(tempDir, 'custom-project-root');
      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [50],
        cwd: targetCwd,
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: targetCwd,
        }),
        undefined
      );
    });

    it('should forward default process.cwd() to processSupervisor.execute when cwd option is omitted', async () => {
      const mockIssue: GitHubIssue = {
        number: 51,
        title: 'Default CWD Forwarding Test',
        body: 'Testing default cwd forwarding',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/51',
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        closeIssue: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 51,
          title: 'Default CWD Forwarding Test',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation(() => {
          mockIssue.state = 'CLOSED';
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
        issues: [51],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: process.cwd(),
        }),
        undefined
      );
    });
  });

  describe('Blocker Evidence Sanitization & Payload Bounding', () => {
    it('should strip ANSI escape sequences and bound evidence length when worker fails', async () => {
      const mockIssue: GitHubIssue = {
        number: 70,
        title: 'Failing Task',
        body: 'Do something',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
        closeIssue: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 70,
          title: 'Failing Task',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const ansiStderr =
        '\u001b[31mFAIL\u001b[39m test/sample.test.ts\n\u001b[1mError:\u001b[22m Verification failed\n' +
        'X'.repeat(35000);

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: false,
          status: 'failed',
          attempts: 2,
          totalDurationMs: 1200,
          error: 'Verification failed',
          lastStderr: ansiStderr,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [70],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const blockedEvents: any[] = [];
      runner.on('baton:blocked', (p) => blockedEvents.push(p));

      const result = await runner.run();

      expect(result.success).toBe(false);
      expect(result.blockedIssues).toEqual([70]);

      expect(blockedEvents).toHaveLength(1);
      const event = blockedEvents[0];
      expect(event.evidence).toBeDefined();
      expect(event.evidence).not.toContain('\u001b[');
      expect(event.evidence.length).toBeLessThanOrEqual(30000);
      expect(event.evidence).toContain('FAIL test/sample.test.ts');

      expect(mockGitHubService.reportBlocker).toHaveBeenCalledTimes(1);
      const blockerCall = mockGitHubService.reportBlocker.mock.calls[0][0];
      expect(blockerCall.evidence).not.toContain('\u001b[');
      expect(blockerCall.evidence.length).toBeLessThanOrEqual(30000);
      expect(blockerCall.evidence).toContain('FAIL test/sample.test.ts');
    });
  });

  describe('Live Issue Closure Verification & Corrective Retry Protocol (#71)', () => {
    it('should query GitHub for closure after worker exits 0 and complete cleanly when issue is CLOSED', async () => {
      const mockIssue: GitHubIssue = {
        number: 71,
        title: 'Issue Closure Verification',
        body: 'Verify closure',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn()
          // First call (gating): issue is OPEN
          .mockResolvedValueOnce(mockIssue)
          // Second call (post-worker verification): issue is CLOSED
          .mockResolvedValueOnce({ ...mockIssue, state: 'CLOSED' }),
        reportBlocker: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 71,
          title: 'Issue Closure Verification',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 600,
          lastExitCode: 0,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [71],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const retriesEmitted: any[] = [];
      runner.on('worker:retry', (p) => retriesEmitted.push(p));

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.closedIssues).toEqual([71]);
      expect(result.blockedIssues).toEqual([]);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledTimes(1);
      expect(retriesEmitted).toHaveLength(0);
      expect(mockGitHubService.getIssue).toHaveBeenCalledTimes(2);
      expect(mockGitHubService.reportBlocker).not.toHaveBeenCalled();
    });

    it('should trigger a single corrective retry when worker exits with code 0 but issue remains OPEN, and complete when corrective attempt closes issue', async () => {
      const mockIssue: GitHubIssue = {
        number: 71,
        title: 'Issue Closure Verification',
        body: 'Verify closure',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn()
          // First call (gating): OPEN
          .mockResolvedValueOnce(mockIssue)
          // Second call (after attempt 1): OPEN
          .mockResolvedValueOnce({ ...mockIssue, state: 'OPEN' })
          // Third call (after corrective attempt): CLOSED
          .mockResolvedValueOnce({ ...mockIssue, state: 'CLOSED' }),
        reportBlocker: vi.fn(),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 71,
          title: 'Issue Closure Verification',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const executedPrompts: string[] = [];
      const mockProcessSupervisor = {
        execute: vi.fn().mockImplementation((workerOptions) => {
          executedPrompts.push(workerOptions.prompt);
          return Promise.resolve({
            success: true,
            status: 'completed',
            attempts: 1,
            totalDurationMs: 500,
            lastExitCode: 0,
          });
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [71],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const retriesEmitted: any[] = [];
      runner.on('worker:retry', (p) => retriesEmitted.push(p));

      const phasesEmitted: any[] = [];
      runner.on('worker:phase', (p) => phasesEmitted.push(p));

      const result = await runner.run();

      expect(result.success).toBe(true);
      expect(result.closedIssues).toEqual([71]);
      expect(result.blockedIssues).toEqual([]);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledTimes(2);

      // Verify corrective retry event
      expect(retriesEmitted).toHaveLength(1);
      expect(retriesEmitted[0].issueNumber).toBe(71);
      expect(retriesEmitted[0].attempt).toBe(2);

      // Verify follow-up directive in corrective retry prompt
      expect(executedPrompts).toHaveLength(2);
      expect(executedPrompts[1]).toContain('pull request creation');
      expect(executedPrompts[1]).toContain('merge');
      expect(executedPrompts[1]).toContain('issue closure');

      expect(mockGitHubService.reportBlocker).not.toHaveBeenCalled();
    });

    it('should invoke blocker protocol and halt baton when issue remains OPEN after corrective retry', async () => {
      const mockIssue: GitHubIssue = {
        number: 71,
        title: 'Issue Closure Verification',
        body: 'Verify closure',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubService = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn()
          // First call (gating): OPEN
          .mockResolvedValueOnce(mockIssue)
          // Second call (after attempt 1): OPEN
          .mockResolvedValueOnce({ ...mockIssue, state: 'OPEN' })
          // Third call (after corrective retry): still OPEN
          .mockResolvedValueOnce({ ...mockIssue, state: 'OPEN' }),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
      };

      const mockGatingEvaluator = {
        evaluateIssue: vi.fn().mockResolvedValue({
          issueNumber: 71,
          title: 'Issue Closure Verification',
          state: 'OPEN',
          status: 'READY',
          isReady: true,
          reasons: ['Ready'],
        }),
      };

      const mockProcessSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 500,
          lastExitCode: 0,
        }),
      };

      const runner = new BatonRunner({
        repo: 'owner/repo',
        issues: [71],
        githubService: mockGitHubService as any,
        gatingEvaluator: mockGatingEvaluator as any,
        processSupervisor: mockProcessSupervisor as any,
        stateFilePath,
        mode: 'afk',
      });

      const blockedEvents: any[] = [];
      runner.on('baton:blocked', (p) => blockedEvents.push(p));

      const retriesEmitted: any[] = [];
      runner.on('worker:retry', (p) => retriesEmitted.push(p));

      const result = await runner.run();

      expect(result.success).toBe(false);
      expect(result.closedIssues).toEqual([]);
      expect(result.blockedIssues).toEqual([71]);
      expect(mockProcessSupervisor.execute).toHaveBeenCalledTimes(2);
      expect(retriesEmitted).toHaveLength(1);

      // Verify blocker protocol was invoked
      expect(mockGitHubService.reportBlocker).toHaveBeenCalledTimes(1);
      expect(mockGitHubService.reportBlocker).toHaveBeenCalledWith(
        expect.objectContaining({
          issueNumber: 71,
          reason: expect.stringContaining('remained OPEN'),
          repo: 'owner/repo',
        })
      );

      // Verify baton:blocked event
      expect(blockedEvents).toHaveLength(1);
      expect(blockedEvents[0].issueNumber).toBe(71);
      expect(blockedEvents[0].reason).toContain('remained OPEN');
    });
  });
});

