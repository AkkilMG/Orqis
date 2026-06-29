// ---------------------------------------------------------------------------
// Orqis – test/helpers.ts
// Shared utilities for the Orqis test suite.
// Import from individual test files:
//   import { sleep, makeCounter, makeTask, deferred } from './helpers.js';
// ---------------------------------------------------------------------------

import type { Task } from '../src/types.js';

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 * Works with both real and fake (vi.useFakeTimers) timers.
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * Returns a Promise that never resolves (useful for occupying a queue slot).
 * The caller must cancel the queue / abort the signal to clean up.
 */
export const neverResolve = (): Promise<never> =>
  new Promise<never>(() => { /* intentionally hangs */ });

// ---------------------------------------------------------------------------
// Call counter
// ---------------------------------------------------------------------------

/**
 * Creates a counter object that tracks how many times a function was called.
 *
 * @example
 * const counter = makeCounter();
 * queue.add(counter.fn);
 * await queue.onIdle();
 * expect(counter.calls).toBe(1);
 */
export function makeCounter(): { fn: Task<void>; calls: number } {
  const state = { calls: 0 };
  return {
    fn: async () => { state.calls++; },
    get calls() { return state.calls; },
  };
}

// ---------------------------------------------------------------------------
// Controlled task factory
// ---------------------------------------------------------------------------

/**
 * Creates a task that:
 *  - Optionally fails for the first `failTimes` calls, then resolves.
 *  - Tracks total call count.
 *  - Resolves with `returnValue`.
 *
 * @example
 * const t = makeTask({ failTimes: 2, returnValue: 'done' });
 * const result = await queue.add(t.fn, { retry: { attempts: 3 } });
 * expect(result).toBe('done');
 * expect(t.calls).toBe(3);
 */
export function makeTask<T = string>(opts: {
  failTimes?: number;
  returnValue?: T;
  delayMs?: number;
} = {}): { fn: Task<T | undefined>; calls: number } {
  const { failTimes = 0, returnValue, delayMs = 0 } = opts;
  const state = { calls: 0 };

  return {
    fn: async ({ signal }) => {
      state.calls++;
      if (delayMs > 0) {
        await sleep(delayMs);
        if (signal.aborted) return undefined;
      }
      if (state.calls <= failTimes) {
        throw new Error(`Intentional failure (attempt ${state.calls})`);
      }
      return returnValue;
    },
    get calls() { return state.calls; },
  };
}

// ---------------------------------------------------------------------------
// Deferred promise
// ---------------------------------------------------------------------------

/**
 * A manually-controlled promise.  Useful for fine-grained timing in tests.
 *
 * @example
 * const d = deferred<string>();
 * queue.add(() => d.promise);
 * d.resolve('hello');
 * expect(await d.promise).toBe('hello');
 */
export function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

// ---------------------------------------------------------------------------
// Event recorder
// ---------------------------------------------------------------------------

/**
 * Attaches listeners to a queue and records every event that fires,
 * in emission order.
 *
 * @example
 * const recorder = recordEvents(queue, ['start', 'success', 'idle']);
 * await queue.add(async () => 'ok');
 * await queue.onIdle();
 * expect(recorder.events).toEqual(['start', 'success', 'idle']);
 */
export function recordEvents(
  emitter: { on: (event: string, listener: (...args: unknown[]) => void) => void },
  eventNames: string[],
): { events: string[] } {
  const events: string[] = [];
  for (const name of eventNames) {
    emitter.on(name, () => events.push(name));
  }
  return { events };
}

// ---------------------------------------------------------------------------
// Active concurrency tracker
// ---------------------------------------------------------------------------

/**
 * Wraps a set of tasks to record the peak simultaneous active count.
 *
 * @example
 * const tracker = concurrencyTracker(tasks);
 * await queue.addAll(tracker.tasks);
 * expect(tracker.peak).toBeLessThanOrEqual(3);
 */
export function concurrencyTracker(
  tasks: Array<Task<unknown>>,
  delayMs = 20,
): { tasks: Array<Task<unknown>>; peak: number } {
  const state = { active: 0, peak: 0 };

  const wrapped = tasks.map(task => async (ctx: Parameters<Task<unknown>>[0]) => {
    state.active++;
    state.peak = Math.max(state.peak, state.active);
    try {
      return await task(ctx);
    } finally {
      await sleep(delayMs); // hold the slot briefly to make overlaps observable
      state.active--;
    }
  }) as Array<Task<unknown>>;

  return {
    tasks: wrapped,
    get peak() { return state.peak; },
  };
}
