# Testing Guide

How to write reliable tests for code that uses Orqis, and a reference for the test suite patterns used inside Orqis itself.

---

## Testing Your Queue-Based Code

### Concurrency Enforcement

Verify that no more than `N` tasks run simultaneously:

```ts
import { TaskQueue } from 'orqis';
import { describe, it, expect } from 'vitest';

describe('concurrency', () => {
  it('runs at most N tasks simultaneously', async () => {
    const N = 3;
    const queue = new TaskQueue({ concurrency: N });
    let active = 0;
    let maxActive = 0;

    const tasks = Array.from({ length: 10 }, () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise(r => setTimeout(r, 50));
      active--;
    });

    await queue.addAll(tasks);
    expect(maxActive).toBe(N);
  });
});
```

---

### FIFO Ordering

Verify tasks run in the order they were added (when no priority is set):

```ts
it('processes tasks in FIFO order', async () => {
  const queue = new TaskQueue({ concurrency: 1 });
  const order: number[] = [];

  await queue.addAll([
    async () => { order.push(1); },
    async () => { order.push(2); },
    async () => { order.push(3); },
  ]);

  expect(order).toEqual([1, 2, 3]);
});
```

---

### Priority Ordering

```ts
it('executes higher-priority tasks first', async () => {
  const queue = new TaskQueue({ concurrency: 1, priority: true });
  const order: string[] = [];

  // All added before any run (concurrency 1, autoStart can be set false for determinism)
  queue.add(async () => { order.push('low'); },    { priority: 1 });
  queue.add(async () => { order.push('high'); },   { priority: 10 });
  queue.add(async () => { order.push('medium'); }, { priority: 5 });

  await queue.onIdle();
  expect(order).toEqual(['high', 'medium', 'low']);
});
```

---

### Retry Behaviour

Use a task that fails a predictable number of times:

```ts
it('retries a failing task and eventually resolves', async () => {
  const queue = new TaskQueue({
    retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
  });

  let attempts = 0;

  const result = await queue.add(async () => {
    attempts++;
    if (attempts < 3) throw new Error('not yet');
    return 'success';
  });

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});

it('rejects after exhausting all retries', async () => {
  const queue = new TaskQueue({
    retry: { attempts: 2, backoff: { type: 'fixed', delay: 10 } },
  });

  await expect(
    queue.add(async () => { throw new Error('always fails'); })
  ).rejects.toThrow('always fails');
});
```

---

### Timeouts

```ts
import { TimeoutError } from 'orqis';

it('rejects with TimeoutError when task exceeds timeout', async () => {
  const queue = new TaskQueue({ timeout: 100 }); // 100ms

  await expect(
    queue.add(() => new Promise(() => { /* never resolves */ }))
  ).rejects.toBeInstanceOf(TimeoutError);
});
```

---

### Cancellation

```ts
import { AbortError } from 'orqis';

it('cancels pending tasks', async () => {
  const queue = new TaskQueue({ concurrency: 1 });

  const results: string[] = [];

  // First task blocks the slot
  queue.add(() => new Promise(r => setTimeout(r, 500)));

  // Second task is pending — will be cancelled
  const p = queue.add(async () => { results.push('ran'); return 'done'; });

  queue.cancel();

  await expect(p).rejects.toBeInstanceOf(AbortError);
  expect(results).toEqual([]);
});

it('passes AbortSignal to running tasks', async () => {
  const queue = new TaskQueue({ concurrency: 1 });
  let signalAborted = false;

  const p = queue.add(async ({ signal }) => {
    await new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        signalAborted = true;
        reject(new Error('aborted'));
      });
    });
  });

  queue.cancel();
  await expect(p).rejects.toThrow();
  expect(signalAborted).toBe(true);
});
```

---

### Event Emission

```ts
it('emits start, success, idle events in order', async () => {
  const queue = new TaskQueue({ concurrency: 1 });
  const events: string[] = [];

  queue.on('start',   () => events.push('start'));
  queue.on('success', () => events.push('success'));
  queue.on('idle',    () => events.push('idle'));

  await queue.add(async () => 'ok');
  await queue.onIdle();

  expect(events).toEqual(['start', 'success', 'idle']);
});
```

---

### Error Handling / `stopOnError`

```ts
it('continues after task error by default', async () => {
  const queue = new TaskQueue({ concurrency: 2 });
  const errors: Error[] = [];
  const successes: string[] = [];

  queue.on('error', ({ error }) => errors.push(error));

  queue.add(async () => { throw new Error('fail'); });
  queue.add(async () => { successes.push('ok'); });

  await queue.onIdle();

  expect(errors).toHaveLength(1);
  expect(successes).toEqual(['ok']);
});
```

---

## Tips for Deterministic Tests

### Control time with fake timers

When testing retry backoffs or timeouts, use fake timers to avoid slow tests:

```ts
import { vi } from 'vitest';

it('retries after the correct delay', async () => {
  vi.useFakeTimers();

  const queue = new TaskQueue({
    retry: { attempts: 2, backoff: { type: 'fixed', delay: 1000 } },
  });

  let calls = 0;
  const p = queue.add(async () => {
    calls++;
    if (calls < 2) throw new Error('fail');
    return 'done';
  });

  await vi.runAllTimersAsync();

  expect(await p).toBe('done');
  expect(calls).toBe(2);

  vi.useRealTimers();
});
```

### Use `autoStart: false` for setup-before-run patterns

```ts
const queue = new TaskQueue({ concurrency: 1, autoStart: false });

queue.add(() => firstTask());
queue.add(() => secondTask());
// Both are queued but not started

queue.resume(); // Now they run
await queue.onIdle();
```

---

## Running the Orqis Test Suite

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

Tests are in `test/` and use [Vitest](https://vitest.dev/). Coverage is tracked with `@vitest/coverage-v8`.
