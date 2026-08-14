import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { WatchMonitor } from '../src/ui/watch-monitor.js';
import type { BatonRunSnapshot } from '../src/types/baton.js';
import type { TranscriptStep } from '../src/types/transcript.js';

describe('WatchMonitor', () => {
  let tmpDir: string;
  let runJsonPath: string;
  let transcriptPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-watch-test-'));
    runJsonPath = path.join(tmpDir, '.sandcastle', 'run.json');
    transcriptPath = path.join(tmpDir, 'transcript.jsonl');
    fs.mkdirSync(path.dirname(runJsonPath), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should send alternate-screen enter and exit escape sequences', () => {
    const outputChunks: string[] = [];
    const mockWriter = (str: string) => outputChunks.push(str);

    const monitor = new WatchMonitor({
      cwd: tmpDir,
      stateFilePath: runJsonPath,
      transcriptPath,
      writer: mockWriter,
      renderOnce: true,
    });

    monitor.enterAlternateScreen();
    const entered = outputChunks.join('');
    expect(entered).toContain('\x1b[?1049h'); // Enter alternate screen
    expect(entered).toContain('\x1b[?25l');   // Hide cursor

    outputChunks.length = 0;
    monitor.exitAlternateScreen();
    const exited = outputChunks.join('');
    expect(exited).toContain('\x1b[?1049l');  // Exit alternate screen
    expect(exited).toContain('\x1b[?25h');   // Restore cursor
  });

  it('should render active session snapshot, reasoning, and tool calls', async () => {
    const snapshot: BatonRunSnapshot = {
      sessionId: 'test-session-123',
      startTime: new Date(Date.now() - 65000).toISOString(),
      status: 'running',
      repo: 'test-owner/test-repo',
      mode: 'afk',
      currentIssue: 27,
      totalIssues: 3,
      closedCount: 1,
      blockedCount: 0,
      processedIssues: [
        {
          number: 26,
          title: 'Previous Issue',
          status: 'completed',
          durationMs: 45000,
        },
      ],
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(runJsonPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    const step1: TranscriptStep = {
      step_index: 0,
      source: 'MODEL',
      type: 'PLANNER_RESPONSE',
      status: 'DONE',
      created_at: new Date().toISOString(),
      content: 'I am implementing the alternate-screen monitor.',
      tool_calls: [
        {
          name: 'replace_file_content',
          args: { TargetFile: 'src/ui/watch-monitor.ts' },
          toolAction: 'Editing watch monitor',
          toolSummary: 'Edit file',
        },
      ],
    };
    fs.writeFileSync(transcriptPath, `${JSON.stringify(step1)}\n`, 'utf-8');

    const outputChunks: string[] = [];
    const mockWriter = (str: string) => outputChunks.push(str);

    const monitor = new WatchMonitor({
      cwd: tmpDir,
      stateFilePath: runJsonPath,
      transcriptPath,
      writer: mockWriter,
      renderOnce: true,
    });

    await monitor.render();

    const rendered = outputChunks.join('');
    expect(rendered).toContain('test-session-123');
    expect(rendered).toContain('test-owner/test-repo');
    expect(rendered).toContain('Issue #27');
    expect(rendered).toContain('RUNNING');
    expect(rendered).toContain('I am implementing the alternate-screen monitor.');
    expect(rendered).toContain('replace_file_content');
    expect(rendered).toContain('Editing watch monitor');
  });

  it('should render idle status when run.json is not present', async () => {
    const outputChunks: string[] = [];
    const mockWriter = (str: string) => outputChunks.push(str);

    const monitor = new WatchMonitor({
      cwd: tmpDir,
      stateFilePath: path.join(tmpDir, 'nonexistent', 'run.json'),
      writer: mockWriter,
      renderOnce: true,
    });

    await monitor.render();

    const rendered = outputChunks.join('');
    expect(rendered).toContain('No active Sandcastle baton run detected');
    expect(rendered).toContain('Waiting for session');
  });

  it('should handle keyboard keypresses for q and Ctrl+C', () => {
    const mockStdin = new EventEmitter() as any;
    mockStdin.isTTY = true;
    mockStdin.setRawMode = vi.fn();
    mockStdin.resume = vi.fn();
    mockStdin.pause = vi.fn();

    const outputChunks: string[] = [];
    const mockWriter = (str: string) => outputChunks.push(str);
    const onExit = vi.fn();

    const monitor = new WatchMonitor({
      cwd: tmpDir,
      stateFilePath: runJsonPath,
      writer: mockWriter,
      stdin: mockStdin,
      renderOnce: true,
      onExit,
    });

    monitor.start();

    // Simulate pressing 'q'
    mockStdin.emit('data', Buffer.from('q'));
    expect(onExit).toHaveBeenCalledTimes(1);

    // Verify exit alternate screen was called
    const output = outputChunks.join('');
    expect(output).toContain('\x1b[?1049l');
    expect(output).toContain('\x1b[?25h');
  });
});
