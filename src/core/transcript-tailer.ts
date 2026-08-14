import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import os from 'os';
import type {
  TranscriptStep,
  ParsedToolCall,
  TranscriptTailerOptions,
  TranscriptTailerEventMap,
  TranscriptSummary,
} from '../types/transcript.js';

export class TranscriptTailer extends EventEmitter {
  private options: TranscriptTailerOptions;
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
    this.options = options;
    this.filePath = options.filePath;
    this.conversationId = options.conversationId;
    this.pollIntervalMs = options.pollIntervalMs ?? 300;
    this.appDataDir =
      options.appDataDir ??
      process.env.GEMINI_APP_DIR ??
      path.join(os.homedir(), '.gemini', 'antigravity-cli');
  }

  // Type-safe event overrides
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
    if (this.filePath && fs.existsSync(this.filePath)) {
      return this.filePath;
    }

    if (this.conversationId) {
      const specificPath = path.join(
        this.appDataDir,
        'brain',
        this.conversationId,
        '.system_generated',
        'logs',
        'transcript.jsonl'
      );
      if (fs.existsSync(specificPath)) {
        this.filePath = specificPath;
        return specificPath;
      }
    }

    const brainDir = path.join(this.appDataDir, 'brain');
    if (!fs.existsSync(brainDir)) {
      return undefined;
    }

    try {
      const entries = fs.readdirSync(brainDir, { withFileTypes: true });
      let newestPath: string | undefined;
      let newestMtime = 0;
      let newestConvId: string | undefined;

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const candidate = path.join(
          brainDir,
          entry.name,
          '.system_generated',
          'logs',
          'transcript.jsonl'
        );
        if (fs.existsSync(candidate)) {
          try {
            const stat = fs.statSync(candidate);
            if (stat.mtimeMs > newestMtime) {
              newestMtime = stat.mtimeMs;
              newestPath = candidate;
              newestConvId = entry.name;
            }
          } catch {
            // Ignore stat errors
          }
        }
      }

      if (newestPath) {
        this.filePath = newestPath;
        if (!this.conversationId) {
          this.conversationId = newestConvId;
        }
        return newestPath;
      }
    } catch {
      // Ignore read errors
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
      if (!targetPath || !fs.existsSync(targetPath)) {
        return;
      }

      const stat = fs.statSync(targetPath);
      if (stat.size <= this.lastByteOffset) {
        // No new bytes
        return;
      }

      const bytesToRead = stat.size - this.lastByteOffset;
      const buffer = Buffer.alloc(bytesToRead);

      const fd = fs.openSync(targetPath, 'r');
      try {
        fs.readSync(fd, buffer, 0, bytesToRead, this.lastByteOffset);
      } finally {
        fs.closeSync(fd);
      }

      this.lastByteOffset = stat.size;
      const textChunk = buffer.toString('utf-8');
      const combined = this.lineBuffer + textChunk;

      const lines = combined.split(/\r?\n/);
      // The last element is whatever remains after the trailing newline
      this.lineBuffer = lines.pop() ?? '';

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        let step: TranscriptStep;
        try {
          step = JSON.parse(line) as TranscriptStep;
        } catch (err: any) {
          this.emit('error', new Error(`Failed to parse transcript line: ${err.message}`));
          continue;
        }

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

    // Extract thoughts / reasoning
    if (step.content && typeof step.content === 'string') {
      const trimmed = step.content.trim();
      if (
        step.type === 'PLANNER_RESPONSE' ||
        step.source === 'MODEL' ||
        trimmed.startsWith('<thought>') ||
        trimmed.startsWith('Thinking')
      ) {
        // Strip tags if present
        let cleanThought = trimmed
          .replace(/<\/?thought>/g, '')
          .replace(/^#+\s*/, '')
          .trim();
        if (cleanThought) {
          this.latestThought = cleanThought;
          this.emit('thought', cleanThought);
        }
      }
    }

    // Extract tool calls
    if (Array.isArray(step.tool_calls) && step.tool_calls.length > 0) {
      for (const tc of step.tool_calls) {
        const parsedTc: ParsedToolCall = {
          stepIndex: step.step_index,
          timestamp: step.created_at || new Date().toISOString(),
          name: tc.name,
          args: tc.args || {},
          summary: tc.toolSummary || tc.args?.toolSummary,
          action: tc.toolAction || tc.args?.toolAction,
          status: step.status === 'ERROR' ? 'error' : step.status === 'DONE' ? 'completed' : 'running',
        };

        this.recentToolCalls.push(parsedTc);
        if (this.recentToolCalls.length > 50) {
          this.recentToolCalls.shift();
        }

        this.emit('tool_call', parsedTc);
      }
    }

    // Extract token usage
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

    // Run first poll asynchronously
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
   * Returns an aggregated summary of the transcript stream.
   */
  getSummary(): TranscriptSummary {
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
}
