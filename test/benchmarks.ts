// ---------------------------------------------------------------------------
// Orqis – test/benchmarks.ts
//
// Performance benchmarks required by the research document Section 5:
//   "Measure performance under load:
//    - Throughput (tasks/sec) for trivial tasks vs heavy tasks.
//    - Memory overhead as queue length grows.
//    - Compare against p-queue, p-limit, fastq."
//
// Run with:  node --loader ts-node/esm test/benchmarks.ts
// Or via:    npm run bench
//
// These are NOT Vitest tests — they are standalone benchmark scripts that
// print results to stdout.  They are run separately from the test suite.
// ---------------------------------------------------------------------------

import { TaskQueue } from '../src/queue.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a high-resolution timestamp in milliseconds. */
const now = () => Number(process.hrtime.bigint()) / 1_000_000;

/** Returns current heap used in MB. */
const heapMB = () =>
  (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2);

/** Formats a number with thousands separator. */
const fmt = (n: number) => n.toLocaleString('en-US');

async function runBench(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
  // Warm-up
  await fn();

  const start = now();
  await fn();
  const elapsed = now() - start;

  console.log(`  ${name.padEnd(50)} ${elapsed.toFixed(1).padStart(8)}ms`);
}

// ---------------------------------------------------------------------------
// Benchmark 1: Throughput — trivial tasks
// "Enqueue 10,000 quick tasks and measure enqueue/dequeue speed"
// ---------------------------------------------------------------------------

async function benchThroughputTrivial() {
  console.log('\n── Throughput: trivial tasks (no-op) ──');

  const TASK_COUNT = 10_000;

  await runBench(`${fmt(TASK_COUNT)} tasks  concurrency=∞`, async () => {
    const queue = new TaskQueue(); // Infinity concurrency
    await queue.addAll(Array.from({ length: TASK_COUNT }, () => async () => {}));
  });

  await runBench(`${fmt(TASK_COUNT)} tasks  concurrency=50`, async () => {
    const queue = new TaskQueue({ concurrency: 50 });
    await queue.addAll(Array.from({ length: TASK_COUNT }, () => async () => {}));
  });

  await runBench(`${fmt(TASK_COUNT)} tasks  concurrency=1 (serial)`, async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    await queue.addAll(Array.from({ length: TASK_COUNT }, () => async () => {}));
  });
}

// ---------------------------------------------------------------------------
// Benchmark 2: Throughput — I/O-simulated tasks
// "Throughput for trivial tasks vs heavy tasks"
// ---------------------------------------------------------------------------

async function benchThroughputIO() {
  console.log('\n── Throughput: I/O-simulated tasks (1ms delay) ──');

  const TASK_COUNT = 500;
  const IO_DELAY = 1; // ms

  const ioTask = () => new Promise<void>(r => setTimeout(r, IO_DELAY));

  for (const concurrency of [1, 4, 8, 16, 32]) {
    await runBench(
      `${fmt(TASK_COUNT)} tasks  concurrency=${concurrency}`,
      async () => {
        const queue = new TaskQueue({ concurrency });
        await queue.addAll(Array.from({ length: TASK_COUNT }, () => ioTask));
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Benchmark 3: Memory overhead as queue grows
// "Memory overhead as queue length grows"
// ---------------------------------------------------------------------------

async function benchMemory() {
  console.log('\n── Memory: heap usage as pending queue grows ──');

  for (const size of [1_000, 10_000, 50_000]) {
    // Force GC if available
    if (typeof global.gc === 'function') global.gc();

    const before = process.memoryUsage().heapUsed;

    // Fill queue but don't start (autoStart: false)
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });
    const tasks = Array.from({ length: size }, () => async () => {});
    for (const t of tasks) queue.add(t).catch(() => {});

    const after = process.memoryUsage().heapUsed;
    const deltaMB = ((after - before) / 1024 / 1024).toFixed(2);
    const perTask = (((after - before) / size)).toFixed(0);

    console.log(
      `  ${fmt(size).padStart(7)} pending tasks  heap Δ ${deltaMB} MB  (${perTask} B/task)`,
    );

    queue.cancel();
  }
}

// ---------------------------------------------------------------------------
// Benchmark 4: Priority queue overhead
// "For priority queues, a binary heap can be used"
// ---------------------------------------------------------------------------

async function benchPriority() {
  console.log('\n── Priority queue vs FIFO: insertion overhead ──');

  const TASK_COUNT = 5_000;

  await runBench(`${fmt(TASK_COUNT)} tasks  FIFO`, async () => {
    const queue = new TaskQueue({ concurrency: 50 });
    await queue.addAll(Array.from({ length: TASK_COUNT }, () => async () => {}));
  });

  await runBench(`${fmt(TASK_COUNT)} tasks  priority heap`, async () => {
    const queue = new TaskQueue({ concurrency: 50, priority: true });
    await queue.addAll(
      Array.from({ length: TASK_COUNT }, (_, i) => async () => {}),
    );
  });
}

// ---------------------------------------------------------------------------
// Benchmark 5: Add speed (enqueue without executing)
// ---------------------------------------------------------------------------

async function benchAddSpeed() {
  console.log('\n── Add speed (autoStart:false, pure enqueue) ──');

  for (const count of [1_000, 10_000, 100_000]) {
    const queue = new TaskQueue({ concurrency: 1, autoStart: false });

    const start = now();
    for (let i = 0; i < count; i++) {
      queue.add(async () => {}).catch(() => {});
    }
    const elapsed = now() - start;
    const rate = Math.round(count / (elapsed / 1000));

    console.log(
      `  ${fmt(count).padStart(8)} enqueues  ${elapsed.toFixed(1).padStart(8)}ms  ${fmt(rate).padStart(10)} tasks/sec`,
    );

    queue.cancel();
  }
}

// ---------------------------------------------------------------------------
// Benchmark 6: onIdle() resolution latency
// "idle latency"
// ---------------------------------------------------------------------------

async function benchIdleLatency() {
  console.log('\n── onIdle() latency after last task completes ──');

  const RUNS = 50;
  const latencies: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    const queue = new TaskQueue({ concurrency: 2 });

    queue.add(async () => {});
    queue.add(async () => {});

    const waitStart = now();
    await queue.onIdle();
    latencies.push(now() - waitStart);
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  console.log(`  avg ${avg.toFixed(3)}ms  min ${min.toFixed(3)}ms  max ${max.toFixed(3)}ms  (n=${RUNS})`);
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║            Orqis Performance Benchmarks              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`Node.js ${process.version}  heap before: ${heapMB()} MB`);

  await benchThroughputTrivial();
  await benchThroughputIO();
  await benchPriority();
  await benchAddSpeed();
  await benchIdleLatency();
  await benchMemory();

  console.log(`\nheap after: ${heapMB()} MB`);
  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
