// ---------------------------------------------------------------------------
// Orqis – queue.test.ts
// Core TaskQueue behaviour: concurrency, ordering, pause/resume, events,
// addAll, stopOnError, and state properties.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/queue';
import { AbortError } from '../src/errors';

// Helper: resolves after `ms` milliseconds
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('TaskQueue – concurrency', () => {
  it('runs at most concurrency tasks simultaneously', async () => {
    const N = 3;
    const queue = new TaskQueue({ concurrency: N });
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await sleep(20);
      active--;
    });

    await queue.addAll(tasks);
    expect(maxActive).toBe(N);
  });

  it('runs all tasks when concurrency is Infinity', async () => {
    const queue = new TaskQueue(); // default concurrency = Infinity
    let started = 0;

    const tasks = Array.from({ length: 5 }, () => async () => {
      started++;
      await sleep(10);
    });

    await queue.addAll(tasks);
    expect(started).toBe(5);
  });

  it('serial execution when concurrency is 1', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const order: number[] = [];

    await queue.addAll([
      async () => { order.push(1); await sleep(10); },
      async () => { order.push(2); await sleep(10); },
      async () => { order.push(3); },
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('TaskQueue – FIFO ordering', () => {
  it('processes tasks in the order they were added', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const order: number[] = [];

    await queue.addAll([
      async () => { order.push(1); },
      async () => { order.push(2); },
      async () => { order.push(3); },
    ]);

    expect(order).toEqual([1, 2, 3]);
  });
});

describe('TaskQueue – priority queue', () => {
  it('executes higher-priority tasks first', async () => {
    const queue = new TaskQueue({ concurrency: 1, priority: true, autoStart: false });
    const order: string[] = [];

    queue.add(async () => { order.push('low'); },    { priority: 1 });
    queue.add(async () => { order.push('high'); },   { priority: 10 });
    queue.add(async () => { order.push('medium'); }, { priority: 5 });

    queue.resume();
    await queue.onIdle();

    expect(order).toEqual(['high', 'medium', 'low']);
  });
});

describe('TaskQueue – addAll', () => {
  it('returns results in input order', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const results = await queue.addAll([
      async () => { await sleep(30); return 'a'; },
      async () => { await sleep(10); return 'b'; },
      async () => { await sleep(20); return 'c'; },
    ]);
    expect(results).toEqual(['a', 'b', 'c']);
  });

  it('rejects if any task fails', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    queue.on('error', () => { /* suppress ERR_UNHANDLED_ERROR */ });
    await expect(
      queue.addAll([
        async () => 'ok',
        async () => { throw new Error('boom'); },
      ])
    ).rejects.toThrow('boom');
  });
});

describe('TaskQueue – pause / resume', () => {
  it('pauses dequeuing and resumes on resume()', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const ran: string[] = [];

    queue.add(async () => { ran.push('a'); await sleep(50); });
    queue.pause();
    queue.add(async () => { ran.push('b'); });

    await sleep(20); // let 'a' start before pause takes effect
    expect(ran).toContain('a');
    expect(ran).not.toContain('b');

    queue.resume();
    await queue.onIdle();
    expect(ran).toContain('b');
  });

  it('autoStart: false requires resume() to begin', async () => {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });
    const ran: string[] = [];

    queue.add(async () => { ran.push('x'); });
    await sleep(20);
    expect(ran).toEqual([]);

    queue.resume();
    await queue.onIdle();
    expect(ran).toEqual(['x']);
  });
});

describe('TaskQueue – clear', () => {
  it('discards pending tasks and rejects their promises', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    // Block the slot
    queue.add(() => sleep(200));

    const p = queue.add(async () => 'never');
    queue.clear();

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('TaskQueue – state properties', () => {
  it('reflects size and pending correctly', async () => {
    const queue = new TaskQueue({ concurrency: 1 });

    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);

    const blocker = queue.add(() => sleep(100));
    await sleep(10); // let blocker start

    queue.add(() => sleep(10));
    queue.add(() => sleep(10));

    expect(queue.pending).toBe(1);
    expect(queue.size).toBe(2);

    await blocker;
    await queue.onIdle();

    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);
  });
});

describe('TaskQueue – events', () => {
  it('emits start and success for a passing task', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const events: string[] = [];

    queue.on('start',   () => events.push('start'));
    queue.on('success', () => events.push('success'));

    await queue.add(async () => 'ok');
    expect(events).toEqual(['start', 'success']);
  });

  it('emits idle after all tasks settle', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let idleFired = false;
    queue.on('idle', () => { idleFired = true; });

    queue.add(() => sleep(10));
    queue.add(() => sleep(20));
    await queue.onIdle();

    expect(idleFired).toBe(true);
  });

  it('emits empty when pending queue drains', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    let emptyFired = false;
    queue.on('empty', () => { emptyFired = true; });

    queue.add(() => sleep(50));
    queue.add(() => sleep(10));

    await queue.onEmpty();
    expect(emptyFired).toBe(true);
  });
});

describe('TaskQueue – stopOnError', () => {
  it('pauses queue on first error when stopOnError is true', async () => {
    const queue = new TaskQueue({ concurrency: 2, stopOnError: true });
    const ran: string[] = [];

    queue.on('error', () => { /* prevent unhandled */ });

    queue.add(async () => { throw new Error('fail'); });
    queue.add(async () => { await sleep(50); ran.push('b'); });
    queue.add(async () => { ran.push('c'); });

    await sleep(100);

    // 'c' should NOT have run — queue paused after first failure
    expect(ran).not.toContain('c');
  });
});

describe('TaskQueue – onIdle / onEmpty resolve immediately when idle', () => {
  it('onIdle resolves immediately on an already-idle queue', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    await expect(queue.onIdle()).resolves.toBeUndefined();
  });

  it('onEmpty resolves immediately when queue has no pending tasks', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    await expect(queue.onEmpty()).resolves.toBeUndefined();
  });
});

describe('TaskQueue – external abortSignal', () => {
  it('cancels the queue when the external signal fires', async () => {
    const controller = new AbortController();
    const queue = new TaskQueue({ concurrency: 1, abortSignal: controller.signal });

    let started = false;
    const p = queue.add(async ({ signal }) => {
      started = true;
      await new Promise<void>((_, rej) => {
        signal.addEventListener('abort', () => { rej(signal.reason); }, { once: true });
      });
    });

    // Poll until task is running, then abort
    await new Promise<void>(res => {
      const iv = setInterval(() => { if (started) { clearInterval(iv); res(); } }, 1);
    });
    controller.abort();

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  it('rejects add() immediately if signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const queue = new TaskQueue({ concurrency: 1, abortSignal: controller.signal });

    await expect(queue.add(async () => 'x')).rejects.toBeInstanceOf(AbortError);
  });
});
