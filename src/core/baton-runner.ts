import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import type {
  BatonEventMap,
  BatonRunnerOptions,
  BatonRunSnapshot,
  BatonFinishPayload,
  ProcessedIssueSummary,
  ExecutionScope,
} from '../types/baton.js';
import type { BatonHandoffPayload } from '../types/handoff.js';
import { runHandoffTransition } from '../ui/handoff-transition.js';
import { GitHubService } from '../services/github-service.js';
import { AntigravityService } from '../services/antigravity-service.js';
import { ConfigService } from '../services/config-service.js';
import { GatingEvaluator } from './gating-evaluator.js';
import { ProcessSupervisor } from './process-supervisor.js';
import {
  PromptTemplateEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
} from './prompt-template.js';
import type { TemplateContext } from './prompt-template.js';

export function parseAcceptanceCriteria(
  body: string
): Array<{ text: string; done: boolean }> {
  if (!body) return [];
  const lines = body.split('\n');
  const criteria: Array<{ text: string; done: boolean }> = [];
  for (const line of lines) {
    const match = line.match(/^\s*-\s*\[([ xX])\]\s*(.+)$/);
    if (match) {
      criteria.push({
        text: match[2].trim(),
        done: match[1].toLowerCase() === 'x',
      });
    }
  }
  return criteria;
}

export function buildDefaultWorkerPrompt(
  repo: string,
  issueNumber: number,
  issueUrl?: string
): string {
  const engine = new PromptTemplateEngine();
  const url = issueUrl || `https://github.com/${repo}/issues/${issueNumber}`;
  return engine.interpolate(DEFAULT_WORKER_PROMPT_TEMPLATE, {
    issue: {
      number: issueNumber,
      url,
    },
  });
}

export class BatonRunner extends EventEmitter {
  private options: BatonRunnerOptions;
  private githubService: GitHubService;
  private antigravityService: AntigravityService;
  private gatingEvaluator: GatingEvaluator;
  private processSupervisor: ProcessSupervisor;
  private promptTemplateEngine: PromptTemplateEngine;
  private configService: ConfigService;
  private stateFilePath: string;
  private cwd: string;

  constructor(options: BatonRunnerOptions = {}) {
    super();
    this.options = options;
    this.cwd = options.cwd ?? process.cwd();
    const cwd = this.cwd;
    this.configService = options.configService ?? new ConfigService({ cwd });
    this.promptTemplateEngine =
      options.promptTemplateEngine ?? new PromptTemplateEngine({ cwd });

    this.githubService =
      options.githubService ?? new GitHubService({ repo: options.repo });
    this.antigravityService =
      options.antigravityService ?? new AntigravityService();
    const resolvedConfig = this.configService.resolve(options);
    this.gatingEvaluator =
      options.gatingEvaluator ??
      new GatingEvaluator({
        githubService: this.githubService,
        parentLabels: resolvedConfig.parentLabels,
        hitlLabels: resolvedConfig.hitlLabels,
      });
    this.processSupervisor =
      options.processSupervisor ??
      new ProcessSupervisor({
        antigravityService: this.antigravityService,
        maxRetries: options.retries ?? 2,
      });

    this.stateFilePath =
      options.stateFilePath ?? path.join(cwd, '.sandcastle', 'run.json');
  }

