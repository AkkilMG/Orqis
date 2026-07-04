# Built-in Plugins

Orqis ships three built-in plugins available from `orqis/plugins`.

---

## `loggingPlugin`

Prints task lifecycle events to the console.

```ts
import { loggingPlugin } from 'orqis/plugins';

queue.use(loggingPlugin({
  prefix: '[orqis]',  // default: '[orqis]'
  verbose: false,      // default: false (only logs errors)
}));
```

With `verbose: true`, logs `start`, `done`, and `cancel` events for every task. With `verbose: false` (the default), only errors are logged.

---

## `metricsPlugin`

Collects timing and count metrics for all tasks. Returns a `snapshot()` function you call after tasks finish.

```ts
import { metricsPlugin } from 'orqis/plugins';

const { plugin, snapshot } = metricsPlugin();
queue.use(plugin);

await queue.onIdle();

const stats = snapshot();
// {
//   total:          100,
//   succeeded:       97,
//   failed:           2,
//   cancelled:        1,
//   totalDurationMs: 4321,
//   minDurationMs:    12,
//   maxDurationMs:   210,
//   avgDurationMs:    44,
// }
```

### `MetricsSnapshot`

```ts
interface MetricsSnapshot {
  total: number;           // tasks started (including failed and cancelled)
  succeeded: number;       // tasks that resolved
  failed: number;          // tasks that rejected (after retries)
  cancelled: number;       // tasks that were aborted
  totalDurationMs: number; // sum of successful task durations
  minDurationMs: number;   // fastest successful task
  maxDurationMs: number;   // slowest successful task
  avgDurationMs: number;   // mean of successful task durations
}
```

---

## `retryObserverPlugin`

Fires a callback before each retry attempt. Useful for custom back-pressure, alerting, or logging retry state.

```ts
import { retryObserverPlugin } from 'orqis/plugins';

queue.use(retryObserverPlugin((id, attempt, delay) => {
  console.warn(`Task ${id} will retry (attempt ${attempt}) in ${delay}ms`);
}));
```
