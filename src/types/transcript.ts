export interface TranscriptStep {
  step_index: number;
  source: 'USER_EXPLICIT' | 'MODEL' | 'SYSTEM' | string;
  type: string;
  status: 'DONE' | 'RUNNING' | 'ERROR' | string;
  created_at: string;
  content?: string;
  tool_calls?: Array<{
    name: string;
    args: Record<string, any>;
    toolSummary?: string;
    toolAction?: string;
  }>;
  exit_code?: number;
  token_count?: number | { input?: number; output?: number; total?: number };
  [key: string]: any;
}

export interface ParsedToolCall {
  stepIndex: number;
  timestamp: string;
  name: string;
  args: Record<string, any>;
  summary?: string;
  action?: string;
  status: 'running' | 'completed' | 'error';
  resultPreview?: string;
}

export interface TranscriptTailerOptions {
  filePath?: string;
  conversationId?: string;
  appDataDir?: string;
  pollIntervalMs?: number;
  autoDiscover?: boolean;
}

export type TranscriptTailerEventMap = {
  step: (step: TranscriptStep) => void;
  tool_call: (toolCall: ParsedToolCall) => void;
  thought: (thought: string) => void;
  tokens: (usage: { input?: number; output?: number; total?: number }) => void;
  error: (err: Error) => void;
  end: () => void;
};

export interface TranscriptSummary {
  conversationId?: string;
  filePath?: string;
  totalSteps: number;
  latestStep?: TranscriptStep;
  latestThought?: string;
  recentToolCalls: ParsedToolCall[];
  tokenUsage?: {
    input?: number;
    output?: number;
    total?: number;
  };
  lastUpdated: Date;
}
