import { TaskQueue } from 'orqis';

export async function demoPriority(): Promise<void> {
  console.log('  [07] Priority Queue — Higher priority runs first');
  console.log('  -------------------------------------------------');

  const queue = new TaskQueue({ concurrency: 1, priority: true });

  const order: number[] = [];

  const tasks = [
    { id: 1, priority: 0 },
    { id: 2, priority: 10 },
    { id: 3, priority: 5 },
    { id: 4, priority: 20 },
    { id: 5, priority: 1 },
  ];

  for (const t of tasks) {
    queue.add(async ({ signal }) => {
      await sleep(30, signal);
      order.push(t.id);
      console.log(`    Task ${t.id} (priority ${t.priority}) executed`);
    }, { priority: t.priority, id: `p-${t.id}` });
  }

  await queue.onIdle();

  console.log(`\n  Execution order (first task starts immediately, then highest-priority pending): [${order.join(', ')}]`);
  console.log('  Expected: [1, 4, 2, 3, 5]');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
