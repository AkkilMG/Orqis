# API Reference

This page is the complete technical reference for Orqis. For usage patterns and examples, see the [README](../README.md) and the recipe pages in this docs folder.

---

## Table of Contents

- [`TaskQueue`](#taskqueue)
  - [Constructor](#constructor)
  - [QueueOptions](#queueoptions)
  - [Methods](#methods)
  - [Properties](#properties)
- [`TaskGroup`](#taskgroup)
  - [Constructor](#taskgroup-constructor)
  - [GroupOptions](#groupoptions)
  - [Methods](#taskgroup-methods)
- [Types](#types)
  - [`Task<T>`](#taskt)
  - [`TaskContext`](#taskcontext)
  - [`TaskAddOptions`](#taskaddoptions)
  - [`RetryOptions`](#retryoptions)
  - [`BackoffOptions`](#backofoptions)
  - [`QueueEvent`](#queueevent)
- [Errors](#errors)
  - [`TimeoutError`](#timeouterror)
  - [`AbortError`](#aborterror)

---

## `TaskQueue`

The core class. Manages a pool of async tasks under a concurrency limit.

```ts
import { TaskQueue } from 'orqis';
```

### Constructor

```ts
new TaskQueue(options?: QueueOptions)
```

Creates a new queue. If `autoStart` is `true` (default), tasks added via `add()` will begin executing immediately when a concurrency slot is available.

---

### `QueueOptions`

```ts
interface QueueOptions {
  concurrency?: number;
  autoStart?: boolean;
  timeout?: number;
  retry?: RetryOptions;
  priority?: boolean;
  abortSignal?: AbortSignal;
  stopOnError?: boolean;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `concurrency` | `number` | `Infinity` | Maximum number of tasks that may run simultaneously. Set to `1` for serial execution. |
| `autoStart` | `boolean` | `true` | When `true`, tasks are dispatched as soon as a slot is free. When `false`, you must call `resume()` to start processing. |
| `timeout` | `number` | `undefined` | Default timeout in milliseconds applied to every task. Tasks that exceed this duration are aborted and their promise rejects with `TimeoutError`. Overridable per task via `TaskAddOptions.timeout`. |
| `retry` | `RetryOptions` | `undefined` | Default retry policy. Applied to all tasks unless overridden in `TaskAddOptions.retry`. |
| `priority` | `boolean` | `false` | When `true`, the pending queue is a binary max-heap ordered by `TaskAddOptions.priority`. Tasks with higher numeric priority run first. |
| `abortSignal` | `AbortSignal` | `undefined` | An external `AbortSignal`. When this signal fires, the queue behaves as if `cancel()` was called: all pending tasks are discarded, all running tasks receive an abort signal. |
| `stopOnError` | `boolean` | `false` | When `true`, the queue pauses and rejects `onIdle()` on the first unretried task failure. When `false` (default), the queue continues processing and collects errors via `'error'` events. |

---

### Methods

#### `add<T>(task, options?): Promise<T>`

Enqueues `task` and returns a `Promise` that resolves with the task's return value, or rejects with its thrown error (after exhausting retries).

```ts
queue.add<T>(
  task: Task<T>,
  options?: TaskAddOptions
): Promise<T>
```

- If a concurrency slot is immediately free, `task` begins executing synchronously in the next microtask.
- The returned promise rejects with `AbortError` if the task is cancelled.
- The returned promise rejects with `TimeoutError` if the task exceeds its timeout.

#### `addAll<T>(tasks, options?): Promise<T[]>`

Convenience method. Enqueues all tasks and returns a `Promise` that resolves with an array of results **in the same order as `tasks`**, regardless of execution order.

```ts
queue.addAll<T>(
  tasks: Array<Task<T>>,
  options?: TaskAddOptions
): Promise<T[]>
```

If any task fails (after retries), the returned promise rejects with that error.

#### `onIdle(): Promise<void>`

Returns a promise that resolves when:
1. The pending queue is empty, **and**
2. All currently running tasks have settled.

```ts
await queue.onIdle();
```

If the queue is already idle when `onIdle()` is called, the returned promise resolves on the next microtask.

#### `onEmpty(): Promise<void>`

Returns a promise that resolves when the pending queue contains no more tasks. Running tasks may still be in-flight.

```ts
await queue.onEmpty();
```

#### `pause(): void`

Suspends dequeuing. Tasks already running continue to completion. New calls to `add()` will enqueue tasks but not start them until `resume()` is called.

#### `resume(): void`

Resumes dequeuing. Any tasks waiting in the pending queue are scheduled immediately (up to `concurrency`). This also works if the queue was initialised with `autoStart: false`.

#### `clear(): void`

Removes all pending (not-yet-started) tasks from the queue. Their promises reject with `AbortError`. Running tasks are unaffected.

#### `cancel(): void`

Cancels the entire queue:
1. All pending tasks are discarded (promises reject with `AbortError`).
2. All running tasks receive an abort on their `ctx.signal`.

After `cancel()`, you can call `resume()` and add new tasks to start fresh.

#### `on(event, listener): this`

Subscribe to a lifecycle event. See [Events](#events) below.

#### `off(event, listener): this`

Remove an event listener.

#### `once(event, listener): this`

Subscribe to an event once; the listener auto-removes after first invocation.

---

### Properties

All properties are **read-only**.

| Property | Type | Description |
|----------|------|-------------|
| `size` | `number` | Number of tasks currently in the **pending** queue (not yet started). |
| `pending` | `number` | Number of tasks currently **running**. |
| `isPaused` | `boolean` | `true` if the queue is paused. |
| `signal` | `AbortSignal` | The `AbortSignal` of the queue's internal `AbortController`. You can pass this to child `TaskQueue`s or `TaskGroup`s to inherit cancellation. |

---

## `TaskGroup`

A scoped batch of related tasks. A group lives inside a parent `TaskQueue` and can be independently awaited or cancelled without affecting sibling groups or the parent queue.

```ts
import { TaskGroup } from 'orqis/group';
```

### TaskGroup Constructor

```ts
new TaskGroup(queue: TaskQueue, options?: GroupOptions)
```

Creates a group backed by `queue`. Tasks added to the group consume slots from `queue`.

---

### `GroupOptions`

```ts
interface GroupOptions {
  id?: string;
  concurrency?: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | auto UUID | A label used in event payloads and debug output. |
| `concurrency` | `number` | parent's concurrency | Additional inner concurrency cap for this group. Must be ≤ parent's concurrency. |

---

### TaskGroup Methods

#### `add<T>(task, options?): Promise<T>`

Same signature as `TaskQueue.add()`. Enqueues into the parent queue, tagged to this group.

#### `onComplete(): Promise<void>`

Returns a promise that resolves when every task added **to this group** has settled (regardless of success or failure).

```ts
await group.onComplete();
```

#### `cancel(): void`

Aborts all pending and running tasks **belonging to this group only**. Tasks in other groups or ungrouped tasks on the parent queue are unaffected.

#### Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Group identifier. |
| `size` | `number` | Pending tasks in this group. |
| `pending` | `number` | Running tasks in this group. |

---

## Types

### `Task<T>`

```ts
type Task<T = unknown> = (ctx: TaskContext) => T | Promise<T>;
```

The function you enqueue. Always receives a `TaskContext`. You are encouraged (but not required) to use `ctx.signal` for cooperative cancellation.

### `TaskContext`

```ts
interface TaskContext {
  /**
   * An AbortSignal that fires when the task is cancelled or times out.
   * Pass this to fetch(), Node streams, or any abort-aware API.
   */
  signal: AbortSignal;
}
```

### `TaskAddOptions`

```ts
interface TaskAddOptions {
  priority?: number;
  timeout?: number;
  signal?: AbortSignal;
  retry?: RetryOptions;
  id?: string;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `priority` | `number` | `0` | Higher values = earlier execution. Only used when `QueueOptions.priority` is `true`. |
| `timeout` | `number` | queue's `timeout` | Overrides the queue-level timeout for this specific task. Set `0` to disable timeout for this task. |
| `signal` | `AbortSignal` | — | An additional external signal. The task's `ctx.signal` will fire when either this signal or the queue's own signal fires. |
| `retry` | `RetryOptions` | queue's `retry` | Overrides the queue-level retry policy for this task. |
| `id` | `string` | auto UUID | Label for this task. Appears in event payloads. |

### `RetryOptions`

```ts
interface RetryOptions {
  attempts: number;
  backoff?: BackoffOptions;
}
```

| Property | Type | Description |
|----------|------|-------------|
| `attempts` | `number` | Total number of attempts including the first. `1` = no retry. `3` = initial attempt + 2 retries. |
| `backoff` | `BackoffOptions` | Controls the delay between retries. If omitted, retries happen immediately. |

### `BackoffOptions`

```ts
interface BackoffOptions {
  type: 'exponential' | 'fixed';
  delay: number;
  factor?: number;
  jitter?: number;
  maxDelay?: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `type` | `'exponential' \| 'fixed'` | — | `'fixed'` waits `delay` ms between every retry. `'exponential'` multiplies `delay` by `factor` each retry. |
| `delay` | `number` | — | Base delay in milliseconds. |
| `factor` | `number` | `2` | Multiplier for exponential backoff. `delay × factor^attempt`. |
| `jitter` | `number` | `0` | Fraction of `delay` to add/subtract randomly (0–1). E.g. `0.2` adds ±20% noise to prevent thundering-herd. |
| `maxDelay` | `number` | `Infinity` | Cap on computed delay. Useful for exponential to prevent unbounded waits. |

**Delay formula (exponential with jitter):**

```
computed = min(delay × factor^(attempt - 1), maxDelay)
final    = computed × (1 + jitter × (Math.random() * 2 - 1))
```

### `QueueEvent`

The union of all event names the queue can emit:

```ts
type QueueEvent =
  | 'start'
  | 'success'
  | 'error'
  | 'retry'
  | 'timeout'
  | 'cancel'
  | 'idle'
  | 'empty'
  | 'active';
```

---

## Events

### `'start'`

Fires when a task transitions from pending to active.

```ts
queue.on('start', ({ id }: { id: string }) => { /* ... */ });
```

### `'success'`

Fires when a task resolves successfully.

```ts
queue.on('success', ({ id, result, durationMs }: {
  id: string;
  result: unknown;
  durationMs: number;
}) => { /* ... */ });
```

### `'error'`

Fires when a task rejects (after the last retry attempt, or immediately if no retries configured).

```ts
queue.on('error', ({ id, error, attempt }: {
  id: string;
  error: Error;
  attempt: number;
}) => { /* ... */ });
```

### `'retry'`

Fires before a failed task is re-enqueued for another attempt.

```ts
queue.on('retry', ({ id, attempt, delay }: {
  id: string;
  attempt: number;  // attempt number that just failed (1-based)
  delay: number;    // ms until next attempt
}) => { /* ... */ });
```

### `'timeout'`

Fires when a task's timeout fires. The task's promise rejects with `TimeoutError` synchronously with this event.

```ts
queue.on('timeout', ({ id }: { id: string }) => { /* ... */ });
```

### `'cancel'`

Fires for each task that is cancelled (via `queue.cancel()`, `queue.clear()`, an external signal, or a group cancel).

```ts
queue.on('cancel', ({ id }: { id: string }) => { /* ... */ });
```

### `'idle'`

Fires when both `queue.size === 0` and `queue.pending === 0`. Equivalent to `queue.onIdle()` resolving.

```ts
queue.on('idle', () => { /* ... */ });
```

### `'empty'`

Fires when `queue.size` drops to `0` (pending queue is drained). Running tasks may still be active.

```ts
queue.on('empty', () => { /* ... */ });
```

### `'active'`

Fires when the queue transitions from idle to active (first task starts after idle).

```ts
queue.on('active', () => { /* ... */ });
```

---

## Errors

### `TimeoutError`

Thrown (and available as the rejection reason) when a task exceeds its configured timeout.

```ts
import { TimeoutError } from 'orqis';

queue.on('error', ({ error }) => {
  if (error instanceof TimeoutError) {
    console.warn('Task timed out after', error.timeoutMs, 'ms');
  }
});
```

```ts
class TimeoutError extends Error {
  name: 'TimeoutError';
  timeoutMs: number;
}
```

### `AbortError`

Thrown when a task is cancelled.

```ts
import { AbortError } from 'orqis';

queue.on('error', ({ error }) => {
  if (error instanceof AbortError) {
    console.log('Task was cancelled');
  }
});
```

```ts
class AbortError extends Error {
  name: 'AbortError';
}
```

> **Note:** `AbortError` is not emitted via the `'error'` event by default — cancellation is considered intentional, not a failure. It is emitted via the `'cancel'` event instead, and causes task promises to reject with `AbortError`. You can opt into `'error'`-style handling by listening to `'cancel'`.
