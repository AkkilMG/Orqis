# Plugin System

Orqis ships a lightweight plugin / middleware system that lets you hook into the task lifecycle for logging, metrics, caching, error alerting, and more — without modifying task functions.

This addresses the gap identified in the research survey:
> *"None of the reviewed libs support plugins/hooks out-of-the-box. A plugin system (e.g. middleware around task execution) could allow users to integrate logging, caching, error reporting, etc."*

---

## Quick Start

```ts
import { TaskQueue } from 'orqis';
import { loggingPlugin, metricsPlugin } from 'orqis/plugins';

const queue = new TaskQueue({ concurrency: 4 });

// Register plugins
queue.use(loggingPlugin({ prefix: '[build]', verbose: true }));
const { plugin: metrics, snapshot } = metricsPlugin();
queue.use(metrics);

// Run tasks normally
await queue.addAll([
  async () => fetchData('/api/a'),
  async () => fetchData('/api/b'),
]);

console.log(snapshot());
// { total: 2, succeeded: 2, failed: 0, avgDurationMs: 43 }
```

---

## How It Works

A plugin is a **factory function** that receives the queue instance and returns a set of **lifecycle hooks**. Hooks are called around every task execution:

```
queue.add(task)
  │
  ├─ onBefore(ctx)         ← plugin hook: task is about to start
  │
  ├─ task(ctx)             ← the actual task function runs
  │
  ├─ onError(ctx)?         ← plugin hook: task threw (if applicable)
  │  or
  ├─ onCancel(ctx)?        ← plugin hook: task was aborted
  │
  └─ onAfter(ctx)          ← plugin hook: task finished (success or fail)
```

All hooks are **async-capable** (you can `await` inside them). Hook errors are caught and logged — they never propagate to the task promise.

---

## Plugin Interface

```ts
import type { OrqisPlugin } from 'orqis/plugins';

const myPlugin: OrqisPlugin = (queue) => ({
  name: 'my-plugin',

  onBefore: async (ctx) => { /* ... */ },
  onAfter:  async (ctx) => { /* ... */ },
  onError:  async (ctx) => { /* ... */ },
  onCancel: async (ctx) => { /* ... */ },
});
```

The factory receives the queue's event emitter interface — you can call `queue.on(event, listener)` for passive listening on top of the active hooks.

---

## Hook Reference

### `onBefore(ctx: BeforeHookContext)`

Called immediately before the task function is invoked. Use it for:
- Recording start time
- Injecting values into `ctx.meta` for downstream hooks
- Pre-flight validation

```ts
onBefore: async ({ id, meta }) => {
  meta.startedAt = Date.now();
  console.log(`Starting task ${id}`);
}
```

### `onAfter(ctx: AfterHookContext)`

Called after the task settles (whether success or failure). `ctx.result` is set on success; `ctx.error` is set on failure.

```ts
onAfter: async ({ id, result, error, durationMs }) => {
  if (error) {
    console.error(`Task ${id} failed in ${durationMs}ms:`, error.message);
  } else {
    console.log(`Task ${id} done in ${durationMs}ms`);
  }
}
```

### `onError(ctx: AfterHookContext & { error: Error })`

Called specifically when the task rejects after exhausting all retries. Runs before `onAfter`. Use it for alerting, dead-letter queue logic, or error aggregation.

```ts
onError: async ({ id, error, attempt }) => {
  await alertingService.report({ taskId: id, error, attempt });
}
```

### `onCancel(ctx: HookContext & { reason: Error })`

Called when the task is cancelled (`AbortError` or `TimeoutError`). Runs instead of `onAfter`/`onError`.

```ts
onCancel: async ({ id, reason }) => {
  console.warn(`Task ${id} cancelled:`, reason.message);
}
```

---

## Plugin Execution Order

When multiple plugins are registered, **`onBefore`** hooks run in **registration order**; **`onAfter`**, **`onError`**, and **`onCancel`** also run in registration order (not reverse — unlike Koa-style middleware, there is no onion wrapping since hooks don't call `next()`).

```ts
queue.use(pluginA); // onBefore: A first
queue.use(pluginB); // onBefore: B second

// Execution order:
// onBefore:  A → B
// task runs
// onError:   A → B  (if failed)
// onAfter:   A → B
```

---

## TypeScript Types

All plugin types are exported from `orqis/plugins`:

```ts
import type {
  OrqisPlugin,      // Plugin factory: (queue) => PluginHooks
  PluginHooks,      // { name, onBefore?, onAfter?, onError?, onCancel? }
  HookContext,      // { id, task, options, startedAt, meta }
  BeforeHookContext, // extends HookContext
  AfterHookContext,  // extends HookContext + { durationMs, result?, error?, attempt }
  MetricsSnapshot,  // returned by metricsPlugin().snapshot()
} from 'orqis/plugins';
```
