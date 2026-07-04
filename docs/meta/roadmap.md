# Roadmap

This document tracks Orqis's planned milestones, drawn from the design research that preceded the project.

---

## Summary

| Version | Target | Theme |
|---------|--------|-------|
| v0.1 | 6–8 weeks from start | Core queue, MVP |
| v1.0 | 3–6 months | Stable, cancellation, full events |
| v1.x | Ongoing | Advanced features, plugin ecosystem |
| v2.0 | As needed | Breaking improvements, Web/Worker compat |

---

## v0.1 — MVP ✅ *(current)*

**Goal:** A working core queue that developers can drop into a build script today.

- [x] `TaskQueue` with configurable `concurrency`
- [x] `add<T>()` returning `Promise<T>`
- [x] `addAll<T>()` with ordered results
- [x] `pause()`, `resume()`, `clear()`, `cancel()`
- [x] `onIdle()` and `onEmpty()` promises
- [x] `autoStart` option
- [x] Basic lifecycle events: `start`, `success`, `error`, `idle`, `empty`, `active`
- [x] TypeScript-first with strict generics
- [x] Dual ESM + CJS package
- [x] Zero production dependencies
- [x] Full test suite (Vitest)
- [x] CI on Node 16–22 (GitHub Actions)
- [x] README, docs, CHANGELOG, CONTRIBUTING

---

## v0.2 — Cancellation & Timeouts

**Goal:** First-class `AbortController` / `AbortSignal` support, per-task timeouts.

- [x] `ctx.signal` passed to every task
- [x] `queue.cancel()` aborts running tasks via signal
- [x] External `AbortSignal` on `QueueOptions.abortSignal`
- [x] Per-task `AbortSignal` via `TaskAddOptions.signal`
- [x] Per-task and queue-level `timeout` with `TimeoutError`
- [x] `cancel` and `timeout` events

---

## v0.3 — Retry & Backoff

**Goal:** Built-in resilience — no need for `p-retry` as an external wrapper.

- [x] `retry.attempts` — total attempt count
- [x] `retry.backoff.type` — `'fixed'` and `'exponential'`
- [x] `retry.backoff.factor`, `.jitter`, `.maxDelay`
- [x] Per-task retry override
- [x] `retry` event with attempt number and delay

---

## v0.4 — Priority Queue & Task Groups

**Goal:** Hierarchical task organisation and ordering control.

- [x] Priority queue mode (binary max-heap, opt-in)
- [x] `TaskGroup` with scoped cancellation
- [x] `group.onComplete()` and `group.cancel()`
- [x] Inner concurrency cap on groups

---

## v0.5 — Plugin System ✅ *(current)*

**Goal:** Extensibility hooks for logging, metrics, tracing, caching.

- [x] `OrqisPlugin` factory interface
- [x] `onBefore`, `onAfter`, `onError`, `onCancel` hooks
- [x] `HookContext` with `meta` bag for cross-hook state
- [x] Built-in `loggingPlugin`
- [x] Built-in `metricsPlugin` with `MetricsSnapshot`
- [x] Built-in `retryObserverPlugin`
- [x] Plugin documentation

---

## v1.0 — Stable Release

**Goal:** Production-ready, API-stable release. No breaking changes after this.

- [ ] `queue.use(plugin)` method wired into `TaskQueue` directly
- [ ] Plugin hooks integrated into the scheduler pipeline
- [ ] Rate limiting: `intervalCap` + `interval` options (token bucket / fixed window)
- [ ] `carryoverConcurrency` option (carry partial interval slot counts on resume)
- [ ] `stopOnError` tested and stable
- [ ] 100% test coverage on all `src/` files
- [ ] Performance benchmarks tracked in CI (no regression > 10%)
- [ ] Full API documentation freeze
- [ ] Security policy published
- [ ] npm provenance published
- [ ] Semver guarantee: no breaking API changes in v1.x

**Estimated effort:** ~1–2 developer-months from v0.5.

---

## v1.1 — Developer Experience

- [ ] `queue.use()` accepts an array of plugins
- [ ] Debug mode (`ORQIS_DEBUG=1`) that auto-registers the logging plugin
- [ ] `queue.stats()` — synchronous snapshot of runtime metrics without needing a plugin
- [ ] Improved TypeScript ergonomics: `queue.add()` infers task return type without annotation

---

## v1.2 — Observability

- [ ] OpenTelemetry plugin (official, maintained in `orqis/plugins/otel`)
- [ ] Prometheus metrics plugin (`orqis/plugins/prometheus`)
- [ ] `queue.on('progress', ({ completed, total, percent }) => ...)` event

---

## v1.3 — Concurrency Patterns

- [ ] `queue.fork(n)` — create N child queues sharing one concurrency budget
- [ ] `queue.pipe(otherQueue)` — route task results as inputs to another queue (producer/consumer)
- [ ] Semaphore utility (named slots for resource-constrained tasks)

---

## v2.0 — Platform Expansion *(breaking if needed)*

**Goal:** Extend beyond Node.js CLI/build-tool to broader environments.

- [ ] Browser / Web Worker compatibility (replace `node:events`, `node:crypto` with web-native APIs)
- [ ] `worker_threads` integration: `WorkerTaskQueue` that dispatches CPU-bound tasks to a thread pool (like Bree but inline)
- [ ] Deno and Bun first-class support
- [ ] Optional persistence adapter interface (pluggable; implement your own Redis/SQLite backend)
- [ ] Web-compatible ESM-only build with no Node.js built-ins

---

## Ideas Backlog (No Version Assigned)

These are ideas worth tracking but not yet prioritised:

- `queue.replay(taskId)` — re-run a specific completed task
- `queue.snapshot()` / `queue.restore()` — serialise and restore queue state
- Task dependencies (`queue.add(task, { after: [taskId1, taskId2] })`)
- Visual queue inspector (terminal UI using `ink`)
- VS Code extension for queue state during builds

---

## Estimated Effort (from Research Document)

> *"Estimated effort: ~1–2 developer-months for MVP; additional months for advanced features and hardening."*

| Milestone | Effort estimate |
|-----------|----------------|
| v0.1 MVP  | 6–8 weeks |
| v1.0 stable | +2–3 months |
| v1.x features | +1 month per minor |
| v2.0 platform | +2–3 months |

---

## Contributing to the Roadmap

Have a use case not covered here? Open a [feature request](https://github.com/AkkilMG/orqis/issues/new?template=feature_request.md) or start a [Discussion](https://github.com/AkkilMG/orqis/discussions). Items with strong community support will be moved into the nearest upcoming milestone.
