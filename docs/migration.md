# Migration Guide

How to replace common async orchestration libraries with Orqis.

---

## Migrating from `p-limit`

`p-limit` wraps a function call. Orqis uses `queue.add()` instead.

**Before (p-limit):**
```js
import pLimit from 'p-limit';

const limit = pLimit(5);
const results = await Promise.all(
  urls.map(url => limit(() => fetch(url).then(r => r.json())))
);
```

**After (orqis):**
```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 5 });
const results = await queue.addAll(
  urls.map(url => () => fetch(url).then(r => r.json()))
);
```

**Key differences:**
- `addAll` preserves order (same as `Promise.all`).
- You gain access to retries, cancellation, and events for free.
- `queue.size` / `queue.pending` replace `limit.pendingCount` / `limit.activeCount`.
- `queue.clear()` replaces `limit.clearQueue()`.

---

## Migrating from `p-queue`

`p-queue` is the closest relative. Most concepts map directly.

| p-queue | orqis |
|---------|-------|
| `new PQueue({ concurrency })` | `new TaskQueue({ concurrency })` |
| `queue.add(fn)` | `queue.add(fn)` |
| `queue.add(fn, { priority })` | `queue.add(fn, { priority })` |
| `queue.onIdle()` | `queue.onIdle()` |
| `queue.onEmpty()` | `queue.onEmpty()` |
| `queue.pause()` | `queue.pause()` |
| `queue.resume()` | `queue.resume()` |
| `queue.clear()` | `queue.clear()` |
| `queue.size` | `queue.size` |
| `queue.pending` | `queue.pending` |
| `queue.isPaused` | `queue.isPaused` |
| `queue.on('active', ...)` | `queue.on('active', ...)` |
| `queue.on('idle', ...)` | `queue.on('idle', ...)` |
| `queue.on('error', ...)` | `queue.on('error', ...)` |

**New in Orqis (not in p-queue):**
- `queue.cancel()` — abort all tasks, not just clear pending
- `queue.addAll()` — batch add with ordered results
- Built-in `retry` and `backoff` — no need for `p-retry`
- `TaskGroup` — scoped cancellation without nested queue boilerplate
- `'start'`, `'success'`, `'retry'`, `'timeout'`, `'cancel'` events

**p-queue features not in Orqis v0.x:**
- `intervalCap` / `interval` (rate limiting by interval window) — planned for v1.x

---

## Migrating from `async.queue` (caolan/async)

`async` uses callback-style workers. Orqis is Promise/async-native.

**Before (async):**
```js
const async = require('async');

const q = async.queue(async (task, done) => {
  try {
    await doWork(task);
    done();
  } catch (err) {
    done(err);
  }
}, 3);

q.push({ url: 'https://...' }, err => {
  if (err) console.error(err);
});

q.drain(() => console.log('All done'));
```

**After (orqis):**
```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 3 });

queue.add(() => doWork({ url: 'https://...' }));
queue.on('error', ({ error }) => console.error(error));
queue.on('idle', () => console.log('All done'));
```

**Key differences:**
- No callbacks. Every task is a Promise-returning function.
- `q.drain` → `queue.on('idle', ...)` or `await queue.onIdle()`.
- `q.push(task, callback)` → `queue.add(() => doWork(task))` (returned Promise = the callback).
- No need to call `done()` — just return or throw from the async function.

---

## Migrating from `fastq`

fastq is callback-first. Orqis replaces it with a Promise-native API.

**Before (fastq):**
```js
const fastq = require('fastq');

const worker = async (task, cb) => {
  try {
    const result = await doWork(task);
    cb(null, result);
  } catch (err) {
    cb(err);
  }
};

const q = fastq(worker, 2);
q.push({ id: 1 }, (err, result) => { /* ... */ });
```

**After (orqis):**
```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 2 });

const result = await queue.add(() => doWork({ id: 1 }));
```

---

## Migrating from `@supercharge/promise-pool`

`PromisePool` processes a fixed array. Orqis can do the same and more.

**Before:**
```js
const { PromisePool } = require('@supercharge/promise-pool');

const { results, errors } = await PromisePool
  .for([1, 2, 3, 4])
  .withConcurrency(2)
  .process(async num => work(num));
```

**After (orqis):**
```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 2 });
const errors: Error[] = [];

queue.on('error', ({ error }) => errors.push(error));

const results = await queue.addAll(
  [1, 2, 3, 4].map(num => () => work(num))
);

// results = ordered array of resolved values
// errors  = array of any failures
```

> **Note:** Unlike `PromisePool`, `queue.addAll()` rejects on first failure by default. If you want to collect all results and all errors regardless, add the tasks individually with `.add()` and use `'error'` event listeners, then `await queue.onIdle()`.
