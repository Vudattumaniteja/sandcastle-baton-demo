import { execa } from 'execa';
import type { CommandExecutor } from '../../../types/github.js';

/**
 * Default CLI command executor leveraging execa with abort signal cancellation support.
 */
export const defaultExecutor: CommandExecutor = async (file, args, options = {}) => {
  const { signal, ...rest } = (options || {}) as any;
  const result = await execa(file, args, {
    ...rest,
    ...(signal ? { cancelSignal: signal } : {}),
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 0,
  };
};
