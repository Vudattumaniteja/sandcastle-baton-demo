import pc from 'picocolors';
import { DoctorService } from '../services/doctor-service.js';

export interface DoctorCommandOptions {
  json?: boolean;
  cwd?: string;
}

export async function doctorCommand(
  options: DoctorCommandOptions = {},
  service?: DoctorService
): Promise<void> {
  const doctor = service ?? new DoctorService({ cwd: options.cwd });
  const report = await doctor.runDiagnostics();

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    if (!report.healthy) {
      process.exit(1);
    }
    return;
  }

  console.log(`\n${pc.bold(pc.cyan('Sandcastle Environment Diagnostics (Doctor)'))}`);
  console.log(pc.gray('===============================================\n'));

  for (const check of report.checks) {
    if (check.passed) {
      console.log(`  ${pc.green('✔')} ${pc.bold(check.name)}: ${pc.gray(check.message)}`);
    } else {
      const icon = check.fatal ? pc.red('✖') : pc.yellow('!');
      console.log(`  ${icon} ${pc.bold(check.name)}: ${check.message}`);
      if (check.remediation) {
        console.log(`    ${pc.dim('↳ Remediation:')} ${pc.cyan(check.remediation)}`);
      }
    }
  }

  console.log('');
  if (report.healthy) {
    console.log(pc.green('✔ System and workspace are healthy and ready for Sandcastle batons.\n'));
  } else {
    console.log(pc.red('✖ One or more fatal diagnostic checks failed. Please remediate before running batons.\n'));
    process.exit(1);
  }
}
