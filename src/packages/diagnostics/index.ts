import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import pc from 'picocolors';
import type {
  DoctorCheck,
  DoctorReport,
  DoctorServiceOptions,
} from '../../types/doctor.js';
import type {
  UpdateCommandOptions,
  UpdateResult,
} from '../../types/update.js';
import type { CommandExecutor } from '../../types/github.js';
import {
  probeNodeRuntime,
  probeGitWorkspace,
  probeGhAuth,
  probeAgyCli,
  probeWorkspaceAssets,
  probePowerShellAlias,
  type ProbeExecutor,
} from './lib/doctor-probes.js';
import { CI_WORKFLOW_CONTENT } from './lib/workflow-template.js';
import { resolveSandcastlePackageRoot } from './lib/package-root.js';

export {
  CI_WORKFLOW_CONTENT,
  resolveSandcastlePackageRoot,
  probeNodeRuntime,
  probeGitWorkspace,
  probeGhAuth,
  probeAgyCli,
  probeWorkspaceAssets,
  probePowerShellAlias,
  type ProbeExecutor,
};

export type {
  DoctorReport,
  DoctorCheck,
  DoctorServiceOptions,
  UpdateCommandOptions,
  UpdateResult,
};

export type DoctorCheckStatus = DoctorCheck;
export type UpdateOptions = UpdateCommandOptions;
export interface UpdateCheckStatus {
  isBehind: boolean;
  currentVersion: string;
  latestVersion: string;
}

/**
 * DoctorEngine: Workspace, runtime, and toolchain diagnostic verification engine.
 */
export class DoctorEngine {
  private cwd: string;
  private executor: ProbeExecutor;

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

    checks.push(await probeNodeRuntime());
    checks.push(await probeGitWorkspace(this.executor));
    checks.push(await probeGhAuth(this.executor));
    checks.push(await probeAgyCli(this.executor));
    checks.push(await probeWorkspaceAssets(this.cwd));

    const psCheck = await probePowerShellAlias(this.executor);
    if (psCheck) {
      checks.push(psCheck);
    }

    const healthy = checks.every((c) => (c.fatal ? c.passed : true));

    return {
      healthy,
      checks,
    };
  }
}

export const defaultUpdateExecutor: CommandExecutor = async (file, args, options = {}) => {
  try {
    const res = await execa(file, args, options as any);
    return {
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? '',
      exitCode: res.exitCode ?? 0,
    };
  } catch (err: any) {
    return {
      stdout: err?.stdout ?? '',
      stderr: err?.stderr ?? err?.message ?? '',
      exitCode: err?.exitCode ?? 1,
    };
  }
};

/**
 * UpdateEngine: Self-update orchestration, git syncing, and CI workflow generator.
 */
