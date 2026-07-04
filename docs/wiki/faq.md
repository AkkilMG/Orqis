# FAQ

Frequently asked questions about Orqis.

---

## General

### What is Orqis for?

Orqis is for running async tasks in Node.js with control over how many run at once, what happens when they fail, and how to cancel them. Its sweet spot is build scripts, CLI tools, data pipelines, and test runners — anything that runs a batch of async work in a single process without needing a database or worker cluster.

### Why not just use `Promise.all`?

`Promise.all` starts all promises at once. If you have 10,000 items to process, that's 10,000 simultaneous operations — which will saturate your CPU, exhaust file handles, and get you rate-limited by external APIs. Orqis caps concurrency, so you process, say, 8 at a time, and the rest wait their turn.

### Why not just use `p-limit`?

`p-limit` is a great single-purpose tool for concurrency capping. Choose `p-limit` if that's all you need. Choose Orqis when you also need any of: retry on failure, per-task timeouts, cancellation via AbortSignal, scoped task groups, or lifecycle events.

### Does Orqis work in the browser?

Not officially — v0.x uses `node:events` and `node:crypto` which are Node.js built-ins. A browser-compatible build is planned for v2.0. You can use it in Node.js environments that run in browsers (like some bundler build steps), but direct browser use isn't supported yet.

### Does Orqis work in Deno or Bun?

Bun supports Node.js built-ins, so Orqis should work. Deno support depends on its Node compatibility layer. Neither is officially tested yet — v2.0 will add first-class support.

---

## Configuration

### What happens if I set `concurrency` to 1?

All tasks run serially — one at a time, in the order they were added. This is equivalent to a sequential `for...of` loop with `await`, but with all the retry, timeout, and event features of Orqis.

### What's the difference between `clear()` and `cancel()`?

`clear()` removes pending (not-yet-started) tasks from the queue and rejects their promises with `AbortError`. Running tasks are **not** affected — they continue to completion.

`cancel()` does everything `clear()` does, plus aborts the `ctx.signal` of all running tasks, signalling them to stop cooperatively.

After `cancel()`, you can call `resume()` and `add()` new tasks — the queue resets its controller.

### Can I reuse a queue after cancelling it?

Yes. `cancel()` replaces the internal `AbortController` with a new one. New tasks added after `cancel()` will work normally.

```ts
queue.cancel(); // abort everything
queue.add(() => freshTask()); // works fine
```

### How does `stopOnError` work exactly?

When `stopOnError: true`, the first task failure (after retries are exhausted) calls `queue.pause()` internally. No more tasks are dequeued. Tasks already running continue. The promise returned by `onIdle()` rejects with that error.

You can recover by calling `queue.resume()` after handling the error.

### What's the difference between `onIdle()` and `onEmpty()`?

`onEmpty()` resolves when the pending queue reaches 0 — there are no more tasks *waiting*. But tasks may still be *running*.

`onIdle()` resolves when pending = 0 AND active = 0 — all tasks have completely finished.

```ts
queue.add(() => sleep(1000));
queue.add(() => sleep(2000));

await queue.onEmpty(); // resolves ~0ms later (both tasks dequeued)
// but 2 tasks are still running

await queue.onIdle(); // resolves after ~2000ms (all done)
```

### Can I change `concurrency` after the queue has started?

Not directly — it's read-only after construction. As a workaround, you can `pause()` the queue, drain it with `onIdle()`, construct a new queue with the desired concurrency, and resume work.

---

## Retry & Timeout

### What counts as one "attempt"?

`attempts: 1` means one try with no retry. `attempts: 3` means the first attempt plus 2 retries — 3 total executions of the task function.

### Does retry wait use a separate concurrency slot?

No. When a task is being retried, it frees its concurrency slot during the backoff delay (so other tasks can run), then re-acquires a slot for the next attempt. This is why the queue stays active during a long retry backoff — other tasks fill the slots.

### Can I inspect which attempt a retry is on?

Yes, via the `'retry'` event:

```ts
queue.on('retry', ({ id, attempt, delay }) => {
  // attempt = the attempt that just failed (1 = first try failed)
  // delay   = ms before the next attempt
  console.log(`Task ${id}: attempt ${attempt} failed, retrying in ${delay}ms`);
});
```

### Does `timeout` include retry wait time?

No. The timeout is per-attempt. If a task is retried 3 times with a 5s timeout, each of the 3 attempts has its own independent 5-second timer. The retry backoff delay between attempts is not counted.

### Can I disable timeout for one specific task on a queue that has a default?

Yes, set `timeout: 0` in `TaskAddOptions`:

```ts
const queue = new TaskQueue({ timeout: 5000 }); // 5s default

queue.add(() => fastTask()); // has 5s timeout
queue.add(() => slowButExpected(), { timeout: 0 }); // no timeout
```

---

## Cancellation

### Does cancelling a group affect other groups?

No. `group.cancel()` only aborts tasks that were added through that group. Tasks added to other groups, or tasks added directly to the parent queue, are unaffected.

### What if the queue is cancelled while a task is in backoff (retry delay)?

The `sleep()` inside the retry backoff loop watches `descriptor.controller.signal`. If the queue is cancelled during the backoff, the sleep rejects, the retry is abandoned, and the task's promise rejects with `AbortError`.

### Does `AbortError` count as a task failure (does it fire the `'error'` event)?

No. `AbortError` fires the `'cancel'` event, not `'error'`. Cancellation is intentional — not a failure. If you want to know when tasks were cancelled, listen to `'cancel'`.

### Can I cancel a single task without cancelling the whole queue?

Pass a per-task `AbortSignal`:

```ts
const controller = new AbortController();

const p = queue.add(() => longTask(), { signal: controller.signal });

// Cancel only this task:
controller.abort();

// p rejects with AbortError; other tasks in the queue continue normally
```

---

## stopOnError behaviour

### When `stopOnError: true`, what exactly stops?

Dequeuing stops — no new tasks are started. Running tasks continue to completion. The queue is effectively paused. `onIdle()` rejects with the error that triggered the stop.

### Can I resume after `stopOnError` pauses the queue?

Yes:

```ts
const queue = new TaskQueue({ concurrency: 2, stopOnError: true });
queue.on('error', ({ error }) => {
  console.error('Pipeline failed:', error.message);
  // Optionally resume and continue, or cancel:
  queue.cancel(); // or queue.resume()
});
```

---

## Events

### Is it safe to add tasks from inside an event listener?

Yes, with care. Adding tasks from inside `'success'` or `'error'` handlers is supported — it's how you'd implement re-queuing logic. The re-entrant `add()` is handled safely because scheduling runs in a microtask, not synchronously inside the emit.

### Does Orqis buffer events?

No. Events are synchronous `EventEmitter` calls. If no listener is registered when an event fires, it's lost. Register your listeners before calling `add()`.

---

## TypeScript

### Why do my event listener types say `unknown` instead of the payload type?

You need to use the typed `on()` overload. Make sure you're importing from `orqis` (not from `orqis/dist` or a relative path):

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 2 });

// ✅ Typed — error has .id, .error, .attempt
queue.on('error', ({ id, error, attempt }) => { ... });

// ❌ Falls back to EventEmitter's untyped overload
(queue as EventEmitter).on('error', (payload) => { ... });
```

### Can I use Orqis with JavaScript (no TypeScript)?

Yes — the CJS build is plain JavaScript with no TypeScript required. JSDoc types are available in the declaration files for editor autocompletion, but you don't need to compile TypeScript to use Orqis.
