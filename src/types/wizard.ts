import type { BatonRunnerOptions, BatonFinishPayload, ExecutionScope } from './baton.js';
import type { GitHubService } from '../services/github-service.js';
import type { AntigravityService } from '../services/antigravity-service.js';
import type { DoctorService } from '../services/doctor-service.js';
import type { ConfigService } from '../services/config-service.js';
import type { GatingEvaluator } from '../core/gating-evaluator.js';

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
}

export interface WizardDependencies {
  prompts?: WizardPrompts;
  doctorService?: DoctorService;
  githubService?: GitHubService;
  antigravityService?: AntigravityService;
  gatingEvaluator?: GatingEvaluator;
  configService?: ConfigService;
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
