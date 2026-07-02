// ---------------------------------------------------------------------------
// Orqis – retry.test.ts
// Real timers throughout (no vi.useFakeTimers) — short fixed delays (10ms)
// keep the whole suite fast while avoiding fake-timer/pool interaction bugs.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../src/queue';
import { computeDelay, shouldRetry } from '../src/retry';

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
    expect(computeDelay(1, { type: 'fixed', delay: 500 })).toBe(500);
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
    expect(computeDelay(3, opt)).toBe(300);
    expect(computeDelay(10, opt)).toBe(300);
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

describe('TaskQueue – retry', () => {
  it('retries a task and resolves on eventual success', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
    });
    let calls = 0;

    const result = await queue.add(async () => {
      calls++;
      if (calls < 3) { throw new Error('not yet'); }
      return 'done';
    });

    expect(result).toBe('done');
    expect(calls).toBe(3);
  });

  it('rejects after exhausting all retry attempts', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 2, backoff: { type: 'fixed', delay: 10 } },
    });
    let calls = 0;

    await expect(queue.add(async () => {
      calls++;
      throw new Error('always fails');
    })).rejects.toThrow('always fails');

    expect(calls).toBe(2);
  });

  it('emits retry event with correct attempt and delay', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
    });
    const retries: Array<{ attempt: number; delay: number }> = [];
    queue.on('retry', ({ attempt, delay }) => { retries.push({ attempt, delay }); });
    queue.on('error', () => { /* prevent unhandled */ });

    await queue.add(async () => { throw new Error('fail'); }).catch(() => {});

    expect(retries).toHaveLength(2);
    expect(retries[0]).toMatchObject({ attempt: 1, delay: 10 });
    expect(retries[1]).toMatchObject({ attempt: 2, delay: 10 });
  });

  it('per-task retry overrides queue-level retry', async () => {
    const queue = new TaskQueue({
      retry: { attempts: 5, backoff: { type: 'fixed', delay: 10 } },
    });
    let calls = 0;

    await queue.add(
      async () => { calls++; throw new Error('fail'); },
      { retry: { attempts: 2, backoff: { type: 'fixed', delay: 10 } } },
    ).catch(() => {});

    expect(calls).toBe(2);
  });

  it('does not retry when no retry config is set', async () => {
    const queue = new TaskQueue();
    let calls = 0;

    await expect(queue.add(async () => {
      calls++;
      throw new Error('fail');
    })).rejects.toThrow('fail');

    expect(calls).toBe(1);
  });
});
