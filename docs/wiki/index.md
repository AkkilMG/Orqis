# Orqis Wiki

Welcome to the Orqis wiki — the troubleshooting, FAQ, and deep-dive reference hub. If the main docs answer *what* Orqis does, the wiki answers *why something isn't working* and *how to fix it*.

---

## Pages

| Page | What it covers |
|------|---------------|
| [Common Errors](./common-errors.md) | Every known error message, why it happens, and the exact fix |
| [Troubleshooting](./troubleshooting.md) | Symptom-based debugging guide — "my tests hang", "tasks don't cancel", etc. |
| [FAQ](./faq.md) | Frequently asked questions with answers |
| [Patterns & Pitfalls](./patterns-and-pitfalls.md) | Best practices and anti-patterns with real examples |
| [Environment Compatibility](./environment-compatibility.md) | Node.js version quirks, Windows vs Linux, ESM vs CJS |
| [Changelog Notes](./changelog-notes.md) | Migration notes for each release, breaking changes |

---

## Quick Error Lookup

| Error | Go to |
|-------|-------|
| `ERR_UNHANDLED_ERROR` | [Common Errors → ERR_UNHANDLED_ERROR](./common-errors.md#err_unhandled_error) |
| `ERR_MODULE_NOT_FOUND ./queue.js` | [Common Errors → Module not found](./common-errors.md#err_module_not_found) |
| `TimeoutError: Task timed out` | [Common Errors → TimeoutError](./common-errors.md#timeouterror) |
| Tests hang at 10/15 seconds | [Troubleshooting → Tests never resolve](./troubleshooting.md#tests-never-resolve) |
| `vi.useFakeTimers()` breaks retry tests | [Troubleshooting → Fake timers](./troubleshooting.md#fake-timers-not-working) |
| `cancel()` doesn't abort running tasks | [Troubleshooting → Cancellation not working](./troubleshooting.md#cancellation-not-working) |
| Tasks run after `stopOnError` | [FAQ → stopOnError behaviour](./faq.md#stoponerror-behaviour) |
| `queue.signal` stale after `cancel()` | [Patterns & Pitfalls → Stale signal](./patterns-and-pitfalls.md#stale-signal-after-cancel) |

---

## Getting Help

1. Search this wiki first.
2. Check [GitHub Issues](https://github.com/your-org/orqis/issues) — your problem may already be reported.
3. Open a [Discussion](https://github.com/your-org/orqis/discussions) for questions.
4. Open an [Issue](https://github.com/your-org/orqis/issues/new?template=bug_report.md) for bugs with a minimal reproduction.
