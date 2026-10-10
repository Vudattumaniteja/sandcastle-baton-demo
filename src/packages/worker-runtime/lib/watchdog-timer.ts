/**
 * Watchdog timer and cancellable sleep utilities.
 */

/**
 * Cancellable delay using AbortSignal. Active timers are cleared immediately on abort.
 */
export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(signal?.reason ?? new Error('Aborted'));
    };

    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Creates a watchdog timer that invokes `onTimeout` after `timeoutMs`.
 * Returns a cancel function.
 */
export function createWatchdog(timeoutMs: number, onTimeout: () => void): () => void {
  if (timeoutMs <= 0) {
    return () => {};
  }
  const timer = setTimeout(onTimeout, timeoutMs);
  return () => {
    clearTimeout(timer);
  };
}
