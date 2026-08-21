import fs from 'fs';
import path from 'path';
import os from 'os';

export type TemplateTier = 'explicit' | 'local' | 'global' | 'default';

export interface ResolveTemplateOptions {
  explicitPath?: string;
  cwd?: string;
  globalDir?: string;
  configTemplatePath?: string;
}

export interface ResolvedTemplate {
  template: string;
  source: string;
  tier: TemplateTier;
}

export interface TemplateContext {
  issue?: {
    number?: number | string;
    title?: string;
    body?: string;
    url?: string;
    labels?: Array<string | { name: string }> | string;
    state?: string;
    [key: string]: any;
  };
  repo?:
    | {
        name?: string;
        owner?: string;
        full?: string;
        [key: string]: any;
      }
    | string;
  branch?: {
    name?: string;
    [key: string]: any;
  };
  parent?: {
    number?: number | string;
    title?: string;
    url?: string;
    body?: string;
    [key: string]: any;
  };
  retry?: {
    attempt?: number | string;
    maxAttempts?: number | string;
    feedback?: string;
    [key: string]: any;
  };
  // Flat convenience aliases
  issueNumber?: number | string;
  issueTitle?: string;
  issueBody?: string;
  issueUrl?: string;
  issueLabels?: Array<string | { name: string }> | string;
  issueState?: string;
  branchName?: string;
  parentNumber?: number | string;
  parentTitle?: string;
  parentUrl?: string;
  parentBody?: string;
  parentContext?: 'reference' | 'inline' | 'none';
  retryAttempt?: number | string;
  retryMaxAttempts?: number | string;
  retryFeedback?: string;
  retryContext?: string;
  [key: string]: any;
}

export const DEFAULT_WORKER_PROMPT_TEMPLATE = [
  'You are an autonomous AI coding agent executing a Sandcastle issue baton for issue #{{issue.number}}.',
  '',
  'Issue URL: {{issue.url}}',
  '',
  'Instructions:',
  '1. Fetch and read the full issue requirements and acceptance criteria using `gh issue view {{issue.number}} --comments`.',
  '2. Inspect the codebase context (CONTEXT.md, AGENTS.md, existing test suites).',
  '3. Follow the `implement` and `tdd` skills to write minimal, clean code satisfying the acceptance criteria test-first.',
  '4. Run all local test suites and linters until 100% green.',
  '5. Create a git branch `issue-{{issue.number}}-<slug>`, commit changes with conventional commit messages referencing `#{{issue.number}}`.',
  '6. Open a Pull Request referencing `#{{issue.number}}` using `gh pr create`.',
  '7. Merge the Pull Request using `gh pr merge --merge` (or squash).',
  '8. Close issue `#{{issue.number}}` with `gh issue close {{issue.number}} --comment "Completed autonomously via Sandcastle baton. Verified green tests."`.',
].join('\n');

export class PromptTemplateEngine {
  private cwd: string;
  private globalDir: string;

  constructor(options: { cwd?: string; globalDir?: string } = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.globalDir = options.globalDir ?? path.join(os.homedir(), '.sandcastle');
  }

