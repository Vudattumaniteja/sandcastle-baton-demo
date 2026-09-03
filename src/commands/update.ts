import fs from 'node:fs';
import path from 'node:path';
import { execa } from 'execa';
import pc from 'picocolors';
import type { CommandExecutor } from '../types/github.js';
import type { UpdateCommandOptions, UpdateResult } from '../types/update.js';

export * from '../types/update.js';

export const CI_WORKFLOW_CONTENT = `name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Node \${{ matrix.node-version }} on \${{ matrix.os }}
    runs-on: \${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
        node-version: [18, 20, 22]

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js \${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: \${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run typecheck
        run: npm run typecheck

      - name: Build project
        run: npm run build

      - name: Verify build packaging
        run: npm run build:verify

      - name: Run test suite
        run: npm test
`;

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
 * Executes the update command to synchronize, rebuild, and configure Sandcastle.
 */
export async function updateCommand(
  options: UpdateCommandOptions = {}
): Promise<UpdateResult> {
  const cwd = options.cwd ?? process.cwd();
  const executor = options.executor ?? options.commandExecutor ?? defaultUpdateExecutor;
  const ciPath = path.join(cwd, '.github', 'workflows', 'ci.yml');
  const workflowMissing = !fs.existsSync(ciPath);

  try {
    // 1. Detect if running inside a Git clone
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

    // 2. Fetch origin/main
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

    // 3. Resolve current HEAD commit / version
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

    // 4. Resolve latest remote origin/main commit / version
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
    const isBehind = currentVersion !== latestVersion;

    // 5. Check mode: report status without applying updates or modifying files
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

    // 6. Pull changes and rebuild if behind or forced
    let updated = false;
    if (isBehind || options.force) {
      // Step A: pull changes
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

      // Step B: npm install
      const installRes = await executor('npm', ['install'], { cwd });
      if (installRes.exitCode !== 0) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion,
          latestVersion,
          ciUpdated: false,
          message: `Failed to install dependencies: ${installRes.stderr.trim() || installRes.stdout.trim() || 'npm install failed'}`,
        };
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ ${result.message}`));
        }
        return result;
      }

      // Step C: npm run build
      const buildRes = await executor('npm', ['run', 'build'], { cwd });
      if (buildRes.exitCode !== 0) {
        const result: UpdateResult = {
          success: false,
          updated: false,
          currentVersion,
          latestVersion,
          ciUpdated: false,
          message: `Failed to build project: ${buildRes.stderr.trim() || buildRes.stdout.trim() || 'npm run build failed'}`,
        };
        if (options.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.error(pc.red(`✖ ${result.message}`));
        }
        return result;
      }

      // Step D: npm run build:verify
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

    // 7. Manage CI workflow file (.github/workflows/ci.yml)
    let ciUpdated = false;
    if (options.ci || workflowMissing) {
      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');
      ciUpdated = true;
    }

    // 8. Construct user message and result
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
