import pc from 'picocolors';
import * as clack from '@clack/prompts';
import { BatonRunner } from '../core/baton-runner.js';
import { GitHubService } from '../services/github-service.js';
import { GatingEvaluator } from '../core/gating-evaluator.js';
import { wizardCommand } from './wizard.js';
import type {
  BatonRunnerOptions,
  BatonFinishPayload,
  ExecutionScope,
} from '../types/baton.js';

export interface RunCommandOptions {
  from?: string | number;
  only?: string | number | (string | number)[];
  all?: boolean;
  model?: string;
  effort?: 'low' | 'medium' | 'high';
  mode?: 'afk' | 'supervised' | 'dry-run';
  timeout?: string;
  retries?: string | number;
  autoPr?: boolean;
  autoMerge?: boolean;
  json?: boolean;
  quiet?: boolean;
  repo?: string;
  promptTemplate?: string;
  parentContext?: 'reference' | 'inline' | 'none';
  expandChildren?: boolean;
  yes?: boolean;
  cwd?: string;
}

export type RunnerFactory = (options: BatonRunnerOptions) => {
  run: () => Promise<BatonFinishPayload>;
  on: (event: string, listener: (...args: any[]) => void) => any;
};

export interface RunCommandDeps {
  wizardCommand?: () => Promise<any>;
  isTTY?: boolean;
  githubService?: GitHubService;
  gatingEvaluator?: GatingEvaluator;
  prompts?: any;
}

