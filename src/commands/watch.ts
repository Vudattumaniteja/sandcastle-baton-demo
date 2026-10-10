import fs from 'fs';
import path from 'path';
import type { BatonRunSnapshot } from '../types/baton.js';
import { WatchMonitor } from '../ui/watch-monitor.js';
import { TranscriptTailer } from '../core/transcript-tailer.js';
import { AntigravityService } from '../services/antigravity-service.js';

export interface WatchCommandOptions {
  interval?: string | number;
  file?: string;
  session?: string;
  json?: boolean;
  state?: string;
  stateFilePath?: string;
  once?: boolean;
  cwd?: string;
  writer?: (text: string) => void;
  stdin?: NodeJS.ReadStream;
  stdout?: NodeJS.WriteStream;
}

export async function watchCommand(
  options: WatchCommandOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const stateFilePath =
    options.stateFilePath ??
    options.state ??
    path.join(cwd, '.sandcastle', 'run.json');

  const refreshIntervalMs =
    typeof options.interval === 'number'
      ? options.interval
      : options.interval
      ? parseInt(options.interval, 10) || 500
      : 500;

  // Handle JSON output mode
  if (options.json) {
    let snapshot: BatonRunSnapshot | null = null;
    if (fs.existsSync(stateFilePath)) {
      try {
        const raw = fs.readFileSync(stateFilePath, 'utf-8');
        snapshot = JSON.parse(raw);
      } catch {
        // Tolerates concurrent write or partial JSON during state updates
      }
    }

    const tailer = new TranscriptTailer({
      filePath: options.file,
      conversationId: options.session,
    });
    await tailer.poll();
    const transcript = tailer.getSummary();

    const agyService = new AntigravityService();
    const statusline = await agyService.getStatuslineSnapshot();

    console.log(
      JSON.stringify(
        {
          status: snapshot ? snapshot.status : 'idle',
          snapshot,
          transcript,
          statusline,
          timestamp: new Date().toISOString(),
        },
        null,
        2
      )
    );
    return;
  }

  // Handle once mode (single frame render)
  if (options.once) {
    const monitor = new WatchMonitor({
      cwd,
      stateFilePath,
      transcriptPath: options.file,
      conversationId: options.session,
      renderOnce: true,
      writer: options.writer,
      stdin: options.stdin,
      stdout: options.stdout,
    });

    monitor.enterAlternateScreen();
    await monitor.render();
    monitor.exitAlternateScreen();
    return;
  }

  // Live alternate-screen interactive monitor
  return new Promise<void>((resolve) => {
    const monitor = new WatchMonitor({
      cwd,
      stateFilePath,
      transcriptPath: options.file,
      conversationId: options.session,
      refreshIntervalMs,
      writer: options.writer,
      stdin: options.stdin,
      stdout: options.stdout,
      onExit: () => {
        resolve();
      },
    });

    monitor.start();
  });
}
