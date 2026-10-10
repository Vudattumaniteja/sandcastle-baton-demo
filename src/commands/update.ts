import {
  UpdateEngine,
  resolveSandcastlePackageRoot,
  CI_WORKFLOW_CONTENT,
  defaultUpdateExecutor,
} from '#packages/diagnostics';
import type { UpdateCommandOptions, UpdateResult } from '../types/update.js';

export * from '../types/update.js';
export {
  UpdateEngine,
  resolveSandcastlePackageRoot,
  CI_WORKFLOW_CONTENT,
  defaultUpdateExecutor,
};

/**
 * Executes the update command to synchronize, rebuild, and configure Sandcastle.
 */
export async function updateCommand(
  options: UpdateCommandOptions = {}
): Promise<UpdateResult> {
  return UpdateEngine.execute(options);
}
