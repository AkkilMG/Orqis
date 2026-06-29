# Library Comparison

This document is the research foundation behind Orqis — a survey of the Node.js async task orchestration landscape, the comparison table from the original design research, and an analysis of the gaps that motivated Orqis's creation.

---

## Surveyed Libraries

### p-limit

A minimal concurrency limiter. Wraps promise-returning functions to run at most N in parallel.

```js
import pLimit from 'p-limit';
const limit = pLimit(5);
const results = await Promise.all(
  urls.map(url => limit(() => fetch(url).then(r => r.json())))
);
```

**Stats:** ~241M weekly downloads · MIT · zero dependencies · ~1 KB minified

**Pros:** Extremely lightweight, trivial API, zero deps.
**Cons:** No priority, no retries, no timeouts, no cancellation, no events.
**Best for:** Simple batch operations — "fetch these URLs 5 at a time."

---

### p-queue

A richer priority queue with concurrency control, timeouts, and throttling.

```js
import PQueue from 'p-queue';
const queue = new PQueue({ concurrency: 3, timeout: 5000 });
queue.add(() => doTaskA());
queue.add(() => doTaskB(), { priority: 5 });
await queue.onIdle();
```

**Stats:** ~26M weekly downloads · MIT · 1 dependency (eventemitter3) · ~393 KB publish

**Pros:** Feature-rich — priorities, throttling, timeouts, events.
**Cons:** ESM-only (no CJS), moderate bundle size, no built-in retry, no structured concurrency.
**Best for:** In-process task queues that need ordering and priorities.

---

### Bottleneck

A rate limiter with concurrency control and token-bucket semantics.

```js
import Bottleneck from 'bottleneck';
const limiter = new Bottleneck({ maxConcurrent: 2, minTime: 100 });
limiter.schedule(() => fetchFromAPI());
```

**Stats:** ~9.3M weekly downloads · MIT · zero dependencies · ~615 KB install · last release 2019

**Pros:** Powerful rate limiting (minTime, reservoir), optional Redis clustering.
**Cons:** Inactive development, steep learning curve, no native retry, large install.
**Best for:** API rate limiting where request rate control matters more than task order.

---

### async (caolan/async)

A classic utility library for async control flow — `parallel`, `series`, `waterfall`, `queue`.

```js
import async from 'async';
const queue = async.queue(async (task, done) => {
  await doWork(task);
  done();
}, 3);
queue.push({ url: 'a' });
```

**Stats:** ~95M weekly downloads · MIT · zero dependencies · ~203 KB minified

**Pros:** Mature, broad utility functions, both callback and Promise APIs.
**Cons:** Callback-first, no built-in priority or timeouts, larger codebase.
**Best for:** Legacy codebases or complex control flows mixing parallel/series.

---

### RxJS

A reactive programming library. Not a task queue, but widely used for async orchestration via observables.

```js
import { from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

from(taskArray).pipe(
  mergeMap(task => doTask(task), /* concurrent= */ 2)
).subscribe(result => {});
```

**Stats:** ~78M weekly downloads · Apache-2.0 · zero dependencies · ~487 KB minified

**Pros:** Extremely powerful for event-driven flows; rich operator set; cancellation via unsubscribe.
**Cons:** Very large, steep learning curve, not a queue API.
**Best for:** Reactive streams and complex async pipelines, especially in apps already using observables.

---

### fastq

A minimal FIFO work queue — the engine used internally by Node.js HTTP.

```js
import fastq from 'fastq';
const worker = async (task, cb) => { await doWork(task); cb(null); };
const q = fastq(worker, 2);
q.push({ id: 1 }, () => {});
```

**Stats:** Small install · MIT · zero dependencies · < 10 KB minified

**Pros:** Extremely lightweight, battle-tested, used inside Node.js itself.
**Cons:** FIFO only (no priority), callback API, no events or observability.
**Best for:** Minimal in-memory job queue inside Node.js library internals.

---

### @henrygd/queue

A tiny, modern promise-based queue — the closest predecessor to Orqis.

```js
import { newQueue } from '@henrygd/queue';
const queue = newQueue(2);
queue.add(() => fetchData('url1'));
const results = await queue.all([() => fetchA(), () => fetchB()]);
```

**Stats:** Small · MIT · zero dependencies · ~2.5 KB minified

**Pros:** Minimal, fast, modern promise API, cross-platform.
**Cons:** No priority, no retry/backoff, no cancellation, no events, small ecosystem.
**Best for:** Small-scale async tasks where minimal footprint matters.

---

### @supercharge/promise-pool

A batch-processing helper with a fluent API for fixed arrays of items.

```js
import { PromisePool } from '@supercharge/promise-pool';
const { results, errors } = await PromisePool
  .for([1, 2, 3, 4])
  .withConcurrency(2)
  .process(async num => work(num));
```

**Stats:** Active · MIT · zero dependencies · ~6 KB minified

**Pros:** Clean fluent API, collects all results and errors.
**Cons:** One-shot pool (not a live queue), no priority, no cancellation.
**Best for:** Batch-processing fixed lists with per-item error isolation.

