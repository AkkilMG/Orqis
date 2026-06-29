# Recipes

Copy-paste patterns for common Orqis use cases.

---

## Fetch a List of URLs with Concurrency

```ts
import { TaskQueue } from 'orqis';

async function fetchAll(urls: string[], concurrency = 5) {
  const queue = new TaskQueue({ concurrency });
  return queue.addAll(
    urls.map(url => async ({ signal }) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return res.json();
    })
  );
}
```

---

## Parallel File Processing (Build Script)

```ts
import { TaskQueue } from 'orqis';
import { glob } from 'glob';
import fs from 'node:fs/promises';
import path from 'node:path';

async function buildAll(srcDir: string, outDir: string) {
  const queue = new TaskQueue({
    concurrency: 4,
    retry: { attempts: 2, backoff: { type: 'fixed', delay: 200 } },
  });

  const files = await glob(`${srcDir}/**/*.ts`);

  for (const file of files) {
    queue.add(async ({ signal }) => {
      const src = await fs.readFile(file, 'utf8');
      const compiled = await compile(src, { signal });
      const out = path.join(outDir, path.relative(srcDir, file));
      await fs.mkdir(path.dirname(out), { recursive: true });
      await fs.writeFile(out, compiled);
    });
  }

  await queue.onIdle();
  console.log(`Built ${files.length} files`);
}
```

---

## Rate-Limited API Calls

While Orqis doesn't implement token-bucket rate limiting natively, you can combine concurrency control with a per-task delay:

```ts
import { TaskQueue } from 'orqis';

function rateLimited<T>(
  tasks: Array<() => Promise<T>>,
  { concurrency = 2, delayMs = 500 } = {}
) {
  const queue = new TaskQueue({ concurrency });

  return queue.addAll(
    tasks.map(task => async ({ signal }) => {
      const result = await task();
      // enforce minimum gap between calls
      await new Promise(r => setTimeout(r, delayMs));
      return result;
    })
  );
}
```

---

## Serial Execution (One at a Time)

```ts
import { TaskQueue } from 'orqis';

const serial = new TaskQueue({ concurrency: 1 });

serial.add(() => stepOne());
serial.add(() => stepTwo());
serial.add(() => stepThree());

await serial.onIdle();
```

---

## Collecting All Results and Errors

```ts
import { TaskQueue } from 'orqis';

async function runAll<T>(tasks: Array<() => Promise<T>>) {
  const queue = new TaskQueue({ concurrency: 4 });
  const results: T[] = [];
  const errors: { index: number; error: Error }[] = [];

  await queue.addAll(
    tasks.map((task, i) => async () => {
      try {
        results.push(await task());
      } catch (err) {
        errors.push({ index: i, error: err as Error });
      }
    })
  );

  return { results, errors };
}
```

---

## Dynamic Priority Escalation

Boost the priority of a task after it has been waiting too long:

```ts
import { TaskQueue } from 'orqis';

function withEscalation<T>(
  queue: TaskQueue,
  task: () => Promise<T>,
  { initialPriority = 0, escalateAfterMs = 5000, escalatedPriority = 100 } = {}
) {
  let priority = initialPriority;

  const timeout = setTimeout(() => {
    // If task hasn't started yet — re-add with higher priority
    // (simplified: in practice, you'd cancel the pending entry first)
    priority = escalatedPriority;
  }, escalateAfterMs);

  return queue.add(async (ctx) => {
    clearTimeout(timeout);
    return task();
  }, { priority });
}
```

---

## Progress Bar Integration

```ts
import { TaskQueue } from 'orqis';

function withProgress<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
) {
  const queue = new TaskQueue({ concurrency });
  let done = 0;
  const total = tasks.length;

  queue.on('success', () => {
    done++;
    const pct = Math.round((done / total) * 100);
    process.stdout.write(`\r[${pct.toString().padStart(3)}%] ${done}/${total}`);
    if (done === total) process.stdout.write('\n');
  });

  return queue.addAll(tasks.map(t => () => t()));
}
```

---

## Timeout with Fallback Value

```ts
import { TaskQueue, TimeoutError } from 'orqis';

const queue = new TaskQueue({ concurrency: 4 });

async function fetchWithFallback(url: string, fallback: unknown) {
  try {
    return await queue.add(
      async ({ signal }) => {
        const res = await fetch(url, { signal });
        return res.json();
      },
      { timeout: 3000 }
    );
  } catch (err) {
    if (err instanceof TimeoutError) return fallback;
    throw err;
  }
}
```

---

## Stop on First Error

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 3, stopOnError: true });

try {
  await queue.addAll([
    () => doStep1(),
    () => doStep2(),  // if this throws, queue halts
    () => doStep3(),
  ]);
} catch (err) {
  console.error('Pipeline failed:', err);
}
```

---

## Graceful Shutdown on SIGINT

```ts
import { TaskQueue } from 'orqis';

const queue = new TaskQueue({ concurrency: 4 });

process.on('SIGINT', async () => {
  console.log('\nGraceful shutdown: waiting for active tasks...');
  queue.pause();          // stop starting new tasks
  await queue.onIdle();  // wait for running tasks to finish
  process.exit(0);
});

// Or for immediate cancellation:
process.on('SIGTERM', () => {
  queue.cancel();
  process.exit(1);
});
```
