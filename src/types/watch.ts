import type { BatonRunSnapshot } from './baton.js';
import type { StatuslineSnapshot } from './antigravity.js';
import type { TranscriptSummary } from './transcript.js';

export interface WatchMonitorOptions {
  cwd?: string;
  stateFilePath?: string;
  transcriptPath?: string;
  conversationId?: string;
  refreshIntervalMs?: number;
  renderOnce?: boolean;
  writer?: (text: string) => void;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
  onExit?: () => void;
  statuslineSnapshot?: StatuslineSnapshot | null;
}

export interface WatchDashboardData {
  snapshot?: BatonRunSnapshot | null;
  transcript?: TranscriptSummary | null;
  statusline?: StatuslineSnapshot | null;
  elapsedSeconds: number;
}
