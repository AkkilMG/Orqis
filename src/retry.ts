// ---------------------------------------------------------------------------
// Orqis – Retry / backoff logic
// ---------------------------------------------------------------------------

import type { RetryOptions, BackoffOptions } from './types.js';

/**
 * Compute the delay (ms) before the next retry attempt.
 *
 * Formula for exponential with jitter:
 *   computed = min(delay × factor^(attempt - 1), maxDelay)
 *   final    = computed × (1 + jitter × (Math.random() * 2 - 1))
 *
 * @param attempt  1-based index of the attempt that just failed.
 * @param backoff  BackoffOptions from RetryOptions.
 */
export function computeDelay(attempt: number, backoff: BackoffOptions): number {
  const {
    type,
    delay,
    factor = 2,
    jitter = 0,
    maxDelay = Infinity,
  } = backoff;

  let computed: number;

  if (type === 'exponential') {
    computed = delay * Math.pow(factor, attempt - 1);
  } else {
    computed = delay;
  }

  computed = Math.min(computed, maxDelay);

  if (jitter > 0) {
    // Add symmetric jitter: ±(jitter × computed)
    const noise = computed * jitter * (Math.random() * 2 - 1);
    computed = Math.max(0, computed + noise);
  }

  return Math.round(computed);
}

/**
 * Returns true if the task should be retried.
 *
 * @param attempt       1-based attempt number that just failed.
 * @param retryOptions  The resolved retry config for this task.
 */
export function shouldRetry(
  attempt: number,
  retryOptions: RetryOptions | undefined,
): boolean {
  if (retryOptions === undefined) {
    return false;
  }
  return attempt < retryOptions.attempts;
}

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Respects an optional AbortSignal — rejects early with the signal's
 * abort reason if cancelled while waiting.
 */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error('Aborted'));
      },
      { once: true },
    );
  });
}
