import pc from 'picocolors';

export interface LayoutDimensions {
  width: number;
  height: number;
}

/**
 * Gets the current terminal dimensions with safe fallbacks.
 */
export function getTerminalDimensions(
  stdout: NodeJS.WriteStream = process.stdout
): LayoutDimensions {
  return {
    width: stdout.columns || 80,
    height: stdout.rows || 24,
  };
}

/**
 * Truncates text with an ellipsis if it exceeds maxLength.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, Math.max(0, maxLength - 3)) + '...';
}

/**
 * Pads a string with trailing spaces up to target length, ignoring ANSI escape codes for length calculation.
 */
export function padAnsi(text: string, targetLength: number): string {
  // eslint-disable-next-line no-control-regex
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = targetLength - stripped.length;
  return diff > 0 ? text + ' '.repeat(diff) : text;
}

/**
 * Wraps content in a boxed card with border styling.
 */
export function createBoxCard(
  title: string,
  lines: string[],
  width: number = 76,
  borderColor: (s: string) => string = pc.cyan
): string[] {
  const innerWidth = width - 4;
  const topBorder = `┌─ ${title} ${'─'.repeat(Math.max(0, width - 6 - title.length))}┐`;
  const bottomBorder = `└${'─'.repeat(width - 2)}┘`;

  const result: string[] = [pc.bold(borderColor(topBorder))];
  for (const line of lines) {
    result.push(`${pc.bold(borderColor('│'))} ${padAnsi(line, innerWidth)} ${pc.bold(borderColor('│'))}`);
  }
  result.push(pc.bold(borderColor(bottomBorder)));
  return result;
}
