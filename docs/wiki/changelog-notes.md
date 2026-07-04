# Changelog Notes

Per-release migration notes, breaking changes, and upgrade instructions. For the full diff, see [CHANGELOG.md](https://github.com/AkkilMG/orqis/blob/main/CHANGELOG.md).

---

## Released

### v0.2.0 — Cancellation & Timeouts (2026-07-05)

### What's new

- `ctx.signal: AbortSignal` passed to every task
- `queue.cancel()` aborts running tasks and discards pending
- `QueueOptions.abortSignal` for external signal integration
- `TaskAddOptions.signal` for per-task signals
- `timeout` option (queue-level and per-task)
- `TimeoutError` and `AbortError` classes
- `'timeout'` and `'cancel'` events
- Added complete the docs section (Initial).

### Breaking changes from v0.1

None — all new additions.

### `cancel()` controller replacement (important quirk)

`queue.cancel()` creates a **new** `AbortController` after aborting the old one. This means:

```ts
const sig1 = queue.signal; // old controller's signal
queue.cancel();
const sig2 = queue.signal; // NEW controller's signal

// sig1 is aborted; sig2 is fresh
// Tasks added after cancel() use sig2
```

If you stored `queue.signal` in a variable before calling `cancel()`, that reference is now stale. Always read `queue.signal` lazily (inside the task function via `ctx.signal`, or re-read `queue.signal` after cancel).

---

### v0.1.0 — Initial Release

### What's included

- `TaskQueue` with `concurrency`, `autoStart`, `stopOnError`, and `priority` options
- `add<T>()` and `addAll<T>()`
- `onIdle()`, `onEmpty()`
- `pause()`, `resume()`, `clear()`
- Events: `start`, `success`, `error`, `idle`, `empty`, `active`
- Dual ESM + CJS package
- Zero production dependencies
- Full TypeScript generics

---

## Upcoming

### v0.3.0 — Retry & Backoff

### What's new

- `retry.attempts`, `retry.backoff.type`, `retry.backoff.delay`, `retry.backoff.factor`, `retry.backoff.jitter`, `retry.backoff.maxDelay`
- Per-task retry override via `TaskAddOptions.retry`
- `'retry'` event with `{ id, attempt, delay }` payload

### Migration

No breaking changes. Queues without `retry` in options behave identically to before.

### Retry slot behaviour (important)

During backoff, the task **releases its concurrency slot** so other tasks can run. This means a queue with `concurrency: 2` and a task in 5s backoff will still run other tasks during those 5 seconds. This is by design — holding the slot during backoff would starve other work.

If you need to "reserve" capacity during retry, reduce effective concurrency by 1 or use a separate queue for high-reliability tasks.

---

### v0.4.0 — Priority Queue & TaskGroups

### What's new

- `priority: true` queue option enables binary max-heap ordering
- `TaskGroup` class exported from `orqis/group`
- `group.add()`, `group.onComplete()`, `group.cancel()`
- `group.size` and `group.pending` state properties

### Migration

No breaking changes. `TaskGroup` is a new export — existing code is unaffected.

**Important:** `TaskGroup` re-attaches a signal listener to the parent queue's controller on every `add()` call. This ensures correct propagation after `queue.cancel()` (which replaces the internal controller). If you add thousands of tasks to a single group, this creates a corresponding number of one-time listeners on the signal. This is cleaned up automatically but may show up in memory profiles on high-volume workloads. Scoped by group lifetime.

---

### v0.5.0 — Plugin System

### What's new

- `OrqisPlugin` factory interface with `onBefore`, `onAfter`, `onError`, `onCancel` hooks
- Built-in `loggingPlugin`, `metricsPlugin`, `retryObserverPlugin` in `orqis/plugins`
- `HookContext.meta` bag for passing state between hooks in the same task execution
- `'./plugins'` conditional export added to `package.json`

### Migration

No breaking changes. Plugin registration (`queue.use()`) is not yet wired into `TaskQueue` — use the `PluginRunner` class directly or wait for v1.0. See [Plugin docs](../plugins/overview.md) for current usage.

---

### v1.0.0

### Planned breaking changes

None confirmed yet. v1.0 is intended to freeze the public API and provide a semver stability guarantee for v1.x.

### Planned additions

- `queue.use(plugin)` method on `TaskQueue` directly
- `intervalCap` + `interval` rate-limiting options
- `queue.stats()` synchronous metrics snapshot
- 100% branch coverage requirement enforced in CI

### How to prepare

If you're on v0.x, the migration to v1.0 should be zero-effort. No API removals are planned. Features added in v1.0 are additive only.

---

## How to Read This File

Each section covers one minor version. Within a section:

- **What's new** — features added in this release
- **Migration** — steps needed when upgrading from the previous version
- **Breaking changes** — API removals or behaviour changes (rare; none in v0.x so far)
- **Important** — non-breaking changes that may affect your expectations

For bug fixes within a minor version (patch releases), see [CHANGELOG.md](https://github.com/AkkilMG/orqis/blob/main/CHANGELOG.md).
