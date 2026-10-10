import fs from 'fs';
import path from 'path';

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

export interface TranscriptReadResult {
  newByteOffset: number;
  remainingBuffer: string;
  steps: TranscriptStep[];
  errors: Error[];
}

/**
 * Reads newly appended data from a transcript JSONL file from a given byte offset.
 */
export function readTranscriptDelta(
  filePath: string,
  lastByteOffset: number,
  lineBuffer: string
): TranscriptReadResult {
  if (!fs.existsSync(filePath)) {
    return {
      newByteOffset: lastByteOffset,
      remainingBuffer: lineBuffer,
      steps: [],
      errors: [],
    };
  }

  const stat = fs.statSync(filePath);
  if (stat.size <= lastByteOffset) {
    return {
      newByteOffset: lastByteOffset,
      remainingBuffer: lineBuffer,
      steps: [],
      errors: [],
    };
  }

  const bytesToRead = stat.size - lastByteOffset;
  const buffer = Buffer.alloc(bytesToRead);

  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, bytesToRead, lastByteOffset);
  } finally {
    fs.closeSync(fd);
  }

  const textChunk = buffer.toString('utf-8');
  const combined = lineBuffer + textChunk;
  const lines = combined.split(/\r?\n/);
  const remainingBuffer = lines.pop() ?? '';

  const steps: TranscriptStep[] = [];
  const errors: Error[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    try {
      const step = JSON.parse(line) as TranscriptStep;
      steps.push(step);
    } catch (err: any) {
      errors.push(new Error(`Failed to parse transcript line: ${err.message}`));
    }
  }

  return {
    newByteOffset: stat.size,
    remainingBuffer,
    steps,
    errors,
  };
}

/**
 * Locates the newest transcript file on disk based on conversation ID or timestamp.
 */
export function discoverTranscriptPath(
  appDataDir: string,
  conversationId?: string,
  filePath?: string
): { filePath?: string; conversationId?: string } {
  if (filePath && fs.existsSync(filePath)) {
    return { filePath, conversationId };
  }

  if (conversationId) {
    const specificPath = path.join(
      appDataDir,
      'brain',
      conversationId,
      '.system_generated',
      'logs',
      'transcript.jsonl'
    );
    if (fs.existsSync(specificPath)) {
      return { filePath: specificPath, conversationId };
    }
  }

  const brainDir = path.join(appDataDir, 'brain');
  if (!fs.existsSync(brainDir)) {
    return {};
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
          // Tolerates stat race conditions if a transcript file is deleted or locked
        }
      }
    }

    if (newestPath) {
      return { filePath: newestPath, conversationId: newestConvId };
    }
  } catch {
    // Tolerates missing directories or unreadable paths during auto-discovery
  }

  return {};
}
