// ---------------------------------------------------------------------------
// Orqis – group.test.ts
// TaskGroup: scoped cancellation, onComplete, size/pending tracking.
// ---------------------------------------------------------------------------

import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../src/queue.js';
import { TaskGroup } from '../src/group.js';
import { AbortError } from '../src/errors.js';

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

describe('TaskGroup – basic usage', () => {
  it('runs tasks through the parent queue', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const group = new TaskGroup(queue);
    const results: number[] = [];

    group.add(async () => { results.push(1); });
    group.add(async () => { results.push(2); });
    group.add(async () => { results.push(3); });

    await group.onComplete();
    expect(results.sort()).toEqual([1, 2, 3]);
  });

  it('onComplete resolves when all group tasks settle', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const group = new TaskGroup(queue);
    let completed = false;

    group.add(() => sleep(30));
    group.add(() => sleep(50));

    await group.onComplete();
    completed = true;

    expect(completed).toBe(true);
  });

  it('onComplete resolves immediately for an empty group', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const group = new TaskGroup(queue);
    await expect(group.onComplete()).resolves.toBeUndefined();
  });
});

describe('TaskGroup – scoped cancellation', () => {
  it('cancel() aborts only this group\'s tasks', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const groupA = new TaskGroup(queue);
    const groupB = new TaskGroup(queue);

    const results: string[] = [];

    groupA.add(async ({ signal }) => {
      await sleep(100);
      if (!signal.aborted) results.push('A');
    });

    groupB.add(async () => {
      await sleep(50);
      results.push('B');
    });

    groupA.cancel();

    await queue.onIdle();

    expect(results).not.toContain('A');
    expect(results).toContain('B');
  });

  it('group.cancel() rejects onComplete', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const group = new TaskGroup(queue);

    group.add(() => sleep(500));

    const complete = group.onComplete();
    group.cancel();

    await expect(complete).rejects.toBeInstanceOf(AbortError);
  });

  it('propagates parent queue cancellation to the group', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const group = new TaskGroup(queue);

    const p = group.add(async ({ signal }) =>
      new Promise<void>((_, rej) => {
        signal.addEventListener('abort', () => { rej(new AbortError()); }, { once: true });
      })
    );

    setTimeout(() => queue.cancel(), 10);

    await expect(p).rejects.toBeInstanceOf(AbortError);
  });
});

describe('TaskGroup – size / pending tracking', () => {
  it('tracks size (pending) correctly as tasks complete', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const group = new TaskGroup(queue);

    group.add(() => sleep(30));
    group.add(() => sleep(30));
    group.add(() => sleep(30));

    expect(group.size).toBeGreaterThan(0);

    await group.onComplete();

    expect(group.size).toBe(0);
    expect(group.pending).toBe(0);
  });
});

describe('TaskGroup – id', () => {
  it('uses the provided id', () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const group = new TaskGroup(queue, { id: 'my-group' });
    expect(group.id).toBe('my-group');
  });

  it('auto-generates an id when none provided', () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const group = new TaskGroup(queue);
    expect(typeof group.id).toBe('string');
    expect(group.id.length).toBeGreaterThan(0);
  });
});
