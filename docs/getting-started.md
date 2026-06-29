# Getting Started with Orqis

This guide walks you from installation to your first working task queue in under 5 minutes.

---

## Prerequisites

- **Node.js ≥ 16** (for `AbortController` and `AbortSignal` native support)
- npm, pnpm, or yarn

---

## Installation

```bash
npm install orqis
```

Orqis ships a **dual package** — it works with both ESM (`import`) and CommonJS (`require`) out of the box, with no configuration needed.

---

## Your First Queue

```ts
import { TaskQueue } from 'orqis';

// Create a queue that runs at most 3 tasks at a time
const queue = new TaskQueue({ concurrency: 3 });

// Add tasks; each returns a Promise for the task's result
const p1 = queue.add(async () => {
  // simulate async work
  await sleep(100);
  return 'result-a';
});

const p2 = queue.add(async () => {
  await sleep(200);
  return 'result-b';
});

// Wait for all tasks to finish
await queue.onIdle();

console.log(await p1); // 'result-a'
console.log(await p2); // 'result-b'

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

---

## Using `addAll` for Batch Results

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 4 });

const items = [1, 2, 3, 4, 5, 6, 7, 8];

const results = await queue.addAll(
  items.map(n => async () => n * n)
);

console.log(results); // [1, 4, 9, 16, 25, 36, 49, 64]
```

`addAll` preserves order — results are in the same order as input tasks, regardless of which finished first.

---

## Cooperative Cancellation

Every task receives a `ctx` object with a `signal: AbortSignal`. Pass it to any abort-aware API (e.g. `fetch`, Node.js streams) so the task cleans up promptly when cancelled.

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 2 });

queue.add(async ({ signal }) => {
  const response = await fetch('https://api.example.com/data', { signal });
  return response.json();
});

// Cancel everything after 1 second
setTimeout(() => queue.cancel(), 1000);

try {
  await queue.onIdle();
} catch {
  console.log('cancelled!');
}
```

---

## What's Next?

- **[API Reference](./api/README.md)** — full type signatures and options
- **[Recipes](./recipes.md)** — copy-paste patterns for common scenarios
- **[Architecture](./architecture.md)** — how Orqis works internally
- **[Migration Guide](./migration.md)** — moving from p-limit, p-queue, or async
- **[Testing Guide](./testing.md)** — how to test your queue-based code
