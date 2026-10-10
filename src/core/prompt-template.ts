import {
  PromptEngine,
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  type TemplateContext,
  type ResolvedTemplate,
  type TemplateTier,
  type ResolveTemplateOptions,
} from '#packages/orchestrator';

export {
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  type TemplateContext,
  type ResolvedTemplate,
  type TemplateTier,
  type ResolveTemplateOptions,
};

/**
 * Backward-compatible bridge class for PromptEngine.
 */
export class PromptTemplateEngine extends PromptEngine {
  constructor(options: { cwd?: string; globalDir?: string } = {}) {
    super(options);
  }
}
