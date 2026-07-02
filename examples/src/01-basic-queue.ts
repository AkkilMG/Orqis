import { TaskQueue } from 'orqis';

export async function demoBasicQueue(): Promise<void> {
  console.log('  [01] Basic Queue — Concurrency & onIdle()');
  console.log('  -----------------------------------------');

  const queue = new TaskQueue({ concurrency: 3 });

  const results: number[] = [];

  for (let i = 1; i <= 8; i++) {
    queue.add(async ({ signal }) => {
      const delay = 100 + Math.random() * 200;
      await sleep(delay, signal);
      results.push(i);
      console.log(`    Task ${i} finished (${Math.round(delay)}ms)`);
    });
  }

  await queue.onIdle();

  console.log(`\n  All ${results.length} tasks completed in order of concurrency slots.`);
  console.log(`  Execution order: [${results.join(', ')}]`);
  console.log(`  Final queue size: ${queue.size}, pending: ${queue.pending}`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
