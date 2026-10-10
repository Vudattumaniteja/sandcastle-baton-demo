import {
  ModelInfo,
  FALLBACK_MODELS,
  resolveModel,
  parseModelsOutput,
} from './lib/model-parser.js';
import {
  AgyCommandExecutor,
  defaultProcessSpawner,
} from './lib/process-spawner.js';

export {
  ModelInfo,
  FALLBACK_MODELS,
  resolveModel,
  parseModelsOutput,
};

/**
 * Discovers available local Antigravity models and aliases.
 */
export async function discoverModels(
  timeoutMs: number = 2500,
  customAgyPath: string = 'agy',
  executor: AgyCommandExecutor = defaultProcessSpawner
): Promise<ModelInfo[]> {
  try {
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const { stdout } = await executor(customAgyPath, ['models'], {
        signal: abortController.signal,
      });
      const models = parseModelsOutput(stdout);
      if (models.length > 0) {
        return models;
      }
    } finally {
      clearTimeout(timer);
    }
  } catch {}

  return [...FALLBACK_MODELS];
}