export function parseIssueNumber(val: unknown): number | undefined {
  if (val === undefined || val === null) return undefined;
  const str = String(val).trim().replace(/^#/, '');
  if (!str) return undefined;
  const num = parseInt(str, 10);
  if (isNaN(num) || num <= 0) return undefined;
  return num;
}

export function parseOnlyTargets(val: unknown): number[] {
  if (val === undefined || val === null) return [];
  const rawList: string[] = [];
  if (Array.isArray(val)) {
    for (const item of val) {
      if (typeof item === 'number') {
        rawList.push(String(item));
      } else if (typeof item === 'string') {
        rawList.push(...item.split(','));
      }
    }
  } else if (typeof val === 'number') {
    rawList.push(String(val));
  } else if (typeof val === 'string') {
    rawList.push(...val.split(','));
  }

  const result: number[] = [];
  for (const str of rawList) {
    const cleaned = str.trim().replace(/^#/, '');
    if (!cleaned) continue;
    const num = parseInt(cleaned, 10);
    if (!isNaN(num) && num > 0) {
      result.push(num);
    }
  }
  return result;
}

export async function runCommand(
  targetArg?: string,
  options: RunCommandOptions = {},
  runnerFactory?: RunnerFactory,
  deps: RunCommandDeps = {}
): Promise<void> {
  const hasPositionalTarget =
    targetArg !== undefined && targetArg !== null && String(targetArg).trim() !== '';
  const hasFrom =
    options.from !== undefined &&
    options.from !== null &&
    String(options.from).trim() !== '';
  const hasOnly =
    options.only !== undefined &&
    options.only !== null &&
    (Array.isArray(options.only)
      ? options.only.length > 0
      : String(options.only).trim() !== '');
  const hasAll = Boolean(options.all);

  const isTTY = deps.isTTY ?? Boolean(process.stdout?.isTTY);
  const wizard = deps.wizardCommand ?? wizardCommand;

  // Zero-argument execution handling
  if (!hasPositionalTarget && !hasFrom && !hasOnly && !hasAll) {
    if (isTTY) {
      await wizard();
      return;
    } else {
      const msg =
        'No issue target or scope specified. Use "sandcastle run <target>", "sandcastle run --from <num>", "sandcastle run --only <issues...>", or "sandcastle run --all".';
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: msg }, null, 2));
      } else {
        console.error(pc.red(`\n✖ Error: ${msg}\n`));
      }
      process.exit(1);
      return;
    }
  }

  // Conflict validation
  const errors: string[] = [];

  if (hasPositionalTarget && hasFrom) {
    errors.push('Cannot specify both positional target and --from.');
  }
  if (hasPositionalTarget && hasOnly) {
    errors.push('Cannot specify both positional target and --only.');
  }
  if (hasPositionalTarget && hasAll) {
    errors.push('Cannot specify both positional target and --all.');
  }
  if (hasFrom && hasOnly) {
    errors.push('Cannot specify both --from and --only.');
  }
  if (hasFrom && hasAll) {
    errors.push('Cannot specify both --from and --all.');
  }
  if (hasOnly && hasAll) {
    errors.push('Cannot specify both --only and --all.');
  }

  if (errors.length > 0) {
    const errorMsg = errors.join(' ');
    if (options.json) {
      console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
    } else {
      console.error(pc.red(`\n✖ Error: ${errorMsg}\n`));
    }
    process.exit(1);
    return;
  }

  const githubService = deps.githubService ?? new GitHubService({ repo: options.repo });
  const gatingEvaluator = deps.gatingEvaluator ?? new GatingEvaluator({ githubService });

  // Build ExecutionScope
  let scope: ExecutionScope;

  if (hasAll) {
    scope = { type: 'all' };
  } else if (hasOnly) {
    const targets = parseOnlyTargets(options.only);
    if (targets.length === 0) {
      const errorMsg = `Invalid issue number(s) provided for --only: ${Array.isArray(options.only) ? options.only.join(',') : options.only}`;
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
      } else {
        console.error(pc.red(`\n✖ Error: ${errorMsg}\n`));
      }
      process.exit(1);
      return;
    }
    scope = { type: 'only', targets };
  } else if (hasFrom) {
    const target = parseIssueNumber(options.from);
    if (target === undefined) {
      const errorMsg = `Invalid issue number provided for --from: ${options.from}`;
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
      } else {
        console.error(pc.red(`\n✖ Error: ${errorMsg}\n`));
      }
      process.exit(1);
      return;
    }
    scope = { type: 'from', target };
  } else if (hasPositionalTarget) {
    const target = parseIssueNumber(targetArg);
    if (target === undefined) {
      const errorMsg = `Invalid positional issue target provided: ${targetArg}`;
      if (options.json) {
        console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
      } else {
        console.error(pc.red(`\n✖ Error: ${errorMsg}\n`));
      }
      process.exit(1);
      return;
    }

    // Check if target is a parent issue
    let isParent = false;
    let childTargets: number[] = [];
    try {
      const targetRepo = await githubService.getRepo(options.repo);
      const targetIssue = await githubService.getIssue(target, targetRepo);
      if (targetIssue) {
        const evalResult = await gatingEvaluator.evaluateIssue(targetIssue, targetRepo);
        if (evalResult.status === 'PARENT') {
          isParent = true;
          const openIssues = await githubService.listIssues({ state: 'open', repo: targetRepo });
          const childIssues = openIssues
            .filter((i) => gatingEvaluator.parseParentReferences(i.body || '').includes(target))
            .sort((a, b) => a.number - b.number);
          childTargets = childIssues.map((i) => i.number);
        }
      }
    } catch {
      // Ignore error
    }

    if (isParent) {
      const shouldExpand = Boolean(options.expandChildren || options.yes);
      if (shouldExpand) {
        scope = { type: 'only', targets: childTargets };
      } else if (isTTY) {
        const prompts = deps.prompts ?? clack;
        if (!options.quiet && !options.json) {
          console.log(
            pc.cyan(
              `\nParent issue #${target} detected with ${childTargets.length} child task(s):`
            )
          );
          if (childTargets.length > 0) {
            console.log(
              `   ${childTargets.map((n) => pc.bold(`#${n}`)).join(', ')}\n`
            );
          }
        }

        const confirmed = await prompts.confirm({
          message: `Expand parent issue #${target} and run ${childTargets.length} child task(s)?`,
          initialValue: true,
        });

        if (!confirmed || (prompts.isCancel && prompts.isCancel(confirmed))) {
          if (prompts.cancel) {
            prompts.cancel('Parent execution cancelled.');
          } else {
            console.log(pc.yellow('Parent execution cancelled.'));
          }
          return;
        }

        scope = { type: 'only', targets: childTargets };
      } else {
        const errorMsg = `Issue #${target} is a parent/epic specification and cannot be run directly. Use --expand-children (or -y) to run its child tasks.`;
        if (options.json) {
          console.log(JSON.stringify({ success: false, error: errorMsg }, null, 2));
        } else {
          console.error(pc.red(`\n✖ Error: ${errorMsg}\n`));
        }
        process.exit(1);
        return;
      }
    } else {
      scope = { type: 'from', target };
    }
  } else {
    scope = { type: 'all' };
  }

  const retries =
    options.retries !== undefined ? parseInt(String(options.retries), 10) : undefined;

  const runnerOptions: BatonRunnerOptions = {
    scope,
    issues: scope.type === 'only' ? scope.targets : undefined,
    all: scope.type === 'all',
    from: scope.type === 'from' ? scope.target : undefined,
    only: scope.type === 'only' ? scope.targets : undefined,
    model: options.model,
    reasoningEffort: options.effort,
    mode: options.mode,
    timeout: options.timeout,
    retries: isNaN(retries as number) ? undefined : retries,
    autoPr: options.autoPr,
    autoMerge: options.autoMerge,
    repo: options.repo,
    promptTemplate: options.promptTemplate,
    parentContext: options.parentContext,
    cwd: options.cwd,
    githubService,
    gatingEvaluator,
  };

  const runner = runnerFactory
    ? runnerFactory(runnerOptions)
    : new BatonRunner(runnerOptions);

  const isQuiet = options.quiet || options.json;

  if (!isQuiet) {
    console.log(`\n${pc.bold(pc.cyan('Sandcastle Autonomous Issue Baton'))}`);
    console.log(pc.gray('===============================================\n'));

    runner.on('baton:start', (payload) => {
      console.log(`${pc.cyan('🚀 Starting Baton Run')}`);
      console.log(`   ${pc.bold('Repo:')}   ${payload.repo}`);
      console.log(`   ${pc.bold('Mode:')}   ${payload.mode}`);
      if (payload.scope) {
        if (payload.scope.type === 'from') {
          console.log(`   ${pc.bold('Scope:')}  Resuming from #${payload.scope.target} onward`);
        } else if (payload.scope.type === 'only') {
          console.log(`   ${pc.bold('Scope:')}  Only #${payload.scope.targets.join(', #')}`);
        } else {
          console.log(`   ${pc.bold('Scope:')}  All ready issues`);
        }
      }
      console.log(`   ${pc.bold('Queue:')}  ${payload.issues.length > 0 ? payload.issues.map((n: number) => `#${n}`).join(', ') : '(all open ready)'}`);
      if (payload.model) console.log(`   ${pc.bold('Model:')}  ${payload.model}`);
      console.log('');
    });

    runner.on('baton:gating', ({ issueNumber, evaluation }) => {
      const icon = evaluation.isReady ? pc.green('✔') : pc.yellow('!');
      console.log(`${icon} ${pc.bold(`[Gate]`)} Issue #${issueNumber}: ${evaluation.status} - ${evaluation.reasons.join('; ')}`);
    });

    runner.on('worker:start', ({ issueNumber, title, attempt, maxAttempts }) => {
      console.log(`\n${pc.cyan('▶')} ${pc.bold(`Issue #${issueNumber}`)}: ${pc.bold(title)} (Attempt ${attempt}/${maxAttempts})`);
    });

    runner.on('worker:phase', ({ phase, message }) => {
      console.log(`   ${pc.dim('↳')} ${pc.blue(phase.toUpperCase())}: ${message}`);
    });

    runner.on('worker:retry', ({ issueNumber, attempt, maxAttempts, error }) => {
      console.log(`   ${pc.yellow(`[Retry ${attempt}/${maxAttempts}]`)} Issue #${issueNumber} failed. Error: ${error}`);
    });

    runner.on('worker:complete', ({ issueNumber, durationMs }) => {
      console.log(`   ${pc.green('✔')} ${pc.bold(`Issue #${issueNumber} completed successfully`)} in ${(durationMs / 1000).toFixed(1)}s`);
    });

    runner.on('baton:blocked', ({ issueNumber, reason }) => {
      console.log(`\n${pc.red('✖')} ${pc.bold(`Issue #${issueNumber} BLOCKED:`)} ${reason}`);
      console.log(pc.red('   Sandcastle execution halted to protect repository integrity.'));
    });
  }

  let result: BatonFinishPayload;
  try {
    result = await runner.run();
  } catch (err: any) {
    if (options.json) {
      console.log(
        JSON.stringify(
          { success: false, error: err?.message || String(err) },
          null,
          2
        )
      );
    } else {
      console.error(pc.red(`\n✖ Error: ${err?.message || err}`));
    }
    process.exit(1);
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.success) {
      process.exit(1);
    }
    return;
  }

  if (!options.quiet) {
    console.log(`\n${pc.gray('===============================================')}`);
    if (result.success) {
      console.log(pc.green(`✔ Baton finished successfully! Closed ${result.closedIssues.length} issue(s) in ${(result.durationMs / 1000).toFixed(1)}s.\n`));
    } else {
      console.log(pc.red(`✖ Baton finished with blockers (${result.blockedIssues.length} blocked issue(s)).\n`));
      process.exit(1);
    }
  }
}
