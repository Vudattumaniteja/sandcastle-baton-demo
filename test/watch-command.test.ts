import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { watchCommand } from '../src/commands/watch.js';
import type { BatonRunSnapshot } from '../src/types/baton.js';

describe('watchCommand', () => {
  let tmpDir: string;
  let runJsonPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-watch-cmd-test-'));
    runJsonPath = path.join(tmpDir, '.sandcastle', 'run.json');
    fs.mkdirSync(path.dirname(runJsonPath), { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should output JSON snapshot when --json flag is provided', async () => {
    const snapshot: BatonRunSnapshot = {
      sessionId: 'sess-json-test',
      startTime: new Date().toISOString(),
      status: 'running',
      repo: 'owner/repo',
      mode: 'afk',
      currentIssue: 27,
      totalIssues: 1,
      closedCount: 0,
      blockedCount: 0,
      processedIssues: [],
      lastUpdated: new Date().toISOString(),
    };
    fs.writeFileSync(runJsonPath, JSON.stringify(snapshot), 'utf-8');

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: any) => logs.push(String(msg));

    try {
      await watchCommand({
        cwd: tmpDir,
        stateFilePath: runJsonPath,
        json: true,
      });

      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]);
      expect(parsed.snapshot.sessionId).toBe('sess-json-test');
      expect(parsed.snapshot.currentIssue).toBe(27);
    } finally {
      console.log = originalLog;
    }
  });

  it('should support --once flag to render single frame and exit', async () => {
    const chunks: string[] = [];
    const mockWriter = (text: string) => chunks.push(text);

    await watchCommand({
      cwd: tmpDir,
      stateFilePath: runJsonPath,
      once: true,
      writer: mockWriter,
    });

    const combined = chunks.join('');
    expect(combined).toContain('\x1b[?1049h');
    expect(combined).toContain('\x1b[?1049l');
    expect(combined).toContain('SANDCASTLE');
  });
});
