import type { ExecutionScope } from '../../../types/baton.js';

export interface ResolveQueueOptions {
  scope?: ExecutionScope;
  all?: boolean;
  from?: number;
  only?: number[];
  issues?: number[];
  fetchOpenIssues?: () => Promise<Array<{ number: number }>>;
}

/**
 * Resolves an ExecutionScope from explicit scope or legacy CLI flags.
 * For `only <N,M>`, targets are sorted in ascending order unless an explicit scope was supplied.
 */
export function resolveExecutionScope(options: {
  scope?: ExecutionScope;
  all?: boolean;
  from?: number;
  only?: number[];
  issues?: number[];
}): ExecutionScope | undefined {
  if (options.scope) {
    return options.scope;
  }
  if (options.all) {
    return { type: 'all' };
  }
  if (options.from !== undefined) {
    return { type: 'from', target: options.from };
  }
  if (options.only && options.only.length > 0) {
    return { type: 'only', targets: Array.from(new Set(options.only)).sort((a, b) => a - b) };
  }
  if (options.issues && options.issues.length > 0) {
    return { type: 'only', targets: [...options.issues] };
  }
  return undefined;
}

/**
 * Resolves the issue queue for all, from <N>, and only <N,M>.
 * Backlog issues fetched dynamically are sorted in ascending issue number order.
 */
export async function resolveExecutionQueue(
  options: ResolveQueueOptions
): Promise<number[]> {
  const scope = resolveExecutionScope(options);

  if (scope?.type === 'only') {
    return [...scope.targets];
  }

  if (scope?.type === 'from') {
    const startNum = scope.target;
    if (options.fetchOpenIssues) {
      const openIssues = await options.fetchOpenIssues();
      return openIssues
        .map((i) => i.number)
        .filter((num) => num >= startNum)
        .sort((a, b) => a - b);
    }
    if (options.issues && options.issues.length > 0) {
      return Array.from(
        new Set(options.issues.filter((num) => num >= startNum))
      ).sort((a, b) => a - b);
    }
    return [startNum];
  }

  if (scope?.type === 'all') {
    if (options.fetchOpenIssues) {
      const openIssues = await options.fetchOpenIssues();
      return openIssues.map((i) => i.number).sort((a, b) => a - b);
    }
    if (options.issues && options.issues.length > 0) {
      return Array.from(new Set(options.issues)).sort((a, b) => a - b);
    }
    return [];
  }

  if (options.issues && options.issues.length > 0) {
    return [...options.issues];
  }

  return [];
}
