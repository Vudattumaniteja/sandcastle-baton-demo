import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  PromptTemplateEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
} from '../src/core/prompt-template.js';
import type { TemplateContext } from '../src/core/prompt-template.js';

describe('PromptTemplateEngine', () => {
  let tempDir: string;
  let cwdDir: string;
  let globalDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandcastle-prompt-test-'));
    cwdDir = path.join(tempDir, 'project');
    globalDir = path.join(tempDir, 'global-sandcastle');
    fs.mkdirSync(cwdDir, { recursive: true });
    fs.mkdirSync(globalDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('4-tier discovery hierarchy', () => {
    it('Tier 1: should load explicit template path when provided', () => {
      const explicitPath = path.join(tempDir, 'custom-template.md');
      fs.writeFileSync(explicitPath, 'Custom explicit template for #{{issue.number}}');

      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });
      const loaded = engine.loadTemplate(explicitPath);

      expect(loaded.tier).toBe('explicit');
      expect(loaded.template).toBe('Custom explicit template for #{{issue.number}}');
      expect(loaded.source).toBe(path.resolve(explicitPath));
    });

    it('Tier 1: should fail fast and throw if explicit template path does not exist on disk', () => {
      const explicitPath = path.join(tempDir, 'non-existent.md');
      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });

      expect(() => {
        engine.loadTemplate(explicitPath);
      }).toThrow(/not found on disk/i);
    });

    it('Tier 2: should discover local project template at .sandcastle/worker-prompt.md', () => {
      const localSandcastleDir = path.join(cwdDir, '.sandcastle');
      fs.mkdirSync(localSandcastleDir, { recursive: true });
      const localPromptPath = path.join(localSandcastleDir, 'worker-prompt.md');
      fs.writeFileSync(localPromptPath, 'Local project template for #{{issue.number}}');

      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });
      const loaded = engine.loadTemplate();

      expect(loaded.tier).toBe('local');
      expect(loaded.template).toBe('Local project template for #{{issue.number}}');
      expect(loaded.source).toBe(localPromptPath);
    });

    it('Tier 2: should discover template specified in config promptTemplate parameter', () => {
      const customConfigPath = path.join(cwdDir, 'templates', 'worker.md');
      fs.mkdirSync(path.dirname(customConfigPath), { recursive: true });
      fs.writeFileSync(customConfigPath, 'Config specified template: {{issue.title}}');

      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });
      const loaded = engine.loadTemplate(undefined, customConfigPath);

      expect(loaded.tier).toBe('local');
      expect(loaded.template).toBe('Config specified template: {{issue.title}}');
      expect(loaded.source).toBe(customConfigPath);
    });

    it('Tier 3: should discover global template at ~/.sandcastle/worker-prompt.md when no local template exists', () => {
      const globalPromptPath = path.join(globalDir, 'worker-prompt.md');
      fs.writeFileSync(globalPromptPath, 'Global template: {{repo.full}}');

      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });
      const loaded = engine.loadTemplate();

      expect(loaded.tier).toBe('global');
      expect(loaded.template).toBe('Global template: {{repo.full}}');
      expect(loaded.source).toBe(globalPromptPath);
    });

    it('Tier 4: should fall back to built-in default worker prompt when no template exists', () => {
      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });
      const loaded = engine.loadTemplate();

      expect(loaded.tier).toBe('default');
      expect(loaded.template).toBe(DEFAULT_WORKER_PROMPT_TEMPLATE);
      expect(loaded.source).toBe('built-in default');
    });

    it('should prioritize explicit > local > global > default', () => {
      // Create both local and global templates
      const localSandcastleDir = path.join(cwdDir, '.sandcastle');
      fs.mkdirSync(localSandcastleDir, { recursive: true });
      fs.writeFileSync(path.join(localSandcastleDir, 'worker-prompt.md'), 'Local prompt');

      fs.writeFileSync(path.join(globalDir, 'worker-prompt.md'), 'Global prompt');

      const explicitPath = path.join(tempDir, 'explicit.md');
      fs.writeFileSync(explicitPath, 'Explicit prompt');

      const engine = new PromptTemplateEngine({ cwd: cwdDir, globalDir });

      // Explicit wins over local and global
      expect(engine.loadTemplate(explicitPath).tier).toBe('explicit');

      // Local wins over global when explicit is omitted
      expect(engine.loadTemplate().tier).toBe('local');
      expect(engine.loadTemplate().template).toBe('Local prompt');
    });
  });

  describe('variable interpolation & placeholders', () => {
    it('should interpolate nested variables', () => {
      const template = [
        'Issue: #{{issue.number}} - {{issue.title}} ({{issue.state}})',
        'URL: {{issue.url}}',
        'Labels: {{issue.labels}}',
        'Repo: {{repo.name}} owned by {{repo.owner}} (full: {{repo.full}})',
        'Branch: {{branch.name}}',
        'Parent: #{{parent.number}} - {{parent.title}} ({{parent.url}})',
        'Attempt: {{retry.attempt}}/{{retry.maxAttempts}}',
      ].join('\n');

      const context: TemplateContext = {
        issue: {
          number: 42,
          title: 'Implement Prompt Engine',
          body: 'Detailed body text',
          url: 'https://github.com/owner/repo/issues/42',
          labels: ['ready-for-agent', 'AFK'],
          state: 'OPEN',
        },
        repo: {
          name: 'sandcastle',
          owner: 'owner',
          full: 'owner/sandcastle',
        },
        branch: {
          name: 'issue-42-prompt-engine',
        },
        parent: {
          number: 40,
          title: 'Epic: Architecture',
          url: 'https://github.com/owner/repo/issues/40',
        },
        retry: {
          attempt: 2,
          maxAttempts: 3,
          feedback: 'TypeError in line 10',
        },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toContain('Issue: #42 - Implement Prompt Engine (OPEN)');
      expect(result).toContain('URL: https://github.com/owner/repo/issues/42');
      expect(result).toContain('Labels: ready-for-agent, AFK');
      expect(result).toContain('Repo: sandcastle owned by owner (full: owner/sandcastle)');
      expect(result).toContain('Branch: issue-42-prompt-engine');
      expect(result).toContain('Parent: #40 - Epic: Architecture (https://github.com/owner/repo/issues/40)');
      expect(result).toContain('Attempt: 2/3');
    });

    it('should interpolate flat convenience aliases', () => {
      const template = [
        'Issue: #{{issueNumber}} - {{issueTitle}}',
        'URL: {{issueUrl}}',
        'Repo: {{repo}}',
        'Branch: {{branchName}}',
        'Body: {{issueBody}}',
        'Retry: {{retryContext}}',
      ].join('\n');

      const context: TemplateContext = {
        issueNumber: 42,
        issueTitle: 'Flat Aliases Test',
        issueBody: 'Short body',
        issueUrl: 'https://github.com/org/repo/issues/42',
        repo: 'org/repo',
        branchName: 'issue-42-flat',
        retryContext: 'Previous compile error',
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toContain('Issue: #42 - Flat Aliases Test');
      expect(result).toContain('URL: https://github.com/org/repo/issues/42');
      expect(result).toContain('Repo: org/repo');
      expect(result).toContain('Branch: issue-42-flat');
      expect(result).toContain('Body: Short body');
      expect(result).toContain('Retry: Previous compile error');
    });

    it('should support double-brace placeholders with arbitrary whitespace trimming', () => {
      const template = 'Issue: #{{   issue.number   }} Title: {{	issue.title 	}} Repo: {{\nrepo\n}}';
      const context: TemplateContext = {
        issue: { number: 99, title: 'Whitespace Test' },
        repo: 'test/repo',
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toBe('Issue: #99 Title: Whitespace Test Repo: test/repo');
    });

    it('should preserve multiline markdown in issue body verbatim without escaping', () => {
      const markdownBody = [
        '# Requirements',
        '',
        '- Task 1: Create `src/foo.ts`',
        '- Task 2: Ensure "special quotes" and $variables remain verbatim',
        '',
        '```typescript',
        'export function foo(): string {',
        '  return `hello ${world}`;',
        '}',
        '```',
      ].join('\n');

      const template = 'Full Issue Specification:\n\n{{issue.body}}\n\nEnd of Spec.';
      const context: TemplateContext = {
        issue: {
          number: 1,
          title: 'Markdown Test',
          body: markdownBody,
        },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toContain(markdownBody);
      expect(result).toBe(`Full Issue Specification:\n\n${markdownBody}\n\nEnd of Spec.`);
    });

    it('should interpolate missing or undefined variables cleanly to empty strings without throwing', () => {
      const template = 'Issue: #{{issue.number}} Parent: #{{parent.number}} Extra: {{nonExistent.var}} ({{unknown}})';
      const context: TemplateContext = {
        issue: { number: 5 },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toBe('Issue: #5 Parent: # Extra:  ()');
    });

    it('should handle label arrays as strings or objects cleanly', () => {
      const template = 'Labels: {{issue.labels}}';
      const engine = new PromptTemplateEngine();

      // Object format
      const res1 = engine.interpolate(template, {
        issue: { labels: [{ name: 'ready-for-agent' }, { name: 'AFK' }] as any },
      });
      expect(res1).toBe('Labels: ready-for-agent, AFK');

      // String array format
      const res2 = engine.interpolate(template, {
        issue: { labels: ['bug', 'enhancement'] },
      });
      expect(res2).toBe('Labels: bug, enhancement');

      // Plain string
      const res3 = engine.interpolate(template, {
        issue: { labels: 'ready-for-agent, AFK' },
      });
      expect(res3).toBe('Labels: ready-for-agent, AFK');
    });

    it('should infer repo name and owner when repo is provided as a string', () => {
      const template = 'Owner: {{repo.owner}}, Name: {{repo.name}}, Full: {{repo.full}}';
      const engine = new PromptTemplateEngine();

      const res = engine.interpolate(template, {
        repo: 'Vudattumaniteja/sandcastle-baton-demo',
      });
      expect(res).toBe('Owner: Vudattumaniteja, Name: sandcastle-baton-demo, Full: Vudattumaniteja/sandcastle-baton-demo');
    });
  });

  describe('automatic retry diagnostic injection', () => {
    it('should automatically append failure diagnostics to prompt bottom on retries if template omits retry placeholders', () => {
      const template = 'Execute issue #{{issue.number}} on {{repo}}. Follow worker contract.';
      const context: TemplateContext = {
        issue: { number: 42 },
        repo: 'owner/repo',
        retry: {
          attempt: 2,
          maxAttempts: 3,
          feedback: 'FAIL: test/example.test.ts (AssertionError: expected false to be true)',
        },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toContain('Execute issue #42 on owner/repo. Follow worker contract.');
      expect(result).toContain('[Sandcastle Retry Context - Attempt 2/3]');
      expect(result).toContain('FAIL: test/example.test.ts (AssertionError: expected false to be true)');
      expect(result).toContain('Please fix the issue and ensure all tests pass.');
    });

    it('should NOT append diagnostics to prompt bottom if template already contains {{retryContext}} or {{retry.feedback}}', () => {
      const template = [
        'Execute issue #{{issue.number}}.',
        '{{retryContext}}',
        'Good luck!',
      ].join('\n');

      const context: TemplateContext = {
        issue: { number: 42 },
        retry: {
          attempt: 2,
          maxAttempts: 3,
          feedback: 'Assertion failed in test 4',
        },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toContain('Assertion failed in test 4');
      expect(result).toContain('Good luck!');
      expect(result).not.toContain('[Sandcastle Retry Context - Attempt 2/3]');
    });

    it('should not append retry diagnostics if attempt is 1 (initial run)', () => {
      const template = 'Execute issue #{{issue.number}}.';
      const context: TemplateContext = {
        issue: { number: 42 },
        retry: {
          attempt: 1,
          maxAttempts: 3,
          feedback: '',
        },
      };

      const engine = new PromptTemplateEngine();
      const result = engine.interpolate(template, context);

      expect(result).toBe('Execute issue #42.');
      expect(result).not.toContain('Retry Context');
    });
  });

  describe('default built-in template compatibility', () => {
    it('should interpolate default worker prompt template to match expected worker contract instructions', () => {
      const engine = new PromptTemplateEngine();
      const { template } = engine.loadTemplate();

      const result = engine.interpolate(template, {
        issue: {
          number: 42,
          url: 'https://github.com/owner/repo/issues/42',
        },
      });

      expect(result).toContain('You are an autonomous AI coding agent executing a Sandcastle issue baton for issue #42.');
      expect(result).toContain('Issue URL: https://github.com/owner/repo/issues/42');
      expect(result).toContain('gh issue view 42 --comments');
      expect(result).toContain('issue-42-<slug>');
      expect(result).toContain('gh pr create');
      expect(result).toContain('gh pr merge --merge');
      expect(result).toContain('gh issue close 42');
    });
  });
});
