# Patterns & Pitfalls

Best practices and anti-patterns. Each pitfall includes the wrong version, why it fails, and the correct pattern.

---

## Always Listen to the `'error'` Event

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 4 });
queue.add(() => mightFail()); // if this throws → ERR_UNHANDLED_ERROR crash
await queue.onIdle();
```

**Why it fails:** Node.js's `EventEmitter` throws a fatal error when `'error'` is emitted with no listener. Any task rejection emits `'error'`.

**Correct:**
```ts
const queue = new TaskQueue({ concurrency: 4 });
queue.on('error', ({ id, error }) => {
  console.error(`Task ${id} failed:`, error.message);
});
queue.add(() => mightFail());
await queue.onIdle();
```

---

## Pass `ctx.signal` to Abort-Aware APIs

**Pitfall:**
```ts
queue.add(async () => {
  const res = await fetch(url); // ignores signal
  return res.json();
});
queue.cancel(); // fires, but fetch keeps going
```

**Why it fails:** `queue.cancel()` aborts the queue's signal. But `fetch` has no way to know — it runs to completion, then Orqis discards the result. Your process doesn't clean up; open connections linger.

**Correct:**
```ts
queue.add(async ({ signal }) => {
  const res = await fetch(url, { signal }); // aborts cleanly
  return res.json();
});
queue.cancel(); // fetch aborts immediately, connection closes
```

This applies to anything that accepts a signal: `fs.promises`, `child_process` streams, database clients, gRPC calls, etc.

---

## Register Listeners Before Adding Tasks

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 2 });
queue.add(() => fastTask()); // completes instantly
queue.on('idle', () => console.log('done')); // too late
```

**Why it fails:** If tasks complete before listeners are registered, events are lost. There's no buffering.

**Correct:**
```ts
const queue = new TaskQueue({ concurrency: 2 });
queue.on('idle', () => console.log('done')); // register first
queue.add(() => fastTask());
```

---

## Stale Signal After `cancel()`

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 2 });
const sig = queue.signal; // capture the signal reference

queue.cancel(); // replaces the internal AbortController
queue.add(() => newWork());

sig.addEventListener('abort', () => {
  console.log('aborted'); // NEVER fires for the new work
});
```

**Why it fails:** `cancel()` replaces `#controller` with a new one. The `sig` variable now points to the old, already-aborted controller. New tasks use the new controller's signal.

**Correct — always read `queue.signal` lazily:**
```ts
queue.add(async ({ signal }) => {
  // signal is always the current controller's signal at task start time
  signal.addEventListener('abort', () => console.log('aborted'));
});
```

**Or listen to events instead:**
```ts
queue.on('cancel', ({ id }) => console.log(`${id} was cancelled`));
```

---

## Don't Await Individual Tasks AND `onIdle()`

**Pitfall:**
```ts
await queue.add(() => taskA()); // waits for A to finish
await queue.add(() => taskB()); // then starts B, waits for it
await queue.onIdle(); // redundant — nothing is running by now
```

**Why it fails:** Awaiting individual `add()` calls makes them serial, defeating the purpose of a concurrency queue.

**Correct — fire without awaiting, then wait for all:**
```ts
queue.add(() => taskA()); // don't await
queue.add(() => taskB()); // don't await
await queue.onIdle();     // wait for both to finish together
```

**Or use `addAll` for ordered results:**
```ts
const [resultA, resultB] = await queue.addAll([
  () => taskA(),
  () => taskB(),
]);
```

---

