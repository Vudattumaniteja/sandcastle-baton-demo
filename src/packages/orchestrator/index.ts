import { EventEmitter } from 'events';
import type {
  BatonEventMap,
  BatonFinishPayload,
  BatonRunSnapshot,
  ExecutionScope,
  ProcessedIssueSummary,
} from '../../types/baton.js';
import type { BatonHandoffPayload } from '../../types/handoff.js';
import type { SandcastleConfig } from '../../types/config.js';

import { GitHubClient, sanitizeBlockerEvidence } from '#packages/github';
import { WorkerSupervisor } from '#packages/worker-runtime';
import { RunStateStore, ConfigStore } from '#packages/state';

import { GatingEngine } from './gating.js';
import { PromptEngine } from './prompt.js';
import { resolveExecutionQueue, resolveExecutionScope } from './lib/queue-builder.js';
import { assembleHandoffPayload } from './lib/handoff-calculator.js';
import { parseAcceptanceCriteria } from './lib/dependency-parser.js';

export {
  GatingEngine,
  type GatingEngineOptions,
  type GatingEvaluation,
  type GatingStatus,
} from './gating.js';
export {
  parseParentReferences,
  parsePrerequisites,
  parseAcceptanceCriteria,
} from './lib/dependency-parser.js';
export {
  resolveExecutionQueue,
  resolveExecutionScope,
} from './lib/queue-builder.js';
export {
  calculatePhaseBreakdown,
  assembleHandoffPayload,
} from './lib/handoff-calculator.js';
export { interpolatePrompt } from './lib/prompt-interpolator.js';
export {
  PromptEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  type TemplateContext,
  type ResolvedTemplate,
  type TemplateTier,
  type ResolveTemplateOptions,
} from './prompt.js';

export type BatonHandoffEventPayload = BatonHandoffPayload;

export interface IssueExecutionResult extends ProcessedIssueSummary {}

export type {
  BatonFinishPayload,
  ProcessedIssueSummary,
  ExecutionScope,
};

export interface BatonOrchestratorOptions extends Omit<Partial<SandcastleConfig>, 'timeout'> {
  issues?: number[];
  all?: boolean;
  from?: number;
  only?: number[];
  scope?: ExecutionScope;
  repo?: string;
  mode?: 'afk' | 'supervised' | 'dry-run';
  model?: string;
  reasoningEffort?: 'high' | 'medium' | 'low';
  timeout?: string | number;
  retries?: number;
  autoPr?: boolean;
  autoMerge?: boolean;
  promptTemplate?: string;
  parentContext?: 'reference' | 'inline' | 'none';
  pacingSeconds?: number;
  cwd?: string;
  stateFilePath?: string;
  signal?: AbortSignal;
  githubClient?: GitHubClient | any;
  workerSupervisor?: WorkerSupervisor | any;
  runStateStore?: RunStateStore | any;
  configStore?: ConfigStore | any;
  gatingEngine?: GatingEngine | any;
  promptEngine?: PromptEngine | any;
  // Optional non-UI handoff action hook
  handoffHandler?: (
    payload: BatonHandoffPayload
  ) => Promise<'continue' | 'skip' | 'abort' | void> | 'continue' | 'skip' | 'abort' | void;
}

export class BatonOrchestrator extends EventEmitter {
  protected options: BatonOrchestratorOptions;
  protected githubClient: GitHubClient | any;
  protected workerSupervisor: WorkerSupervisor | any;
  protected runStateStore: RunStateStore | any;
  protected configStore: ConfigStore | any;
  protected gatingEngine: GatingEngine | any;
  protected promptEngine: PromptEngine | any;
  protected cwd: string;

  constructor(options: BatonOrchestratorOptions = {}) {
    super();
    this.options = options;
    this.cwd = options.cwd ?? process.cwd();
    const cwd = this.cwd;

    this.configStore =
      options.configStore ??
      new ConfigStore({ cwd });

    this.githubClient =
      options.githubClient ??
      new GitHubClient({ repo: options.repo });

    const configOverrides: Partial<SandcastleConfig> = {
      ...options,
      timeout: options.timeout !== undefined ? String(options.timeout) : undefined,
    };
    const resolvedConfig = this.configStore.resolve(configOverrides);

    this.workerSupervisor =
      options.workerSupervisor ??
      new WorkerSupervisor({
        maxRetries: options.retries ?? resolvedConfig.retries ?? 2,
      });

    this.runStateStore =
      options.runStateStore ??
      new RunStateStore({
        cwd,
        stateFilePath: options.stateFilePath,
      });

    this.gatingEngine =
      options.gatingEngine ??
      new GatingEngine({
        githubClient: this.githubClient,
        parentLabels: resolvedConfig.parentLabels,
        hitlLabels: resolvedConfig.hitlLabels,
      });

    this.promptEngine =
      options.promptEngine ??
      new PromptEngine({ cwd });
  }

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
   * Writes current baton execution snapshot to state store.
   */
  protected saveSnapshot(snapshot: BatonRunSnapshot): void {
    try {
      this.runStateStore.write(snapshot);
    } catch {
      // Non-fatal: persist state snapshot failures do not interrupt autonomous orchestrator execution
    }
  }

