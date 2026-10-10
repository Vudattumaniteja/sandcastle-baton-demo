import fs from 'fs';
import path from 'path';
import os from 'os';
import type { ModelInfo } from './model-parser.js';

export interface StatuslineQuotaInfo {
  remaining_fraction: number;
  reset_time?: string;
  reset_in_seconds?: number;
}

export interface StatuslineSnapshot {
  cwd?: string;
  session_id?: string;
  conversation_id?: string;
  transcript_path?: string;
  model?: {
    id: string;
    display_name?: string;
    effort?: string;
  };
  workspace?: {
    current_dir?: string;
    project_dir?: string;
  };
  context_window?: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
  };
  quota?: Record<string, StatuslineQuotaInfo>;
  agent_state?: string;
  task_count?: number;
}

/**
 * Evaluates if a worker result indicates an HTTP 429 / Quota limit error.
 */
export function isQuotaError(result: {
  exitCode?: number;
  stderr?: string;
  stdout?: string;
}): boolean {
  if (result.exitCode === undefined || result.exitCode === 0) {
    return false;
  }
  if (result.exitCode === 429) {
    return true;
  }
  const stderr = result.stderr || '';
  const quotaRegex = /(?:RESOURCE_EXHAUSTED|\(code 429\)|quota reached)/i;
  return quotaRegex.test(stderr);
}

/**
 * Normalizes a single quota info object based on current timestamp and reset_time.
 */
export function normalizeQuotaInfo(
  info: StatuslineQuotaInfo,
  now: number | Date = Date.now()
): StatuslineQuotaInfo {
  if (!info || typeof info !== 'object') {
    return info;
  }

  const nowMs = typeof now === 'number' ? now : now.getTime();

  if (info.reset_time && typeof info.reset_time === 'string') {
    const resetDate = new Date(info.reset_time);
    const resetMs = resetDate.getTime();

    if (!isNaN(resetMs)) {
      if (resetMs <= nowMs) {
        return {
          ...info,
          remaining_fraction: 1.0,
          reset_in_seconds: 0,
        };
      } else {
        const remainingSeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
        return {
          ...info,
          reset_in_seconds: remainingSeconds,
        };
      }
    }
  }

  return { ...info };
}

/**
 * Normalizes all quota pools in a StatuslineSnapshot based on time-decay and reset timestamps.
 */
export function normalizeStatuslineSnapshot(
  snapshot: StatuslineSnapshot | null | undefined,
  now: number | Date = Date.now()
): StatuslineSnapshot | null {
  if (!snapshot) {
    return null;
  }

  if (!snapshot.quota || typeof snapshot.quota !== 'object') {
    return { ...snapshot };
  }

  const normalizedQuota: Record<string, StatuslineQuotaInfo> = {};
  for (const [poolKey, poolInfo] of Object.entries(snapshot.quota)) {
    if (poolInfo && typeof poolInfo === 'object') {
      normalizedQuota[poolKey] = normalizeQuotaInfo(poolInfo, now);
    } else {
      normalizedQuota[poolKey] = poolInfo;
    }
  }

  return {
    ...snapshot,
    quota: normalizedQuota,
  };
}

/**
 * Resolves candidate quota pool info for a given model or identifier from a statusline snapshot.
 */
