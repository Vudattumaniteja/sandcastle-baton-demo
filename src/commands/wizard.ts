import * as clack from '@clack/prompts';
import pc from 'picocolors';
import { BatonRunner } from '../core/baton-runner.js';
import { GitHubService } from '../services/github-service.js';
import {
  AntigravityService,
  resolveAgyModel,
} from '../services/antigravity-service.js';
import { DoctorService } from '../services/doctor-service.js';
import { ConfigService } from '../services/config-service.js';
import { GatingEvaluator } from '../core/gating-evaluator.js';
import {
  formatIssueOption,
  formatModelOption,
  getReasoningEffortChoices,
  getExecutionModeChoices,
  formatLaunchManifest,
  formatPhaseMessage,
} from '../ui/formatters.js';
import type {
  WizardOptions,
  WizardDependencies,
  WizardResult,
  WizardManifest,
  WizardPromptOption,
} from '../types/wizard.js';
import type { BatonRunnerOptions } from '../types/baton.js';

/**
 * Runs the interactive guided Sandcastle wizard (Variant A TUI Flow).
 */
export async function wizardCommand(
  options: WizardOptions = {},
  deps: WizardDependencies = {}
): Promise<WizardResult> {
  const prompts = deps.prompts ?? clack;
  const cwd = deps.cwd ?? options.cwd ?? process.cwd();
  const configService = deps.configService ?? new ConfigService({ cwd });
  const githubService = deps.githubService ?? new GitHubService();
  const antigravityService = deps.antigravityService ?? new AntigravityService();
  const doctorService = deps.doctorService ?? new DoctorService({ cwd });
  const resolvedConfig = configService.resolve();
  const gatingEvaluator =
    deps.gatingEvaluator ??
    new GatingEvaluator({
      githubService,
      parentLabels: resolvedConfig.parentLabels,
      hitlLabels: resolvedConfig.hitlLabels,
    });

  // 1. Intro Banner
  prompts.intro(pc.bold(pc.cyan('Sandcastle Autonomous Issue Baton Wizard')));

  // 2. Preflight Validation
  const s = prompts.spinner();
  s.start('Running workspace and preflight diagnostics...');
  const doctorReport = await doctorService.runDiagnostics();

  if (!doctorReport.healthy) {
    const failedCheck =
      doctorReport.checks.find((c) => !c.passed && c.fatal) ||
      doctorReport.checks.find((c) => !c.passed);
    const errorMsg =
      failedCheck?.message || 'Workspace preflight diagnostics failed.';

    s.stop(pc.red(`Preflight check failed: ${errorMsg}`));
    if (failedCheck?.remediation && prompts.log) {
      prompts.log.error(failedCheck.remediation);
    }
    prompts.cancel('Preflight validation failed.');
    return { cancelled: true, error: errorMsg };
  }

  s.stop(pc.green('Preflight validation passed.'));

  // 3. Issue Selection
  s.start('Fetching backlog issues & gating prerequisites...');
  const targetRepo = await githubService.getRepo();
  const openIssues = await githubService.listIssues({ state: 'open' });

  if (!openIssues || openIssues.length === 0) {
    s.stop(pc.yellow('No open issues found in repository.'));
    prompts.cancel('No open issues found in repository.');
    return { cancelled: true, error: 'No open issues found in repository.' };
  }

  const evaluationMap = await gatingEvaluator.evaluateBacklog(
    openIssues,
    targetRepo
  );
  s.stop(pc.green(`Loaded ${openIssues.length} open issue(s).`));

  const readyCount = Array.from(evaluationMap.values()).filter(
    (e) => e.isReady
  ).length;

  const issueOptions: WizardPromptOption<number | 'all'>[] = [];
  if (readyCount > 0) {
    issueOptions.push({
      value: 'all',
      label: pc.bold(`All Ready Issues (${readyCount} ready)`),
      hint: 'Run all unblocked ready issues sequentially in backlog order',
    });
  }

  for (const issue of openIssues) {
    const evalResult =
      evaluationMap.get(issue.number) ||
      (await gatingEvaluator.evaluateIssue(issue, targetRepo));
    issueOptions.push(formatIssueOption(evalResult));
  }

  const selectedIssue = await prompts.select({
    message: 'Select an issue to run with Sandcastle baton:',
    options: issueOptions,
  });

  if (prompts.isCancel(selectedIssue)) {
    prompts.cancel('Wizard cancelled.');
    return { cancelled: true };
  }

  let targetDescription = '';
  let issuesToRun: number[] | undefined;
  let isAll = false;

  if (selectedIssue === 'all') {
    isAll = true;
    targetDescription = `All Ready Issues (${readyCount} ready issues)`;
  } else {
    const issueNum = Number(selectedIssue);
    issuesToRun = [issueNum];
    const foundIssue = openIssues.find((i) => i.number === issueNum);
    targetDescription = foundIssue
      ? `Issue #${issueNum}: ${foundIssue.title}`
      : `Issue #${issueNum}`;
  }

  // 4. Model Selection
  s.start('Discovering available Antigravity models & quota...');
  const discoveredModels = await antigravityService.discoverModels();
  const statuslineSnapshot = await antigravityService.getStatuslineSnapshot();
  s.stop(pc.green(`Discovered ${discoveredModels.length} model(s).`));

  const modelOptions = discoveredModels.map((m) =>
    formatModelOption(m, statuslineSnapshot)
  );
  const defaultModel =
    discoveredModels.find((m) => m.isDefault)?.id || discoveredModels[0]?.id;

  const selectedModel = await prompts.select({
    message: 'Select Antigravity LLM model:',
    options: modelOptions,
    initialValue: defaultModel,
  });

  if (prompts.isCancel(selectedModel)) {
    prompts.cancel('Wizard cancelled.');
    return { cancelled: true };
  }

  // 5. Reasoning Effort Selection
  const initialEffort = (configService.get('reasoningEffort') || 'high') as 'high' | 'medium' | 'low';
  const effortOptions = getReasoningEffortChoices();
  const selectedEffort = await prompts.select({
    message: 'Select reasoning effort level:',
    options: effortOptions,
    initialValue: initialEffort,
  });

  if (prompts.isCancel(selectedEffort)) {
    prompts.cancel('Wizard cancelled.');
    return { cancelled: true };
  }

  // 6. Execution Mode Selection
  const modeOptions = getExecutionModeChoices();
  const selectedMode = await prompts.select({
    message: 'Select execution mode:',
    options: modeOptions,
    initialValue: 'afk',
  });

  if (prompts.isCancel(selectedMode)) {
    prompts.cancel('Wizard cancelled.');
    return { cancelled: true };
  }

  // 7. Launch Manifest Note Card & Confirmation
  let branch = 'main';
  const gitBranchCheck = doctorReport.checks.find((c) => c.id === 'git');
  const branchMatch = gitBranchCheck?.message.match(
    /Active branch:\s*([^)]+)/i
  );
  if (branchMatch && branchMatch[1]) {
    branch = branchMatch[1].trim();
  }

  const resolvedModel = resolveAgyModel(
    String(selectedModel),
    selectedEffort as any
  );

  const manifest: WizardManifest = {
    repo: targetRepo,
    branch,
    targetDescription,
    model: resolvedModel,
    reasoningEffort: selectedEffort as 'high' | 'medium' | 'low',
    mode: selectedMode as 'afk' | 'supervised' | 'dry-run',
    autoPr: true,
    autoMerge: true,
    issues: issuesToRun,
    all: isAll,
    scope: isAll
      ? { type: 'all' }
      : issuesToRun && issuesToRun.length > 0
      ? { type: 'only', targets: issuesToRun }
      : undefined,
  };

  const manifestCard = formatLaunchManifest(manifest);
  prompts.note(manifestCard, 'Sandcastle Launch Manifest');

  const confirmed = await prompts.confirm({
    message: 'Launch Sandcastle Baton with this configuration?',
    initialValue: true,
  });

  if (!confirmed || prompts.isCancel(confirmed)) {
    prompts.cancel('Launch cancelled.');
    return { cancelled: true, manifest };
  }

  // 8. Dynamic Execution with Multi-Phase Spinners
  const runnerOptions: BatonRunnerOptions = {
    repo: manifest.repo,
    issues: manifest.issues,
    all: manifest.all,
    scope: manifest.scope,
    model: manifest.model,
    reasoningEffort: manifest.reasoningEffort,
    mode: manifest.mode,
    autoPr: manifest.autoPr,
    autoMerge: manifest.autoMerge,
    cwd,
  };

  const runner = deps.runnerFactory
    ? deps.runnerFactory(runnerOptions)
    : new BatonRunner(runnerOptions);

  const execSpinner = prompts.spinner();

  runner.on('baton:start', (payload: any) => {
    execSpinner.start(
      pc.cyan(
        `Starting Sandcastle Baton for ${payload.repo} (Mode: ${payload.mode})...`
      )
    );
  });

  runner.on('baton:gating', ({ issueNumber, evaluation }: any) => {
    execSpinner.message(
      pc.cyan(`[Gate] Evaluating issue #${issueNumber}: ${evaluation.status}`)
    );
  });

  runner.on(
    'worker:start',
    ({ issueNumber, title, attempt, maxAttempts }: any) => {
      execSpinner.message(
        pc.bold(
          `▶ Issue #${issueNumber}: ${title} (Attempt ${attempt}/${maxAttempts})`
        )
      );
    }
  );

  runner.on('worker:phase', ({ issueNumber, phase, message }: any) => {
    const formattedPhase = formatPhaseMessage(phase, issueNumber);
    execSpinner.message(`${formattedPhase} - ${message}`);
  });

  runner.on(
    'worker:retry',
    ({ issueNumber, attempt, maxAttempts, error }: any) => {
      execSpinner.message(
        pc.yellow(
          `[Retry ${attempt}/${maxAttempts}] Issue #${issueNumber} failed: ${error}`
        )
      );
    }
  );

  runner.on('worker:complete', ({ issueNumber, durationMs }: any) => {
    execSpinner.message(
      pc.green(
        `✔ Issue #${issueNumber} completed successfully in ${(durationMs / 1000).toFixed(1)}s`
      )
    );
  });

  runner.on('baton:blocked', ({ issueNumber, reason }: any) => {
    execSpinner.stop(pc.red(`✖ Issue #${issueNumber} BLOCKED: ${reason}`));
  });

  const batonResult = await runner.run();

  if (batonResult.success) {
    execSpinner.stop(
      pc.green(
        `✔ Baton finished successfully! Closed ${batonResult.closedIssues.length} issue(s).`
      )
    );
    prompts.outro(
      pc.green(
        `Sandcastle Baton completed successfully! Closed ${batonResult.closedIssues.length} issue(s) in ${(batonResult.durationMs / 1000).toFixed(1)}s.`
      )
    );
    return {
      cancelled: false,
      success: true,
      manifest,
      batonResult,
    };
  } else {
    execSpinner.stop(
      pc.red(
        `✖ Baton halted due to blockers (${batonResult.blockedIssues.length} blocked issue(s)).`
      )
    );
    prompts.outro(
      pc.red('Sandcastle Baton halted to protect repository integrity.')
    );
    return {
      cancelled: false,
      success: false,
      manifest,
      batonResult,
      error: 'Baton halted due to blockers.',
    };
  }
}
