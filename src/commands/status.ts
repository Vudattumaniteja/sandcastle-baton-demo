import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import type { BatonRunSnapshot } from '../types/baton.js';

export interface StatusCommandOptions {
  json?: boolean;
  stateFilePath?: string;
  cwd?: string;
}

export async function statusCommand(
  options: StatusCommandOptions = {}
): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const stateFilePath =
    options.stateFilePath ?? path.join(cwd, '.sandcastle', 'run.json');

  if (!fs.existsSync(stateFilePath)) {
    if (options.json) {
      console.log(
        JSON.stringify({ status: 'idle', message: 'No active or past baton runs recorded.' }, null, 2)
      );
    } else {
      console.log(`\n${pc.yellow('No Sandcastle baton runs found in this workspace.')}`);
      console.log(pc.gray('Run `sandcastle run <issue>` or `sandcastle` to start an autonomous baton.\n'));
    }
    return;
  }

  let snapshot: BatonRunSnapshot;
  try {
    const raw = fs.readFileSync(stateFilePath, 'utf-8');
    snapshot = JSON.parse(raw) as BatonRunSnapshot;
  } catch (err: any) {
    if (options.json) {
      console.log(JSON.stringify({ status: 'error', error: err.message }, null, 2));
    } else {
      console.error(pc.red(`Failed to parse baton snapshot: ${err.message}`));
    }
    return;
  }

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }

  const statusColor =
    snapshot.status === 'completed'
      ? pc.green
      : snapshot.status === 'running'
      ? pc.cyan
      : snapshot.status === 'blocked'
      ? pc.red
      : pc.yellow;

  console.log(`\n${pc.bold(pc.cyan('Sandcastle Baton Run Status'))}`);
  console.log(pc.gray('===============================================\n'));
  console.log(`  ${pc.bold('Session ID:')}   ${pc.gray(snapshot.sessionId)}`);
  console.log(`  ${pc.bold('Repository:')}   ${pc.magenta(snapshot.repo)}`);
  console.log(`  ${pc.bold('Mode:')}         ${snapshot.mode}`);
  console.log(`  ${pc.bold('Status:')}       ${statusColor(snapshot.status.toUpperCase())}`);
  if (snapshot.currentIssue) {
    console.log(`  ${pc.bold('Active Issue:')} #${snapshot.currentIssue}`);
  }
  console.log(`  ${pc.bold('Progress:')}     ${snapshot.closedCount}/${snapshot.totalIssues} closed (${snapshot.blockedCount} blocked)`);
  console.log(`  ${pc.bold('Start Time:')}   ${new Date(snapshot.startTime).toLocaleString()}`);
  if (snapshot.endTime) {
    console.log(`  ${pc.bold('End Time:')}     ${new Date(snapshot.endTime).toLocaleString()}`);
  }
  console.log(`  ${pc.bold('Last Updated:')} ${new Date(snapshot.lastUpdated).toLocaleString()}`);

  if (snapshot.processedIssues && snapshot.processedIssues.length > 0) {
    console.log(`\n${pc.bold('Processed Issues:')}`);
    for (const issue of snapshot.processedIssues) {
      const icon =
        issue.status === 'completed'
          ? pc.green('✔')
          : issue.status === 'blocked'
          ? pc.red('✖')
          : pc.gray('○');
      const dur = `${(issue.durationMs / 1000).toFixed(1)}s`;
      console.log(`  ${icon} #${issue.number} - ${issue.title} ${pc.gray(`(${dur})`)}`);
      if (issue.error) {
        console.log(`    ${pc.red(`Error: ${issue.error}`)}`);
      }
    }
  }

  console.log('');
}
