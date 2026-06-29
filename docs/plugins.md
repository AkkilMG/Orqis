# Plugin System

Orqis ships a lightweight plugin / middleware system that lets you hook into the task lifecycle for logging, metrics, caching, error alerting, and more — without modifying task functions.

This addresses the gap identified in the research survey:
> *"None of the reviewed libs support plugins/hooks out-of-the-box. A plugin system (e.g. middleware around task execution) could allow users to integrate logging, caching, error reporting, etc."*

---

## Table of Contents

- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [Plugin Interface](#plugin-interface)
- [Hook Reference](#hook-reference)
- [Built-in Plugins](#built-in-plugins)
  - [loggingPlugin](#loggingplugin)
  - [metricsPlugin](#metricsplugin)
  - [retryObserverPlugin](#retryobserverplugin)
- [Writing a Custom Plugin](#writing-a-custom-plugin)
- [Plugin Execution Order](#plugin-execution-order)
- [TypeScript Types](#typescript-types)

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

## Built-in Plugins

### `loggingPlugin`

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

### `metricsPlugin`

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

#### `MetricsSnapshot`

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

### `retryObserverPlugin`

Fires a callback before each retry attempt. Useful for custom back-pressure, alerting, or logging retry state.

```ts
import { retryObserverPlugin } from 'orqis/plugins';

queue.use(retryObserverPlugin((id, attempt, delay) => {
  console.warn(`Task ${id} will retry (attempt ${attempt}) in ${delay}ms`);
}));
```

---

## Writing a Custom Plugin

### Cache Plugin Example

```ts
import type { OrqisPlugin } from 'orqis/plugins';

export function cachePlugin(
  cache: Map<string, unknown>
): OrqisPlugin {
  return () => ({
    name: 'cache',

    onBefore: async (ctx) => {
      const key = ctx.options.id;
      if (key !== undefined && cache.has(key)) {
        // Short-circuit: store cached result in meta
        ctx.meta.cachedResult = cache.get(key);
        ctx.meta.fromCache = true;
      }
    },

    onAfter: async (ctx) => {
      const key = ctx.options.id;
      if (key !== undefined && !ctx.meta.fromCache && ctx.result !== undefined) {
        cache.set(key, ctx.result);
      }
    },
  });
}

// Usage:
const cache = new Map<string, unknown>();
queue.use(cachePlugin(cache));
```

### Sentry Error Plugin Example

```ts
import type { OrqisPlugin } from 'orqis/plugins';
import * as Sentry from '@sentry/node';

export const sentryPlugin: OrqisPlugin = () => ({
  name: 'sentry',

  onError: async ({ id, error, attempt }) => {
    Sentry.captureException(error, {
      tags: { taskId: id, attempt: String(attempt) },
    });
  },
});
```

### OpenTelemetry Tracing Plugin Example

```ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import type { OrqisPlugin } from 'orqis/plugins';

const tracer = trace.getTracer('orqis');

export const otelPlugin: OrqisPlugin = () => ({
  name: 'opentelemetry',

  onBefore: async (ctx) => {
    const span = tracer.startSpan(`orqis.task:${ctx.id}`);
    ctx.meta.span = span;
    ctx.meta.otelCtx = trace.setSpan(context.active(), span);
  },

  onAfter: async (ctx) => {
    const span = ctx.meta.span as ReturnType<typeof tracer.startSpan> | undefined;
    if (span) {
      if (ctx.error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: ctx.error.message });
        span.recordException(ctx.error);
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    }
  },

  onCancel: async (ctx) => {
    const span = ctx.meta.span as ReturnType<typeof tracer.startSpan> | undefined;
    span?.setStatus({ code: SpanStatusCode.ERROR, message: 'cancelled' });
    span?.end();
  },
});
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
