# API Reference

Orqis exposes three main entry points:

| Import path | Exports |
|-------------|---------|
| `orqis` | `TaskQueue`, `AbortError`, `TimeoutError` |
| `orqis/group` | `TaskGroup` |
| `orqis/plugins` | Plugin types, `loggingPlugin`, `metricsPlugin`, `retryObserverPlugin` |

---

## Common Types

### `Task<T>`

```ts
type Task<T = unknown> = (ctx: TaskContext) => T | Promise<T>;
```

The function you enqueue. Always receives a `TaskContext`.

### `TaskContext`

```ts
interface TaskContext {
  signal: AbortSignal;
}
```

An `AbortSignal` that fires when the task is cancelled or times out. Pass this to `fetch()`, Node streams, or any abort-aware API.

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
| `timeout` | `number` | queue's `timeout` | Overrides the queue-level timeout. Set `0` to disable timeout for this task. |
| `signal` | `AbortSignal` | — | An additional external signal merged with the queue's signal. |
| `retry` | `RetryOptions` | queue's `retry` | Overrides the queue-level retry policy. |
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
| `attempts` | `number` | Total attempts including the first. `1` = no retry. `3` = initial + 2 retries. |
| `backoff` | `BackoffOptions` | Controls delay between retries. Omit for immediate retries. |

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
| `factor` | `number` | `2` | Multiplier for exponential backoff. |
| `jitter` | `number` | `0` | Fraction of `delay` to add/subtract randomly (0–1). |
| `maxDelay` | `number` | `Infinity` | Cap on computed delay. |

**Delay formula (exponential with jitter):**

```
computed = min(delay × factor^(attempt - 1), maxDelay)
final    = computed × (1 + jitter × (Math.random() * 2 - 1))
```

---

## Errors

### `TimeoutError`

Thrown when a task exceeds its configured timeout.

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

> **Note:** `AbortError` is not emitted via the `'error'` event by default — cancellation is considered intentional. It is emitted via the `'cancel'` event instead.
