import { Command } from 'commander';
import { runCommand } from '../commands/run.js';
import { statusCommand } from '../commands/status.js';
import { doctorCommand } from '../commands/doctor.js';
import { wizardCommand } from '../commands/wizard.js';
import { watchCommand } from '../commands/watch.js';
import {
  configGetCommand,
  configSetCommand,
  configListCommand,
} from '../commands/config.js';

const program = new Command();

program
  .name('sandcastle')
  .description(
    'Autonomous, sequential GitHub issue baton orchestrator for AI coding agents'
  )
  .version(
    typeof __SANDCASTLE_VERSION__ !== 'undefined'
      ? __SANDCASTLE_VERSION__
      : '0.1.0',
    '-v, --version',
    'Output the current version'
  )
  .helpOption('-h, --help', 'Display help for command');

// 0. wizard command
program
  .command('wizard')
  .description('Launch the interactive guided Sandcastle baton wizard')
  .action(async () => {
    await wizardCommand();
  });

// 1. run command
program
  .command('run [issue]')
  .description('Run an autonomous issue baton loop')
  .option('-a, --all', 'Process all open ready issues in backlog sequentially')
  .option('-m, --model <name>', 'LLM model to use for Antigravity workers')
  .option(
    '-e, --effort <low|medium|high>',
    'Reasoning effort level (low, medium, high)'
  )
  .option(
    '--mode <afk|supervised|dry-run>',
    'Execution mode (afk, supervised, dry-run)',
    'afk'
  )
  .option('-t, --timeout <duration>', 'Timeout per issue (e.g. 30m)')
  .option('--retries <N>', 'Max retry attempts per issue', '2')
  .option('--auto-pr', 'Automatically create Pull Request upon verified tests', true)
  .option('--auto-merge', 'Automatically merge Pull Request upon creation', true)
  .option('--prompt-template <path>', 'Path to custom markdown prompt template')
  .option('--json', 'Output structured JSON format')
  .option('--quiet', 'Suppress non-essential progress output')
  .action(async (issue, options) => {
    await runCommand(issue, options);
  });

// 2. status command
program
  .command('status')
  .description('Display status snapshot of current or latest baton execution')
  .option('--json', 'Output raw JSON snapshot')
  .action(async (options) => {
    await statusCommand(options);
  });

// 3. doctor command
program
  .command('doctor')
  .description('Validate workspace health, toolchain, and gate requirements')
  .option('--json', 'Output structured diagnostic JSON report')
  .action(async (options) => {
    await doctorCommand(options);
  });

// 4. config command
const configCmd = program
  .command('config')
  .description('Manage Sandcastle 3-tier configuration');

configCmd
  .command('get <key>')
  .description('Get the effective value of a configuration key')
  .option('--json', 'Output in JSON format')
  .action((key, options) => {
    configGetCommand(key, options);
  });

configCmd
  .command('set <key> <value>')
  .description('Set a configuration key in local or global config')
  .option('-g, --global', 'Set globally in ~/.sandcastle/config.json')
  .action((key, value, options) => {
    configSetCommand(key, value, options);
  });

configCmd
  .command('list')
  .description('List configurations across all tiers (defaults, global, local, resolved)')
  .option('--json', 'Output in JSON format')
  .action((options) => {
    configListCommand(options);
  });

// 5. watch command
program
  .command('watch')
  .description('Live alternate-screen terminal monitor streaming agent transcripts and progress')
  .option('-i, --interval <ms>', 'Refresh polling interval in milliseconds', '500')
  .option('-f, --file <path>', 'Explicit transcript JSONL file path to stream')
  .option('-s, --session <id>', 'Specific Antigravity session/conversation ID to attach to')
  .option('--state <path>', 'Custom path to .sandcastle/run.json state file')
  .option('--once', 'Render a single snapshot frame and exit')
  .option('--json', 'Output live monitoring snapshot in JSON format')
  .action(async (options) => {
    await watchCommand(options);
  });

// If no arguments provided in process.argv, check if interactive terminal (TTY)
if (process.argv.slice(2).length === 0) {
  if (process.stdout.isTTY) {
    wizardCommand().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  } else {
    program.outputHelp();
  }
} else {
  program.parse(process.argv);
}
