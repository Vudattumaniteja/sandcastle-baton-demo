import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { DoctorService } from '../src/services/doctor-service.js';

describe('DoctorService (Health & Environment Validation)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-doctor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should report healthy when all environment checks and workspace assets pass', async () => {
    // Create workspace assets
    fs.writeFileSync(path.join(tempDir, 'SKILL.md'), '# Skill');
    fs.writeFileSync(path.join(tempDir, 'CONTEXT.md'), '# Context');
    fs.writeFileSync(path.join(tempDir, 'AGENTS.md'), '# Agents');

    const mockExecutor = vi.fn(async (file: string, args: string[]) => {
      if (file === 'git' && args.includes('rev-parse')) {
        return { stdout: 'true\nrefs/heads/main', stderr: '', exitCode: 0 };
      }
      if (file === 'gh' && args.includes('status')) {
        return { stdout: 'Logged in to github.com', stderr: '', exitCode: 0 };
      }
      if (file === 'agy') {
        return { stdout: 'agy version 2.0.0', stderr: '', exitCode: 0 };
      }
      return { stdout: '', stderr: '', exitCode: 0 };
    });

    const doctorService = new DoctorService({
      cwd: tempDir,
      commandExecutor: mockExecutor,
    });

    const report = await doctorService.runDiagnostics();

    expect(report.healthy).toBe(true);
    expect(report.checks.length).toBeGreaterThanOrEqual(5);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it('should report unhealthy when git repository check fails', async () => {
    const mockExecutor = vi.fn(async (file: string, args: string[]) => {
      if (file === 'git') {
        return { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 };
      }
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    });

    const doctorService = new DoctorService({
      cwd: tempDir,
      commandExecutor: mockExecutor,
    });

    const report = await doctorService.runDiagnostics();

    expect(report.healthy).toBe(false);
    const gitCheck = report.checks.find((c) => c.id === 'git');
    expect(gitCheck?.passed).toBe(false);
    expect(gitCheck?.fatal).toBe(true);
  });

  it('should report missing workspace gate assets with actionable remediation', async () => {
    const mockExecutor = vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 }));

    const doctorService = new DoctorService({
      cwd: tempDir,
      commandExecutor: mockExecutor,
    });

    const report = await doctorService.runDiagnostics();

    const assetCheck = report.checks.find((c) => c.id === 'workspace-assets');
    expect(assetCheck?.passed).toBe(false);
    expect(assetCheck?.message).toContain('SKILL.md');
    expect(assetCheck?.remediation).toBeDefined();
  });
});
