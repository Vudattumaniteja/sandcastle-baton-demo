import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import type {
  DoctorCheck,
  DoctorReport,
  DoctorServiceOptions,
} from '../types/doctor.js';

export class DoctorService {
  private cwd: string;
  private executor: (
    file: string,
    args: string[]
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

  constructor(options: DoctorServiceOptions = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.executor =
      options.commandExecutor ??
      (async (file, args) => {
        try {
          const res = await execa(file, args, { cwd: this.cwd });
          return {
            stdout: res.stdout,
            stderr: res.stderr,
            exitCode: res.exitCode ?? 0,
          };
        } catch (err: any) {
          return {
            stdout: err?.stdout ?? '',
            stderr: err?.stderr ?? err?.message ?? '',
            exitCode: err?.exitCode ?? 1,
          };
        }
      });
  }

  /**
   * Runs complete system, toolchain, and workspace diagnostics.
   */
  async runDiagnostics(): Promise<DoctorReport> {
    const checks: DoctorCheck[] = [];

    // 1. Node.js Version Check
    const nodeMajor = parseInt(process.versions.node.split('.')[0] || '0', 10);
    const nodePassed = nodeMajor >= 18;
    checks.push({
      id: 'node',
      name: 'Node.js Runtime',
      passed: nodePassed,
      message: `Node.js v${process.versions.node} (Required >= 18.0.0)`,
      fatal: !nodePassed,
      remediation: nodePassed
        ? undefined
        : 'Please install or upgrade to Node.js >= 18.0.0 (https://nodejs.org).',
    });

    // 2. Git Workspace Check
    const gitRes = await this.executor('git', ['rev-parse', '--is-inside-work-tree']);
    const isGit = gitRes.exitCode === 0 && gitRes.stdout.trim().startsWith('true');
    let branchName = '';
    if (isGit) {
      const branchRes = await this.executor('git', ['branch', '--show-current']);
      branchName = branchRes.stdout.trim();
    }
    checks.push({
      id: 'git',
      name: 'Git Workspace',
      passed: isGit,
      message: isGit
        ? `Valid Git repository (Active branch: ${branchName || 'HEAD'})`
        : 'Current directory is not a Git repository.',
      fatal: !isGit,
      remediation: isGit
        ? undefined
        : 'Run `git init` or execute sandcastle from within a git repository workspace.',
    });

    // 3. GitHub CLI (gh) Auth Check
    const ghRes = await this.executor('gh', ['auth', 'status']);
    const ghPassed = ghRes.exitCode === 0;
    checks.push({
      id: 'gh-auth',
      name: 'GitHub CLI Auth',
      passed: ghPassed,
      message: ghPassed
        ? 'GitHub CLI (gh) is authenticated and functional.'
        : 'GitHub CLI (gh) is not authenticated or not installed in PATH.',
      fatal: !ghPassed,
      remediation: ghPassed
        ? undefined
        : 'Run `gh auth login` to authenticate the GitHub CLI.',
    });

    // 4. Antigravity CLI (agy) Availability Check
    const agyRes = await this.executor('agy', ['--version']);
    const agyPassed = agyRes.exitCode === 0;
    checks.push({
      id: 'agy-cli',
      name: 'Antigravity CLI (agy)',
      passed: agyPassed,
      message: agyPassed
        ? `Antigravity CLI is installed (${agyRes.stdout.trim() || 'Ready'})`
        : 'Antigravity CLI (`agy`) not found in PATH.',
      fatal: false, // Non-fatal if running in alternative environments
      remediation: agyPassed
        ? undefined
        : 'Install or add Google Antigravity CLI (`agy`) to PATH.',
    });

    // 5. Workspace Gate Assets (SKILL.md, CONTEXT.md, AGENTS.md)
    const requiredFiles = ['SKILL.md', 'CONTEXT.md', 'AGENTS.md'];
    const missingFiles: string[] = [];
    for (const file of requiredFiles) {
      if (!fs.existsSync(path.join(this.cwd, file))) {
        missingFiles.push(file);
      }
    }
    const assetsPassed = missingFiles.length === 0;
    checks.push({
      id: 'workspace-assets',
      name: 'Workspace Gate Assets',
      passed: assetsPassed,
      message: assetsPassed
        ? 'All required workspace assets present (SKILL.md, CONTEXT.md, AGENTS.md).'
        : `Missing workspace asset(s): ${missingFiles.join(', ')}`,
      fatal: false,
      remediation: assetsPassed
        ? undefined
        : `Create the missing domain documentation files: ${missingFiles.join(', ')}.`,
    });

    // 6. Windows PowerShell Alias Conflict Check (sc -> Set-Content)
    if (process.platform === 'win32') {
      try {
        const psCheck = await this.executor('powershell', [
          '-NoProfile',
          '-Command',
          '(Get-Command sc -ErrorAction SilentlyContinue).CommandType',
        ]);
        const isAliased = psCheck.stdout.trim().toLowerCase() === 'alias';
        checks.push({
          id: 'ps-sc-alias',
          name: 'PowerShell "sc" Alias Conflict',
          passed: !isAliased,
          message: isAliased
            ? 'PowerShell built-in alias `sc` points to `Set-Content`, shadowing Sandcastle CLI shorthand.'
            : 'No conflicting `sc` alias in PowerShell.',
          fatal: false,
          remediation: isAliased
            ? 'Run `Remove-Alias -Name sc -Force -ErrorAction SilentlyContinue` in your PowerShell profile, or invoke full `sandcastle` binary.'
            : undefined,
        });
      } catch {
        // Non-fatal if PowerShell command execution fails
      }
    }

    const healthy = checks.every((c) => (c.fatal ? c.passed : true));

    return {
      healthy,
      checks,
    };
  }
}