---

### Bull

A Redis-backed job queue for distributed, persistent work.

```js
import Queue from 'bull';
const q = new Queue('my-queue');
q.add({ foo: 'bar' }, { delay: 5000, attempts: 3, priority: 1 });
q.process(async job => { console.log(job.data.foo); });
```

**Stats:** ~0.5M weekly downloads · MIT · ~8+ dependencies · 229 KB publish · 12.8 MB install

**Pros:** Persistent (Redis), clustering, priorities, retries, cron, Bull Board monitoring.
**Cons:** Requires Redis, large install, not for in-process/CLI use.
**Best for:** Production job processing across distributed workers (email queues, background jobs).

---

### Agenda

A MongoDB-backed cron-style job scheduler.

```js
import { Agenda } from 'agenda';
const agenda = new Agenda({ db: { address: mongoUri } });
agenda.define('say hello', async job => { console.log(job.attrs.data.name); });
await agenda.start();
await agenda.every('1 minute', 'say hello', { name: 'Alice' });
```

**Stats:** ~96k weekly downloads · MIT · 25 MB install

**Pros:** Recurring cron scheduling, persistence, distributed locking.
**Cons:** Requires MongoDB, very large install, complex for simple use cases.
**Best for:** Server-side recurring jobs with persistence.

---

### Bree

A modern job scheduler using `worker_threads` for CPU parallelism.

```js
import Bree from 'bree';
const bree = new Bree({
  jobs: [
    { name: 'build', interval: '5 minutes' },
    { name: 'cleanup', timeout: 'at 00:00' },
  ],
});
bree.start();
```

**Stats:** ~21k weekly downloads · MIT · ~10 first-level deps · 4.9 MB install

**Pros:** Worker-thread-native, human-friendly scheduling, TypeScript-friendly.
**Cons:** No persistence, newer ecosystem, not for simple ad-hoc queues.
**Best for:** In-memory scheduling of CPU-bound tasks within a single process.

---

## Comparison Table

| Package | Bundle size | Dependencies | Last release | Weekly DL | Key features |
|---------|-------------|-------------|--------------|-----------|-------------|
| **p-limit** | ~1 KB | 0 | Feb 2026 | ~241M | Simple concurrency cap |
| **p-queue** | ~393 KB publish | 1 | May 2026 | ~26M | Priority, timeout, throttle, events |
| **Bottleneck** | ~615 KB install | 0 | 2019 | ~9.3M | Rate limiting, minTime, Redis cluster |
| **async** | ~203 KB | 0 | Aug 2024 | ~95M | parallel/series/waterfall/queue |
| **rxjs** | ~487 KB | 0 | Jun 2025 | ~78M | Observables, operators, cancel |
| **fastq** | < 10 KB | 0 | Jul 2023 | Internal | Minimal FIFO, callback API |
| **@henrygd/queue** | ~2.5 KB | 0 | Mar 2026 | Small | Tiny promise queue |
| **@supercharge/promise-pool** | ~6 KB | 0 | Recent | Medium | Batch pool, collects errors |
| **Bull** | ~229 KB | ~8 | Dec 2020 | ~0.53M | Redis persistent queue, cron |
| **Agenda** | ~393 KB | Several | Jul 2025 | ~96k | Mongo persistent, cron scheduling |
| **Bree** | ~88 KB | ~10 | Feb 2026 | ~21k | Worker threads, cron, in-memory |
| **orqis** | < 5 KB | 0 | Current | — | All of the above, for CLI/build |

---

## Gaps That Orqis Fills

The survey revealed that **no single package covers all needs** for modern CLI/build-tool workflows:

| Gap | Libraries with this gap | Orqis solution |
|-----|------------------------|----------------|
| **Structured concurrency** (scoped cancellation) | All of the above | `TaskGroup` with `cancel()` propagation |
| **AbortSignal-native cancellation** | p-limit, async, fastq, Bottleneck | `ctx.signal` on every task, `queue.cancel()` |
| **Built-in retry + backoff** | p-limit, p-queue, fastq, @henrygd/queue | `RetryOptions` with exponential/fixed + jitter |
| **Per-task timeouts** | p-limit, async, fastq, Bottleneck | `timeout` option, `TimeoutError` |
| **Plugin / middleware hooks** | All of the above | `OrqisPlugin` with `onBefore/onAfter/onError/onCancel` |
| **Zero dependencies** | Bull, Agenda, Bree, p-queue | Zero production deps |
| **Dual ESM + CJS** | p-queue (ESM only) | Dual package via tsup |
| **TypeScript-first** | async, fastq, Bottleneck | Written in strict TypeScript, full generics |
| **Tiny bundle (< 5 KB)** | p-queue (393 KB publish) | < 5 KB minzipped |

Orqis is positioned between the **simple limiters** (p-limit, @henrygd/queue) and the **heavyweight queues** (Bull, Agenda). It is the right tool when you need reliability features (retry, timeout, cancel) without external infrastructure (Redis, MongoDB).
