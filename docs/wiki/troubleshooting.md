# Troubleshooting

Symptom-based debugging. Find the behaviour you're seeing and follow the diagnosis steps.

---

## Tests Never Resolve (hang at timeout)

**Symptom:** Test suite hangs for 10–15 seconds per test, then each test fails with `Test timed out in Nms`.

### Cause 1: `vi.useFakeTimers()` with the wrong pool

The most common cause. When you use `vi.useFakeTimers()`, Vitest patches the global `setTimeout`/`setInterval`. But if Orqis uses `Promise.resolve().then(...)` for scheduling (microtasks), fake timers don't advance those. The task scheduler enqueues work in a microtask — fake `advanceTimersByTime` never drains it, so `queue.add()` never resolves.

**Diagnosis:** Do your hanging tests call `vi.useFakeTimers()` or `vi.advanceTimersByTimeAsync()`?

**Fix:** Replace fake timers with real timers using small delays:

```ts
// Before — hangs:
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('retries', async () => {
  const queue = new TaskQueue({ retry: { attempts: 3, backoff: { type: 'fixed', delay: 1000 } } });
  await queue.add(() => { throw new Error('fail'); }).catch(() => {});
  await vi.runAllTimersAsync(); // ← never drains microtasks
});

// After — works:
it('retries', async () => {
  const queue = new TaskQueue({ retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } } });
  await queue.add(() => { throw new Error('fail'); }).catch(() => {});
  // real timers, small delay, no fake timer needed
});
```

**Why it works:** With real timers and a 10ms backoff, the test completes in ~30ms total (3 attempts × 10ms). Fast enough for any CI.

### Cause 2: Task never settles because signal is not observed

A task that does `await new Promise(() => {})` (never resolves) will hang `queue.onIdle()` forever if cancellation isn't propagated to it.

```ts
// Hangs:
queue.add(async () => {
  await new Promise(() => {}); // never resolves, ignores signal
});
queue.cancel();
await queue.onIdle(); // ← waits forever
```

```ts
// Works:
queue.add(async ({ signal }) => {
  await new Promise<void>((_, rej) => {
    signal.addEventListener('abort', () => rej(signal.reason), { once: true });
  });
});
queue.cancel();
await queue.onIdle(); // resolves once the task aborts
```

### Cause 3: `onIdle()` called before tasks are added

```ts
const queue = new TaskQueue({ concurrency: 2 });
await queue.onIdle(); // resolves immediately — nothing was added yet

queue.add(() => work()); // too late, onIdle() already resolved
```

Add tasks first, then call `onIdle()`:

```ts
const queue = new TaskQueue({ concurrency: 2 });
queue.add(() => work());
queue.add(() => moreWork());
await queue.onIdle(); // waits for both
```

---

## Cancellation Not Working

**Symptom:** `queue.cancel()` is called but tasks keep running, or `queue.onIdle()` never resolves after cancel.

### Cause 1: Tasks don't watch `ctx.signal`

`queue.cancel()` aborts the queue's internal `AbortController`. The signal fires on `ctx.signal` inside each running task. But if the task doesn't listen to that signal, it runs to completion anyway.

```ts
// cancel() fires, but task ignores it and finishes normally:
queue.add(async () => {
  await fetch('https://api.example.com/slow'); // no signal passed
  return 'done';
});
queue.cancel();
```

```ts
// cancel() fires, fetch aborts immediately:
queue.add(async ({ signal }) => {
  await fetch('https://api.example.com/slow', { signal }); // abort-aware
  return 'done';
});
queue.cancel();
```

**Rule:** Always pass `ctx.signal` to any I/O operation that supports it — `fetch`, `fs.promises`, database clients, child processes, etc.

### Cause 2: Group cancel doesn't propagate to the parent queue's controller

`group.cancel()` aborts only the group's own `AbortController`, not the parent queue. Pending tasks in other groups or ungrouped tasks are unaffected. This is by design — but if you want to cancel everything, call `queue.cancel()` instead.

### Cause 3: External signal fires after queue.cancel() replaces the controller

Orqis replaces `#controller` when `cancel()` is called (so new tasks after a cancel work cleanly). If you attached a listener to `queue.signal` before calling `cancel()`, that listener is on the old controller. The new signal is fresh and won't fire.

**Fix:** Listen to the queue's events instead:

```ts
// Don't rely on queue.signal after cancel() has been called.
// Instead, listen to events:
queue.on('cancel', ({ id }) => console.log(`${id} was cancelled`));
```

---

## Fake Timers Not Working

**Symptom:** `vi.advanceTimersByTimeAsync(1000)` doesn't advance the retry backoff. Tasks still take the real delay.

### Why

Orqis's scheduler uses `Promise.resolve().then(...)` for microtask-based dispatch and `setTimeout` inside `sleep()` for retry backoff. `vi.advanceTimersByTimeAsync` advances `setTimeout`, but the Promise microtasks that connect them need to drain in between. In `pool: 'forks'` mode (subprocess), fake timers work differently than in `pool: 'threads'` (shared memory).

