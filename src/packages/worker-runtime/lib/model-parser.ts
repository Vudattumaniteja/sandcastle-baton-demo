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

export const FALLBACK_MODELS: ModelInfo[] = [
  {
    id: 'Gemini 3.8 Flash',
    name: 'Gemini 3.8 Flash',
    aliases: ['3.8-flash', 'gemini-3.8-flash'],
    isDefault: true,
  },
  {
    id: 'Gemini 3.7 Flash',
    name: 'Gemini 3.7 Flash',
    aliases: ['3.7-flash', 'flash', 'gemini-3.7-flash'],
    isDefault: false,
  },
  {
    id: 'Gemini 3.1 Pro',
    name: 'Gemini 3.1 Pro',
    aliases: ['3.1-pro', 'pro', 'gemini-3.1-pro'],
    isDefault: false,
  },
  {
    id: 'Gemini 3.6 Flash',
    name: 'Gemini 3.6 Flash',
    aliases: ['3.6-flash', 'gemini-3.6-flash'],
    isDefault: false,
  },
  {
    id: 'Gemini 3.5 Flash',
    name: 'Gemini 3.5 Flash',
    aliases: ['3.5-flash', 'gemini-3.5-flash'],
    isDefault: false,
  },
  {
    id: 'Claude Sonnet 4.6 (Thinking)',
    name: 'Claude Sonnet 4.6 (Thinking)',
    aliases: ['claude-sonnet', 'sonnet', 'claude-3.7-sonnet'],
    isDefault: false,
  },
  {
    id: 'Claude Opus 4.6 (Thinking)',
    name: 'Claude Opus 4.6 (Thinking)',
    aliases: ['claude-opus', 'opus'],
    isDefault: false,
  },
  {
    id: 'GPT-OSS 120B (Medium)',
    name: 'GPT-OSS 120B (Medium)',
    aliases: ['gpt-oss', 'gpt-120b'],
    isDefault: false,
  },
];

/**
 * Normalizes any model identifier or alias into an exact agy-recognized model name.
 */
export function resolveModel(modelName?: string, effort?: string): string {
  if (!modelName) {
    if (effort === 'medium') return 'Gemini 3.8 Flash (Medium)';
    if (effort === 'low') return 'Gemini 3.8 Flash (Low)';
    return 'Gemini 3.8 Flash (High)';
  }

  const trimmed = modelName.trim();

  // If already exact model with parenthesized effort/mode, check if it needs effort override or return as is
  if (/\([^)]+\)$/.test(trimmed)) {
    if (
      effort &&
      (trimmed.startsWith('Gemini 3.8 Flash') ||
        trimmed.startsWith('Gemini 3.7 Flash') ||
        trimmed.startsWith('Gemini 3.6 Flash') ||
        trimmed.startsWith('Gemini 3.5 Flash'))
    ) {
      const prefix = trimmed.replace(/\s*\([^)]+\)$/, '');
      const eff =
        effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
      return `${prefix} (${eff})`;
    }
    if (effort && trimmed.startsWith('Gemini 3.1 Pro')) {
      const eff = effort === 'low' ? 'Low' : 'High';
      return `Gemini 3.1 Pro (${eff})`;
    }
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (
    (lower.includes('3.8') && lower.includes('flash')) ||
    lower === '3.8-flash' ||
    lower === 'gemini-3.8-flash' ||
    lower === 'default'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.8 Flash (${eff})`;
  }
  if (
    (lower.includes('3.7') && lower.includes('flash')) ||
    lower === 'flash' ||
    lower === 'gemini-3.7-flash'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.7 Flash (${eff})`;
  }
  if (
    (lower.includes('3.6') && lower.includes('flash')) ||
    lower === '3.6-flash' ||
    lower === 'gemini-3.6-flash'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.6 Flash (${eff})`;
  }
  if (
    (lower.includes('3.5') && lower.includes('flash')) ||
    lower === '3.5-flash' ||
    lower === 'gemini-3.5-flash'
  ) {
    const eff =
      effort === 'low' ? 'Low' : effort === 'medium' ? 'Medium' : 'High';
    return `Gemini 3.5 Flash (${eff})`;
  }
  if (
    (lower.includes('3.1') && lower.includes('pro')) ||
    lower === 'pro' ||
    lower === 'gemini-3.1-pro' ||
    lower === 'gemini-pro'
  ) {
    const eff = effort === 'low' ? 'Low' : 'High';
    return `Gemini 3.1 Pro (${eff})`;
  }
  if (
    lower.includes('sonnet') ||
    lower.includes('claude-3.7') ||
    lower.includes('claude-sonnet')
  ) {
    return 'Claude Sonnet 4.6 (Thinking)';
  }
  if (lower.includes('opus') || lower.includes('claude-opus')) {
    return 'Claude Opus 4.6 (Thinking)';
  }
  if (lower.includes('gpt') || lower.includes('120b')) {
    return 'GPT-OSS 120B (Medium)';
  }

  for (const m of FALLBACK_MODELS) {
    if (
      m.id.toLowerCase() === lower ||
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
    if (inAvailableBlock && (trimmed.startsWith('Gemini') || trimmed.startsWith('Claude') || trimmed.startsWith('GPT'))) {
      const id = trimmed;
      models.push({
        id,
        name: id,
      });
      continue;
    }
  }

  // Determine default model: Default model line -> Gemini 3.8 Flash (High) -> Gemini 3.7 Flash (High)
  let defaultTarget = defaultModelId;
  if (!defaultTarget) {
    if (
      models.some(
        (m) =>
          m.name === 'Gemini 3.8 Flash (High)' ||
          m.id === 'gemini-3.8-flash-high' ||
          m.id === 'Gemini 3.8 Flash (High)'
      )
    ) {
      defaultTarget = 'Gemini 3.8 Flash (High)';
    } else if (
      models.some(
        (m) =>
          m.name === 'Gemini 3.7 Flash (High)' ||
          m.id === 'gemini-3.7-flash-high' ||
          m.id === 'Gemini 3.7 Flash (High)'
      )
    ) {
      defaultTarget = 'Gemini 3.7 Flash (High)';
    }
  }

  if (defaultTarget) {
    for (const m of models) {
      const isMatch =
        m.id === defaultTarget ||
        m.name === defaultTarget ||
        (defaultTarget === 'Gemini 3.8 Flash (High)' &&
          (m.id === 'gemini-3.8-flash-high' || m.name === 'Gemini 3.8 Flash (High)')) ||
        (defaultTarget === 'Gemini 3.7 Flash (High)' &&
          (m.id === 'gemini-3.7-flash-high' || m.name === 'Gemini 3.7 Flash (High)'));

      m.isDefault = Boolean(isMatch);
    }
  } else {
    for (const m of models) {
      m.isDefault = false;
    }
  }

  return models;
}
