/**
 * Model parser and resolution utilities for Antigravity models.
 */

export interface ModelInfo {
  id: string;
  name: string;
  isDefault?: boolean;
  aliases?: string[];
  effort?: 'low' | 'medium' | 'high';
}

export const DEFAULT_MODEL_ID = 'gemini-3.8-flash-medium';

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'gemini-3.8-flash-medium',
    name: 'Gemini 3.8 Flash (Medium)',
    aliases: ['3.8-flash', 'flash', 'gemini-flash', 'gemini-3.8-flash', 'gemini-3.8-flash-medium'],
    effort: 'medium',
    isDefault: true,
  },
  {
    id: 'gemini-3.8-flash-high',
    name: 'Gemini 3.8 Flash (High)',
    aliases: ['3.8-flash-high', 'flash-high', 'gemini-3.8-flash-high'],
    effort: 'high',
    isDefault: false,
  },
  {
    id: 'gemini-3.8-flash-low',
    name: 'Gemini 3.8 Flash (Low)',
    aliases: ['3.8-flash-low', 'flash-low', 'gemini-3.8-flash-low'],
    effort: 'low',
    isDefault: false,
  },
  {
    id: 'claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6 (Thinking)',
    aliases: ['sonnet', 'claude-sonnet', 'claude-sonnet-4-6', 'sonnet-4.6', 'claude-4.6-sonnet'],
    isDefault: false,
  },
  {
    id: 'claude-opus-4-6-thinking',
    name: 'Claude Opus 4.6 (Thinking)',
    aliases: ['opus', 'claude-opus', 'claude-opus-4-6', 'opus-4.6'],
    isDefault: false,
  },
  {
    id: 'gpt-oss-120b-medium',
    name: 'GPT-OSS 120B (Medium)',
    aliases: ['gpt-oss', 'gpt-oss-120b', 'gpt-oss-120b-medium', 'oss-120b'],
    effort: 'medium',
    isDefault: false,
  },
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    aliases: ['2.5-flash', 'gemini-2.5-flash'],
    isDefault: false,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    aliases: ['2.5-pro', 'pro', 'gemini-pro', 'gemini-2.5-pro'],
    isDefault: false,
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet',
    aliases: ['claude-3.7', 'claude-3-7', 'claude-3.7-sonnet'],
    isDefault: false,
  },
  {
    id: 'claude-3-5-sonnet',
    name: 'Claude 3.5 Sonnet',
    aliases: ['claude-3.5', 'claude-3-5', 'claude-3.5-sonnet'],
    isDefault: false,
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    aliases: ['4o', 'gpt-4', 'chatgpt-4o'],
    isDefault: false,
  },
];

/**
 * Normalizes any model identifier or alias into an exact agy-recognized model name.
 */
export function resolveModel(modelName?: string, effort?: string): string {
  if (!modelName) {
    return DEFAULT_MODEL_ID;
  }

  const trimmed = modelName.trim();
  const lower = trimmed.toLowerCase();

  if (lower === 'default') {
    return DEFAULT_MODEL_ID;
  }

  // Extract parenthesized effort/tier if present, e.g. "Gemini 3.8 Flash (High)"
  let resolvedEffort = effort?.trim().toLowerCase();
  const parenMatch = trimmed.match(/\(([^)]+)\)$/);
  if (parenMatch && parenMatch[1]) {
    const insideParen = parenMatch[1].trim().toLowerCase();
    if (insideParen === 'high' || insideParen === 'medium' || insideParen === 'low') {
      if (!resolvedEffort) {
        resolvedEffort = insideParen;
      }
    }
  }

  // If already exact model with parenthesized effort/mode, resolve the prefix
  if (/\([^)]+\)$/.test(trimmed)) {
    const prefix = trimmed.replace(/\s*\([^)]+\)$/, '').trim();
    return resolveModel(prefix, resolvedEffort);
  }

  // Gemini 3.8 Flash explicit variants
  if (
    lower === 'gemini-3.8-flash-high' ||
    lower === '3.8-flash-high' ||
    lower === 'flash-high'
  ) {
    return 'gemini-3.8-flash-high';
  }

  if (
    lower === 'gemini-3.8-flash-low' ||
    lower === '3.8-flash-low' ||
    lower === 'flash-low'
  ) {
    return 'gemini-3.8-flash-low';
  }

  if (
    lower === 'gemini-3.8-flash-medium' ||
    lower === '3.8-flash-medium' ||
    lower === 'flash-medium'
  ) {
    return 'gemini-3.8-flash-medium';
  }

  // Generic flash or 3.8 flash with effort routing
  if (
    (lower.includes('3.8') && lower.includes('flash')) ||
    lower === '3.8-flash' ||
    lower === 'flash' ||
    lower === 'gemini-flash' ||
    lower === 'gemini-3.8-flash'
  ) {
    if (resolvedEffort === 'high') {
      return 'gemini-3.8-flash-high';
    }
    if (resolvedEffort === 'low') {
      return 'gemini-3.8-flash-low';
    }
    return 'gemini-3.8-flash-medium';
  }

  // Legacy 2.5 flash and pro
  if (
    (lower.includes('2.5') && lower.includes('flash')) ||
    lower === '2.5-flash' ||
    lower === 'gemini-2.5-flash'
  ) {
    return 'gemini-2.5-flash';
  }

  if (
    (lower.includes('2.5') && lower.includes('pro')) ||
    lower === '2.5-pro' ||
    lower === 'pro' ||
    lower === 'gemini-pro' ||
    lower === 'gemini-2.5-pro'
  ) {
    return 'gemini-2.5-pro';
  }

  // Claude Sonnet variants
  if (
    (lower.includes('3.7') && (lower.includes('sonnet') || lower.includes('claude'))) ||
    lower === 'claude-3.7' ||
    lower === 'claude-3-7' ||
    lower === 'claude-3.7-sonnet' ||
    lower === 'claude-3-7-sonnet'
  ) {
    return 'claude-3-7-sonnet';
  }

  if (
    (lower.includes('3.5') && (lower.includes('sonnet') || lower.includes('claude'))) ||
    lower === 'claude-3.5' ||
    lower === 'claude-3-5' ||
    lower === 'claude-3.5-sonnet' ||
    lower === 'claude-3-5-sonnet'
  ) {
    return 'claude-3-5-sonnet';
  }

  if (
    lower.includes('sonnet') ||
    lower.includes('claude-sonnet') ||
    lower === 'sonnet' ||
    lower === 'claude-sonnet-4-6' ||
    lower === 'sonnet-4.6'
  ) {
    return 'claude-sonnet-4-6';
  }

  // Claude Opus variants
  if (lower.includes('opus') || lower === 'claude-opus-4-6-thinking') {
    return 'claude-opus-4-6-thinking';
  }

  // GPT-OSS variants
  if (lower.includes('oss') || lower === 'gpt-oss-120b-medium') {
    return 'gpt-oss-120b-medium';
  }

  // GPT-4o
  if (lower.includes('4o') || lower === 'gpt-4o' || lower === '4o') {
    return 'gpt-4o';
  }

  for (const m of FALLBACK_MODELS) {
    if (
      m.id.toLowerCase() === lower ||
      m.name.toLowerCase() === lower ||
      m.aliases?.some((a) => a.toLowerCase() === lower)
    ) {
      return m.id;
    }
  }

  return trimmed;
}

