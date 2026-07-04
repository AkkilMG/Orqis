# Common Errors

Every error message you might see when using Orqis, why it happens, and the exact fix.

---

## `ERR_UNHANDLED_ERROR`

```
Error: Unhandled error. ({
  id: 'abc123',
  error: Error: something went wrong,
  attempt: 1
})
```

### Why it happens

Node.js `EventEmitter` has a special rule: if you emit `'error'` and there is no `'error'` listener registered, Node throws a fatal `ERR_UNHANDLED_ERROR`. Orqis emits `'error'` when a task fails (after exhausting retries). If your queue has no `'error'` listener and a task throws, this crash occurs.

### The fix

Always add an `'error'` listener before adding tasks that can fail:

```ts
const queue = new TaskQueue({ concurrency: 4 });

// Add this BEFORE adding any tasks
queue.on('error', ({ id, error, attempt }) => {
  console.error(`Task ${id} failed (attempt ${attempt}):`, error.message);
});

queue.add(() => mightFail());
```

If you're intentionally not caring about individual errors and only care about `onIdle()` resolving, the minimum is:

```ts
queue.on('error', () => { /* intentionally ignored */ });
```

### Why Orqis doesn't suppress this automatically

Silently swallowing errors would be worse. The `ERR_UNHANDLED_ERROR` crash is Node.js telling you "a task failed and nobody was listening." That's valuable signal. Orqis makes you opt into silence rather than opting into noise.

---

## `ERR_MODULE_NOT_FOUND`

```
Error: Cannot find module './queue.js' imported from 'test/cancel.test.ts'
```

### Why it happens

Orqis's source files use Node.js ESM-style imports with `.js` extensions (e.g. `import { X } from './queue.js'`). This is correct for the published package — Node.js resolves `.js` to the compiled `.js` files in `dist/`. But when Vitest runs tests directly against TypeScript source, it looks for literal `./queue.js` and finds no such file — only `queue.ts` exists.

### Fix 1: `resolve.extensions` in `vitest.config.ts` (recommended)

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  test: { ... },
});
```

Vite tries extensions in order, so `./queue.js` resolves to `./queue.ts`. This is the zero-change fix — your source files keep their `.js` imports.

### Fix 2: Remove `.js` from test file imports

In your test files, import without extension:

```ts
// Before:
import { TaskQueue } from '../src/queue.js';

// After:
import { TaskQueue } from '../src/queue';
```

Vitest finds TypeScript files without extensions by default. This works but requires changing every test import.

### Fix 3: Install `vite-tsconfig-paths`

If you're using `paths` aliases in `tsconfig.json`:

```bash
npm install -D vite-tsconfig-paths
```

```ts
// vitest.config.ts
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { ... },
});
```

---

## `TimeoutError: Task timed out after Nms`

```
TimeoutError: Task timed out after 5000ms
  at scheduler.ts:74
```

### Why it happens

A task was running longer than its configured timeout. The timeout fires, aborts the task's signal, and the task's promise rejects with `TimeoutError`.

### Is it a bug?

Usually not. It means the task genuinely took too long. Check:

1. Is the timeout value realistic for the work being done?
2. Is the task passing `ctx.signal` to the underlying I/O call? If not, the signal fires but the operation isn't cancelled — it runs to completion and the timeout error is thrown when it finally resolves.
3. Is the external API unusually slow?

### The fix

**Option A — Increase the timeout:**
```ts
queue.add(() => slowOperation(), { timeout: 30_000 }); // 30s for this task
```

**Option B — Disable timeout for a specific task:**
```ts
queue.add(() => verySlowButExpected(), { timeout: 0 }); // no timeout
```

**Option C — Make the task respect the signal:**
```ts
queue.add(async ({ signal }) => {
  // Before:
  const res = await fetch(url); // ignores signal, times out hard

  // After:
  const res = await fetch(url, { signal }); // aborts cleanly
  return res.json();
});
```

### Catching `TimeoutError`

```ts
import { TimeoutError } from 'orqis';