export function resolveCandidateQuotaInfo(
  model?: ModelInfo | string,
  snapshot?: StatuslineSnapshot | null,
  now: number | Date = Date.now()
): StatuslineQuotaInfo | undefined {
  if (!snapshot?.quota) {
    return undefined;
  }

  const modelId = typeof model === 'string' ? model : model?.id;
  const modelAliases = typeof model === 'object' && model ? model.aliases : undefined;

  const candidateKeys: string[] = [];

  if (modelId) {
    candidateKeys.push(modelId);
    if (!candidateKeys.includes(modelId.toLowerCase())) {
      candidateKeys.push(modelId.toLowerCase());
    }
  }

  if (modelAliases && Array.isArray(modelAliases)) {
    for (const alias of modelAliases) {
      if (alias && !candidateKeys.includes(alias)) {
        candidateKeys.push(alias);
      }
      if (alias && !candidateKeys.includes(alias.toLowerCase())) {
        candidateKeys.push(alias.toLowerCase());
      }
    }
  }

  const lowerId = (modelId || '').toLowerCase();
  const isGeminiFamily =
    lowerId.startsWith('gemini') ||
    lowerId.includes('flash') ||
    lowerId.includes('pro') ||
    (modelAliases?.some((a) => {
      const al = a.toLowerCase();
      return al.startsWith('gemini') || al.includes('flash') || al.includes('pro');
    }) ?? false);

  const is3pFamily =
    lowerId.startsWith('claude') ||
    lowerId.startsWith('gpt') ||
    lowerId.startsWith('3p') ||
    lowerId.includes('sonnet') ||
    lowerId.includes('opus') ||
    lowerId.includes('oss') ||
    (modelAliases?.some((a) => {
      const al = a.toLowerCase();
      return (
        al.startsWith('claude') ||
        al.startsWith('gpt') ||
        al.startsWith('3p') ||
        al.includes('sonnet') ||
        al.includes('opus')
      );
    }) ?? false);

  if (isGeminiFamily) {
    for (const key of ['gemini-5h', 'gemini-weekly', 'gemini']) {
      if (!candidateKeys.includes(key)) {
        candidateKeys.push(key);
      }
    }
  } else if (is3pFamily) {
    for (const key of ['3p-5h', '3p-weekly', '3p']) {
      if (!candidateKeys.includes(key)) {
        candidateKeys.push(key);
      }
    }
  }

  // Evaluate all candidate pools present in the snapshot in priority order
  const evaluatedCandidates: StatuslineQuotaInfo[] = [];

  for (const key of candidateKeys) {
    const rawEntry = snapshot.quota[key];
    if (rawEntry && typeof rawEntry === 'object' && typeof rawEntry.remaining_fraction === 'number') {
      const normalized = normalizeQuotaInfo(rawEntry, now);
      evaluatedCandidates.push(normalized);
    }
  }

  if (evaluatedCandidates.length === 0) {
    for (const rawEntry of Object.values(snapshot.quota)) {
      if (rawEntry && typeof rawEntry === 'object' && typeof rawEntry.remaining_fraction === 'number') {
        evaluatedCandidates.push(normalizeQuotaInfo(rawEntry, now));
      }
    }
  }

  if (evaluatedCandidates.length === 0) {
    return undefined;
  }

  const exhaustedCandidate = evaluatedCandidates.find((c) => c.remaining_fraction === 0);
  if (exhaustedCandidate) {
    return exhaustedCandidate;
  }

  return evaluatedCandidates[0];
}

/**
 * Calculates quota backoff delay using statusline snapshot or fallback duration.
 */
export function resolveQuotaDelay(
  snapshot?: StatuslineSnapshot | null,
  now: number | Date = Date.now()
): number {
  try {
    const nowMs = typeof now === 'number' ? now : now.getTime();
    if (snapshot?.quota) {
      for (const key of Object.keys(snapshot.quota)) {
        const q = snapshot.quota[key];
        if (!q) continue;

        // Ignore expired quota pools (reset_time <= now)
        if (q.reset_time && typeof q.reset_time === 'string') {
          const resetMs = new Date(q.reset_time).getTime();
          if (!isNaN(resetMs) && resetMs <= nowMs) {
            continue;
          }
        }

        if (q.remaining_fraction === 0) {
          let delaySeconds = q.reset_in_seconds;
          if (q.reset_time && typeof q.reset_time === 'string') {
            const resetMs = new Date(q.reset_time).getTime();
            if (!isNaN(resetMs)) {
              delaySeconds = Math.max(0, Math.round((resetMs - nowMs) / 1000));
            }
          }

          if (delaySeconds && delaySeconds > 0) {
            return Math.min(delaySeconds * 1000, 300000); // capped at 5 minutes
          }
        }
      }
    }
  } catch {
    // Non-fatal: parsing statusline quota timestamp failed, defaulting to 60s backoff
  }
  return 60000; // default 60s backoff
}

/**
 * Reads live state and quota from `last_statusline_input.json`.
 */
export async function getQuotaSnapshot(
  appDataDir?: string,
  now: number | Date = Date.now()
): Promise<StatuslineSnapshot | null> {
  const candidateDirs: string[] = [];

  if (appDataDir) {
    candidateDirs.push(appDataDir);
  } else {
    candidateDirs.push(path.join(process.cwd(), '.sandcastle'));

    if (process.env.GEMINI_APP_DIR) {
      candidateDirs.push(process.env.GEMINI_APP_DIR);
    }
    const home = os.homedir();
    candidateDirs.push(path.join(home, '.gemini', 'antigravity-cli'));
    candidateDirs.push(path.join(home, '.gemini', 'antigravity'));
    candidateDirs.push(path.join(home, '.antigravity'));
  }

  for (const dir of candidateDirs) {
    try {
      const statuslineFile = path.join(dir, 'last_statusline_input.json');
      if (fs.existsSync(statuslineFile)) {
        const raw = fs.readFileSync(statuslineFile, 'utf-8');
        if (raw && raw.trim()) {
          const parsed = JSON.parse(raw) as StatuslineSnapshot;
          return normalizeStatuslineSnapshot(parsed, now);
        }
      }
    } catch {
      // Continue checking other candidates
    }
  }

  return null;
}
