/**
 * Mustache token expansion, variable aliasing, and retry diagnostics interpolation.
 */

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

/**
 * Looks up a variable name or nested dot path in context with alias fallbacks.
 */
export function lookupContextValue(key: string, context: TemplateContext): any {
  const trimmed = key.trim();

  switch (trimmed) {
    case 'issueNumber':
    case 'issue.number':
      return context.issue?.number ?? context.issueNumber;
    case 'issueTitle':
    case 'issue.title':
      return context.issue?.title ?? context.issueTitle;
    case 'issueBody':
    case 'issue.body':
      return context.issue?.body ?? context.issueBody;
    case 'issueUrl':
    case 'issue.url':
      return context.issue?.url ?? context.issueUrl;
    case 'issueLabels':
    case 'issue.labels':
      return context.issue?.labels ?? context.issueLabels;
    case 'issueState':
    case 'issue.state':
      return context.issue?.state ?? context.issueState;
    case 'branchName':
    case 'branch.name':
      return context.branch?.name ?? context.branchName;
    case 'parentNumber':
    case 'parent.number':
      return context.parent?.number ?? context.parentNumber;
    case 'parentTitle':
    case 'parent.title':
      return context.parent?.title ?? context.parentTitle;
    case 'parentUrl':
    case 'parent.url':
      return context.parent?.url ?? context.parentUrl;
    case 'parentBody':
    case 'parent.body':
      return context.parent?.body ?? context.parentBody;
    case 'parentContext':
      return context.parentContext;
    case 'retryAttempt':
    case 'retry.attempt':
      return context.retry?.attempt ?? context.retryAttempt;
    case 'retryMaxAttempts':
    case 'retry.maxAttempts':
      return context.retry?.maxAttempts ?? context.retryMaxAttempts;
    case 'retryFeedback':
    case 'retryContext':
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

  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
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

  if (trimmed in context && context[trimmed] !== undefined) {
    return context[trimmed];
  }

  return undefined;
}

/**
 * Formats raw variable value into clean string representation without escaping.
 */
export function formatContextValue(val: any): string {
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
 * Interpolates context variables into template string using mustache {{token}} syntax.
 * If on retry and the template lacks retry placeholders, automatically appends retry diagnostic section.
 */
export function interpolatePrompt(
  template: string,
  context: TemplateContext
): string {
  const placeholderRegex = /{{\s*([\w.]+)\s*}}/g;
  const hasRetryPlaceholder = /{{\s*(?:retryContext|retry\.feedback)\s*}}/.test(template);

  let result = template.replace(placeholderRegex, (_match, key) => {
    const val = lookupContextValue(key, context);
    return formatContextValue(val);
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
