/**
 * Signal trapping and terminal cursor restoration.
 */

/**
 * Restores terminal cursor visibility (\x1b[?25h).
 */
export function restoreCursor(): void {
  try {
    process.stdout.write('\x1b[?25h');
  } catch {
    // Non-fatal: stdout stream may be closed or redirected in background sessions
  }
}

export interface SignalTrapOptions {
  escalationGracePeriodMs?: number;
  onSignal?: (signal: string, graceful: boolean) => void;
}

/**
 * Registers signal trap handlers for SIGINT and SIGTERM with terminal cursor recovery
 * and forced kill escalation.
 */
export function registerSignalTrap(options: SignalTrapOptions = {}): () => void {
  const escalationGracePeriodMs = options.escalationGracePeriodMs ?? 5000;
  let forceTimer: NodeJS.Timeout | undefined;

  const handleSignal = (sig: string) => {
    restoreCursor();
    options.onSignal?.(sig, true);

    if (!forceTimer) {
      forceTimer = setTimeout(() => {
        options.onSignal?.(sig, false);
        process.exit(130);
      }, escalationGracePeriodMs);

      if (forceTimer.unref) {
        forceTimer.unref();
      }
    }
  };

  const sigintListener = () => handleSignal('SIGINT');
  const sigtermListener = () => handleSignal('SIGTERM');

  process.on('SIGINT', sigintListener);
  process.on('SIGTERM', sigtermListener);

  return () => {
    if (forceTimer) {
      clearTimeout(forceTimer);
      forceTimer = undefined;
    }
    process.removeListener('SIGINT', sigintListener);
    process.removeListener('SIGTERM', sigtermListener);
  };
}
