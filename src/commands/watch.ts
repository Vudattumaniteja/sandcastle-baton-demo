import path from 'path';
import { WatchMonitor } from '#packages/terminal';
import { TranscriptTailer, getQuotaSnapshot } from '#packages/worker-runtime';
import { RunStateStore } from '#packages/state';

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
    const store = new RunStateStore({ cwd, stateFilePath });
    const snapshot = store.read();

    const tailer = new TranscriptTailer({
      filePath: options.file,
      conversationId: options.session,
    });
    await tailer.poll();
    const transcript = tailer.getSummary();

    const statusline = await getQuotaSnapshot();

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
