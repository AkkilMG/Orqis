<div align="center">

# orqis

**Structured async task orchestration for Node.js**

*The gap between `p-limit` and Bull — without Redis, without boilerplate.*

[![npm version](https://img.shields.io/npm/v/orqis.svg?style=flat-square)](https://www.npmjs.com/package/orqis)
[![npm downloads](https://img.shields.io/npm/dm/orqis.svg?style=flat-square)](https://www.npmjs.com/package/orqis)
[![CI](https://github.com/AkkilMG/orqis/actions/workflows/ci.yml/badge.svg)](https://github.com/AkkilMG/orqis/actions)
[![Coverage](https://img.shields.io/codecov/c/github/AkkilMG/orqis?style=flat-square)](https://codecov.io/gh/AkkilMG/orqis)
[![Bundle Size](https://img.shields.io/bundlephobia/minzip/orqis?style=flat-square&label=minzipped)](https://bundlephobia.com/package/orqis)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue?style=flat-square)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D16-brightgreen?style=flat-square)](https://nodejs.org)

</div>

---

## Install

```bash
npm install orqis
# or
pnpm add orqis
# or
yarn add orqis
```

**Requirements:** Node.js ≥ 16. Works with ESM (`import`) and CommonJS (`require`) — zero configuration. **Zero production dependencies.**

---

## Quick Start

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 5 });

const urls = [
  'https://api.example.com/users/1',
  'https://api.example.com/users/2',
  // ... hundreds more
];

const users = await queue.addAll(
  urls.map(url => async ({ signal }) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  })
);

console.log(`Fetched ${users.length} users`);
```

That's it. Concurrency capped at 5. Cancellation-ready. TypeScript-inferred.

---

## Quick Decision Matrix

| Your Need | Use This |
|-----------|----------|
| Cap concurrency, nothing else | `p-limit` (~1 KB) |
| Concurrency + priorities + timeouts | `p-queue` |
| **Concurrency + retries + cancellation + events + plugins** | **orqis** (~5 KB) |
| Redis-backed persistent queue across servers | BullMQ |
| Cron / recurring jobs | Bree or `node-cron` |
| API rate limiting | Bottleneck |

**Orqis is for in-process async orchestration.** If your tasks live in a single Node.js process and you need more than a concurrency cap but less than a full Redis-backed job queue, Orqis is the right tool.

---

## The Problem Orqis Solves

You're building a CLI tool, a build script, or a background task runner. You have async work — lots of it — and you need more than raw `Promise.all`.

Promise.all starts everything at once. Feed it 10,000 URLs and you'll saturate the CPU, exhaust file handles, and get rate-limited by every API in sight. You need:

- **Concurrency control** — process 8 at a time, not 10,000
- **Retries** — transient failures happen; tasks should recover without boilerplate
- **Timeouts** — a hung network call shouldn't stall your entire pipeline
- **Cancellation** — Ctrl-C should clean up, not leak connections
- **Observability** — which tasks ran, which failed, how long they took

The existing solutions force a compromise: reach for `p-limit` and build everything else yourself, or adopt Bull/BullMQ and bring in Redis middleware infrastructure. Orqis fills the gap — **production-grade orchestration with zero infrastructure**.

---

## Why Orqis

### Resilience
- **Built-in retry + backoff** — exponential, fixed, with jitter. No `p-retry` wrapper needed.
- **Per-task timeouts** — hung requests get aborted, not awaited forever.
- **`stopOnError`** — halt the pipeline on first failure for build scripts and CI.

### Control
- **AbortSignal-native cancellation** — `ctx.signal` on every task. Pass it to `fetch`, streams, database clients. Cancellation propagates cleanly through the call chain.
- **TaskGroup scoped cancellation** — cancel only the compile phase without touching lint. The missing primitive for structured concurrency.
- **Priority queue** — binary max-heap; critical tasks jump the line.

### Observability
- **Lifecycle events** — `start`, `success`, `error`, `retry`, `timeout`, `cancel`, `idle`, `empty`, `active`. Every event has typed payloads.
- **Plugin system** — `onBefore`, `onAfter`, `onError`, `onCancel` hooks. Built-in logging, metrics, and retry observer. Write custom plugins for Sentry, OpenTelemetry, caching, etc.
- **`onIdle()` / `onEmpty()` promises** — await completion without polling.

### Simplicity
- **Zero dependencies** — 5 KB minzipped. No `node_modules` baggage, no CVE surface.
- **TypeScript-first** — strict generics, typed events, no `any` leakage.
- **Dual ESM + CJS** — one package, both module systems, no config.
- **No infrastructure** — runs in-process. No Redis, no Docker, no worker processes.

---

## When Should You Use Orqis

**Use Orqis when your answer to one or more of these is "yes":**

- You're writing a CLI, build script, test runner, or data pipeline in Node.js
- You need to run N async tasks but cap parallelism below some limit
- Some of those tasks call unreliable external services that need retry logic
- You need to handle Ctrl-C / graceful shutdown cleanly
- You want to log or monitor task progress without wiring up a full observability stack
- You have batches of related tasks that should be cancellable as a unit
- You need different tasks to run with different priorities (critical path vs. background)

**Consider alternatives when:**

- **Tasks must survive process restarts** → BullMQ (Redis-backed)
- **Work distributes across machines** → BullMQ or Agenda
- **Recurring cron-style jobs needed** → Bree or `node-cron`
- **Only need concurrency control** → `p-limit`
- **Reactive stream processing** → RxJS

---

## Core Concepts

### Tasks

A task is any async function. It receives `{ signal: AbortSignal }` and returns a value. That's the entire interface.

```ts
const task = async ({ signal }: { signal: AbortSignal }) => {
  const data = await fetch('/api', { signal });
  return data.json();
};

const result = await queue.add(task);
```

### Pending vs Active

Tasks exist in one of two states. **Pending** tasks are queued and waiting for a concurrency slot. **Active** tasks are running. `queue.size` is pending; `queue.pending` is active.

| Method | Effect |
|--------|--------|
| `queue.clear()` | Removes pending tasks (running continue) |
| `queue.cancel()` | Removes pending + aborts running |
| `queue.pause()` | Stops dequeuing (running continue) |

### queue.onIdle() vs queue.onEmpty()

`onIdle()` resolves when pending = 0 AND running = 0 — everything is done. `onEmpty()` resolves when the pending queue drains, even if tasks are still running.

### TaskGroup

A group is a named batch of tasks that can be awaited or cancelled as a unit, without affecting other work on the same queue.

```ts
import { TaskGroup } from 'orqis/group';

const queue  = new TaskQueue({ concurrency: 8 });
const build  = new TaskGroup(queue, { id: 'build' });
const test   = new TaskGroup(queue, { id: 'test' });

build.cancel();            // only build tasks abort
await test.onComplete();   // wait for only test tasks
```

---

## Comparison

| | **orqis** | p-limit | p-queue | Bottleneck | Bull |
|-|-----------|---------|---------|------------|------|
| **Size** | ~5 KB | ~1 KB | ~25 KB publish | ~15 KB | ~229 KB |
| **Dependencies** | **0** | 0 | 1 | 0 | 8+ |
| **ESM + CJS** | ✅ | ✅ | ESM only | ✅ | ✅ |
| **TypeScript-first** | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Concurrency cap** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Priority queue** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **AbortSignal cancellation** | ✅ | ❌ | partial | ❌ | ❌ |
| **Structured concurrency** (TaskGroup) | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Built-in retry + backoff** | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Per-task timeouts** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Lifecycle events** | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Plugin system** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Infrastructure required** | **none** | none | none | none | Redis |
| **Maintenance status** | Active | Active | Active | Stale (2019) | Active |

The only things Orqis deliberately omits are persistence, clustering, and cron scheduling — all of which require external infrastructure that most in-process use cases don't need.

---

## Graceful Shutdown

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 8 });

process.on('SIGINT', async () => {
  console.log('\nShutting down gracefully...');
  queue.pause();
  await queue.onIdle();
  process.exit(0);
});

process.on('SIGTERM', () => {
  queue.cancel();
  process.exit(1);
});
```

---

## API at a Glance

```ts
new TaskQueue(options?)

// Methods
queue.add(task, opts?)      // → Promise<T>
queue.addAll(tasks, opts?)  // → Promise<T[]>
queue.onIdle()              // → Promise<void>
queue.onEmpty()             // → Promise<void>
queue.pause() / resume()
queue.clear() / cancel()
queue.on/off/once(event, fn)

// Properties
queue.size      // pending count
queue.pending   // active count
queue.isPaused
queue.signal    // AbortSignal

// Events
'on start'     → { id }
'on success'   → { id, result, durationMs }
'on error'     → { id, error, attempt }
'on retry'     → { id, attempt, delay }
'on timeout'   → { id }
'on cancel'    → { id }
'on idle' / 'on empty' / 'on active'
```

Full docs: [API Reference](./docs/api/index.md)

---

## Plugin System

```ts
import { loggingPlugin, metricsPlugin, retryObserverPlugin } from 'orqis/plugins';

queue.use(loggingPlugin({ prefix: '[build]', verbose: true }));

const { plugin, snapshot } = metricsPlugin();
queue.use(plugin);
await queue.onIdle();
console.log(snapshot());

queue.use(retryObserverPlugin((id, attempt, delay) => {
  console.warn(`Task ${id} retrying (${attempt}) in ${delay}ms`);
}));
```

See the [Plugin Guide](./docs/plugins/overview.md) for custom plugin examples (cache, Sentry, OpenTelemetry).

---

## What's Next (Roadmap)

| Version | Focus |
|---------|-------|
| **v1.0** | `queue.use()` on TaskQueue, rate limiting, 100% coverage |
| **v1.x** | OpenTelemetry plugin, `queue.stats()`, progress events |
| **v2.0** | Browser/Worker support, Deno/Bun, optional persistence |

See the [full roadmap](./docs/meta/roadmap.md).

---

## Documentation

| Page | Description |
|------|-------------|
| [Getting Started](./docs/intro/quickstart.md) | Step-by-step from install to first queue |
| [Core Concepts](./docs/guide/core-concepts.md) | How Orqis works internally |
| [Recipes](./docs/guide/recipes.md) | Copy-paste patterns for common scenarios |
| [Plugin System](./docs/plugins/overview.md) | Logging, metrics, tracing, and custom middleware |
| [API Reference](./docs/api/index.md) | Complete type signatures and option tables |
| [Migration Guide](./docs/guide/migration.md) | Moving from p-limit, p-queue, async, fastq |
| [Testing Guide](./docs/guide/testing.md) | How to test queue-based code reliably |
| [Comparison](./docs/meta/comparison.md) | Detailed survey of the ecosystem |
| [Roadmap](./docs/meta/roadmap.md) | Planned features and release milestones |
| [Wiki](./docs/wiki/index.md) | Troubleshooting, FAQs, common errors |

---

## Contributing

```bash
git clone https://github.com/AkkilMG/orqis.git
cd orqis && npm install
npm test          # run test suite
npm run build     # compile dist/
npm run typecheck # type-check src/
npm run lint      # ESLint
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a PR. Bug reports go in [Issues](https://github.com/AkkilMG/orqis/issues). Questions go in [Discussions](https://github.com/AkkilMG/orqis/discussions).

---

## License

[MIT](./LICENSE) © Akkil M G
