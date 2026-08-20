import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import type {
  BatonEventMap,
  BatonRunnerOptions,
  BatonRunSnapshot,
  BatonFinishPayload,
  ProcessedIssueSummary,
} from '../types/baton.js';
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

  constructor(options: BatonRunnerOptions = {}) {
    super();
    this.options = options;
    const cwd = options.cwd ?? process.cwd();
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

    // Resolve queue of issues to run
    let queue: number[] = [];
    if (this.options.issues && this.options.issues.length > 0) {
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
      model: config.model,
      autoPr: config.autoPr,
      autoMerge: config.autoMerge,
    });

    for (const issueNumber of queue) {
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

      const parentMatch =
        issue.body?.match(/Part of #(\d+)/i) ||
        issue.body?.match(/Parent:\s*#(\d+)/i);
      const parentNumber = parentMatch ? parseInt(parentMatch[1], 10) : undefined;

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
        parent: parentNumber
          ? {
              number: parentNumber,
              title: '',
              url: `https://github.com/${targetRepo}/issues/${parentNumber}`,
            }
          : undefined,
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
          cwd: this.options.cwd,
        },
        this.options.signal
      );

      const issueDurationMs = Date.now() - issueStartTime;

      if (superviseResult.success) {
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
}