/**
 * Parses tab/space/indented text outputs from `agy models`.
 */
export function parseModelsOutput(output: string): ModelInfo[] {
  if (!output || !output.trim()) {
    return [];
  }

  const models: ModelInfo[] = [];
  const lines = output.split(/\r?\n/);
  let defaultModelId = '';

  // Search for default model indicator
  for (const line of lines) {
    const defaultMatch = line.match(/Default\s+model:\s*(.+)$/i);
    if (defaultMatch && defaultMatch[1]) {
      defaultModelId = defaultMatch[1].trim();
    }
  }

  let inAvailableBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toLowerCase().startsWith('default model:')) {
      continue;
    }

    if (trimmed.toLowerCase().startsWith('fetching')) {
      continue;
    }

    if (trimmed.toLowerCase().startsWith('available models:')) {
      inAvailableBlock = true;
      continue;
    }

    // Format 1: - <id> (alias: <a1>, <a2>)
    if (trimmed.startsWith('-')) {
      const modelMatch = trimmed.match(/^-\s*([^\s(]+)(?:\s*\((?:alias:\s*)?([^)]+)\))?/i);
      if (modelMatch && modelMatch[1]) {
        const id = modelMatch[1].trim();
        const rawAliases = modelMatch[2] ? modelMatch[2].replace(/^alias:\s*/i, '').trim() : '';
        const aliases = rawAliases
          ? rawAliases.split(',').map((a) => a.trim()).filter(Boolean)
          : [];

        models.push({
          id,
          name: id,
          aliases: aliases.length > 0 ? aliases : undefined,
        });
      }
      continue;
    }

    // Format 2: Tab-separated or space-separated <id>\t<name> or <id>  <name>
    let colMatch: RegExpMatchArray | null = null;
    if (trimmed.includes('\t')) {
      colMatch = trimmed.match(/^([^\t]+)\t+(.+)$/);
    } else {
      colMatch = trimmed.match(/^([^\s]+)\s{2,}(.+)$/);
    }

    if (colMatch && colMatch[1] && colMatch[2]) {
      const id = colMatch[1].trim();
      const name = colMatch[2].trim();
      models.push({
        id,
        name,
      });
      continue;
    }

    // Format 3: Indented model names from agy
    if (
      inAvailableBlock &&
      (trimmed.startsWith('Gemini') ||
        trimmed.startsWith('gemini') ||
        trimmed.startsWith('Claude') ||
        trimmed.startsWith('claude') ||
        trimmed.startsWith('GPT') ||
        trimmed.startsWith('gpt'))
    ) {
      const id = trimmed;
      models.push({
        id,
        name: id,
      });
      continue;
    }
  }

  // Determine default model: Default model line -> gemini-3.8-flash-medium / candidates -> first model
  let defaultTarget = defaultModelId;
  if (!defaultTarget) {
    const defaultCandidates = [
      'gemini-3.8-flash-medium',
      'Gemini 3.8 Flash (Medium)',
      'gemini-3.8-flash',
      'gemini-3.8-flash-high',
      'Gemini 3.8 Flash (High)',
      'gemini-2.5-flash',
      'Gemini 2.5 Flash',
      'claude-sonnet-4-6',
      'Claude Sonnet 4.6 (Thinking)',
    ];
    for (const candidate of defaultCandidates) {
      if (
        models.some(
          (m) =>
            m.id.toLowerCase() === candidate.toLowerCase() ||
            m.name.toLowerCase() === candidate.toLowerCase()
        )
      ) {
        defaultTarget = candidate;
        break;
      }
    }
    if (!defaultTarget && models.length > 0) {
      defaultTarget = models[0].id || models[0].name;
    }
  }

  if (defaultTarget) {
    for (const m of models) {
      const isMatch =
        m.id.toLowerCase() === defaultTarget.toLowerCase() ||
        m.name.toLowerCase() === defaultTarget.toLowerCase();

      m.isDefault = Boolean(isMatch);
    }
  } else {
    for (const m of models) {
      m.isDefault = false;
    }
  }

  return models;
}
