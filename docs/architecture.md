# Architecture

This document explains how Orqis works internally — its data structures, scheduling model, cancellation semantics, and event system.

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                      TaskQueue                       │
│                                                      │
│  ┌─────────────────────┐   ┌──────────────────────┐ │
│  │   Pending Queue     │   │   Active Slots        │ │
│  │  (FIFO or MaxHeap)  │──▶│  [Task] [Task] [Task] │ │
│  └─────────────────────┘   └──────────────────────┘ │
│           ▲                         │               │
│           │ retry (after delay)     │ settle        │
│           │                         ▼               │
│       ┌───────────────────────────────────────┐     │
│       │         Event Emitter                  │     │
│       │  start / success / error / retry /     │     │
│       │  timeout / cancel / idle / empty       │     │
│       └───────────────────────────────────────┘     │
│                                                      │
│  AbortController ──► AbortSignal (passed to tasks)  │
└──────────────────────────────────────────────────────┘
```

---

## Data Structures

### Pending Queue

When `priority: false` (the default), the pending queue is a **circular buffer** — a fixed-capacity array with head and tail indices. Enqueue is O(1) amortized; dequeue is O(1). The buffer grows automatically when full (doubles capacity).

When `priority: true`, the pending queue is a **binary max-heap** keyed on `TaskAddOptions.priority`. Enqueue is O(log n); dequeue (pop max) is O(log n). The heap is implemented inline with no external dependency.

### Active Slots

Active slots are tracked as a simple **counter** (`activeCount`). There is no explicit data structure holding running tasks — each task is a self-contained Promise chain. When a task settles, the counter decrements and the scheduler is invoked.

---

## Scheduling Loop

The scheduler is the single function responsible for moving tasks from pending to active. It runs:

1. After every call to `add()`.
2. After every task settles (success, failure, or cancel).
3. After `resume()`.

```
schedule():
  while activeCount < concurrency && pendingQueue.size > 0:
    task = pendingQueue.dequeue()
    activeCount++
    runTask(task)       ← async, does not block
```

`runTask` is called without `await` — the scheduler returns immediately and the tasks run concurrently on the event loop. To avoid deep call stacks when many tasks finish simultaneously, the scheduler defers via `setImmediate` (or `queueMicrotask` for sub-microtask precision).

---

## Task Execution Pipeline

For each task, Orqis runs this pipeline:

```
1. Emit 'start' event
2. Merge signals (queue signal ∪ task signal ∪ timeout signal)
3. Call task(ctx) → Promise<T>
4. Race against timeout timer (if configured)
5a. If resolves → emit 'success', decrement activeCount, schedule()
5b. If rejects:
    - If retries remain → emit 'retry', wait backoff delay, re-enqueue
    - Else → emit 'error', decrement activeCount, schedule()
5c. If signal fires → emit 'cancel', reject with AbortError
```

Signal merging uses a lightweight helper that listens to multiple `AbortSignal`s and triggers a combined `AbortController` when any fires — similar to `AbortSignal.any()` (available in Node 20+; polyfilled for Node 16–18).

---

## Cancellation Model

Orqis uses a **hierarchical cancellation** model:

```
External AbortSignal (optional)
        │
        ▼
  Queue AbortController
        │  (queue.cancel() aborts this)
        │
        ├──▶ Task 1 ctx.signal
        ├──▶ Task 2 ctx.signal
        └──▶ TaskGroup AbortController
                   │
                   ├──▶ Group Task 1 ctx.signal
                   └──▶ Group Task 2 ctx.signal
```

When `queue.cancel()` is called:
- The queue's internal `AbortController` fires.
- All running tasks' `ctx.signal` fires (they should abort cooperative work like `fetch`).
- All pending tasks are dequeued and their promises rejected with `AbortError`.

When `group.cancel()` is called, only the group's controller fires — the parent queue and other groups are unaffected.

---

## Retry and Backoff

Retry state is stored per-task in a small descriptor object alongside the task function:

```ts
interface TaskDescriptor {
  fn: Task<unknown>;
  options: ResolvedTaskOptions;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  attempt: number;       // current attempt (1-based)
  controller: AbortController;
}
```

After a failure, if `attempt < options.retry.attempts`, the descriptor is held out of the queue, a `setTimeout` fires after the computed backoff delay, and then the descriptor is re-enqueued with `attempt++`. The original `Promise` (returned by `queue.add()`) does **not** reject until the final attempt fails.

---

## Memory Model

Orqis is designed for minimal memory overhead:

- Each queued task holds one small descriptor object (~5 fields).
- References to task functions and their closures are released as soon as the task settles.
- Event listeners on the queue itself are lightweight (Node.js `EventEmitter`).
- No persistent state beyond the current queue snapshot.

If the queue is cancelled and cleared, all descriptors are released and their `Promise` references drop, enabling GC.

---

## Concurrency and the Event Loop

Orqis is **single-threaded** and fully cooperative. It does not use `worker_threads` or `child_process`. This makes it ideal for I/O-bound tasks (file reads, network requests) where parallelism comes from the event loop's non-blocking I/O.

For CPU-bound work, use `worker_threads` inside your task functions (or a dedicated library like Bree). Orqis can orchestrate the dispatch of work to workers, but does not manage workers itself.

---

## Event System

Orqis extends Node.js's built-in `EventEmitter`. There is no external event library dependency. The emitter is synchronous — listeners fire in the order they were registered, within the same microtask as the state change.

---

## Bundle and Packaging

Orqis is built with [`tsup`](https://tsup.egoist.dev/) and ships:

- `dist/index.js` — ESM entry
- `dist/index.cjs` — CommonJS entry
- `dist/index.d.ts` — TypeScript declaration file
- `dist/group.js` / `dist/group.cjs` / `dist/group.d.ts` — TaskGroup subpackage

The `exports` field in `package.json` uses Node.js **conditional exports** so that:
- `import { TaskQueue } from 'orqis'` → resolves `dist/index.js` (ESM)
- `require('orqis')` → resolves `dist/index.cjs` (CJS)
