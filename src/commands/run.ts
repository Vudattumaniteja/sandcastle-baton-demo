import pc from 'picocolors';
import { BatonRunner } from '../core/baton-runner.js';
import type { BatonRunnerOptions, BatonFinishPayload } from '../types/baton.js';

export interface RunCommandOptions {
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
  cwd?: string;
}

export type RunnerFactory = (options: BatonRunnerOptions) => {
  run: () => Promise<BatonFinishPayload>;
  on: (event: string, listener: (...args: any[]) => void) => any;
};

export async function runCommand(
  issueArg?: string,
  options: RunCommandOptions = {},
  runnerFactory?: RunnerFactory
): Promise<void> {
  const issues: number[] = [];
  if (issueArg) {
    const parsed = parseInt(issueArg.replace('#', ''), 10);
    if (!isNaN(parsed) && parsed > 0) {
      issues.push(parsed);
    }
  }

  const retries =
    options.retries !== undefined ? parseInt(String(options.retries), 10) : undefined;

  const runnerOptions: BatonRunnerOptions = {
    issues: issues.length > 0 ? issues : undefined,
    all: options.all,
    model: options.model,
    reasoningEffort: options.effort,
    mode: options.mode,
    timeout: options.timeout,
    retries: isNaN(retries as number) ? undefined : retries,
    autoPr: options.autoPr,
    autoMerge: options.autoMerge,
    repo: options.repo,
    cwd: options.cwd,
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
      console.log(`   ${pc.bold('Queue:')}  ${payload.issues.length > 0 ? payload.issues.map((n: number) => `#${n}`).join(', ') : '(all open ready)'}`);
      if (payload.model) console.log(`   ${pc.bold('Model:')}  ${payload.model}`);
      console.log('');
    });

    runner.on('baton:gating', ({ issueNumber, evaluation }) => {
      const icon = evaluation.isReady ? pc.green('✔') : pc.yellow('!');
      console.log(`${icon} ${pc.bold(`[Gate]`)} Issue #${issueNumber}: ${evaluation.status} - ${evaluation.reasons.join('; ')}`);
    });

    runner.on('worker:start', ({ issueNumber, title, attempt, maxAttempts }) => {
      console.log(`\n${pc.magenta('▶')} ${pc.bold(`Issue #${issueNumber}`)}: ${pc.bold(title)} (Attempt ${attempt}/${maxAttempts})`);
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

  const result = await runner.run();

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
