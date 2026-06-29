// ---------------------------------------------------------------------------
// Orqis – timeout.test.ts
// Per-task and queue-level timeouts, TimeoutError, signal propagation.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/queue.js';
import { TimeoutError } from '../src/errors.js';

const neverResolve = () => new Promise<never>(() => { /* intentionally hangs */ });

describe('TaskQueue – timeouts', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('rejects with TimeoutError when task exceeds queue-level timeout', async () => {
    const queue = new TaskQueue({ timeout: 500 });

    const p = queue.add(() => neverResolve());
    await vi.advanceTimersByTimeAsync(600);

    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries the configured timeoutMs', async () => {
    const queue = new TaskQueue({ timeout: 250 });

    const p = queue.add(() => neverResolve());
    await vi.advanceTimersByTimeAsync(300);

    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).timeoutMs).toBe(250);
  });

  it('per-task timeout overrides queue-level timeout', async () => {
    const queue = new TaskQueue({ timeout: 1000 });

    const p = queue.add(() => neverResolve(), { timeout: 100 });
    await vi.advanceTimersByTimeAsync(150);

    await expect(p).rejects.toBeInstanceOf(TimeoutError);
  });

  it('task with timeout: 0 disables timeout even when queue has a default', async () => {
    const queue = new TaskQueue({ timeout: 100 });

    let resolved = false;
    const p = queue.add(async () => {
      await new Promise<void>(r => setTimeout(r, 200));
      resolved = true;
    }, { timeout: 0 });

    await vi.advanceTimersByTimeAsync(300);
    await p;
    expect(resolved).toBe(true);
  });

  it('emits timeout event on timeout', async () => {
    const queue = new TaskQueue({ timeout: 100 });
    const timeouts: string[] = [];
    queue.on('timeout', ({ id }) => timeouts.push(id));

    const p = queue.add(() => neverResolve(), { id: 'my-task' });
    await vi.advanceTimersByTimeAsync(150);
    await p.catch(() => {});

    expect(timeouts).toContain('my-task');
  });

  it('task that resolves before timeout does not emit timeout event', async () => {
    const queue = new TaskQueue({ timeout: 1000 });
    const timeouts: unknown[] = [];
    queue.on('timeout', (p) => timeouts.push(p));

    await queue.add(async () => {
      await new Promise<void>(r => setTimeout(r, 50));
      return 'fast';
    });

    await vi.advanceTimersByTimeAsync(1100);

    expect(timeouts).toHaveLength(0);
  });

  it('ctx.signal fires on timeout so tasks can clean up', async () => {
    const queue = new TaskQueue({ timeout: 100 });
    let signalFired = false;

    const p = queue.add(async ({ signal }) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          signalFired = true;
          reject(signal.reason);
        }, { once: true });
      });
    });

    await vi.advanceTimersByTimeAsync(150);
    await p.catch(() => {});

    expect(signalFired).toBe(true);
  });

  it('multiple tasks each get their own independent timeout', async () => {
    const queue = new TaskQueue({ concurrency: 2, timeout: 100 });

    const p1 = queue.add(() => neverResolve());
    const p2 = queue.add(() => neverResolve(), { timeout: 300 });

    await vi.advanceTimersByTimeAsync(150);

    await expect(p1).rejects.toBeInstanceOf(TimeoutError);

    // p2 hasn't timed out yet
    await vi.advanceTimersByTimeAsync(200);
    await expect(p2).rejects.toBeInstanceOf(TimeoutError);
  });
});
