export interface ModelInfo {
  id: string;
  name: string;
  isDefault?: boolean;
  aliases?: string[];
  effort?: 'low' | 'medium' | 'high';
}

export interface StatuslineQuotaInfo {
  remaining_fraction: number;
  reset_time?: string;
  reset_in_seconds?: number;
}

export interface StatuslineSnapshot {
  cwd?: string;
  session_id?: string;
  conversation_id?: string;
  transcript_path?: string;
  model?: {
    id: string;
    display_name?: string;
    effort?: string;
  };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
  };
  context_window?: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
  };
  quota?: Record<string, StatuslineQuotaInfo>;
  agent_state?: string;
  task_count?: number;
}

export interface AntigravityWorkerOptions {
  repo: string;
  issueNumber: number;
  model?: string;
  reasoningEffort?: 'low' | 'medium' | 'high';
  timeout?: string | number;
  prompt?: string;
  dangerouslySkipPermissions?: boolean;
  additionalArgs?: string[];
  cwd?: string;
  env?: Record<string, string>;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface AntigravityWorkerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean;
  aborted?: boolean;
}

export type AgyCommandExecutor = (
  file: string,
  args: string[],
  options?: any
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

export interface AntigravityServiceOptions {
  customAgyPath?: string;
  appDataDir?: string;
  executor?: AgyCommandExecutor;
}
