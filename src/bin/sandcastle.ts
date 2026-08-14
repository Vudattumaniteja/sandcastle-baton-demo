import { Command } from 'commander';

const program = new Command();

program
  .name('sandcastle')
  .description('Autonomous, sequential GitHub issue baton orchestrator for AI coding agents')
  .version(__SANDCASTLE_VERSION__, '-v, --version', 'Output the current version')
  .helpOption('-h, --help', 'Display help for command');

program.parse(process.argv);