export class UpdateEngine {
  /**
   * Executes the update synchronization and CI workflow generation lifecycle.
   */
  static async execute(options: UpdateCommandOptions = {}): Promise<UpdateResult> {
    const executor = options.executor ?? options.commandExecutor ?? defaultUpdateExecutor;

    let cwd = options.cwd;
    if (!cwd) {
      const curGitCheck = await executor('git', ['rev-parse', '--is-inside-work-tree'], {
        cwd: process.cwd(),
      });
      const curIsGit =
        curGitCheck.exitCode === 0 && curGitCheck.stdout.trim().toLowerCase() === 'true';

      if (curIsGit) {
        cwd = process.cwd();
      } else {
        const sandcastleRoot = resolveSandcastlePackageRoot();
        if (sandcastleRoot) {
          const rootGitCheck = await executor('git', ['rev-parse', '--is-inside-work-tree'], {
            cwd: sandcastleRoot,
          });
          if (
            rootGitCheck.exitCode === 0 &&
            rootGitCheck.stdout.trim().toLowerCase() === 'true'
          ) {
            cwd = sandcastleRoot;
          }
        }
      }
    }
    cwd = cwd ?? process.cwd();

    const ciPath = path.join(cwd, '.github', 'workflows', 'ci.yml');
    const workflowMissing = !fs.existsSync(ciPath);

    if (options.cwd === undefined && cwd !== process.cwd() && !options.json) {
      console.log(pc.cyan(`→ Targeting Sandcastle installation at ${cwd}`));
    }

    try {
      const gitCheck = await executor('git', ['rev-parse', '--is-inside-work-tree'], { cwd });
      const isGit = gitCheck.exitCode === 0 && gitCheck.stdout.trim().toLowerCase() === 'true';

      if (!isGit) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion: 'unknown',
          latestVersion: 'unknown',
          ciUpdated: false,
          message: 'Current working directory is not a Git repository clone.',
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ Error: ${result.message}`));
        }
        return result;
      }

      const fetchRes = await executor('git', ['fetch', 'origin', 'main'], { cwd });
      if (fetchRes.exitCode !== 0) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion: 'unknown',
          latestVersion: 'unknown',
          ciUpdated: false,
          message: `Failed to fetch updates from remote origin: ${fetchRes.stderr.trim() || 'git fetch origin main failed'}`,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ Error: ${result.message}`));
        }
        return result;
      }

      const headRes = await executor('git', ['rev-parse', 'HEAD'], { cwd });
      if (headRes.exitCode !== 0) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion: 'unknown',
          latestVersion: 'unknown',
          ciUpdated: false,
          message: `Failed to resolve current git HEAD: ${headRes.stderr.trim() || 'git rev-parse HEAD failed'}`,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ Error: ${result.message}`));
        }
        return result;
      }
      let currentVersion = headRes.stdout.trim();

      const originRes = await executor('git', ['rev-parse', 'origin/main'], { cwd });
      if (originRes.exitCode !== 0) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion,
          latestVersion: 'unknown',
          ciUpdated: false,
          message: `Failed to resolve remote origin/main commit: ${originRes.stderr.trim() || 'git rev-parse origin/main failed'}`,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ Error: ${result.message}`));
        }
        return result;
      }
      const latestVersion = originRes.stdout.trim();
      let isBehind = currentVersion !== latestVersion;
      if (isBehind) {
        const revListRes = await executor('git', ['rev-list', 'HEAD..origin/main', '--count'], { cwd });
        if (revListRes.exitCode === 0) {
          const count = parseInt(revListRes.stdout.trim(), 10);
          if (!isNaN(count) && count === 0) {
            isBehind = false;
          }
        }
      }

      if (options.check) {
        const result: UpdateResult = {
          success: true,
          updated: false,
          currentVersion,
          latestVersion,
          ciUpdated: false,
          message: isBehind
            ? `Update available: ${currentVersion} -> ${latestVersion}`
            : `Sandcastle is up to date (${currentVersion})`,
        };

        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (isBehind) {
            console.log(pc.yellow(`ℹ Update available: ${currentVersion} -> ${latestVersion}`));
            console.log(pc.dim("  Run 'sandcastle update' to pull changes and rebuild."));
          } else {
            console.log(pc.green(`✔ Sandcastle is up to date (${currentVersion}).`));
          }
        }
        return result;
      }

      let updated = false;
      if (isBehind || options.force) {
        if (!options.json) {
          console.log(pc.cyan('→ Pulling latest updates from remote...'));
        }
        const pullRes = await executor('git', ['pull', 'origin', 'main'], { cwd });
        if (pullRes.exitCode !== 0) {
          const result: UpdateResult = {
            success: false,
            updated: false,
            currentVersion,
            latestVersion,
            ciUpdated: false,
            message: `Failed to pull updates from origin/main: ${pullRes.stderr.trim() || pullRes.stdout.trim() || 'git pull failed'}`,
          };
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.error(pc.red(`✖ ${result.message}`));
          }
          return result;
        }

        if (!options.json) {
          console.log(pc.cyan('→ Installing dependencies...'));
        }
        const installRes = await executor('npm', ['install'], { cwd });
        if (installRes.exitCode !== 0) {
          const result: UpdateResult = {
            success: false,
            updated: false,
            currentVersion,
            latestVersion,
            ciUpdated: false,
            message: `Failed to install dependencies: ${installRes.stderr.trim() || 'npm install failed'}`,
          };
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.error(pc.red(`✖ ${result.message}`));
          }
          return result;
        }

        if (!options.json) {
          console.log(pc.cyan('→ Rebuilding Sandcastle binary...'));
        }
        const buildRes = await executor('npm', ['run', 'build'], { cwd });
        if (buildRes.exitCode !== 0) {
          const result: UpdateResult = {
            success: false,
            updated: false,
            currentVersion,
            latestVersion,
            ciUpdated: false,
            message: `Failed to build project: ${buildRes.stderr.trim() || 'npm run build failed'}`,
          };
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.error(pc.red(`✖ ${result.message}`));
          }
          return result;
        }

        if (!options.json) {
          console.log(pc.cyan('→ Verifying build...'));
        }

        const verifyRes = await executor('npm', ['run', 'build:verify'], { cwd });
        if (verifyRes.exitCode !== 0) {
          const result: UpdateResult = {
            success: false,
            updated: false,
            currentVersion,
            latestVersion,
            ciUpdated: false,
            message: `Build verification failed: ${verifyRes.stderr.trim() || verifyRes.stdout.trim() || 'npm run build:verify failed'}`,
          };
          if (options.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.error(pc.red(`✖ ${result.message}`));
          }
          return result;
        }

        // Refresh currentVersion following git pull
        const updatedHeadRes = await executor('git', ['rev-parse', 'HEAD'], { cwd });
        if (updatedHeadRes.exitCode === 0 && updatedHeadRes.stdout.trim()) {
          currentVersion = updatedHeadRes.stdout.trim();
        }
        updated = true;
      }

      let ciUpdated = false;
      if (options.ci || workflowMissing) {
        fs.mkdirSync(path.dirname(ciPath), { recursive: true });
        fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');
        ciUpdated = true;
      }

      let message = '';
      if (updated) {
        if (options.force && !isBehind) {
          message = `Force reinstalled and rebuilt Sandcastle at ${currentVersion}${ciUpdated ? '; CI workflow updated' : ''}.`;
        } else {
          message = `Successfully updated Sandcastle to ${latestVersion}${ciUpdated ? '; CI workflow updated' : ''}.`;
        }
      } else if (ciUpdated) {
        message = `Sandcastle is up to date (${currentVersion}); CI workflow updated.`;
      } else {
        message = `Sandcastle is already up to date (${currentVersion}).`;
      }

      const result: UpdateResult = {
        success: true,
        updated,
        currentVersion,
        latestVersion,
        ciUpdated,
        message,
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (updated) {
          console.log(pc.green(`✔ ${message}`));
        } else if (ciUpdated) {
          console.log(pc.green(`✔ ${message}`));
        } else {
          console.log(pc.cyan(`ℹ ${message}`));
        }
      }

      return result;
    } catch (error: any) {
      const result: UpdateResult = {
        success: false,
        updated: false,
        currentVersion: 'unknown',
        latestVersion: 'unknown',
        ciUpdated: false,
        message: error?.message || String(error),
      };

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.error(pc.red(`✖ Error updating Sandcastle: ${result.message}`));
      }
      return result;
    }
  }
}
