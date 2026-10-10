export const MAX_BLOCKER_EVIDENCE_LENGTH = 30000;

const ANSI_REGEX =
  /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\].*?(?:\x07|\x1b\\)|\x1b[()#%][A-Za-z0-9]|\x1b[@-Z\\-_]/g;

/**
 * Strips terminal ANSI escape sequences from a string.
 */
export function stripAnsi(text: string): string {
  if (!text) return text;
  return text.replace(ANSI_REGEX, '');
}

/**
 * Sanitizes diagnostic blocker evidence by stripping ANSI escape sequences
 * and bounding payload length to stay within GitHub issue comment payload limits.
 */
export function sanitizeBlockerEvidence(
  evidence?: string,
  maxLength: number = MAX_BLOCKER_EVIDENCE_LENGTH
): string | undefined {
  if (evidence === undefined || evidence === null) return undefined;
  const stripped = stripAnsi(evidence);
  if (stripped.length <= maxLength) {
    return stripped;
  }
  return stripped.slice(0, maxLength);
}
