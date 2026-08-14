import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TranscriptTailer } from '../src/core/transcript-tailer.js';
import type { TranscriptStep, ParsedToolCall } from '../src/types/transcript.js';

describe('TranscriptTailer', () => {
  let tmpDir: string;
  let logFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-tailer-test-'));
    logFile = path.join(tmpDir, 'transcript.jsonl');
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should parse existing transcript lines and emit step events', async () => {
    const step1: TranscriptStep = {
      step_index: 0,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'Fix bug #27',
    };

    const step2: TranscriptStep = {
      step_index: 1,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'I will analyze the issue.',
      tool_calls: [
        {
          name: 'view_file',
          args: { AbsolutePath: 'src/index.ts' },
          toolSummary: 'View file',
          toolAction: 'Viewing index.ts',
        },
      ],
    };

    fs.writeFileSync(logFile, `${JSON.stringify(step1)}\n${JSON.stringify(step2)}\n`, 'utf-8');

    const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
    const receivedSteps: TranscriptStep[] = [];
    const receivedToolCalls: ParsedToolCall[] = [];

    tailer.on('step', (step) => receivedSteps.push(step));
    tailer.on('tool_call', (tc) => receivedToolCalls.push(tc));

    await tailer.poll();

    expect(receivedSteps).toHaveLength(2);
    expect(receivedSteps[0].step_index).toBe(0);
    expect(receivedSteps[0].type).toBe('USER_INPUT');
    expect(receivedSteps[1].step_index).toBe(1);
    expect(receivedSteps[1].type).toBe('PLANNER_RESPONSE');

    expect(receivedToolCalls).toHaveLength(1);
    expect(receivedToolCalls[0].name).toBe('view_file');
    expect(receivedToolCalls[0].args.AbsolutePath).toBe('src/index.ts');
    expect(receivedToolCalls[0].action).toBe('Viewing index.ts');

    tailer.stop();
  });

  it('should continuously stream newly appended lines on subsequent polls', async () => {
    const step1: TranscriptStep = {
      step_index: 0,
      source: 'USER_EXPLICIT',
      type: 'USER_INPUT',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'Initial step',
    };

    fs.writeFileSync(logFile, `${JSON.stringify(step1)}\n`, 'utf-8');

    const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
    const receivedSteps: TranscriptStep[] = [];

    tailer.on('step', (step) => receivedSteps.push(step));

    await tailer.poll();
    expect(receivedSteps).toHaveLength(1);

    // Append new line
    const step2: TranscriptStep = {
      step_index: 1,
      source: 'MODEL',
      type: 'RUN_COMMAND',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'Output from npm test',
    };
    fs.appendFileSync(logFile, `${JSON.stringify(step2)}\n`, 'utf-8');

    await tailer.poll();
    expect(receivedSteps).toHaveLength(2);
    expect(receivedSteps[1].step_index).toBe(1);
    expect(receivedSteps[1].type).toBe('RUN_COMMAND');

    tailer.stop();
  });

  it('should handle partial line writes and buffer until newline arrives', async () => {
    const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
    const receivedSteps: TranscriptStep[] = [];

    tailer.on('step', (step) => receivedSteps.push(step));

    const fullJson = JSON.stringify({
      step_index: 0,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'Thinking about the architecture...',
    });

    // Write first half (incomplete JSON line)
    const part1 = fullJson.slice(0, 30);
    const part2 = fullJson.slice(30) + '\n';

    fs.writeFileSync(logFile, part1, 'utf-8');
    await tailer.poll();
    expect(receivedSteps).toHaveLength(0);

    // Write remainder with newline
    fs.appendFileSync(logFile, part2, 'utf-8');
    await tailer.poll();
    expect(receivedSteps).toHaveLength(1);
    expect(receivedSteps[0].content).toBe('Thinking about the architecture...');

    tailer.stop();
  });

  it('should gracefully skip malformed JSON lines without crashing', async () => {
    fs.writeFileSync(logFile, `not a valid json\n{"step_index":1,"type":"VALID","status":"DONE","created_at":"2026-01-01"}\n`, 'utf-8');

    const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
    const receivedSteps: TranscriptStep[] = [];
    const receivedErrors: string[] = [];

    tailer.on('step', (step) => receivedSteps.push(step));
    tailer.on('error', (err) => receivedErrors.push(err.message));

    await tailer.poll();

    expect(receivedSteps).toHaveLength(1);
    expect(receivedSteps[0].type).toBe('VALID');
    expect(receivedErrors).toHaveLength(1);

    tailer.stop();
  });

  it('should extract reasoning and thoughts from planner response steps', async () => {
    const thoughtText = 'We need to verify the seam boundaries before writing tests.';
    const step: TranscriptStep = {
      step_index: 2,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: thoughtText,
    };

    fs.writeFileSync(logFile, `${JSON.stringify(step)}\n`, 'utf-8');

    const tailer = new TranscriptTailer({ filePath: logFile, pollIntervalMs: 20 });
    const thoughts: string[] = [];

    tailer.on('thought', (th) => thoughts.push(th));

    await tailer.poll();

    expect(thoughts).toContain(thoughtText);
    const summary = tailer.getSummary();
    expect(summary.latestThought).toBe(thoughtText);
    expect(summary.totalSteps).toBe(1);

    tailer.stop();
  });

  it('should discover latest transcript from appDataDir when filePath is not specified', async () => {
    const mockBrainDir = path.join(tmpDir, 'brain');
    const conv1Dir = path.join(mockBrainDir, 'conv-old', '.system_generated', 'logs');
    const conv2Dir = path.join(mockBrainDir, 'conv-new', '.system_generated', 'logs');

    fs.mkdirSync(conv1Dir, { recursive: true });
    fs.mkdirSync(conv2Dir, { recursive: true });

    const fileOld = path.join(conv1Dir, 'transcript.jsonl');
    const fileNew = path.join(conv2Dir, 'transcript.jsonl');

    fs.writeFileSync(fileOld, `{"step_index":0,"type":"OLD"}\n`, 'utf-8');
    // Ensure mtime difference
    fs.writeFileSync(fileNew, `{"step_index":0,"type":"NEW"}\n`, 'utf-8');

    const tailer = new TranscriptTailer({
      appDataDir: tmpDir,
      pollIntervalMs: 20,
    });

    const discoveredPath = tailer.discoverTranscriptPath();
    expect(discoveredPath).toBeTruthy();
    expect(discoveredPath).toContain('conv-new');

    tailer.stop();
  });
});
