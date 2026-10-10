import pc from 'picocolors';

/**
 * Formats duration in seconds into MM:SS format.
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const padMins = mins.toString().padStart(2, '0');
  const padSecs = secs.toString().padStart(2, '0');
  return `${padMins}:${padSecs}`;
}

/**
 * Formats duration in milliseconds into seconds string with one decimal place.
 */
export function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats an ANSI progress bar with cyan filled blocks and gray empty blocks.
 *
 * @param percent Value between 0 and 100
 * @param width Number of block characters (default: 20)
 * @param showPercent Whether to append numeric percent (e.g. " 45%")
 */
export function formatProgressBar(
  percent: number,
  width: number = 20,
  showPercent: boolean = true
): string {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillCount = Math.min(width, Math.round((clamped / 100) * width));
  const emptyCount = Math.max(0, width - fillCount);
  const filled = '█'.repeat(fillCount);
  const empty = '░'.repeat(emptyCount);
  const bar = `${pc.cyan(filled)}${pc.gray(empty)}`;
  return showPercent ? `${bar} ${clamped}%` : bar;
}

/**
 * Backward compatibility alias for handoff-style progress bar (no trailing numeric percent).
 */
export function formatHandoffProgressBar(
  percent: number,
  width: number = 20
): string {
  return formatProgressBar(percent, width, false);
}
