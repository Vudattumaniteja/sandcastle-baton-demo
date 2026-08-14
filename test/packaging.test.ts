import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execaNode } from 'execa';
import { VERSION } from '../src/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.resolve(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const distBin = path.resolve(rootDir, 'dist/bin/sandcastle.js');
const distLib = path.resolve(rootDir, 'dist/index.js');
const distDts = path.resolve(rootDir, 'dist/index.d.ts');

describe('Packaging & Configuration Specification', () => {
  it('should define dual binaries sandcastle and sc in package.json', () => {
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.sandcastle).toBe('./dist/bin/sandcastle.js');
    expect(pkg.bin.sc).toBe('./dist/bin/sandcastle.js');
  });

  it('should be configured as pure ESM', () => {
    expect(pkg.type).toBe('module');
  });

  it('should declare Node >=18.0.0 engine requirement', () => {
    expect(pkg.engines).toBeDefined();
    expect(pkg.engines.node).toMatch(/>=\s*18/);
  });

  it('should declare runtime dependencies and tsup bundling', () => {
    expect(pkg.dependencies['@clack/prompts']).toBeDefined();
    expect(pkg.dependencies['commander']).toBeDefined();
    expect(pkg.dependencies['execa']).toBeDefined();
    expect(pkg.dependencies['picocolors']).toBeDefined();
    expect(pkg.dependencies['sisteransi']).toBeDefined();
  });

  it('should have export maps pointing to typed library entrypoint', () => {
    expect(pkg.main).toBe('./dist/index.js');
    expect(pkg.types).toBe('./dist/index.d.ts');
    expect(pkg.exports?.['.']).toBeDefined();
    expect(pkg.exports['.']?.import).toBe('./dist/index.js');
    expect(pkg.exports['.']?.types).toBe('./dist/index.d.ts');
  });
});

describe('Build Outputs & Artifacts', () => {
  it('should generate standalone CLI executable with valid LF shebang', () => {
    expect(fs.existsSync(distBin)).toBe(true);
    const content = fs.readFileSync(distBin, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  it('should generate typed library and declaration files', () => {
    expect(fs.existsSync(distLib)).toBe(true);
    expect(fs.existsSync(distDts)).toBe(true);
    const dtsContent = fs.readFileSync(distDts, 'utf-8');
    expect(dtsContent).toContain('VERSION');
    expect(dtsContent).toContain('SandcastleOptions');
  });

  it('should inject compile-time version matching package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});

describe('CLI Binary Smoke Tests', () => {
  it('should display version with --version flag', async () => {
    const { stdout, exitCode } = await execaNode(distBin, ['--version']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('should display version with -v short flag', async () => {
    const { stdout, exitCode } = await execaNode(distBin, ['-v']);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(pkg.version);
  });

  it('should display help with --help flag', async () => {
    const { stdout, exitCode } = await execaNode(distBin, ['--help']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: sandcastle');
    expect(stdout).toContain('--version');
    expect(stdout).toContain('--help');
  });

  it('should display help with -h short flag', async () => {
    const { stdout, exitCode } = await execaNode(distBin, ['-h']);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('Usage: sandcastle');
  });
});
