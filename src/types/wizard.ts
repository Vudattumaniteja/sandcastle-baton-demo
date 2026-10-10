import type { BatonRunnerOptions, BatonFinishPayload, ExecutionScope } from './baton.js';
import type { DoctorReport } from './doctor.js';
import type { ModelInfo, StatuslineSnapshot } from './antigravity.js';
import type { GatingEvaluation } from './gating.js';
import type { SandcastleConfig } from './config.js';
import type { GitHubIssue } from './github.js';

export interface WizardPromptOption<T = any> {
  value: T;
  label: string;
  hint?: string;
}

export interface WizardSpinner {
  start(message?: string): void;
  stop(message?: string, code?: number): void;
  message(message?: string): void;
}

export interface WizardPrompts {
  intro(title: string): void;
  outro(message: string): void;
  spinner(): WizardSpinner;
  select<T>(options: {
    message: string;
    options: WizardPromptOption<T>[];
    initialValue?: T;
  }): Promise<T | symbol>;
  confirm(options: {
    message: string;
    initialValue?: boolean;
  }): Promise<boolean | symbol>;
  note(message: string, title?: string): void;
  cancel(message?: string): void;
  isCancel(value: unknown): boolean;
  log?: {
    info(msg: string): void;
    success(msg: string): void;
    warning(msg: string): void;
    error(msg: string): void;
    step(msg: string): void;
  };
}

export interface WizardManifest {
  repo: string;
  branch: string;
  targetDescription: string;
  model: string;
  reasoningEffort: 'high' | 'medium' | 'low';
  mode: 'afk' | 'supervised' | 'dry-run';
  autoPr: boolean;
  autoMerge: boolean;
  issues?: number[];
  all?: boolean;
  scope?: ExecutionScope;
  parentContext?: 'reference' | 'inline' | 'none';
}

export interface WizardDoctorContract {
  runDiagnostics(): Promise<DoctorReport>;
}

export interface WizardGitHubContract {
  getRepo(repo?: string): Promise<string>;
  listIssues(options?: any): Promise<GitHubIssue[]>;
  getIssue(number: number, repo?: string): Promise<GitHubIssue | null>;
  [key: string]: any;
}

export interface WizardAntigravityContract {
  discoverModels(): Promise<ModelInfo[]>;
  getStatuslineSnapshot(now?: number | Date): Promise<StatuslineSnapshot | null>;
  [key: string]: any;
}

export interface WizardGatingContract {
  evaluateIssue(
    issue: GitHubIssue,
    repo?: string,
    backlogMap?: Map<number, GitHubIssue>
  ): Promise<GatingEvaluation>;
  evaluateBacklog(
    issues: GitHubIssue[],
    repo?: string
  ): Promise<Map<number, GatingEvaluation>>;
  [key: string]: any;
}

export interface WizardConfigContract {
  resolve(overrides?: Partial<SandcastleConfig>): SandcastleConfig;
  [key: string]: any;
}

export interface WizardDependencies {
  prompts?: WizardPrompts;
  doctorService?: WizardDoctorContract;
  githubService?: WizardGitHubContract;
  antigravityService?: WizardAntigravityContract;
  gatingEvaluator?: WizardGatingContract;
  configService?: WizardConfigContract;
  runnerFactory?: (options: BatonRunnerOptions) => {
    run: () => Promise<BatonFinishPayload>;
    on: (event: string, listener: (...args: any[]) => void) => any;
  };
  cwd?: string;
}

export interface WizardOptions {
  cwd?: string;
}

export interface WizardResult {
  cancelled: boolean;
  success?: boolean;
  manifest?: WizardManifest;
  batonResult?: BatonFinishPayload;
  error?: string;
}