### Fix A: Use real timers with small delays (recommended)

Use short real delays instead of fake timers. 10ms backoff is indistinguishable from 0ms in practice but works identically to production code:

```ts
const queue = new TaskQueue({
  retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
});
```

### Fix B: Switch to `pool: 'threads'` and use `vi.runAllTimersAsync()`

```ts
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'threads', // shared memory — fake timers work more reliably
  },
});
```

```ts
// In test:
vi.useFakeTimers();
const p = queue.add(() => { throw new Error('fail'); });
await vi.runAllTimersAsync(); // drain timers AND flush microtasks
await p.catch(() => {});
vi.useRealTimers();
```

Note: `threads` mode has its own tradeoffs (e.g. shared globals between tests if not careful).

---

## `idle` Event Fires Before `onIdle()` Resolves

**Symptom:** An `'idle'` listener fires, but code awaiting `queue.onIdle()` is still blocked.

### Why

If you registered the `onIdle()` promise *after* the queue became idle, the promise resolves immediately (by design). But the `'idle'` event fires when the queue *transitions* to idle. If tasks complete very quickly, the event fires before your listener is registered.

### Fix

Register listeners and call `onIdle()` before adding tasks:

```ts
const queue = new TaskQueue({ concurrency: 4 });

// Register BEFORE adding tasks
queue.on('idle', () => console.log('idle!'));
const done = queue.onIdle();

// Now add tasks
queue.add(() => work());
queue.add(() => moreWork());

await done;
```

---

## `addAll` Rejects on First Failure, Losing Other Results

**Symptom:** One task fails; you want the other results but `addAll` throws and you lose everything.

### Why

`addAll` is a thin wrapper around `Promise.all`, which rejects at the first failure.

### Fix

Collect errors manually using individual `add()` calls:

```ts
const queue = new TaskQueue({ concurrency: 4 });
const results: Array<{ value?: unknown; error?: Error }> = [];

await Promise.all(
  items.map(item =>
    queue.add(() => process(item))
      .then(value => { results.push({ value }); })
      .catch(error => { results.push({ error }); })
  )
);

const successes = results.filter(r => r.value !== undefined);
const failures  = results.filter(r => r.error !== undefined);
```

---

## Priority Queue Not Ordering Correctly

**Symptom:** Tasks don't run in priority order even though `priority: true` is set.

### Cause 1: Concurrency is too high

If `concurrency` is higher than the number of tasks, all tasks start immediately and priority has no effect — there's no queue to order.

```ts
// concurrency 10, 3 tasks: all 3 start at once, priority irrelevant
const queue = new TaskQueue({ concurrency: 10, priority: true });
```

Priority only matters when the concurrency slots are saturated and tasks must wait.

### Cause 2: Tasks are added after slots are available

If slots are free when tasks are added, they start immediately without being ordered. Add all tasks before the queue starts (use `autoStart: false`):

```ts
const queue = new TaskQueue({ concurrency: 1, priority: true, autoStart: false });

queue.add(() => lowPriority(),  { priority: 1 });
queue.add(() => highPriority(), { priority: 10 });
queue.add(() => background(),   { priority: 0 });

queue.resume(); // now they start in priority order
await queue.onIdle();
```

---

## Unhandled Rejection After `queue.cancel()`

**Symptom:** After `queue.cancel()`, tasks reject with `AbortError` but Vitest or Node logs `UnhandledPromiseRejection`.

### Why

If you called `queue.add(task)` without `.catch()` or `await`, the returned promise can reject after `cancel()` and nobody handles it.

### Fix

Add `.catch()` to tasks whose results you don't need, or use a global handler:

```ts
// Discard result + handle rejection:
queue.add(() => backgroundTask()).catch(() => {}); // intentionally silent

// Or handle at the queue level:
queue.on('cancel', ({ id }) => {
  // tasks were cancelled — expected
});
```

---

## ESLint Running Slowly or Crashing on TypeScript 5.x

**Symptom:** `npm run lint` takes very long or crashes with a TypeScript version warning.

### Why

`@typescript-eslint/eslint-plugin` with `plugin:@typescript-eslint/recommended-requiring-type-checking` requires `parserOptions.project` to be set, which causes ESLint to build the full TypeScript program. With TypeScript 5.6+, the supported version range may differ.

### Fix

Remove type-aware rules from `.eslintrc.cjs` and rely on `tsc` for type checking:

```js
module.exports = {
  // Remove:
  // extends: ['plugin:@typescript-eslint/recommended-requiring-type-checking'],
  // parserOptions: { project: './tsconfig.json' },

  // Keep only:
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // No 'project' key
  },
};
```

Then run `npm run typecheck` separately for type safety.