  /**
   * Resolves the template path according to the 4-tier discovery hierarchy:
   * 1. Explicit path (--prompt-template)
   * 2. Local template (.sandcastle/worker-prompt.md or config.promptTemplate)
   * 3. Global template (~/.sandcastle/worker-prompt.md)
   * 4. Built-in default
   */
  resolveTemplatePath(
    explicitOrOptions?: string | ResolveTemplateOptions,
    configTemplatePath?: string
  ): { path: string | null; tier: TemplateTier } {
    let explicitPath: string | undefined;
    let configPath = configTemplatePath;
    let cwd = this.cwd;
    let globalDir = this.globalDir;

    if (typeof explicitOrOptions === 'object' && explicitOrOptions !== null) {
      explicitPath = explicitOrOptions.explicitPath;
      if (explicitOrOptions.configTemplatePath) {
        configPath = explicitOrOptions.configTemplatePath;
      }
      if (explicitOrOptions.cwd) {
        cwd = explicitOrOptions.cwd;
      }
      if (explicitOrOptions.globalDir) {
        globalDir = explicitOrOptions.globalDir;
      }
    } else if (typeof explicitOrOptions === 'string') {
      explicitPath = explicitOrOptions;
    }

    // Tier 1: Explicit path
    if (explicitPath && explicitPath.trim()) {
      const resolvedExplicit = path.isAbsolute(explicitPath)
        ? explicitPath
        : path.resolve(cwd, explicitPath);

      if (!fs.existsSync(resolvedExplicit)) {
        throw new Error(`Explicit prompt template not found on disk: ${explicitPath}`);
      }
      return { path: resolvedExplicit, tier: 'explicit' };
    }

    // Tier 2: Local project template
    if (configPath && configPath.trim()) {
      const resolvedConfig = path.isAbsolute(configPath)
        ? configPath
        : path.resolve(cwd, configPath);
      if (fs.existsSync(resolvedConfig)) {
        return { path: resolvedConfig, tier: 'local' };
      }
    }

    const localWorkerPrompt = path.join(cwd, '.sandcastle', 'worker-prompt.md');
    if (fs.existsSync(localWorkerPrompt)) {
      return { path: localWorkerPrompt, tier: 'local' };
    }

    // Tier 3: Global template
    const globalWorkerPrompt = path.join(globalDir, 'worker-prompt.md');
    if (fs.existsSync(globalWorkerPrompt)) {
      return { path: globalWorkerPrompt, tier: 'global' };
    }

    // Tier 4: Default built-in
    return { path: null, tier: 'default' };
  }

  /**
   * Loads the template content and metadata based on discovery hierarchy.
   */
  loadTemplate(
    explicitOrOptions?: string | ResolveTemplateOptions,
    configTemplatePath?: string
  ): ResolvedTemplate {
    const { path: templatePath, tier } = this.resolveTemplatePath(
      explicitOrOptions,
      configTemplatePath
    );

    if (templatePath && fs.existsSync(templatePath)) {
      const template = fs.readFileSync(templatePath, 'utf-8');
      return {
        template,
        source: templatePath,
        tier,
      };
    }

    return {
      template: DEFAULT_WORKER_PROMPT_TEMPLATE,
      source: 'built-in default',
      tier: 'default',
    };
  }

  /**
   * Resolves a variable expression from the template context.
   */
  private resolveVariable(key: string, context: TemplateContext): string {
    const trimmedKey = key.trim();

    // Map of flat aliases and normalized paths
    const flatValue = this.lookupValue(trimmedKey, context);
    if (flatValue !== undefined && flatValue !== null) {
      return this.formatValue(flatValue);
    }

    return '';
  }