queue.on('error', ({ id, error }) => {
  if (error instanceof TimeoutError) {
    console.warn(`Task ${id} timed out after ${error.timeoutMs}ms`);
    // retry with longer timeout, alert, etc.
  }
});
```

---

## `AbortError: Task was aborted`

```
AbortError: Task was aborted
```

### Why it happens

The task was cancelled. This happens when:
- `queue.cancel()` was called
- `queue.clear()` removed the task while it was pending
- An external `AbortSignal` (passed via `QueueOptions.abortSignal` or `TaskAddOptions.signal`) fired
- A `TaskGroup.cancel()` cancelled the group the task belonged to

### Is this an error?

No. `AbortError` is not a failure — it means the cancellation worked. Orqis emits `'cancel'` events for cancelled tasks, not `'error'` events, so your error handler won't receive them by default.

### When you need to handle it

If you're using `.catch()` on individual task promises and don't want to treat cancellation as an error:

```ts
import { AbortError } from 'orqis';

const result = await queue.add(() => doWork()).catch(err => {
  if (err instanceof AbortError) {
    return null; // expected, treat as no-op
  }
  throw err; // re-throw unexpected errors
});
```

---

## TypeScript: `TS4114: This member must have an 'override' modifier`

```
error TS4114: This member must have an 'override' modifier because it
overrides a member in the base class 'EventEmitter<DefaultEventMap>'.
```

### Why it happens

`TaskQueue` extends `EventEmitter` and overrides `on()`, `off()`, and `once()` for typed event signatures. TypeScript's `noImplicitOverride` rule (which Orqis enables) requires explicit `override` on any method that shadows a base class method. If you're extending `TaskQueue` yourself and overriding these methods, you need the `override` keyword.

### The fix

```ts
class MyQueue extends TaskQueue {
  // Before (causes TS4114):
  on(event, listener) { ... }

  // After:
  override on(event, listener) { ... }
}
```

---

## TypeScript: `TS6059: File not under rootDir`

```
error TS6059: File 'test/cancel.test.ts' is not under 'rootDir' 'src'.
```

### Why it happens

Your `tsconfig.json` has `rootDir: "src"` and `include: ["src", "test/..."]`. TypeScript's `rootDir` must be a common ancestor of all included files. Including test files in a tsconfig that has `rootDir: "src"` is a contradiction.

### The fix

Use two tsconfig files. `tsconfig.json` is for building (covers `src/` only). `tsconfig.test.json` is for type-checking tests (covers both):

```json
// tsconfig.test.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "noEmit": true,
    "declaration": false
  },
  "include": ["src", "test"],
  "exclude": ["node_modules", "dist"]
}
```

Then update your scripts:
```json
{
  "scripts": {
    "typecheck": "tsc --noEmit",
    "typecheck:all": "tsc --project tsconfig.test.json --noEmit"
  }
}
```

---

## ESLint: `no-restricted-imports` blocks local `.js` imports

```
error  './types.js' import is restricted from being used by a pattern
```

### Why it happens

A misconfigured `no-restricted-imports` rule in `.eslintrc.cjs` that matched all relative imports instead of only external ones.

### The fix

Turn off `no-restricted-imports` for ESM extension patterns:

```js
// .eslintrc.cjs
module.exports = {
  rules: {
    'no-restricted-imports': 'off', // ESM .js extensions are fine
  },
};
```

---

## ESLint: `Unexpected console statement`

```
warning  Unexpected console statement  no-console
```

### Why it happens

The `no-console` rule fires in `src/plugins.ts` where the `PluginRunner` uses `console.error` to report plugin hook errors without rethrowing.

### The fix

Allow `console.error` in the ESLint config:

```js
'no-console': ['warn', { allow: ['error', 'warn'] }],
```

Or disable for the specific file:

```ts
// src/plugins.ts
// eslint-disable-next-line no-console
console.error(`[orqis] Plugin "${hook.name}" onAfter threw:`, err);
```

---

## `DTS Build error` during `npm run build`

```
Error: error occurred in dts build
```

### Why it happens

The DTS (declaration file) build is separate from the JS build and runs TypeScript's full type checker. Any type error in `src/` causes it to fail, even if the JS build succeeded.

### How to diagnose

Run `npm run typecheck` first — it gives a cleaner error message than tsup's DTS output:

```bash
npm run typecheck
```

Common causes:
- Missing `override` keyword on overridden methods (see TS4114 above)
- `@internal` marked types leaking into the public surface
- Circular type references between files

### The fix

Fix the type errors reported by `tsc --noEmit`, then re-run `npm run build`.
