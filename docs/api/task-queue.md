# TaskQueue

The core class. Manages a pool of async tasks under a concurrency limit.

```ts
import { TaskQueue } from 'orqis';
```

## Constructor

```ts
new TaskQueue(options?: QueueOptions)
```

Creates a new queue. If `autoStart` is `true` (default), tasks added via `add()` will begin executing immediately when a concurrency slot is available.

## QueueOptions

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
| `timeout` | `number` | `undefined` | Default timeout in milliseconds applied to every task. Overridable per task via `TaskAddOptions.timeout`. |
| `retry` | `RetryOptions` | `undefined` | Default retry policy. Applied to all tasks unless overridden in `TaskAddOptions.retry`. |
| `priority` | `boolean` | `false` | When `true`, the pending queue is a binary max-heap ordered by `TaskAddOptions.priority`. |
| `abortSignal` | `AbortSignal` | `undefined` | An external `AbortSignal`. When this signal fires, the queue behaves as if `cancel()` was called. |
| `stopOnError` | `boolean` | `false` | When `true`, the queue pauses and rejects `onIdle()` on the first unretried task failure. |

## Methods

### `add<T>(task, options?): Promise<T>`

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

### `addAll<T>(tasks, options?): Promise<T[]>`

Convenience method. Enqueues all tasks and returns a `Promise` that resolves with an array of results **in the same order as `tasks`**, regardless of execution order.

```ts
queue.addAll<T>(
  tasks: Array<Task<T>>,
  options?: TaskAddOptions
): Promise<T[]>
```

If any task fails (after retries), the returned promise rejects with that error.

### `onIdle(): Promise<void>`

Returns a promise that resolves when:
1. The pending queue is empty, **and**
2. All currently running tasks have settled.

```ts
await queue.onIdle();
```

If the queue is already idle when `onIdle()` is called, the returned promise resolves on the next microtask.

### `onEmpty(): Promise<void>`

Returns a promise that resolves when the pending queue contains no more tasks. Running tasks may still be in-flight.

```ts
await queue.onEmpty();
```

### `pause(): void`

Suspends dequeuing. Tasks already running continue to completion. New calls to `add()` will enqueue tasks but not start them until `resume()` is called.

### `resume(): void`

Resumes dequeuing. Any tasks waiting in the pending queue are scheduled immediately (up to `concurrency`). This also works if the queue was initialised with `autoStart: false`.

### `clear(): void`

Removes all pending (not-yet-started) tasks from the queue. Their promises reject with `AbortError`. Running tasks are unaffected.

### `cancel(): void`

Cancels the entire queue:
1. All pending tasks are discarded (promises reject with `AbortError`).
2. All running tasks receive an abort on their `ctx.signal`.

After `cancel()`, you can call `resume()` and add new tasks to start fresh.

### `on(event, listener): this`

Subscribe to a lifecycle event. See [Events](/api/events).

### `off(event, listener): this`

Remove an event listener.

### `once(event, listener): this`

Subscribe to an event once; the listener auto-removes after first invocation.

## Properties

All properties are **read-only**.

| Property | Type | Description |
|----------|------|-------------|
| `size` | `number` | Number of tasks currently in the **pending** queue (not yet started). |
| `pending` | `number` | Number of tasks currently **running**. |
| `isPaused` | `boolean` | `true` if the queue is paused. |
| `signal` | `AbortSignal` | The `AbortSignal` of the queue's internal `AbortController`. |
