# Orqis Documentation

Welcome to the Orqis documentation. Choose a topic below.

---

## Guides

| Guide | Description |
|-------|-------------|
| [Getting Started](./getting-started.md) | Install Orqis and run your first queue in under 5 minutes |
| [Recipes](./recipes.md) | Copy-paste patterns for common scenarios |
| [Plugin System](./plugins.md) | Logging, metrics, tracing, and custom middleware hooks |
| [Migration Guide](./migration.md) | Moving from p-limit, p-queue, async, or fastq |
| [Testing Guide](./testing.md) | How to write reliable tests for queue-based code |
| [Architecture](./architecture.md) | How Orqis works internally |

## Reference

| Reference | Description |
|-----------|-------------|
| [API Reference](./api/README.md) | Full type signatures, options, methods, and events |
| [Library Comparison](./comparison.md) | Full survey of the Node.js async orchestration ecosystem |
| [Roadmap](./roadmap.md) | Planned milestones from v0.1 to v2.0 |

---

## At a Glance

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({
  concurrency: 4,
  retry: { attempts: 3, backoff: { type: 'exponential', delay: 100, factor: 2 } },
  timeout: 10_000,
});

queue.on('error', ({ id, error }) => console.error(`[${id}] failed:`, error));
queue.on('idle',  () => console.log('All done!'));

for (const url of urls) {
  queue.add(async ({ signal }) => {
    const res = await fetch(url, { signal });
    return res.json();
  });
}

await queue.onIdle();
```

---

## Design Goals

- **Zero dependencies** — fast install, no CVE surface
- **Structured concurrency** — task groups with scoped cancellation
- **AbortSignal-native** — works with `fetch`, Node streams, any abort-aware API
- **TypeScript-first** — full generics, strict typings
- **Event-loop-friendly** — no blocking, deferred scheduling via `setImmediate`
- **< 5 KB minzipped** — inlines cleanly into any bundle