## Don't Use `autoStart: false` Without Calling `resume()`

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 4, autoStart: false });
queue.add(() => work());
await queue.onIdle(); // hangs forever — nothing starts
```

**Why it fails:** `autoStart: false` means tasks are queued but never started until `resume()` is called.

**Correct:**
```ts
const queue = new TaskQueue({ concurrency: 4, autoStart: false });
queue.add(() => work1());
queue.add(() => work2());
queue.add(() => work3());
// Load all tasks first...
queue.resume(); // ...then start them all
await queue.onIdle();
```

This pattern is useful when you want to pre-populate the queue with all tasks in priority order before any of them start running.

---

## Catch Errors on Promises You Don't Await

**Pitfall:**
```ts
queue.add(() => mightFail()); // fire-and-forget
// If mightFail() throws, the returned promise is unhandled
// (even though you also have a queue.on('error') listener)
```

**Why it fails:** The `'error'` event fires, which prevents the `ERR_UNHANDLED_ERROR` crash. But the `Promise` returned by `queue.add()` is still an unhandled rejection in some environments.

**Correct:**
```ts
// Option A: catch on the promise
queue.add(() => mightFail()).catch(() => {});

// Option B: only add tasks via addAll() so the aggregate promise handles errors
const results = await queue.addAll(tasks);
```

---

## Don't Modify the Same Queue Concurrently From Multiple Async Contexts

**Pitfall:**
```ts
async function processBatch(items) {
  for (const item of items) {
    queue.add(() => process(item));
  }
  await queue.onIdle(); // waits for THIS batch AND any other concurrent callers
}

// Two concurrent calls to processBatch share the same queue:
await Promise.all([processBatch(batch1), processBatch(batch2)]);
// onIdle() in the first call might resolve early because the second batch
// hasn't been added yet; onIdle() in the second might resolve after
// the first batch's tasks complete.
```

**Why it fails:** `onIdle()` is global — it waits for the entire queue to be idle, not just the tasks you added.

**Correct — use a `TaskGroup` for each batch:**
```ts
async function processBatch(queue, items) {
  const group = new TaskGroup(queue, { id: `batch-${Date.now()}` });
  for (const item of items) {
    group.add(() => process(item));
  }
  await group.onComplete(); // waits for ONLY this batch
}
```

---

## Priority Only Works When Slots Are Saturated

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 100, priority: true });

queue.add(() => lowWork(),  { priority: 1 });
queue.add(() => highWork(), { priority: 10 });
// Both start immediately — priority is irrelevant
```

**Why it fails:** With 100 concurrency slots and 2 tasks, both start the moment they're added. The priority heap is only consulted when tasks are waiting for a free slot.

**Correct — set concurrency low enough that tasks must wait:**
```ts
const queue = new TaskQueue({ concurrency: 2, priority: true, autoStart: false });

// Add all tasks to the heap first
for (let i = 0; i < 20; i++) {
  queue.add(() => work(i), { priority: i }); // i=19 runs first
}

queue.resume(); // now priority order is respected
```

---

## Avoid Infinite Retry Loops

**Pitfall:**
```ts
const queue = new TaskQueue({
  retry: { attempts: Infinity }, // never gives up
});

queue.add(async () => {
  const res = await fetch('/broken-endpoint');
  if (!res.ok) throw new Error('server error');
  return res.json();
});
```

**Why it fails:** If the server is permanently down, this task retries forever, holding a concurrency slot and preventing other tasks from completing.

**Correct — cap attempts and combine with circuit-breaker logic:**
```ts
const queue = new TaskQueue({
  retry: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 200, maxDelay: 10_000 },
  },
});

let consecutiveFailures = 0;
queue.on('error', () => {
  consecutiveFailures++;
  if (consecutiveFailures > 10) {
    queue.cancel(); // circuit breaker
  }
});
queue.on('success', () => { consecutiveFailures = 0; });
```

---

## Always Clean Up on Process Exit

**Pitfall:**
```ts
const queue = new TaskQueue({ concurrency: 8 });
// ... add many tasks ...
// process exits; running tasks are interrupted without cleanup
```

**Correct:**
```ts
const queue = new TaskQueue({ concurrency: 8 });

process.on('SIGINT', async () => {
  console.log('\nGraceful shutdown...');
  queue.pause(); // don't start new tasks
  await queue.onIdle(); // let current tasks finish
  process.exit(0);
});

process.on('SIGTERM', () => {
  queue.cancel(); // immediate abort
  process.exit(1);
});
```

When tasks use `ctx.signal`, `queue.cancel()` on SIGTERM causes them to abort their I/O and clean up in milliseconds rather than leaving open connections.
