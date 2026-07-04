# Events

Orqis emits rich lifecycle events on the queue. All events are synchronous `EventEmitter` calls.

> **Important:** Register your listeners **before** calling `add()`. Orqis does not buffer events — if no listener is registered when an event fires, it's lost.

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

> **Node.js crash rule:** `EventEmitter` throws `ERR_UNHANDLED_ERROR` if `'error'` is emitted with no listener. Always add an `'error'` listener before adding tasks that can fail.

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

> Cancellation is intentional — not a failure. `AbortError` fires `'cancel'`, not `'error'`.

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
