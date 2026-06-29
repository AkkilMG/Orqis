// ---------------------------------------------------------------------------
// Orqis – retry.test.ts
// Retry behaviour: attempts, backoff delay, jitter, maxDelay, per-task
// override, and interaction with events.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/queue.js';
import { computeDelay, shouldRetry } from '../src/retry.js';

// ---------------------------------------------------------------------------
// Unit tests for retry helpers
// ---------------------------------------------------------------------------

describe('shouldRetry()', () => {
  it('returns false when retryOptions is undefined', () => {
    expect(shouldRetry(1, undefined)).toBe(false);
  });

  it('returns false when attempt >= attempts', () => {
    expect(shouldRetry(3, { attempts: 3 })).toBe(false);
    expect(shouldRetry(4, { attempts: 3 })).toBe(false);
  });

  it('returns true when attempt < attempts', () => {
    expect(shouldRetry(1, { attempts: 3 })).toBe(true);
    expect(shouldRetry(2, { attempts: 3 })).toBe(true);
  });
});

describe('computeDelay()', () => {
  it('returns fixed delay for type: fixed', () => {
    const delay = computeDelay(1, { type: 'fixed', delay: 500 });
    expect(delay).toBe(500);
  });

  it('does not change delay with attempts for fixed type', () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(computeDelay(attempt, { type: 'fixed', delay: 200 })).toBe(200);
    }
  });

  it('doubles delay each attempt for exponential (factor 2)', () => {
    const opt = { type: 'exponential' as const, delay: 100, factor: 2 };
    expect(computeDelay(1, opt)).toBe(100);
    expect(computeDelay(2, opt)).toBe(200);
    expect(computeDelay(3, opt)).toBe(400);
  });

  it('respects maxDelay', () => {
    const opt = { type: 'exponential' as const, delay: 100, factor: 2, maxDelay: 300 };
    expect(computeDelay(1, opt)).toBe(100);
    expect(computeDelay(2, opt)).toBe(200);
    expect(computeDelay(3, opt)).toBe(300); // capped
    expect(computeDelay(10, opt)).toBe(300); // still capped
  });

  it('applies jitter within expected range', () => {
    const opt = { type: 'fixed' as const, delay: 1000, jitter: 0.2 };
    for (let i = 0; i < 100; i++) {
      const d = computeDelay(1, opt);
      expect(d).toBeGreaterThanOrEqual(800);
      expect(d).toBeLessThanOrEqual(1200);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration tests for retry in TaskQueue
// ---------------------------------------------------------------------------

describe('TaskQueue – retry', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('retries a task and resolves on eventual success', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 3, backoff: { type: 'fixed', delay: 100 } },
    });
    let calls = 0;

    const p = queue.add(async () => {
      calls++;
      if (calls < 3) throw new Error('not yet');
      return 'done';
    });

    await vi.runAllTimersAsync();
    expect(await p).toBe('done');
    expect(calls).toBe(3);
  });

  it('rejects after exhausting all retry attempts', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
    });
    let calls = 0;

    const p = queue.add(async () => {
      calls++;
      throw new Error('always fails');
    });

    await vi.runAllTimersAsync();
    await expect(p).rejects.toThrow('always fails');
    expect(calls).toBe(2);
  });

  it('emits retry event with correct attempt and delay', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 3, backoff: { type: 'fixed', delay: 200 } },
    });
    const retries: Array<{ attempt: number; delay: number }> = [];
    queue.on('retry', ({ attempt, delay }) => retries.push({ attempt, delay }));
    queue.on('error', () => { /* silence */ });

    const p = queue.add(async () => { throw new Error('fail'); });
    await vi.runAllTimersAsync();
    await p.catch(() => {});

    expect(retries).toHaveLength(2); // 2 retries for 3 total attempts
    expect(retries[0]).toMatchObject({ attempt: 1, delay: 200 });
    expect(retries[1]).toMatchObject({ attempt: 2, delay: 200 });
  });

  it('per-task retry overrides queue-level retry', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 5 }, // queue default: 5 attempts
    });
    let calls = 0;

    const p = queue.add(
      async () => { calls++; throw new Error('fail'); },
      { retry: { attempts: 2 } }, // override: only 2
    );

    await vi.runAllTimersAsync();
    await p.catch(() => {});
    expect(calls).toBe(2);
  });

  it('does not retry when no retry config is set', async () => {
    const queue = new TaskQueue(); // no retry
    let calls = 0;

    const p = queue.add(async () => {
      calls++;
      throw new Error('fail');
    });

    await expect(p).rejects.toThrow('fail');
    expect(calls).toBe(1);
  });
});
