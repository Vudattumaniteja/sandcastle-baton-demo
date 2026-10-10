import fs from 'fs';
import path from 'path';
import type { DoctorCheck } from '../../../types/doctor.js';

export type ProbeExecutor = (
  file: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string; exitCode: number }>;

/**
 * Checks Node.js runtime version compatibility.
 */
export async function probeNodeRuntime(): Promise<DoctorCheck> {
  const nodeMajor = parseInt(process.versions.node.split('.')[0] || '0', 10);
  const nodePassed = nodeMajor >= 18;
  return {
    id: 'node',
    name: 'Node.js Runtime',
    passed: nodePassed,
    message: `Node.js v${process.versions.node} (Required >= 18.0.0)`,
    fatal: !nodePassed,
    remediation: nodePassed
      ? undefined
      : 'Please install or upgrade to Node.js >= 18.0.0 (https://nodejs.org).',
  };
}

/**
 * Checks if current directory is inside a valid git workspace.
 */
export async function probeGitWorkspace(
  executor: ProbeExecutor
): Promise<DoctorCheck> {
  const gitRes = await executor('git', ['rev-parse', '--is-inside-work-tree']);
  const isGit = gitRes.exitCode === 0 && gitRes.stdout.trim().startsWith('true');
  let branchName = '';
  if (isGit) {
    const branchRes = await executor('git', ['branch', '--show-current']);
    branchName = branchRes.stdout.trim();
  }
  return {
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
  };
}

/**
 * Checks if GitHub CLI (gh) is installed and authenticated.
 */
export async function probeGhAuth(
  executor: ProbeExecutor
): Promise<DoctorCheck> {
  const ghRes = await executor('gh', ['auth', 'status']);
  const ghPassed = ghRes.exitCode === 0;
  return {
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
  };
}

/**
 * Checks if Google Antigravity CLI (agy) is installed in PATH.
 */
export async function probeAgyCli(
  executor: ProbeExecutor
): Promise<DoctorCheck> {
  const agyRes = await executor('agy', ['--version']);
  const agyPassed = agyRes.exitCode === 0;
  return {
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
  };
}

/**
 * Checks for presence of workspace gate assets (SKILL.md, CONTEXT.md, AGENTS.md).
 */
export async function probeWorkspaceAssets(cwd: string): Promise<DoctorCheck> {
  const requiredFiles = ['SKILL.md', 'CONTEXT.md', 'AGENTS.md'];
  const missingFiles: string[] = [];
  for (const file of requiredFiles) {
    if (!fs.existsSync(path.join(cwd, file))) {
      missingFiles.push(file);
    }
  }
  const assetsPassed = missingFiles.length === 0;
  return {
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
  };
}

/**
 * Checks Windows PowerShell for alias collision with 'sc' (Set-Content).
 */
export async function probePowerShellAlias(
  executor: ProbeExecutor
): Promise<DoctorCheck | null> {
  if (process.platform !== 'win32') {
    return null;
  }
  try {
    const psCheck = await executor('powershell', [
      '-NoProfile',
      '-Command',
      '(Get-Command sc -ErrorAction SilentlyContinue).CommandType',
    ]);
    const isAliased = psCheck.stdout.trim().toLowerCase() === 'alias';
    return {
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
    };
  } catch {
    return null;
  }
}
