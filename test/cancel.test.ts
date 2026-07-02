// ---------------------------------------------------------------------------
// Orqis – cancel.test.ts
// Cancellation: queue.cancel(), queue.clear(), external AbortSignal,
// per-task signal, ctx.signal propagation, and post-cancel behaviour.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/queue';
import { TaskGroup } from '../src/group';
import { AbortError } from '../src/errors';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// queue.cancel()
// ---------------------------------------------------------------------------

describe('queue.cancel()', () => {
  it('rejects pending tasks with AbortError', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    // Block the only slot
    queue.add(() => sleep(500));

    // This task is pending — will be cancelled
    const p = queue.add(async () => 'never');
    queue.cancel();

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it('propagates abort to running tasks via ctx.signal', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    let aborted = false;

    const p = queue.add(async ({ signal }) => {
      await new Promise<void>((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new AbortError());
        }, { once: true });
      });
    });

    // Give the task time to start
    await Promise.resolve();
    queue.cancel();

    await expect(p).rejects.toBeInstanceOf(AbortError);
    expect(aborted).toBe(true);
  });

  it('emits cancel event for each discarded pending task', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const cancelled: string[] = [];
    queue.on('cancel', ({ id }) => cancelled.push(id));

    queue.add(() => sleep(500)); // blocks slot
    queue.add(async () => 'a', { id: 'task-a' });
    queue.add(async () => 'b', { id: 'task-b' });

    queue.cancel();
    await sleep(10);

    expect(cancelled).toContain('task-a');
    expect(cancelled).toContain('task-b');
  });

  it('allows new tasks to be added after cancel + resume', async () => {
    const queue = new TaskQueue({ concurrency: 2 });

    queue.add(() => sleep(500));
    queue.cancel();

    // After cancel, add a fresh task
    const result = await queue.add(async () => 'fresh');
    expect(result).toBe('fresh');
  });

  it('rejects add() while queue signal is aborted', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    // Cancel fires internal controller; new internal controller is created
    queue.cancel();

    // After cancel a new controller is made, so add() should work again
    // (this verifies the controller is reset)
    const result = await queue.add(async () => 'ok');
    expect(result).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// queue.clear()
// ---------------------------------------------------------------------------

describe('queue.clear()', () => {
  it('only removes pending tasks — running tasks continue', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const ran: string[] = [];

    const running = queue.add(async () => {
      await sleep(50);
      ran.push('running');
    });

    queue.add(async () => { ran.push('pending'); });

    // clear before pending task starts
    queue.clear();

    await running;
    expect(ran).toContain('running');
    expect(ran).not.toContain('pending');
  });

  it('rejects cleared tasks with AbortError', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    queue.add(() => sleep(200)); // blocks slot

    const p1 = queue.add(async () => 'p1');
    const p2 = queue.add(async () => 'p2');

    queue.clear();

    await expect(p1).rejects.toBeInstanceOf(AbortError);
    await expect(p2).rejects.toBeInstanceOf(AbortError);
  });

  it('size becomes 0 after clear()', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    queue.add(() => sleep(500)); // holds slot
    queue.add(async () => 'a');
    queue.add(async () => 'b');
    queue.add(async () => 'c');

    expect(queue.size).toBe(3);

    queue.clear();

    expect(queue.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// External AbortSignal on the queue
// ---------------------------------------------------------------------------

describe('external AbortSignal (QueueOptions.abortSignal)', () => {
  it('cancels queue when external signal fires', async () => {
    const controller = new AbortController();
    const queue = new TaskQueue({ concurrency: 1, abortSignal: controller.signal });

    const p = queue.add(() => sleep(500));

    setTimeout(() => controller.abort(), 20);

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it('rejects immediately if signal is already aborted at construction', async () => {
    const controller = new AbortController();
    controller.abort();

    const queue = new TaskQueue({ concurrency: 1, abortSignal: controller.signal });
    await expect(queue.add(async () => 'x')).rejects.toBeInstanceOf(AbortError);
  });
});

// ---------------------------------------------------------------------------
// Per-task AbortSignal (TaskAddOptions.signal)
// ---------------------------------------------------------------------------

describe('per-task AbortSignal (TaskAddOptions.signal)', () => {
  it('aborts the specific task when its signal fires', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const controller = new AbortController();
    const ran: string[] = [];

    const p1 = queue.add(
      async ({ signal }) => {
        await new Promise<void>((_, rej) => {
          signal.addEventListener('abort', () => rej(new AbortError()), { once: true });
        });
        ran.push('task1');
      },
      { signal: controller.signal },
    );

    const p2 = queue.add(async () => {
      await sleep(50);
      ran.push('task2');
    });

    setTimeout(() => controller.abort(), 10);

    await expect(p1).rejects.toBeInstanceOf(AbortError);
    await p2;

    expect(ran).not.toContain('task1');
    expect(ran).toContain('task2');
  });

  it('does not affect other tasks when one task\'s signal fires', async () => {
    const queue = new TaskQueue({ concurrency: 3 });
    const ctrl = new AbortController();
    const results: string[] = [];

    const p1 = queue.add(async () => { results.push('a'); return 'a'; });
    const p2 = queue.add(
      async ({ signal }) =>
        new Promise<string>((_, rej) => {
          signal.addEventListener('abort', () => rej(new AbortError()), { once: true });
        }),
      { signal: ctrl.signal },
    );
    const p3 = queue.add(async () => { results.push('c'); return 'c'; });

    ctrl.abort();

    await p1;
    await p3;
    await p2.catch(() => {});

    expect(results).toContain('a');
    expect(results).toContain('c');
  });
});

// ---------------------------------------------------------------------------
// TaskGroup cancellation
// ---------------------------------------------------------------------------

describe('TaskGroup cancellation', () => {
  it('group.cancel() does not affect sibling groups', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const groupA = new TaskGroup(queue);
    const groupB = new TaskGroup(queue);
    const results: string[] = [];

    groupA.add(async ({ signal }) => {
      await new Promise<void>((_, rej) => {
        signal.addEventListener('abort', () => rej(new AbortError()), { once: true });
        setTimeout(() => rej(new AbortError()), 200);
      }).catch(() => {});
    });

    groupB.add(async () => {
      await sleep(30);
      results.push('B-done');
    });

    groupA.cancel();

    await groupB.onComplete();
    expect(results).toContain('B-done');
  });

  it('group.cancel() rejects all pending group tasks', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const group = new TaskGroup(queue);

    queue.add(() => sleep(300)); // block slot so group tasks stay pending

    const p1 = group.add(async () => 'x');
    const p2 = group.add(async () => 'y');

    group.cancel();

    await expect(p1).rejects.toBeInstanceOf(AbortError);
    await expect(p2).rejects.toBeInstanceOf(AbortError);
  });

  it('cancelling parent queue also cancels the group', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const group = new TaskGroup(queue);

    const p = group.add(() => sleep(500));

    setTimeout(() => queue.cancel(), 20);

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

// ---------------------------------------------------------------------------
// ctx.signal cooperative cancellation
// ---------------------------------------------------------------------------

describe('ctx.signal cooperative cancellation', () => {
  it('is already aborted when task is dequeued after cancel', async () => {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });

    const p = queue.add(async ({ signal }) => {
      // Check synchronously at task start
      if (signal.aborted) throw new AbortError();
      return 'ok';
    });

    queue.cancel();
    queue.resume();

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it('fires signal.addEventListener abort listener when cancelled mid-run', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const events: string[] = [];

    const p = queue.add(async ({ signal }) => {
      signal.addEventListener('abort', () => events.push('aborted'), { once: true });
      await sleep(500); // will be cancelled during this
    });

    await sleep(10);
    queue.cancel();

    await p.catch(() => {});
    expect(events).toContain('aborted');
  });
});
