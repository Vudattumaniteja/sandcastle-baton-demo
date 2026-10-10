import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  TemplateContext,
  interpolatePrompt,
} from './lib/prompt-interpolator.js';

export {
  DEFAULT_WORKER_PROMPT_TEMPLATE,
  interpolatePrompt,
  type TemplateContext,
};

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

export class PromptEngine {
  private cwd: string;
  private globalDir: string;

  constructor(options: { cwd?: string; globalDir?: string } = {}) {
    this.cwd = options.cwd ?? process.cwd();
    this.globalDir = options.globalDir ?? path.join(os.homedir(), '.sandcastle');
  }

  /**
   * Resolves template path according to the 4-tier discovery hierarchy:
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
   * Loads template content and metadata based on discovery hierarchy.
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
   * Interpolates context variables into template string.
   */
  interpolate(template: string, context: TemplateContext): string {
    return interpolatePrompt(template, context);
  }
}
