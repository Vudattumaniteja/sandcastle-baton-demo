import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execaNode } from 'execa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distBin = path.resolve(__dirname, '../dist/bin/sandcastle.js');

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