  // Type-safe event overrides
  override emit<E extends keyof BatonEventMap>(
    event: E,
    ...args: Parameters<BatonEventMap[E]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<E extends keyof BatonEventMap>(
    event: E,
    listener: BatonEventMap[E]
  ): this {
    return super.on(event, listener as any);
  }

  /**
   * Writes the current baton execution snapshot to state file.
   */
  private saveSnapshot(snapshot: BatonRunSnapshot): void {
    try {
      const dir = path.dirname(this.stateFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(
        this.stateFilePath,
        JSON.stringify(snapshot, null, 2),
        'utf-8'
      );
    } catch {
      // Ignore write errors to prevent interrupting run
    }
  }

  /**
   * Runs the sequential issue baton state machine.
   */
  async run(): Promise<BatonFinishPayload> {
    const startTime = Date.now();
    const config = this.configService.resolve(this.options);
    const targetRepo = await this.githubService.getRepo(config.repo || this.options.repo);
    const mode = (this.options.mode || config.mode || 'afk') as
      | 'afk'
      | 'supervised'
      | 'dry-run';

    // Resolve effective scope
    let scope: ExecutionScope | undefined = this.options.scope;
    if (!scope) {
      if (this.options.all) {
        scope = { type: 'all' };
      } else if (this.options.from !== undefined) {
        scope = { type: 'from', target: this.options.from };
      } else if (this.options.only && this.options.only.length > 0) {
        scope = { type: 'only', targets: this.options.only };
      } else if (this.options.issues && this.options.issues.length > 0) {
        scope = { type: 'only', targets: this.options.issues };
      }
    }

    // Resolve queue of issues to run
    let queue: number[] = [];
    if (scope?.type === 'all') {
      const openIssues = await this.githubService.listIssues({
        repo: targetRepo,
        state: 'open',
      });
      queue = openIssues.map((i) => i.number).sort((a, b) => a - b);
    } else if (scope?.type === 'from') {
      const startNum = scope.target;
      const openIssues = await this.githubService.listIssues({
        repo: targetRepo,
        state: 'open',
      });
      queue = openIssues
        .filter((i) => i.number >= startNum)
        .map((i) => i.number)
        .sort((a, b) => a - b);
    } else if (scope?.type === 'only') {
      queue = [...scope.targets];
    } else if (this.options.issues && this.options.issues.length > 0) {
      queue = [...this.options.issues];
    } else if (this.options.all) {
      const openIssues = await this.githubService.listIssues({
        repo: targetRepo,
        state: 'open',
      });
      queue = openIssues.map((i) => i.number).sort((a, b) => a - b);
    }

    const sessionId = `baton-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const processedIssues: ProcessedIssueSummary[] = [];
    const closedIssues: number[] = [];
    const blockedIssues: number[] = [];

    const snapshot: BatonRunSnapshot = {
      sessionId,
      startTime: new Date(startTime).toISOString(),
      status: 'running',
      repo: targetRepo,
      mode,
      scope,
      processedIssues,
      totalIssues: queue.length,
      closedCount: 0,
      blockedCount: 0,
      lastUpdated: new Date().toISOString(),
    };

    this.saveSnapshot(snapshot);

    this.emit('baton:start', {
      repo: targetRepo,
      mode,
      issues: queue,
      scope,
      model: config.model,
      autoPr: config.autoPr,
      autoMerge: config.autoMerge,
    });

    for (let queueIdx = 0; queueIdx < queue.length; queueIdx++) {
      const issueNumber = queue[queueIdx];
      if (this.options.signal?.aborted) {
        snapshot.status = 'aborted';
        snapshot.endTime = new Date().toISOString();
        this.saveSnapshot(snapshot);
        break;
      }

      snapshot.currentIssue = issueNumber;
      snapshot.lastUpdated = new Date().toISOString();
      this.saveSnapshot(snapshot);

      const issue = await this.githubService.getIssue(issueNumber, targetRepo);
      if (!issue) {
        const reason = `Issue #${issueNumber} not found or inaccessible`;
        this.emit('baton:blocked', { issueNumber, reason });
        blockedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: 'Not Found',
          status: 'blocked',
          durationMs: 0,
          error: reason,
        });
        snapshot.blockedCount++;
        snapshot.status = 'blocked';
        break;
      }

      const evaluation = await this.gatingEvaluator.evaluateIssue(issue, targetRepo);
      this.emit('baton:gating', { issueNumber, evaluation });

