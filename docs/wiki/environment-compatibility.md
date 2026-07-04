# Environment Compatibility

Node.js version quirks, platform differences, ESM vs CJS, and runtime compatibility notes.

---

## Node.js Version Matrix

| Node.js | Status | Notes |
|---------|--------|-------|
| 22.x LTS | ✅ Fully supported | Native `AbortSignal.any()`, all features work |
| 20.x LTS | ✅ Fully supported | Primary CI target |
| 18.x LTS | ✅ Fully supported | `AbortSignal.any()` polyfilled for Node < 20.3 |
| 16.x | ✅ Supported | Minimum version; `AbortController` stable |
| 14.x | ❌ Not supported | `AbortController` not stable; ESM support incomplete |

### `AbortSignal.any()` polyfill

`AbortSignal.any(signals)` (Node 20.3+) merges multiple signals into one. Orqis ships a polyfill in `scheduler.ts` for Node 16–18:

```ts
if (typeof AbortSignal.any === 'function') {
  return AbortSignal.any(active); // native
} else {
  // polyfill: attach abort listeners to each signal
  const controller = new AbortController();
  for (const sig of active) {
    sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
  }
  return controller.signal;
}
```

This means on Node 16 and 18, merging many signals creates more event listeners. If you're adding hundreds of tasks with per-task signals on older Node, be aware that each task creates a small listener chain.

---

## ESM vs CommonJS

Orqis is published as a **dual package** with both ESM and CJS builds. The correct build is selected automatically based on how you import it.

### ESM (recommended)

```ts
// package.json has "type": "module" or file is .mjs
import { TaskQueue } from 'orqis';
import { TaskGroup } from 'orqis/group';
import { loggingPlugin } from 'orqis/plugins';
```

### CommonJS

```js
// package.json has "type": "commonjs" or file is .cjs
const { TaskQueue } = require('orqis');
const { TaskGroup } = require('orqis/group');
const { loggingPlugin } = require('orqis/plugins');
```

### Mixed ESM/CJS projects

If your project uses `"type": "module"` but a dependency uses CJS (or vice versa), Node.js handles the boundary automatically. You can `import` Orqis from either context.

### The `.js` extension in source imports

Orqis's TypeScript source uses `.js` extensions on local imports:

```ts
import { AbortError } from './errors.js'; // correct for Node ESM
```

When Vitest runs tests directly against TypeScript source (not compiled output), it needs to resolve `.js` to `.ts`. Add this to `vitest.config.ts`:

```ts
export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
});
```

---

## Windows Compatibility

Orqis is tested on Windows (the CI matrix runs on `ubuntu-latest`, but the core is platform-independent).

### Known Windows considerations

**Path separators:** Orqis doesn't handle file paths — it only runs async functions. If your tasks use file paths, use `node:path` with `path.join()` rather than hardcoded `/` separators.

**`setImmediate` vs `queueMicrotask`:** Orqis uses `Promise.resolve().then()` for scheduling (microtasks), which behaves identically on Windows and Linux.

**Process signals:** `SIGINT` (Ctrl-C) works on Windows in Node.js. `SIGTERM` is not supported on Windows — use `SIGINT` for graceful shutdown instead:

```ts
// Windows-compatible graceful shutdown:
process.on('SIGINT', async () => {
  queue.pause();
  await queue.onIdle();
  process.exit(0);
});
```

---

## TypeScript Compatibility

| TypeScript | Status |
|------------|--------|
| 5.x | ✅ Fully supported |
| 4.7–4.9 | ✅ Supported |
| < 4.7 | ❌ Not supported (`"module": "NodeNext"` requires 4.7+) |

### ESLint and TypeScript 5.x

`@typescript-eslint` 7.x officially supports TypeScript up to 5.5.x. TypeScript 5.6+ may produce warnings. The fix is to either pin TypeScript, update `@typescript-eslint`, or remove type-aware ESLint rules:

```js
// .eslintrc.cjs — remove type-aware rules to avoid TS version issues
module.exports = {
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  // Remove: 'plugin:@typescript-eslint/recommended-requiring-type-checking'
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Remove: project: './tsconfig.json'
  },
};
```

---

## Bun Compatibility

Bun has good Node.js API compatibility. Orqis should work, with these caveats:

- `node:events` and `node:crypto` are available in Bun
- `AbortController` and `AbortSignal` are native in Bun
- The dual-package `exports` field is supported in Bun's module resolver

Not officially tested yet. If you encounter an issue with Bun, please open a GitHub issue.

---

## Deno Compatibility

Deno has a Node.js compatibility layer (`deno run --node-modules-dir`). Orqis may work under this mode, but it's not tested. Deno first-class support is planned for v2.0.

---

## Vitest Pool Modes and Timer Behaviour

This is a common source of test failures. The behaviour depends on the pool:

| Pool | `vi.useFakeTimers()` | Real timers | Recommendation |
|------|---------------------|-------------|---------------|
| `forks` (subprocess) | ⚠️ Unreliable with microtask-based schedulers | ✅ Works | Use real timers |
| `threads` (worker_threads) | ✅ Works but needs `vi.runAllTimersAsync()` | ✅ Works | Either; prefer real timers |
| `vmForks` | ⚠️ Same as forks | ✅ Works | Use real timers |

**Recommendation:** Use real timers with small delays (10–50ms). They're simpler, work in all pool modes, and test the same code paths as production. Fake timers add complexity without meaningful benefit for time-based queue logic.
