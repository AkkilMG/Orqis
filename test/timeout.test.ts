// ---------------------------------------------------------------------------
// Orqis – timeout.test.ts
// Real timers only — small timeout values (50-200ms) keep the suite fast.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../src/queue';
import { TimeoutError } from '../src/errors';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('TaskQueue – timeouts', () => {
  it('rejects with TimeoutError when task exceeds queue-level timeout', async () => {
    const queue = new TaskQueue({ timeout: 50 });

    await expect(
      queue.add(({ signal }) =>
        new Promise<never>((_, rej) => {
          signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
        })
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('TimeoutError carries the configured timeoutMs', async () => {
    const queue = new TaskQueue({ timeout: 50 });

    const err = await queue.add(({ signal }) =>
      new Promise<never>((_, rej) => {
        signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
      })
    ).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(TimeoutError);
    expect((err as TimeoutError).timeoutMs).toBe(50);
  });

  it('per-task timeout overrides queue-level timeout', async () => {
    const queue = new TaskQueue({ timeout: 5000 }); // queue default: 5s

    await expect(
      queue.add(
        ({ signal }) =>
          new Promise<never>((_, rej) => {
            signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
          }),
        { timeout: 50 }, // override: 50ms
      )
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('task with timeout: 0 disables timeout even when queue has a default', async () => {
    const queue = new TaskQueue({ timeout: 50 });
    let resolved = false;

    await queue.add(async () => {
      await sleep(100);
      resolved = true;
    }, { timeout: 0 });

    expect(resolved).toBe(true);
  }, 3000);

  it('emits timeout event on timeout', async () => {
    const queue = new TaskQueue({ timeout: 50 });
    const timeouts: string[] = [];
    queue.on('timeout', ({ id }: { id: string }) => { timeouts.push(id); });

    await queue.add(
      ({ signal }) =>
        new Promise<never>((_, rej) => {
          signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
        }),
      { id: 'my-task' }
    ).catch(() => {});

    expect(timeouts).toContain('my-task');
  });

  it('task that resolves before timeout does not emit timeout event', async () => {
    const queue = new TaskQueue({ timeout: 200 });
    const timeouts: unknown[] = [];
    queue.on('timeout', (p: unknown) => { timeouts.push(p); });

    await queue.add(async () => {
      await sleep(10); // resolves well before 200ms timeout
      return 'fast';
    });

    // Wait past the timeout window to confirm it never fires
    await sleep(250);
    expect(timeouts).toHaveLength(0);
  }, 3000);

  it('ctx.signal fires on timeout so tasks can clean up', async () => {
    const queue = new TaskQueue({ timeout: 50 });
    let signalFired = false;

    await queue.add(async ({ signal }) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          signalFired = true;
          reject(signal.reason);
        }, { once: true });
      });
    }).catch(() => {});

    expect(signalFired).toBe(true);
  });

  it('multiple tasks each get their own independent timeout', async () => {
    const queue = new TaskQueue({ concurrency: 2, timeout: 80 });

    // p1 has queue-level timeout (80ms), p2 has longer timeout (200ms)
    const p1 = queue.add(
      ({ signal }) =>
        new Promise<never>((_, rej) => {
          signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
        })
    );

    const p2 = queue.add(
      ({ signal }) =>
        new Promise<never>((_, rej) => {
          signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
        }),
      { timeout: 200 }
    );

    // p1 should reject at ~80ms
    await expect(p1).rejects.toBeInstanceOf(TimeoutError);
    // p2 is still pending at this point — wait for it to reject too
    await expect(p2).rejects.toBeInstanceOf(TimeoutError);
  }, 3000);
});
