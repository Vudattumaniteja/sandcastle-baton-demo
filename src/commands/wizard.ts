import * as clack from '@clack/prompts';
import pc from 'picocolors';
import {
  BatonOrchestrator,
  GatingEngine,
  type BatonOrchestratorOptions,
} from '#packages/orchestrator';
import { GitHubClient } from '#packages/github';
import {
  discoverModels,
  resolveModel,
  getQuotaSnapshot,
} from '#packages/worker-runtime';
import { DoctorEngine } from '#packages/diagnostics';
import { ConfigStore } from '#packages/state';
import {
  formatIssueOption,
  formatModelOption,
  getReasoningEffortChoices,
  getExecutionModeChoices,
  formatLaunchManifest,
  formatPhaseMessage,
} from '#packages/terminal';
import type {
  WizardOptions,
  WizardDependencies,
  WizardResult,
  WizardManifest,
  WizardPromptOption,
} from '../types/wizard.js';

/**
 * Runs the interactive guided Sandcastle wizard (Variant A TUI Flow).
 */
export async function wizardCommand(
  options: WizardOptions = {},
  deps: WizardDependencies = {}
): Promise<WizardResult> {
  const prompts = deps.prompts ?? clack;
  const cwd = deps.cwd ?? options.cwd ?? process.cwd();
  const configStore = deps.configStore ?? deps.configService ?? new ConfigStore({ cwd });
  const githubClient = deps.githubClient ?? deps.githubService ?? new GitHubClient();
  const doctorEngine = deps.doctorEngine ?? deps.doctorService ?? new DoctorEngine({ cwd });
  const resolvedConfig = configStore.resolve();
  const gatingEngine =
    deps.gatingEngine ??
    deps.gatingEvaluator ??
    new GatingEngine({
      githubClient,
      parentLabels: resolvedConfig.parentLabels,
      hitlLabels: resolvedConfig.hitlLabels,
    });

  prompts.intro(pc.bold(pc.cyan('Sandcastle Autonomous Issue Baton Wizard')));

  const s = prompts.spinner();
  s.start('Running workspace and preflight diagnostics...');
  const doctorReport = await doctorEngine.runDiagnostics();

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

  s.start('Fetching backlog issues & gating prerequisites...');
  const targetRepo = await githubClient.getRepo();
  const openIssues = await githubClient.listIssues({ state: 'open' });

  if (!openIssues || openIssues.length === 0) {
    s.stop(pc.yellow('No open issues found in repository.'));
    prompts.cancel('No open issues found in repository.');
    return { cancelled: true, error: 'No open issues found in repository.' };
  }

  const evaluationMap = await gatingEngine.evaluateBacklog(
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
      (await gatingEngine.evaluateIssue(issue, targetRepo));

    // Filter out parent and HITL issues from the main issue picker
    if (evalResult.status === 'PARENT' || evalResult.status === 'HITL') {
      continue;
    }

    issueOptions.push(formatIssueOption(evalResult));
  }

  if (issueOptions.length === 0) {
    s.stop(pc.yellow('No actionable issues found in repository.'));
    prompts.cancel('No actionable issues found in repository.');
    return { cancelled: true, error: 'No actionable issues found in repository.' };
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
  let scope: import('../types/baton.js').ExecutionScope;
  let isChildTask = false;

  if (selectedIssue === 'all') {
    isAll = true;
    scope = { type: 'all' };
    targetDescription = 'Full Backlog';
    const readyIssues = openIssues.filter(
      (i) => evaluationMap.get(i.number)?.isReady
    );
    isChildTask = readyIssues.some(
      (i) => gatingEngine.parseParentReferences(i.body || '').length > 0
    );
  } else {
    const issueNum = Number(selectedIssue);
    const followUpAction = await prompts.select({
      message: `Select execution scope for issue #${issueNum}:`,
      options: [
        {
          value: 'only',
          label: `Run only issue #${issueNum}`,
          hint: 'Run only this issue and halt',
        },
        {
          value: 'from',
          label: `Resume backlog from #${issueNum} onward`,
          hint: 'Run this issue and subsequent ready backlog issues sequentially',
        },
      ],
      initialValue: 'only',
    });

    if (prompts.isCancel(followUpAction)) {
      prompts.cancel('Wizard cancelled.');
      return { cancelled: true };
    }

    if (followUpAction === 'from') {
      scope = { type: 'from', target: issueNum };
      targetDescription = `Backlog Resumption (from #${issueNum} onward)`;
      const issuesInScope = openIssues.filter(
        (i) =>
          i.number >= issueNum &&
          evaluationMap.get(i.number)?.status !== 'PARENT' &&
          evaluationMap.get(i.number)?.status !== 'HITL'
      );
      isChildTask = issuesInScope.some(
        (i) => gatingEngine.parseParentReferences(i.body || '').length > 0
      );
    } else {
      issuesToRun = [issueNum];
      scope = { type: 'only', targets: [issueNum] };
      targetDescription = `Single Issue (#${issueNum})`;
      const foundIssue = openIssues.find((i) => i.number === issueNum);
      const parentRefs = foundIssue
        ? gatingEngine.parseParentReferences(foundIssue.body || '')
        : [];
      isChildTask = parentRefs.length > 0;
    }
  }

  // Prompt operator for parent context when executing child tasks
  let parentContext: 'reference' | 'none' | undefined = undefined;
  if (isChildTask) {
    const includeParent = await prompts.confirm({
      message: 'Include parent context in worker prompts?',
      initialValue: true,
    });

    if (prompts.isCancel(includeParent)) {
      prompts.cancel('Wizard cancelled.');
      return { cancelled: true };
    }

    parentContext = includeParent ? 'reference' : 'none';
  }

  s.start('Discovering available Antigravity models & quota...');
  const discoveredModels = deps.discoverModels
    ? await deps.discoverModels()
    : deps.antigravityService?.discoverModels
    ? await deps.antigravityService.discoverModels()
    : await discoverModels();
  const statuslineSnapshot = deps.getStatuslineSnapshot
    ? await deps.getStatuslineSnapshot()
    : deps.antigravityService?.getStatuslineSnapshot
    ? await deps.antigravityService.getStatuslineSnapshot()
    : await getQuotaSnapshot();
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

  const initialEffort = (configStore.get('reasoningEffort') || 'high') as 'high' | 'medium' | 'low';
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

  let branch = 'main';
  const gitBranchCheck = doctorReport.checks.find((c) => c.id === 'git');
  const branchMatch = gitBranchCheck?.message.match(
    /Active branch:\s*([^)]+)/i
  );
  if (branchMatch && branchMatch[1]) {
    branch = branchMatch[1].trim();
  }

  const resolvedModel = resolveModel(
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
    scope,
    parentContext,
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

  const runnerOptions: BatonOrchestratorOptions = {
    repo: manifest.repo,
    issues: manifest.issues,
    all: manifest.all,
    scope: manifest.scope,
    parentContext: manifest.parentContext,
    model: manifest.model,
    reasoningEffort: manifest.reasoningEffort,
    mode: manifest.mode,
    autoPr: manifest.autoPr,
    autoMerge: manifest.autoMerge,
    cwd,
    githubClient,
    gatingEngine,
    configStore,
  };

  const runner = deps.runnerFactory
    ? deps.runnerFactory(runnerOptions)
    : new BatonOrchestrator(runnerOptions);

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