  /**
   * Executes the sequential issue baton state machine.
   */
  async run(): Promise<BatonFinishPayload> {
    const startTime = Date.now();
    const configOverrides: Partial<SandcastleConfig> = {
      ...this.options,
      timeout: this.options.timeout !== undefined ? String(this.options.timeout) : undefined,
    };
    const config = this.configStore.resolve(configOverrides);
    const targetRepo = await this.githubClient.getRepo(config.repo || this.options.repo);
    const mode = (this.options.mode || config.mode || 'afk') as
      | 'afk'
      | 'supervised'
      | 'dry-run';

    const scope = resolveExecutionScope(this.options);

    const queue = await resolveExecutionQueue({
      ...this.options,
      scope,
      fetchOpenIssues: async () => {
        const issues = await this.githubClient.listIssues({
          repo: targetRepo,
          state: 'open',
        });
        return issues;
      },
    });

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

      const issue = await this.githubClient.getIssue(issueNumber, targetRepo);
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

      const evaluation = await this.gatingEngine.evaluateIssue(issue, targetRepo);
      this.emit('baton:gating', { issueNumber, evaluation });

      if (evaluation.status === 'PARENT' || evaluation.status === 'HITL') {
        this.emit('phase:skipped', {
          issueNumber,
          status: evaluation.status,
          reason: `Skipping ${evaluation.status} issue #${issueNumber}`,
        });
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
          await this.githubClient.reportBlocker({
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

      // Live Execution with WorkerSupervisor & PromptEngine
      const { template: rawTemplate } = this.promptEngine.loadTemplate(
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
        typeof this.gatingEngine.parseParentReferences === 'function'
          ? this.gatingEngine.parseParentReferences(issue.body || '')
          : [];
      const parentNumber = parentNumbers.length > 0 ? parentNumbers[0] : undefined;
      const parentContextMode = (this.options.parentContext ?? config.parentContext ?? 'reference') as
        | 'reference'
        | 'inline'
        | 'none';

      let parentObj: any = undefined;
      let parentNumberAlias: number | undefined = undefined;
      let parentTitleAlias: string | undefined = undefined;
      let parentUrlAlias: string | undefined = undefined;
      let parentBodyAlias: string | undefined = undefined;

      if (parentContextMode !== 'none' && parentNumber !== undefined) {
        let parentIssueObj: any = null;
        try {
          parentIssueObj = await this.githubClient.getIssue(parentNumber, targetRepo);
        } catch {
          // Non-fatal: network or API failure fetching parent issue details falls back to basic metadata
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

      const templateContext = {
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

      const workerPrompt = this.promptEngine.interpolate(
        rawTemplate,
        templateContext
      );

      this.emit('worker:phase', {
        issueNumber,
        phase: 'implement',
        message: 'Launching Antigravity worker session',
      });

      let superviseResult = await this.workerSupervisor.execute(
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

      if (superviseResult.success) {
        this.emit('worker:phase', {
          issueNumber,
          phase: 'close',
          message: 'Verifying closure',
        });

        let liveIssue = await this.githubClient.getIssue(issueNumber, targetRepo);

        if (liveIssue?.state?.toUpperCase() === 'OPEN') {
          const correctiveDirective = `\n\n[Sandcastle Worker Contract Directive]\nWorker process exited with code 0, but issue #${issueNumber} remains OPEN on GitHub.\nPlease finish pull request creation (gh pr create), merge (gh pr merge --merge), and issue closure (gh issue close ${issueNumber}).`;
          const correctivePrompt = `${workerPrompt}${correctiveDirective}`;

          this.emit('worker:retry', {
            issueNumber,
            attempt: 2,
            maxAttempts,
            error: `Issue #${issueNumber} remained OPEN after worker process completed. Triggering corrective retry to finish pull request creation, merge, and issue closure.`,
          });

          this.emit('worker:phase', {
            issueNumber,
            phase: 'close',
            message: `Issue #${issueNumber} is still OPEN; retrying to finish PR creation, merge, and issue closure`,
          });

          superviseResult = await this.workerSupervisor.execute(
            {
              repo: targetRepo,
              issueNumber,
              prompt: correctivePrompt,
              model: this.options.model ?? config.model,
              reasoningEffort:
                this.options.reasoningEffort ?? config.reasoningEffort,
              timeout: this.options.timeout ?? config.timeout,
              cwd: this.cwd,
            },
            this.options.signal
          );

          liveIssue = await this.githubClient.getIssue(issueNumber, targetRepo);
        }

        const isClosed = liveIssue?.state?.toUpperCase() === 'CLOSED';
        if (!isClosed) {
          const errorReason =
            superviseResult.error ||
            `Issue #${issueNumber} remained OPEN on GitHub after corrective retry.`;
          const rawEvidence =
            superviseResult.lastStderr || superviseResult.lastStdout;
          const sanitizedEvidence = sanitizeBlockerEvidence(rawEvidence);

          this.emit('baton:blocked', {
            issueNumber,
            reason: errorReason,
            evidence: sanitizedEvidence,
            remediation:
              'Ensure the worker completes pull request creation, merge, and issue closure.',
          });

          await this.githubClient.reportBlocker({
            issueNumber,
            reason: errorReason,
            evidence: sanitizedEvidence,
            repo: targetRepo,
            remediation:
              'Ensure the worker completes pull request creation, merge, and issue closure.',
          });

          blockedIssues.push(issueNumber);
          processedIssues.push({
            number: issueNumber,
            title: issue.title,
            status: 'blocked',
            durationMs: Date.now() - issueStartTime,
            error: errorReason,
          });
          snapshot.blockedCount++;
          snapshot.status = 'blocked';
          break;
        }

        const issueDurationMs = Date.now() - issueStartTime;

        // Sync parent checklist and post progress comment on parent issues
        if (parentNumbers.length > 0) {
          for (const parentNum of parentNumbers) {
            try {
              await this.githubClient.syncParentChecklist(parentNum, issueNumber, targetRepo);
            } catch {
              // Non-fatal: parent checklist sync failure should not block worker completion
            }
            try {
              await this.githubClient.postParentProgressComment({
                parentNumber: parentNum,
                childNumber: issueNumber,
                childTitle: issue.title,
                repo: targetRepo,
              });
            } catch {
              // Non-fatal: parent progress comment failure should not block worker completion
            }
          }
        }

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

        const rawEvidence =
          superviseResult.lastStderr || superviseResult.lastStdout;
        const sanitizedEvidence = sanitizeBlockerEvidence(rawEvidence);

        this.emit('baton:blocked', {
          issueNumber,
          reason: errorReason,
          evidence: sanitizedEvidence,
        });

        await this.githubClient.reportBlocker({
          issueNumber,
          reason: errorReason,
          evidence: sanitizedEvidence,
          repo: targetRepo,
        });

        blockedIssues.push(issueNumber);
        processedIssues.push({
          number: issueNumber,
          title: issue.title,
          status: 'blocked',
          durationMs: Date.now() - issueStartTime,
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
   * Internal handoff processing. Assembles payload, persists snapshot, emits baton:handoff,
   * and invokes optional handoffHandler hook. Zero UI imports.
   */
  protected async processHandoff(
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
      nextIssue = await this.githubClient.getIssue(nextIssueNumber, targetRepo);
      if (nextIssue) {
        nextEval = await this.gatingEngine.evaluateIssue(nextIssue, targetRepo);
        const parentNums =
          typeof this.gatingEngine.parseParentReferences === 'function'
            ? this.gatingEngine.parseParentReferences(nextIssue.body || '')
            : [];
        if (parentNums.length > 0) {
          const pNum = parentNums[0];
          try {
            const pIssue = await this.githubClient.getIssue(pNum, targetRepo);
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
      // Non-fatal: metadata lookup error while assembling next issue preview falls back to basic handoff card
    }

    const handoffPayload = assembleHandoffPayload({
      mode: (mode === 'supervised' ? 'wizard' : 'run') as any,
      queueIndex,
      totalQueue,
      countdownSeconds: this.options.pacingSeconds ?? 3.0,
      currentIssue: {
        number: currentIssue.number,
        title: currentIssue.title,
        durationMs: currentDurationMs,
        prNumber: currentIssue.prNumber,
        branchName: branchName || `issue-${currentIssue.number}-worker`,
      },
      nextIssue: {
        number: nextIssueNumber,
        title: nextIssue?.title || `Issue #${nextIssueNumber}`,
        gatingStatus: (nextEval?.status || 'READY') as any,
        labels: (nextIssue?.labels || []).map((l: any) =>
          typeof l === 'string' ? l : l.name || ''
        ),
        parentIssue: nextParentInfo,
        model: this.options.model ?? config.model ?? 'gemini-3.8-flash-medium',
        reasoningEffort:
          this.options.reasoningEffort ?? config.reasoningEffort ?? 'high',
        acceptanceCriteria: parseAcceptanceCriteria(nextIssue?.body || ''),
        blockingDependencies: nextEval?.blockingIssueNumbers || [],
        estimatedDurationSeconds: 45,
      },
    });

    snapshot.handoff = handoffPayload;
    this.saveSnapshot(snapshot);

    this.emit('baton:handoff', handoffPayload);

    let action: 'continue' | 'skip' | 'abort' = 'continue';
    if (this.options.handoffHandler) {
      const result = await this.options.handoffHandler(handoffPayload);
      if (result === 'skip' || result === 'abort') {
        action = result;
      }
    }

    delete snapshot.handoff;
    this.saveSnapshot(snapshot);

    return action;
  }
}
