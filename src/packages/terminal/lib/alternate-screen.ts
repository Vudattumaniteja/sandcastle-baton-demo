/**
 * ANSI alternate screen buffer and cursor escape codes.
 */

export const ENTER_ALT_SCREEN = '\x1b[?1049h';
export const EXIT_ALT_SCREEN = '\x1b[?1049l';
export const CURSOR_HOME = '\x1b[H';
export const CURSOR_HIDE = '\x1b[?25l';
export const CURSOR_SHOW = '\x1b[?25h';
export const CLEAR_SCREEN = '\x1b[2J';

/**
 * Returns escape sequence to enter alternate screen buffer, move home, and hide cursor.
 */
export function getEnterAlternateScreenSequence(): string {
  return `${ENTER_ALT_SCREEN}${CURSOR_HOME}${CURSOR_HIDE}`;
}

/**
 * Returns escape sequence to exit alternate screen buffer and show cursor.
 */
export function getExitAlternateScreenSequence(): string {
  return `${EXIT_ALT_SCREEN}${CURSOR_SHOW}`;
}

/**
 * Returns escape sequence to home cursor and clear screen.
 */
export function getClearAndHomeSequence(): string {
  return `${CURSOR_HOME}${CLEAR_SCREEN}`;
}
