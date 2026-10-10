import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  BatonOrchestrator,
  GatingEngine,
  PromptEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  parseParentReferences,
  parsePrerequisites,
  parseAcceptanceCriteria,
  resolveExecutionQueue,
  resolveExecutionScope,
  calculatePhaseBreakdown,
  assembleHandoffPayload,
  interpolatePrompt,
} from '#packages/orchestrator';
import { InMemoryRunStateStore, InMemoryConfigStore } from '#packages/state';
import type { GitHubIssue } from '../src/types/github.js';
import type { BatonHandoffPayload } from '../src/types/handoff.js';

describe('packages/orchestrator', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-orchestrator-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('dependency-parser', () => {
    it('should parse parent / epic references', () => {
      const body = 'Part of #10\nParent: #12\nEpic: #15\nParent Issue: #18';
      const parents = parseParentReferences(body);
      expect(parents).toEqual([10, 12, 15, 18]);
    });

    it('should parse prerequisite declarations', () => {
      const body = 'Blocked by: #21\nDepends on #22\nPrerequisites: #23, #24\nRequires: #25';
      const prereqs = parsePrerequisites(body);
      expect(prereqs).toEqual([21, 22, 23, 24, 25]);
    });

    it('should parse markdown task list checkboxes into acceptance criteria', () => {
      const body = '### Acceptance Criteria\n- [ ] Task 1\n- [x] Task 2\n- [X] Task 3';
      const criteria = parseAcceptanceCriteria(body);
      expect(criteria).toEqual([
        { text: 'Task 1', done: false },
        { text: 'Task 2', done: true },
        { text: 'Task 3', done: true },
      ]);
    });
  });

  describe('queue-builder', () => {
    it('should resolve only <N,M> sorted in ascending order', async () => {
      const queue = await resolveExecutionQueue({
        only: [35, 12, 28],
      });
      expect(queue).toEqual([12, 28, 35]);
    });

    it('should resolve from <N> sorted in ascending order from open issues', async () => {
      const fetchOpenIssues = vi.fn().mockResolvedValue([
        { number: 5 },
        { number: 10 },
        { number: 2 },
        { number: 20 },
      ]);
      const queue = await resolveExecutionQueue({
        from: 6,
        fetchOpenIssues,
      });
      expect(queue).toEqual([10, 20]);
    });

    it('should resolve all open issues sorted in ascending order', async () => {
      const fetchOpenIssues = vi.fn().mockResolvedValue([
        { number: 50 },
        { number: 12 },
        { number: 25 },
      ]);
      const queue = await resolveExecutionQueue({
        all: true,
        fetchOpenIssues,
      });
      expect(queue).toEqual([12, 25, 50]);
    });

    it('should preserve explicit scope targets if scope is passed directly', async () => {
      const queue = await resolveExecutionQueue({
        scope: { type: 'only', targets: [45, 42] },
      });
      expect(queue).toEqual([45, 42]);
    });
  });

  describe('prompt-interpolator & PromptEngine', () => {
    it('should interpolate mustache variables and aliases', () => {
      const template = 'Issue: #{{issue.number}} Title: {{issue.title}} Branch: {{branch.name}} Repo: {{repo.name}}';
      const result = interpolatePrompt(template, {
        issue: { number: 42, title: 'Deep Module Refactor' },
        branch: { name: 'issue-42-refactor' },
        repo: { name: 'sandcastle' },
      });
      expect(result).toBe('Issue: #42 Title: Deep Module Refactor Branch: issue-42-refactor Repo: sandcastle');
    });

    it('should inject retry diagnostics when feedback is present without placeholder', () => {
      const template = 'Solve issue #{{issue.number}}';
      const result = interpolatePrompt(template, {
        issue: { number: 42 },
        retry: { attempt: 2, maxAttempts: 3, feedback: 'Compilation error on line 50' },
      });
      expect(result).toContain('[Sandcastle Retry Context - Attempt 2/3]');
      expect(result).toContain('Compilation error on line 50');
    });

    it('should discover local and global templates via PromptEngine hierarchy', () => {
      const localDir = path.join(tempDir, 'project');
      const globalDir = path.join(tempDir, 'global');
      fs.mkdirSync(path.join(localDir, '.sandcastle'), { recursive: true });
      fs.mkdirSync(globalDir, { recursive: true });

      const localTemplatePath = path.join(localDir, '.sandcastle', 'worker-prompt.md');
      fs.writeFileSync(localTemplatePath, 'Local template for #{{issue.number}}');

      const engine = new PromptEngine({ cwd: localDir, globalDir });
      const loaded = engine.loadTemplate();

      expect(loaded.tier).toBe('local');
      expect(loaded.template).toBe('Local template for #{{issue.number}}');
      expect(loaded.source).toBe(localTemplatePath);
    });

    it('should fallback to built-in default template when no disk templates exist', () => {
      const engine = new PromptEngine({ cwd: tempDir, globalDir: path.join(tempDir, 'empty') });
      const loaded = engine.loadTemplate();
      expect(loaded.tier).toBe('default');
      expect(loaded.template).toBe(DEFAULT_WORKER_PROMPT_TEMPLATE);
    });
  });

  describe('handoff-calculator', () => {
    it('should calculate synthetic phase breakdown durations', () => {
      const breakdown = calculatePhaseBreakdown(10000);
      expect(breakdown.inspectMs).toBe(1000);
      expect(breakdown.implementMs).toBe(5000);
      expect(breakdown.testMs).toBe(3000);
      expect(breakdown.gitPrMs).toBe(1000);
    });

    it('should assemble a complete BatonHandoffPayload', () => {
      const payload = assembleHandoffPayload({
        mode: 'run',
        queueIndex: 0,
        totalQueue: 2,
        countdownSeconds: 3.0,
        currentIssue: {
          number: 1,
          title: 'First Issue',
          durationMs: 5000,
        },
        nextIssue: {
          number: 2,
          title: 'Second Issue',
          body: '- [ ] AC 1\n- [x] AC 2',
        },
      });

      expect(payload.countdownSeconds).toBe(3.0);
      expect(payload.completed.number).toBe(1);
      expect(payload.next.number).toBe(2);
      expect(payload.next.acceptanceCriteria).toEqual([
        { text: 'AC 1', done: false },
        { text: 'AC 2', done: true },
      ]);
    });
  });

  describe('GatingEngine', () => {
    it('should evaluate issue status: CLOSED, PARENT, HITL, UNGATED, and READY', async () => {
      const engine = new GatingEngine();

      const closedIssue: GitHubIssue = {
        number: 1,
        title: 'Closed issue',
        body: '',
        state: 'CLOSED',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const closedEval = await engine.evaluateIssue(closedIssue);
      expect(closedEval.status).toBe('CLOSED');
      expect(closedEval.isReady).toBe(false);

      const parentIssue: GitHubIssue = {
        number: 2,
        title: 'Epic issue',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'parent' }, { name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const parentEval = await engine.evaluateIssue(parentIssue);
      expect(parentEval.status).toBe('PARENT');
      expect(parentEval.isReady).toBe(false);

      const hitlIssue: GitHubIssue = {
        number: 3,
        title: 'HITL issue',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'wayfinder:grilling' }],
      };
      const hitlEval = await engine.evaluateIssue(hitlIssue);
      expect(hitlEval.status).toBe('HITL');
      expect(hitlEval.isReady).toBe(false);

      const ungatedIssue: GitHubIssue = {
        number: 4,
        title: 'Ungated issue',
        body: '',
        state: 'OPEN',
        labels: [],
      };
      const ungatedEval = await engine.evaluateIssue(ungatedIssue);
      expect(ungatedEval.status).toBe('UNGATED');
      expect(ungatedEval.missingLabels).toContain('ready-for-agent');
      expect(ungatedEval.missingLabels).toContain('AFK');

      const readyIssue: GitHubIssue = {
        number: 5,
        title: 'Ready issue',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const readyEval = await engine.evaluateIssue(readyIssue);
      expect(readyEval.status).toBe('READY');
      expect(readyEval.isReady).toBe(true);
    });

    it('should evaluate WAITING status when open prerequisites are present in backlog', async () => {
      const engine = new GatingEngine();
      const prereqIssue: GitHubIssue = {
        number: 10,
        title: 'Prerequisite',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const dependentIssue: GitHubIssue = {
        number: 11,
        title: 'Dependent',
        body: 'Blocked by: #10',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const backlogMap = await engine.evaluateBacklog([prereqIssue, dependentIssue]);
      expect(backlogMap.get(10)?.status).toBe('READY');
      expect(backlogMap.get(11)?.status).toBe('WAITING');
      expect(backlogMap.get(11)?.blockingIssueNumbers).toEqual([10]);
    });
  });

  describe('BatonOrchestrator Headless State Machine', () => {
    it('should execute dry-run with zero UI imports and emit all typed events', async () => {
      const mockIssue1: GitHubIssue = {
        number: 101,
        title: 'First Task',
        body: 'Task body 1',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/101',
      };
      const mockIssue2: GitHubIssue = {
        number: 102,
        title: 'Second Task',
        body: 'Task body 2',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
        url: 'https://github.com/owner/repo/issues/102',
      };

      const mockGitHubClient = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockImplementation((num: number) => {
          if (num === 101) return Promise.resolve(mockIssue1);
          if (num === 102) return Promise.resolve(mockIssue2);
          return Promise.resolve(null);
        }),
        listIssues: vi.fn().mockResolvedValue([mockIssue1, mockIssue2]),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
      };

      const mockSupervisor = {
        execute: vi.fn().mockResolvedValue({
          success: true,
          status: 'completed',
          attempts: 1,
          totalDurationMs: 100,
          lastExitCode: 0,
        }),
      };

      const runStateStore = new InMemoryRunStateStore();
      const configStore = new InMemoryConfigStore();

      const orchestrator = new BatonOrchestrator({
        repo: 'owner/repo',
        issues: [101, 102],
        mode: 'dry-run',
        githubClient: mockGitHubClient,
        workerSupervisor: mockSupervisor,
        runStateStore,
        configStore,
      });

      const events: string[] = [];
      const handoffs: BatonHandoffPayload[] = [];

      orchestrator.on('baton:start', (p) => events.push(`baton:start:${p.issues.join(',')}`));
      orchestrator.on('baton:gating', (p) => events.push(`baton:gating:${p.issueNumber}:${p.evaluation.status}`));
      orchestrator.on('worker:start', (p) => events.push(`worker:start:${p.issueNumber}`));
      orchestrator.on('worker:phase', (p) => events.push(`worker:phase:${p.issueNumber}:${p.phase}`));
      orchestrator.on('worker:complete', (p) => events.push(`worker:complete:${p.issueNumber}`));
      orchestrator.on('baton:handoff', (p) => handoffs.push(p));
      orchestrator.on('baton:finish', (p) => events.push(`baton:finish:${p.success}`));

      const result = await orchestrator.run();

      expect(result.success).toBe(true);
      expect(result.closedIssues).toEqual([101, 102]);
      expect(result.blockedIssues).toEqual([]);
      expect(handoffs).toHaveLength(1);
      expect(handoffs[0].completed.number).toBe(101);
      expect(handoffs[0].next.number).toBe(102);

      expect(events).toContain('baton:start:101,102');
      expect(events).toContain('baton:gating:101:READY');
      expect(events).toContain('worker:start:101');
      expect(events).toContain('worker:complete:101');
      expect(events).toContain('baton:finish:true');

      // Verify state snapshot
      const finalSnapshot = runStateStore.get();
      expect(finalSnapshot?.status).toBe('completed');
      expect(finalSnapshot?.closedCount).toBe(2);
    });

    it('should halt on blocked issue, emit baton:blocked, and record blocker', async () => {
      const mockIssue: GitHubIssue = {
        number: 55,
        title: 'Ungated issue',
        body: '',
        state: 'OPEN',
        labels: [], // Missing required labels
      };

      const mockGitHubClient = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockResolvedValue(mockIssue),
        listIssues: vi.fn().mockResolvedValue([mockIssue]),
        reportBlocker: vi.fn().mockResolvedValue(undefined),
      };

      const runStateStore = new InMemoryRunStateStore();
      const orchestrator = new BatonOrchestrator({
        repo: 'owner/repo',
        issues: [55],
        mode: 'afk',
        githubClient: mockGitHubClient,
        runStateStore,
      });

      const blockedEvents: any[] = [];
      orchestrator.on('baton:blocked', (p) => blockedEvents.push(p));

      const result = await orchestrator.run();

      expect(result.success).toBe(false);
      expect(result.blockedIssues).toEqual([55]);
      expect(blockedEvents).toHaveLength(1);
      expect(blockedEvents[0].issueNumber).toBe(55);
      expect(mockGitHubClient.reportBlocker).toHaveBeenCalledWith(
        expect.objectContaining({ issueNumber: 55 })
      );

      const finalSnapshot = runStateStore.get();
      expect(finalSnapshot?.status).toBe('blocked');
      expect(finalSnapshot?.blockedCount).toBe(1);
    });

    it('should invoke optional non-UI handoffHandler hook when provided', async () => {
      const mockIssue1: GitHubIssue = {
        number: 1,
        title: 'Issue 1',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };
      const mockIssue2: GitHubIssue = {
        number: 2,
        title: 'Issue 2',
        body: '',
        state: 'OPEN',
        labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }],
      };

      const mockGitHubClient = {
        getRepo: vi.fn().mockResolvedValue('owner/repo'),
        getIssue: vi.fn().mockImplementation((num: number) => {
          if (num === 1) return Promise.resolve(mockIssue1);
          if (num === 2) return Promise.resolve(mockIssue2);
          return Promise.resolve(null);
        }),
        listIssues: vi.fn().mockResolvedValue([mockIssue1, mockIssue2]),
      };

      const handoffHook = vi.fn().mockResolvedValue('continue');

      const orchestrator = new BatonOrchestrator({
        repo: 'owner/repo',
        issues: [1, 2],
        mode: 'dry-run',
        githubClient: mockGitHubClient,
        runStateStore: new InMemoryRunStateStore(),
        handoffHandler: handoffHook,
      });

      const result = await orchestrator.run();
      expect(result.success).toBe(true);
      expect(handoffHook).toHaveBeenCalledTimes(1);
      expect(handoffHook).toHaveBeenCalledWith(
        expect.objectContaining({
          completed: expect.objectContaining({ number: 1 }),
          next: expect.objectContaining({ number: 2 }),
        })
      );
    });
  });
});
