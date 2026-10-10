import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  DoctorEngine,
  UpdateEngine,
  resolveSandcastlePackageRoot,
  CI_WORKFLOW_CONTENT,
  probeNodeRuntime,
  probeGitWorkspace,
  probeGhAuth,
  probeAgyCli,
  probeWorkspaceAssets,
  probePowerShellAlias,
} from '#packages/diagnostics';

describe('packages/diagnostics', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-diagnostics-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Tolerates ENOENT or file lock race during tempDir cleanup
    }
  });

  describe('DoctorEngine & doctor-probes', () => {
    it('should probe node runtime version >= 18', async () => {
      const check = await probeNodeRuntime();
      expect(check.id).toBe('node');
      expect(check.passed).toBe(true);
      expect(check.fatal).toBe(false);
    });

    it('should probe git workspace when in git repo', async () => {
      const mockExecutor = vi.fn().mockImplementation((file, args) => {
        if (args.includes('--is-inside-work-tree')) {
          return Promise.resolve({ stdout: 'true\n', stderr: '', exitCode: 0 });
        }
        if (args.includes('--show-current')) {
          return Promise.resolve({ stdout: 'feature-branch\n', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      const check = await probeGitWorkspace(mockExecutor);
      expect(check.passed).toBe(true);
      expect(check.message).toContain('Active branch: feature-branch');
    });

    it('should probe gh auth and agy cli statuses', async () => {
      const mockExecutor = vi.fn().mockResolvedValue({
        stdout: 'ok\n',
        stderr: '',
        exitCode: 0,
      });

      const ghCheck = await probeGhAuth(mockExecutor);
      expect(ghCheck.passed).toBe(true);

      const agyCheck = await probeAgyCli(mockExecutor);
      expect(agyCheck.passed).toBe(true);
    });

    it('should probe workspace assets (SKILL.md, CONTEXT.md, AGENTS.md)', async () => {
      const checkMissing = await probeWorkspaceAssets(tempDir);
      expect(checkMissing.passed).toBe(false);
      expect(checkMissing.message).toContain('Missing workspace asset');

      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Skill');
      fs.writeFileSync(path.join(tempDir, 'CONTEXT.md'), '# Context');
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents');

      const checkPresent = await probeWorkspaceAssets(tempDir);
      expect(checkPresent.passed).toBe(true);
    });

    it('should run full diagnostics via DoctorEngine', async () => {
      fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Skill');
      fs.writeFileSync(path.join(tempDir, 'CONTEXT.md'), '# Context');
      fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents');

      const mockExecutor = vi.fn().mockImplementation((file, args) => {
        if (file === 'git') {
          return Promise.resolve({ stdout: 'true\n', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: 'ok\n', stderr: '', exitCode: 0 });
      });

      const engine = new DoctorEngine({
        cwd: tempDir,
        commandExecutor: mockExecutor,
      });

      const report = await engine.runDiagnostics();
      expect(report.healthy).toBe(true);
      expect(report.checks.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('UpdateEngine & lib helpers', () => {
    it('should export CI_WORKFLOW_CONTENT with required matrix', () => {
      expect(CI_WORKFLOW_CONTENT).toContain('name: CI');
      expect(CI_WORKFLOW_CONTENT).toContain('ubuntu-latest');
      expect(CI_WORKFLOW_CONTENT).toContain('windows-latest');
    });

    it('should resolve package root from directory hierarchy', () => {
      const root = resolveSandcastlePackageRoot();
      expect(root).toBeDefined();
      expect(fs.existsSync(path.join(root, 'package.json'))).toBe(true);
    });

    it('should execute check mode via UpdateEngine without mutating files', async () => {
      const mockExecutor = vi.fn().mockImplementation((file, args) => {
        if (args.includes('--is-inside-work-tree')) {
          return Promise.resolve({ stdout: 'true\n', stderr: '', exitCode: 0 });
        }
        if (args[0] === 'fetch') {
          return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
        }
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') {
          return Promise.resolve({ stdout: 'commit-111\n', stderr: '', exitCode: 0 });
        }
        if (args[0] === 'rev-parse' && args[1] === 'origin/main') {
          return Promise.resolve({ stdout: 'commit-111\n', stderr: '', exitCode: 0 });
        }
        return Promise.resolve({ stdout: '', stderr: '', exitCode: 0 });
      });

      const result = await UpdateEngine.execute({
        check: true,
        cwd: tempDir,
        executor: mockExecutor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.currentVersion).toBe('commit-111');
      expect(result.latestVersion).toBe('commit-111');
    });
  });
});
