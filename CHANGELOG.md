# Changelog

All notable changes to Orqis will be documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Orqis follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

---

## [0.1.0] — 2026-07-01

### Added

- `TaskQueue` class with configurable `concurrency`, `autoStart`, `timeout`, `retry`, `priority`, `abortSignal`, and `stopOnError` options.
- `add<T>(task, options?)` — enqueue a single task, returns `Promise<T>`.
- `addAll<T>(tasks, options?)` — batch enqueue, returns `Promise<T[]>` in input order.
- `onIdle()` — resolves when queue is empty and all tasks have settled.
- `onEmpty()` — resolves when pending queue is empty.
- `pause()`, `resume()`, `clear()`, `cancel()` — queue control methods.
- Read-only properties: `size`, `pending`, `isPaused`, `signal`.
- `TaskGroup` class (importable from `orqis/group`) for scoped task batches.
- Built-in retry with `exponential` and `fixed` backoff, configurable per queue or per task.
- Per-task and per-queue timeouts with `TimeoutError`.
- `AbortController`/`AbortSignal`-native cancellation (`ctx.signal` passed to every task).
- Priority queue mode (binary max-heap, opt-in via `priority: true`).
- Events: `start`, `success`, `error`, `retry`, `timeout`, `cancel`, `idle`, `empty`, `active`.
- `TimeoutError` and `AbortError` classes (exported from `orqis`).
- TypeScript-first: full generics, strict typings, no `any` leakage.
- Dual ESM + CJS package with `exports` conditional exports.
- Zero production dependencies.

[Unreleased]: https://github.com/AkkilMG/orqis/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/AkkilMG/orqis/releases/tag/v0.1.0
