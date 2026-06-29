// ---------------------------------------------------------------------------
// Orqis – Scheduler
// Responsible for moving tasks from the pending queue into active slots.
// ---------------------------------------------------------------------------

import type { TaskDescriptor } from './types.js';
import { AbortError, TimeoutError } from './errors.js';
import { shouldRetry, computeDelay, sleep } from './retry.js';

// Re-exported so queue.ts can reference it without knowing internals.
export type DispatchFn = () => void;

/**
 * Merge multiple AbortSignals into one.  The returned signal fires as soon
 * as any of the inputs fires.
 *
 * Uses AbortSignal.any() when available (Node 20+), falls back to a manual
 * implementation for Node 16–18.
 */
export function mergeSignals(signals: AbortSignal[]): AbortSignal {
  // Filter out non-aborted signals first
  const active = signals.filter(Boolean);
  if (active.length === 0) return new AbortController().signal;
  if (active.length === 1 && active[0] !== undefined) return active[0];

  // Native AbortSignal.any (Node ≥ 20.3)
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(active);
  }

  // Polyfill
  const controller = new AbortController();
  const abort = (reason: unknown) => controller.abort(reason);
  for (const sig of active) {
    if (sig.aborted) {
      abort(sig.reason);
      break;
    }
    sig.addEventListener('abort', () => abort(sig.reason), { once: true });
  }
  return controller.signal;
}

/**
 * Run a single task descriptor through its full lifecycle:
 *   start → execute → (retry on fail) → resolve / reject
 *
 * @param descriptor  The task to run.
 * @param onSettle    Called after the task reaches a terminal state
 *                    (success, final-failure, or cancel).  The scheduler
 *                    uses this to free the slot and trigger the next task.
 * @param emit        The queue's internal event emitter helper.
 */
export async function runTask<T>(
  descriptor: TaskDescriptor<T>,
  onSettle: DispatchFn,
  emit: <K extends string>(event: K, payload?: unknown) => void,
): Promise<void> {
  const { options } = descriptor;

  // Build the merged signal for this run
  const signals: AbortSignal[] = [descriptor.controller.signal];
  if (options.signal !== undefined) signals.push(options.signal);

  // Per-task timeout — create a dedicated controller so we can clear it
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let timeoutController: AbortController | undefined;

  if (options.timeout > 0) {
    timeoutController = new AbortController();
    signals.push(timeoutController.signal);
    timeoutHandle = setTimeout(() => {
      emit('timeout', { id: options.id });
      timeoutController!.abort(new TimeoutError(options.timeout));
    }, options.timeout);
  }

  const taskSignal = mergeSignals(signals);

  // Bail immediately if already aborted before we even start
  if (taskSignal.aborted) {
    clearTimeout(timeoutHandle);
    emit('cancel', { id: options.id });
    descriptor.reject(new AbortError());
    onSettle();
    return;
  }

  emit('start', { id: options.id });
  const startedAt = Date.now();

  try {
    const result = await descriptor.fn({ signal: taskSignal });

    clearTimeout(timeoutHandle);
    emit('success', { id: options.id, result, durationMs: Date.now() - startedAt });
    descriptor.resolve(result);
  } catch (raw: unknown) {
    clearTimeout(timeoutHandle);

    const error = raw instanceof Error ? raw : new Error(String(raw));

    // Was this an abort/timeout?
    if (taskSignal.aborted) {
      const reason: unknown = taskSignal.reason;
      if (reason instanceof TimeoutError) {
        emit('error', { id: options.id, error: reason, attempt: descriptor.attempt });
        descriptor.reject(reason);
        onSettle();
        return;
      }
      emit('cancel', { id: options.id });
      descriptor.reject(reason instanceof Error ? reason : new AbortError());
      onSettle();
      return;
    }

    // Check for retry
    if (shouldRetry(descriptor.attempt, options.retry)) {
      const delay =
        options.retry?.backoff !== undefined
          ? computeDelay(descriptor.attempt, options.retry.backoff)
          : 0;

      emit('retry', { id: options.id, attempt: descriptor.attempt, delay });

      // Free the slot immediately so other tasks can run during backoff
      onSettle();

      // Wait out the backoff (respecting the queue's own signal)
      try {
        await sleep(delay, descriptor.controller.signal);
      } catch {
        // Cancelled during backoff
        emit('cancel', { id: options.id });
        descriptor.reject(new AbortError());
        return;
      }

      // Re-enqueue by incrementing attempt and calling onSettle again —
      // the queue will pick it up from the re-add path.
      // (queue.ts handles the re-enqueue; we just signal via the descriptor)
      descriptor.attempt++;
      // Signal the queue to re-run this descriptor (see queue.ts)
      (descriptor as unknown as { _retry: true })['_retry'] = true;
      return;
    }

    emit('error', { id: options.id, error, attempt: descriptor.attempt });
    descriptor.reject(error);
  } finally {
    clearTimeout(timeoutHandle);
    // Only call onSettle once — retry path calls it early, normal path here.
    // The _retry flag tells queue.ts NOT to call it again.
    if (!(descriptor as unknown as { _retry?: boolean })['_retry']) {
      onSettle();
    }
  }
}
