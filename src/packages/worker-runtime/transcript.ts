import { EventEmitter } from 'events';
import path from 'path';
import os from 'os';
import {
  TranscriptStep,
  ParsedToolCall,
  readTranscriptDelta,
  discoverTranscriptPath,
} from './lib/transcript-reader.js';

export type { TranscriptStep, ParsedToolCall };

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

export interface TranscriptStats {
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

export type TranscriptSummary = TranscriptStats;

export class TranscriptTailer extends EventEmitter {
  private filePath?: string;
  private appDataDir: string;
  private pollIntervalMs: number;
  private timer?: NodeJS.Timeout;
  private isPolling = false;
  private lastByteOffset = 0;
  private lineBuffer = '';
  private totalSteps = 0;
  private latestStep?: TranscriptStep;
  private latestThought?: string;
  private recentToolCalls: ParsedToolCall[] = [];
  private tokenUsage?: { input?: number; output?: number; total?: number };
  private conversationId?: string;

  constructor(options: TranscriptTailerOptions = {}) {
    super();
    this.filePath = options.filePath;
    this.conversationId = options.conversationId;
    this.pollIntervalMs = options.pollIntervalMs ?? 300;
    this.appDataDir =
      options.appDataDir ??
      process.env.GEMINI_APP_DIR ??
      path.join(os.homedir(), '.gemini', 'antigravity-cli');
  }

  override emit<E extends keyof TranscriptTailerEventMap>(
    event: E,
    ...args: Parameters<TranscriptTailerEventMap[E]>
  ): boolean {
    return super.emit(event, ...args);
  }

  override on<E extends keyof TranscriptTailerEventMap>(
    event: E,
    listener: TranscriptTailerEventMap[E]
  ): this {
    return super.on(event, listener as any);
  }

  /**
   * Discovers the target transcript file on disk if not explicitly set.
   */
  discoverTranscriptPath(): string | undefined {
    const discovered = discoverTranscriptPath(
      this.appDataDir,
      this.conversationId,
      this.filePath
    );
    if (discovered.filePath) {
      this.filePath = discovered.filePath;
      if (!this.conversationId && discovered.conversationId) {
        this.conversationId = discovered.conversationId;
      }
      return discovered.filePath;
    }
    return undefined;
  }

  /**
   * Reads newly appended data from target transcript and parses JSONL lines.
   */
  async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const targetPath = this.filePath ?? this.discoverTranscriptPath();
      if (!targetPath) {
        return;
      }

      const { newByteOffset, remainingBuffer, steps, errors } =
        readTranscriptDelta(targetPath, this.lastByteOffset, this.lineBuffer);

      this.lastByteOffset = newByteOffset;
      this.lineBuffer = remainingBuffer;

      for (const err of errors) {
        this.emit('error', err);
      }

      for (const step of steps) {
        this.processStep(step);
      }
    } catch (err: any) {
      this.emit('error', err);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Processes a single parsed transcript step, emitting relevant events.
   */
  private processStep(step: TranscriptStep): void {
    this.totalSteps++;
    this.latestStep = step;
    this.emit('step', step);

    if (step.content && typeof step.content === 'string') {
      const trimmed = step.content.trim();
      if (
        step.type === 'PLANNER_RESPONSE' ||
        step.source === 'MODEL' ||
        trimmed.startsWith('<thought>') ||
        trimmed.startsWith('Thinking')
      ) {
        const cleanThought = trimmed
          .replace(/<\/?thought>/g, '')
          .replace(/^#+\s*/, '')
          .trim();
        if (cleanThought) {
          this.latestThought = cleanThought;
          this.emit('thought', cleanThought);
        }
      }
    }

    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      for (const tc of step.tool_calls) {
        const parsedTc: ParsedToolCall = {
          stepIndex: step.step_index,
          timestamp: step.created_at || new Date().toISOString(),
          name: tc.name,
          args: tc.args || {},
          summary: tc.toolSummary || tc.args?.toolSummary,
          action: tc.toolAction || tc.args?.toolAction,
          status:
            step.status === 'ERROR'
              ? 'error'
              : step.status === 'DONE'
              ? 'completed'
              : 'running',
        };

        this.recentToolCalls.push(parsedTc);
        if (this.recentToolCalls.length > 50) {
          this.recentToolCalls.shift();
        }

        this.emit('tool_call', parsedTc);
      }
    }

    if (step.token_count) {
      if (typeof step.token_count === 'number') {
        this.tokenUsage = { total: step.token_count };
        this.emit('tokens', this.tokenUsage);
      } else if (typeof step.token_count === 'object') {
        this.tokenUsage = step.token_count;
        this.emit('tokens', this.tokenUsage);
      }
    }
  }

  /**
   * Starts periodic polling of the transcript file.
   */
  start(): this {
    if (this.timer) return this;

    this.poll().catch(() => {});

    this.timer = setInterval(() => {
      this.poll().catch(() => {});
    }, this.pollIntervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }

    return this;
  }

  /**
   * Stops polling and releases any timers.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    this.emit('end');
  }

  /**
   * Returns an aggregated statistics summary of the transcript stream.
   */
  getStats(): TranscriptStats {
    return {
      conversationId: this.conversationId,
      filePath: this.filePath,
      totalSteps: this.totalSteps,
      latestStep: this.latestStep,
      latestThought: this.latestThought,
      recentToolCalls: [...this.recentToolCalls],
      tokenUsage: this.tokenUsage,
      lastUpdated: new Date(),
    };
  }

  /**
   * Alias to getStats() for backward compatibility.
   */
  getSummary(): TranscriptSummary {
    return this.getStats();
  }
}