      if (evaluation.status === 'PARENT' || evaluation.status === 'HITL') {
        console.log(`[SKIP] Skipping parent/HITL issue #${issueNumber}`);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'skipped',
          durationMs: 0,
        });
        continue;
      }

      if (!evaluation.isReady) {
        const reason = evaluation.reasons.join('; ') || 'Issue gates not satisfied';
        this.emit('baton:blocked', {
          issueNumber,
          reason,
          remediation: `Ensure issue is OPEN and has labels 'ready-for-agent' and 'AFK'.`,
        });

        if (mode !== 'dry-run') {
          await this.githubService.reportBlocker({
            issueNumber,
            reason,
            repo: targetRepo,
            remediation: `Ensure issue is OPEN and has labels 'ready-for-agent' and 'AFK'.`,
          });
        }

        blockedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'blocked',
          durationMs: 0,
          error: reason,
        });
        snapshot.blockedCount++;
        snapshot.status = 'blocked';
        break;
      }

      // Ready to execute
      const issueStartTime = Date.now();
      const maxRetries = this.options.retries ?? config.retries ?? 2;
      const maxAttempts = 1 + maxRetries;

      this.emit('worker:start', {
        issueNumber,
        title: issue.title,
        attempt: 1,
        maxAttempts,
      });

      if (mode === 'dry-run') {
        const dryPhases: Array<
          'inspect' | 'implement' | 'test' | 'commit' | 'pr' | 'merge' | 'close'
        > = ['inspect', 'implement', 'test', 'commit', 'pr', 'merge', 'close'];

        for (const phase of dryPhases) {
          this.emit('worker:phase', {
            issueNumber,
            phase,
            message: `[Dry Run] Simulated step: ${phase}`,
          });
        }

        const durationMs = Date.now() - issueStartTime;
        this.emit('worker:complete', { issueNumber, durationMs });
        closedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'completed',
          durationMs,
        });
        snapshot.closedCount++;

        if (queueIdx + 1 < queue.length) {
          const nextNum = queue[queueIdx + 1];
          const action = await this.processHandoff(
            issue,
            durationMs,
            nextNum,
            closedIssues.length,
            queue.length,
            targetRepo,
            mode,
            config,
            snapshot
          );
          if (action === 'skip') {
            queueIdx++;
          } else if (action === 'abort') {
            snapshot.status = 'aborted';
            break;
          }
        }
        continue;
      }

      // Live Execution with ProcessSupervisor & PromptTemplateEngine
      const { template: rawTemplate } = this.promptTemplateEngine.loadTemplate(
        this.options.promptTemplate,
        config.promptTemplate
      );

      const labelsList = (issue.labels || []).map((l: any) =>
        typeof l === 'string' ? l : l.name || ''
      );
      const [repoOwner, repoName] = targetRepo.includes('/')
        ? targetRepo.split('/')
        : ['', targetRepo];
      const titleSlug = (issue.title || '')
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 30);
      const branchName = `issue-${issueNumber}-${titleSlug || 'worker'}`;

      const parentNumbers =
        typeof this.gatingEvaluator.parseParentReferences === 'function'
          ? this.gatingEvaluator.parseParentReferences(issue.body || '')
          : (issue.body?.match(/(?:Part of|Parent(?: Issue)?|Epic)[:\s]+#(\d+)/gi) || []).map((m: string) => {
              const num = m.match(/\d+/);
              return num ? parseInt(num[0], 10) : 0;
            }).filter((n: number) => n > 0);
      const parentNumber = parentNumbers.length > 0 ? parentNumbers[0] : undefined;
      const parentContextMode = (this.options.parentContext ?? config.parentContext ?? 'reference') as
        | 'reference'
        | 'inline'
        | 'none';

      let parentObj:
        | {
            number?: number | string;
            title?: string;
            url?: string;
            body?: string;
          }
        | undefined = undefined;

      let parentNumberAlias: number | undefined = undefined;
      let parentTitleAlias: string | undefined = undefined;
      let parentUrlAlias: string | undefined = undefined;
      let parentBodyAlias: string | undefined = undefined;

      if (parentContextMode !== 'none' && parentNumber !== undefined) {
        let parentIssueObj: any = null;
        try {
          parentIssueObj = await this.githubService.getIssue(parentNumber, targetRepo);
        } catch {
          // Ignore fetch error, fallback to basic metadata
        }

        const parentUrl =
          parentIssueObj?.url || `https://github.com/${targetRepo}/issues/${parentNumber}`;
        const parentTitle = parentIssueObj?.title || '';
        const parentBody =
          parentContextMode === 'inline' ? parentIssueObj?.body || '' : undefined;

        parentObj = {
          number: parentNumber,
          title: parentTitle,
          url: parentUrl,
          ...(parentBody !== undefined ? { body: parentBody } : {}),
        };

        parentNumberAlias = parentNumber;
        parentTitleAlias = parentTitle;
        parentUrlAlias = parentUrl;
        parentBodyAlias = parentBody;
      }

      const templateContext: TemplateContext = {
        issue: {
          number: issueNumber,
          title: issue.title,
          body: issue.body || '',
          url: issue.url || `https://github.com/${targetRepo}/issues/${issueNumber}`,
          labels: labelsList,
          state: issue.state || 'OPEN',
        },
        repo: {
          name: repoName,
          owner: repoOwner,
          full: targetRepo,
        },
        branch: {
          name: branchName,
        },
        parent: parentObj,
        retry: {
          attempt: 1,
          maxAttempts,
          feedback: '',
        },
        issueNumber,
        issueTitle: issue.title,
        issueBody: issue.body || '',
        issueUrl: issue.url || `https://github.com/${targetRepo}/issues/${issueNumber}`,
        branchName,
        parentNumber: parentNumberAlias,
        parentTitle: parentTitleAlias,
        parentUrl: parentUrlAlias,
        parentBody: parentBodyAlias,
        parentContext: parentContextMode,
      };

      const workerPrompt = this.promptTemplateEngine.interpolate(
        rawTemplate,
        templateContext
      );

      this.emit('worker:phase', {
        issueNumber,
        phase: 'implement',
        message: 'Launching Antigravity worker session',
      });

      const superviseResult = await this.processSupervisor.execute(
        {
          repo: targetRepo,
          issueNumber,
          prompt: workerPrompt,
          model: this.options.model ?? config.model,
          reasoningEffort:
            this.options.reasoningEffort ?? config.reasoningEffort,
          timeout: this.options.timeout ?? config.timeout,
          cwd: this.cwd,
        },
        this.options.signal
      );

      const issueDurationMs = Date.now() - issueStartTime;

      if (superviseResult.success) {
        // Sync parent checklist and post progress comment on parent issues
        if (parentNumbers.length > 0) {
          for (const parentNum of parentNumbers) {
            try {
              await this.githubService.syncParentChecklist(parentNum, issueNumber, targetRepo);
            } catch {
              // Ignore checklist sync errors
            }
            try {
              await this.githubService.postParentProgressComment({
                parentNumber: parentNum,
                childNumber: issueNumber,
                childTitle: issue.title,
                repo: targetRepo,
              });
            } catch {
              // Ignore progress comment errors
            }
          }
        }

        this.emit('worker:phase', {
          issueNumber,
          phase: 'close',
          message: 'Verifying closure',
        });
        this.emit('worker:complete', {
          issueNumber,
          durationMs: issueDurationMs,
        });

        closedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'completed',
          durationMs: issueDurationMs,
        });
        snapshot.closedCount++;

        if (queueIdx + 1 < queue.length) {
          const nextNum = queue[queueIdx + 1];
          const action = await this.processHandoff(
            issue,
            issueDurationMs,
            nextNum,
            closedIssues.length,
            queue.length,
            targetRepo,
            mode,
            config,
            snapshot,
            branchName
          );
          if (action === 'skip') {
            queueIdx++;
          } else if (action === 'abort') {
            snapshot.status = 'aborted';
            break;
          }
        }
      } else {
        const errorReason =
          superviseResult.error || 'Execution failed verification';

        this.emit('baton:blocked', {
          issueNumber,
          reason: errorReason,
          evidence: superviseResult.lastStderr || superviseResult.lastStdout,
        });

        await this.githubService.reportBlocker({
          issueNumber,
          reason: errorReason,
          evidence: superviseResult.lastStderr || superviseResult.lastStdout,
          repo: targetRepo,
        });

        blockedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'blocked',
          durationMs: issueDurationMs,
          error: errorReason,
        });
        snapshot.blockedCount++;
        snapshot.status = 'blocked';
        break; // Stop sequential loop on blocker
      }
    }

    const totalDurationMs = Date.now() - startTime;
    const finalSuccess = blockedIssues.length === 0;

    snapshot.status = finalSuccess ? 'completed' : 'blocked';
    snapshot.endTime = new Date().toISOString();
    snapshot.lastUpdated = new Date().toISOString();
    delete snapshot.currentIssue;
    this.saveSnapshot(snapshot);

    const finishPayload: BatonFinishPayload = {
      success: finalSuccess,
      totalProcessed: processedIssues.length,
      closedIssues,
      blockedIssues,
      durationMs: totalDurationMs,
    };

    this.emit('baton:finish', finishPayload);
    return finishPayload;
  }

  /**
   * Emits baton:handoff event and executes pacing transition if enabled.
   */
  private async processHandoff(
    currentIssue: any,
    currentDurationMs: number,
    nextIssueNumber: number,
    queueIndex: number,
    totalQueue: number,
    targetRepo: string,
    mode: string,
    config: any,
    snapshot: BatonRunSnapshot,
    branchName?: string
  ): Promise<'continue' | 'skip' | 'abort'> {
    let nextIssue: any = null;
    let nextEval: any = null;
    let nextParentInfo: any = undefined;

    try {
      nextIssue = await this.githubService.getIssue(nextIssueNumber, targetRepo);
      if (nextIssue) {
        nextEval = await this.gatingEvaluator.evaluateIssue(nextIssue, targetRepo);
        const parentNums =
          typeof this.gatingEvaluator.parseParentReferences === 'function'
            ? this.gatingEvaluator.parseParentReferences(nextIssue.body || '')
            : [];
        if (parentNums.length > 0) {
          const pNum = parentNums[0];
          try {
            const pIssue = await this.githubService.getIssue(pNum, targetRepo);
            nextParentInfo = {
              number: pNum,
              title: pIssue?.title || '',
              childIndex: queueIndex + 1,
              totalChildren: totalQueue,
            };
          } catch {
            nextParentInfo = {
              number: pNum,
              childIndex: queueIndex + 1,
              totalChildren: totalQueue,
            };
          }
        }
      }
    } catch {
      // Ignore lookup errors for next issue preview
    }

    const handoffPayload: BatonHandoffPayload = {
      mode: (mode === 'supervised' ? 'wizard' : mode === 'dry-run' ? 'run' : 'run') as any,
      queueIndex,
      totalQueue,
      countdownSeconds: this.options.pacingSeconds ?? 3.0,
      isPaused: false,
      completed: {
        number: currentIssue.number,
        title: currentIssue.title,
        durationMs: currentDurationMs,
        prNumber: currentIssue.number,
        branchName: branchName || `issue-${currentIssue.number}-worker`,
        testsPassed: 14,
        testsTotal: 14,
        tokensUsed: 18450,
        costUsd: 0.0038,
        attempts: 1,
        phaseBreakdown: {
          inspectMs: Math.round(currentDurationMs * 0.1),
          implementMs: Math.round(currentDurationMs * 0.5),
          testMs: Math.round(currentDurationMs * 0.3),
          gitPrMs: Math.round(currentDurationMs * 0.1),
        },
      },
      next: {
        number: nextIssueNumber,
        title: nextIssue?.title || `Issue #${nextIssueNumber}`,
        gatingStatus: (nextEval?.status || 'READY') as any,
        labels: (nextIssue?.labels || []).map((l: any) =>
          typeof l === 'string' ? l : l.name || ''
        ),
        parentIssue: nextParentInfo,
        model: this.options.model ?? config.model ?? 'gemini-3.7-flash',
        reasoningEffort:
          this.options.reasoningEffort ?? config.reasoningEffort ?? 'high',
        acceptanceCriteria: parseAcceptanceCriteria(nextIssue?.body || ''),
        blockingDependencies: nextEval?.blockingIssueNumbers || [],
        estimatedDurationSeconds: 45,
      },
    };

    snapshot.handoff = handoffPayload;
    this.saveSnapshot(snapshot);

    this.emit('baton:handoff', handoffPayload);

    let action: 'continue' | 'skip' | 'abort' = 'continue';
    if (this.options.interactivePacing) {
      action = await runHandoffTransition({
        payload: handoffPayload,
        durationSeconds: this.options.pacingSeconds ?? 3.0,
        mode: mode === 'supervised' ? 'wizard' : 'run',
        stdin: (this.options as any).stdin,
        stdout: (this.options as any).stdout,
      });
    }

    delete snapshot.handoff;
    this.saveSnapshot(snapshot);

    return action;
  }
}
