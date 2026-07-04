# Writing a Custom Plugin

Below are complete, real-world examples of custom plugins. Use them as templates for your own.

---

## Cache Plugin

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

---

## Sentry Error Plugin

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

---

## OpenTelemetry Tracing Plugin

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