  /**
   * Looks up a variable name or nested dot path in context with alias fallbacks.
   */
  private lookupValue(key: string, context: TemplateContext): any {
    // 1. Normalized alias and core field mappings
    switch (key) {
      case 'issueNumber':
        return context.issue?.number ?? context.issueNumber;
      case 'issue.number':
        return context.issue?.number ?? context.issueNumber;
      case 'issueTitle':
        return context.issue?.title ?? context.issueTitle;
      case 'issue.title':
        return context.issue?.title ?? context.issueTitle;
      case 'issueBody':
        return context.issue?.body ?? context.issueBody;
      case 'issue.body':
        return context.issue?.body ?? context.issueBody;
      case 'issueUrl':
        return context.issue?.url ?? context.issueUrl;
      case 'issue.url':
        return context.issue?.url ?? context.issueUrl;
      case 'issueLabels':
        return context.issue?.labels ?? context.issueLabels;
      case 'issue.labels':
        return context.issue?.labels ?? context.issueLabels;
      case 'issueState':
        return context.issue?.state ?? context.issueState;
      case 'issue.state':
        return context.issue?.state ?? context.issueState;
      case 'branchName':
        return context.branch?.name ?? context.branchName;
      case 'branch.name':
        return context.branch?.name ?? context.branchName;
      case 'parentNumber':
        return context.parent?.number ?? context.parentNumber;
      case 'parent.number':
        return context.parent?.number ?? context.parentNumber;
      case 'parentTitle':
        return context.parent?.title ?? context.parentTitle;
      case 'parent.title':
        return context.parent?.title ?? context.parentTitle;
      case 'parentUrl':
        return context.parent?.url ?? context.parentUrl;
      case 'parent.url':
        return context.parent?.url ?? context.parentUrl;
      case 'parentBody':
        return context.parent?.body ?? context.parentBody;
      case 'parent.body':
        return context.parent?.body ?? context.parentBody;
      case 'parentContext':
        return context.parentContext;
      case 'retryAttempt':
        return context.retry?.attempt ?? context.retryAttempt;
      case 'retry.attempt':
        return context.retry?.attempt ?? context.retryAttempt;
      case 'retryMaxAttempts':
        return context.retry?.maxAttempts ?? context.retryMaxAttempts;
      case 'retry.maxAttempts':
        return context.retry?.maxAttempts ?? context.retryMaxAttempts;
      case 'retryFeedback':
      case 'retryContext':
        return context.retry?.feedback ?? context.retryFeedback ?? context.retryContext;
      case 'retry.feedback':
        return context.retry?.feedback ?? context.retryFeedback ?? context.retryContext;
      case 'repo':
      case 'repo.full': {
        if (typeof context.repo === 'string') return context.repo;
        if (typeof context.repo === 'object' && context.repo !== null) {
          return context.repo.full ?? context.repo.name;
        }
        return context.repoFull;
      }
      case 'repo.owner': {
        if (typeof context.repo === 'object' && context.repo !== null && context.repo.owner) {
          return context.repo.owner;
        }
        if (typeof context.repo === 'string' && context.repo.includes('/')) {
          return context.repo.split('/')[0];
        }
        return context.repoOwner;
      }
      case 'repo.name': {
        if (typeof context.repo === 'object' && context.repo !== null && context.repo.name) {
          return context.repo.name;
        }
        if (typeof context.repo === 'string') {
          return context.repo.includes('/') ? context.repo.split('/')[1] : context.repo;
        }
        return context.repoName;
      }
    }

    // 2. Nested dot path lookup
    if (key.includes('.')) {
      const parts = key.split('.');
      let current: any = context;
      let found = true;
      for (const part of parts) {
        if (current == null || typeof current !== 'object') {
          found = false;
          break;
        }
        current = current[part];
      }
      if (found && current !== undefined) {
        return current;
      }
    }

    // 3. Direct top-level lookup
    if (key in context && context[key] !== undefined) {
      return context[key];
    }

    return undefined;
  }

  /**
   * Formats raw variable value into clean string representation without escaping.
   */
  private formatValue(val: any): string {
    if (val === undefined || val === null) {
      return '';
    }
    if (typeof val === 'string') {
      return val;
    }
    if (typeof val === 'number' || typeof val === 'boolean') {
      return String(val);
    }
    if (Array.isArray(val)) {
      return val
        .map((item) => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'name' in item) {
            return String(item.name);
          }
          return String(item);
        })
        .filter(Boolean)
        .join(', ');
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  }

  /**
   * Interpolates context variables into the template string.
   */
  interpolate(template: string, context: TemplateContext): string {
    const placeholderRegex = /{{\s*([\w.]+)\s*}}/g;
    const hasRetryPlaceholder = /{{\s*(?:retryContext|retry\.feedback)\s*}}/.test(template);

    let result = template.replace(placeholderRegex, (_match, key) => {
      return this.resolveVariable(key, context);
    });

    // Automatic Retry Diagnostics Injection:
    // If on retry and template omits retry context placeholders, append to prompt bottom.
    const attempt = Number(context.retry?.attempt ?? context.retryAttempt ?? 1);
    const maxAttempts = Number(context.retry?.maxAttempts ?? context.retryMaxAttempts ?? 3);
    const feedback = String(
      context.retry?.feedback ?? context.retryFeedback ?? context.retryContext ?? ''
    ).trim();

    if (feedback && (attempt > 1 || !hasRetryPlaceholder) && !hasRetryPlaceholder) {
      result +=
        `\n\n[Sandcastle Retry Context - Attempt ${attempt}/${maxAttempts}]\n` +
        `Previous attempt failed. Error output:\n${feedback}\n` +
        `Please fix the issue and ensure all tests pass.`;
    }

    return result;
  }
}
