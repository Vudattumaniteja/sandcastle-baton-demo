import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { execaNode } from 'execa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distBin = path.resolve(rootDir, 'dist/bin/sandcastle.js');

beforeAll(() => {
  if (!fs.existsSync(distBin)) {
    execSync('npm run build', { cwd: rootDir, stdio: 'pipe' });
  }
});

describe('CLI Interactive Entrypoint & Help', () => {
  it('should display help when invoked with no arguments in a non-interactive (non-TTY) shell', async () => {
    const { stdout, exitCode } = await execaNode(distBin, []);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: sandcastle');
    expect(stdout).toContain('wizard');
    expect(stdout).toContain('run');
    expect(stdout).toContain('status');
    expect(stdout).toContain('doctor');
    expect(stdout).toContain('config');
  });

  it('should list the wizard command in help output', async () => {
    const { stdout, exitCode } = await execaNode(distBin, ['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('wizard');
    expect(stdout).toContain('Launch the interactive guided Sandcastle baton wizard');
  });
});
