import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { updateCommand, CI_WORKFLOW_CONTENT } from '../src/commands/update.js';

describe('Sandcastle Auto-Update Engine and CI Automation (updateCommand)', () => {
  let tempDir: string;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-update-test-'));
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const createMockExecutor = (customResponses: Record<string, any> = {}) => {
    const commandLog: Array<{ file: string; args: string[] }> = [];

    const executor = vi.fn(async (file: string, args: string[]) => {
      commandLog.push({ file, args });
      const cmdKey = `${file} ${args.join(' ')}`;

      // Custom override matching full command or prefix
      for (const [key, response] of Object.entries(customResponses)) {
        if (cmdKey === key || cmdKey.startsWith(key)) {
          if (typeof response === 'function') {
            return response(file, args);
          }
          return response;
        }
      }

      // Default mock responses
      if (file === 'git' && args.includes('--is-inside-work-tree')) {
        return { stdout: 'true\n', stderr: '', exitCode: 0 };
      }
      if (file === 'git' && args[0] === 'fetch') {
        return { stdout: '', stderr: '', exitCode: 0 };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'HEAD') {
        return { stdout: 'commit-aaa1111\n', stderr: '', exitCode: 0 };
      }
      if (file === 'git' && args[0] === 'rev-parse' && args[1] === 'origin/main') {
        return { stdout: 'commit-aaa1111\n', stderr: '', exitCode: 0 };
      }
      if (file === 'git' && args[0] === 'pull') {
        return { stdout: 'Already up to date.\n', stderr: '', exitCode: 0 };
      }
      if (file === 'npm') {
        return { stdout: 'ok\n', stderr: '', exitCode: 0 };
      }

      return { stdout: '', stderr: '', exitCode: 0 };
    });

    return { executor, commandLog };
  };

  describe('--check mode', () => {
    it('should report up to date when HEAD matches origin/main without applying updates', async () => {
      const { executor, commandLog } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-100\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-100\n', stderr: '', exitCode: 0 },
      });

      const result = await updateCommand({
        check: true,
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.currentVersion).toBe('commit-100');
      expect(result.latestVersion).toBe('commit-100');
      expect(result.ciUpdated).toBe(false);
      expect(result.message).toContain('up to date');

      // Verify no pull or build commands were executed
      expect(commandLog.some((c) => c.file === 'git' && c.args[0] === 'pull')).toBe(false);
      expect(commandLog.some((c) => c.file === 'npm')).toBe(false);
    });

    it('should report update available when HEAD differs from origin/main without applying updates', async () => {
      const { executor, commandLog } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-100\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-200\n', stderr: '', exitCode: 0 },
      });

      const result = await updateCommand({
        check: true,
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.currentVersion).toBe('commit-100');
      expect(result.latestVersion).toBe('commit-200');
      expect(result.ciUpdated).toBe(false);
      expect(result.message).toContain('Update available');
      expect(result.message).toContain('commit-100');
      expect(result.message).toContain('commit-200');

      // Verify no pull or build commands were executed
      expect(commandLog.some((c) => c.file === 'git' && c.args[0] === 'pull')).toBe(false);
      expect(commandLog.some((c) => c.file === 'npm')).toBe(false);
    });

    it('should not create or touch CI workflow file in --check mode', async () => {
      const { executor } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-100\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-200\n', stderr: '', exitCode: 0 },
      });

      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');
      expect(fs.existsSync(ciPath)).toBe(false);

      const result = await updateCommand({
        check: true,
        cwd: tempDir,
        executor,
      });

      expect(result.ciUpdated).toBe(false);
      expect(fs.existsSync(ciPath)).toBe(false);
    });
  });

  describe('git update and build execution', () => {
    it('should pull changes, run npm install, npm run build, and npm run build:verify when behind', async () => {
      let pullInvoked = false;
      const { executor, commandLog } = createMockExecutor({
        'git rev-parse HEAD': () => ({
          stdout: pullInvoked ? 'commit-200\n' : 'commit-100\n',
          stderr: '',
          exitCode: 0,
        }),
        'git rev-parse origin/main': { stdout: 'commit-200\n', stderr: '', exitCode: 0 },
        'git pull origin main': () => {
          pullInvoked = true;
          return { stdout: 'Updating commit-100..commit-200\n', stderr: '', exitCode: 0 };
        },
      });

      // Pre-create CI workflow file so ciUpdated doesn't trigger from missing file
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');
      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');

      const result = await updateCommand({
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(result.currentVersion).toBe('commit-200');
      expect(result.latestVersion).toBe('commit-200');

      // Verify exact lifecycle order
      const executed = commandLog.map((c) => `${c.file} ${c.args.join(' ')}`);
      expect(executed).toContain('git fetch origin main');
      expect(executed).toContain('git pull origin main');
      expect(executed).toContain('npm install');
      expect(executed).toContain('npm run build');
      expect(executed).toContain('npm run build:verify');

      const pullIndex = executed.indexOf('git pull origin main');
      const installIndex = executed.indexOf('npm install');
      const buildIndex = executed.indexOf('npm run build');
      const verifyIndex = executed.indexOf('npm run build:verify');

      expect(pullIndex).toBeLessThan(installIndex);
      expect(installIndex).toBeLessThan(buildIndex);
      expect(buildIndex).toBeLessThan(verifyIndex);
    });

    it('should reinstall and rebuild when force: true even if currentVersion matches latestVersion', async () => {
      const { executor, commandLog } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-same\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-same\n', stderr: '', exitCode: 0 },
      });

      // Pre-create CI workflow
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');
      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');

      const result = await updateCommand({
        force: true,
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(true);
      expect(result.message).toContain('Force reinstalled and rebuilt');

      const executed = commandLog.map((c) => `${c.file} ${c.args.join(' ')}`);
      expect(executed).toContain('git pull origin main');
      expect(executed).toContain('npm install');
      expect(executed).toContain('npm run build');
      expect(executed).toContain('npm run build:verify');
    });

    it('should not pull or build when already up to date without force flag', async () => {
      const { executor, commandLog } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-same\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-same\n', stderr: '', exitCode: 0 },
      });

      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');
      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');

      const result = await updateCommand({
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.updated).toBe(false);
      expect(result.message).toContain('already up to date');

      expect(commandLog.some((c) => c.file === 'git' && c.args[0] === 'pull')).toBe(false);
      expect(commandLog.some((c) => c.file === 'npm')).toBe(false);
    });

    describe('error handling', () => {
      it('should fail cleanly when not inside a git work tree', async () => {
        const { executor } = createMockExecutor({
          'git rev-parse --is-inside-work-tree': {
            stdout: '',
            stderr: 'fatal: not a git repository',
            exitCode: 128,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('not a Git repository');
      });

      it('should fail gracefully when git fetch fails', async () => {
        const { executor } = createMockExecutor({
          'git fetch origin main': {
            stdout: '',
            stderr: 'fatal: could not read from remote repository',
            exitCode: 128,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('Failed to fetch updates from remote origin');
      });

      it('should fail gracefully when git pull fails', async () => {
        const { executor } = createMockExecutor({
          'git rev-parse HEAD': { stdout: 'commit-old\n', stderr: '', exitCode: 0 },
          'git rev-parse origin/main': { stdout: 'commit-new\n', stderr: '', exitCode: 0 },
          'git pull origin main': {
            stdout: '',
            stderr: 'error: Your local changes to files would be overwritten by merge',
            exitCode: 1,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('Failed to pull updates from origin/main');
      });

      it('should fail gracefully when npm install fails', async () => {
        const { executor } = createMockExecutor({
          'git rev-parse HEAD': { stdout: 'commit-old\n', stderr: '', exitCode: 0 },
          'git rev-parse origin/main': { stdout: 'commit-new\n', stderr: '', exitCode: 0 },
          'git pull origin main': { stdout: 'Pulled ok', stderr: '', exitCode: 0 },
          'npm install': {
            stdout: '',
            stderr: 'npm ERR! code EACCES',
            exitCode: 1,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('Failed to install dependencies');
      });

      it('should fail gracefully when npm run build fails', async () => {
        const { executor } = createMockExecutor({
          'git rev-parse HEAD': { stdout: 'commit-old\n', stderr: '', exitCode: 0 },
          'git rev-parse origin/main': { stdout: 'commit-new\n', stderr: '', exitCode: 0 },
          'npm run build': {
            stdout: '',
            stderr: 'SyntaxError: Unexpected token',
            exitCode: 1,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('Failed to build project');
      });

      it('should fail gracefully when npm run build:verify fails', async () => {
        const { executor } = createMockExecutor({
          'git rev-parse HEAD': { stdout: 'commit-old\n', stderr: '', exitCode: 0 },
          'git rev-parse origin/main': { stdout: 'commit-new\n', stderr: '', exitCode: 0 },
          'npm run build:verify': {
            stdout: '',
            stderr: 'Missing artifact dist/bin/sandcastle.js',
            exitCode: 1,
          },
        });

        const result = await updateCommand({ cwd: tempDir, executor });

        expect(result.success).toBe(false);
        expect(result.updated).toBe(false);
        expect(result.message).toContain('Build verification failed');
      });
    });
  });

  describe('CI workflow automation (--ci and missing workflow detection)', () => {
    it('should automatically create .github/workflows/ci.yml when missing', async () => {
      const { executor } = createMockExecutor();
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');

      expect(fs.existsSync(ciPath)).toBe(false);

      const result = await updateCommand({ cwd: tempDir, executor });

      expect(result.success).toBe(true);
      expect(result.ciUpdated).toBe(true);
      expect(fs.existsSync(ciPath)).toBe(true);

      const writtenContent = fs.readFileSync(ciPath, 'utf8');
      expect(writtenContent).toContain('name: CI');
      expect(writtenContent).toContain('os: [ubuntu-latest, windows-latest]');
      expect(writtenContent).toContain('node-version: [18, 20, 22]');
      expect(writtenContent).toContain('npm run typecheck');
      expect(writtenContent).toContain('npm run build:verify');
    });

    it('should update CI workflow when --ci option is explicitly requested', async () => {
      const { executor } = createMockExecutor();
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');

      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, '# Old workflow\n', 'utf8');

      const result = await updateCommand({
        ci: true,
        cwd: tempDir,
        executor,
      });

      expect(result.success).toBe(true);
      expect(result.ciUpdated).toBe(true);

      const updatedContent = fs.readFileSync(ciPath, 'utf8');
      expect(updatedContent).toBe(CI_WORKFLOW_CONTENT);
    });

    it('should not mark ciUpdated as true if workflow file already exists and --ci is not specified', async () => {
      const { executor } = createMockExecutor();
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');

      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');

      const result = await updateCommand({ cwd: tempDir, executor });

      expect(result.success).toBe(true);
      expect(result.ciUpdated).toBe(false);
    });
  });

  describe('json output format', () => {
    it('should output structured JSON when --json flag is passed', async () => {
      const { executor } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-123\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-456\n', stderr: '', exitCode: 0 },
      });

      const result = await updateCommand({
        check: true,
        json: true,
        cwd: tempDir,
        executor,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const lastCall = consoleLogSpy.mock.calls[0][0];
      const parsed = JSON.parse(lastCall);

      expect(parsed).toEqual(result);
      expect(parsed.success).toBe(true);
      expect(parsed.updated).toBe(false);
      expect(parsed.currentVersion).toBe('commit-123');
      expect(parsed.latestVersion).toBe('commit-456');
      expect(parsed.ciUpdated).toBe(false);
      expect(parsed.message).toBeDefined();
    });

    it('should output picocolors formatted messages instead of JSON when json option is omitted', async () => {
      const { executor } = createMockExecutor({
        'git rev-parse HEAD': { stdout: 'commit-123\n', stderr: '', exitCode: 0 },
        'git rev-parse origin/main': { stdout: 'commit-123\n', stderr: '', exitCode: 0 },
      });

      // Pre-create CI
      const ciPath = path.join(tempDir, '.github', 'workflows', 'ci.yml');
      fs.mkdirSync(path.dirname(ciPath), { recursive: true });
      fs.writeFileSync(ciPath, CI_WORKFLOW_CONTENT, 'utf8');

      await updateCommand({
        cwd: tempDir,
        executor,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const output = consoleLogSpy.mock.calls[0][0];
      expect(() => JSON.parse(output)).toThrow();
      expect(output).toContain('up to date');
    });

    it('should output JSON on errors when json flag is specified', async () => {
      const { executor } = createMockExecutor({
        'git rev-parse --is-inside-work-tree': {
          stdout: '',
          stderr: 'not git',
          exitCode: 1,
        },
      });

      const result = await updateCommand({
        json: true,
        cwd: tempDir,
        executor,
      });

      expect(consoleLogSpy).toHaveBeenCalled();
      const parsed = JSON.parse(consoleLogSpy.mock.calls[0][0]);
      expect(parsed.success).toBe(false);
      expect(parsed.message).toContain('not a Git repository');
      expect(parsed).toEqual(result);
    });
  });
});
