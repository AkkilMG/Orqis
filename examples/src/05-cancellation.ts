import { TaskQueue, AbortError } from 'orqis';

export async function demoCancellation(): Promise<void> {
  console.log('  [05] Cancellation — Abort running & pending tasks');
  console.log('  -------------------------------------------------');

  const queue = new TaskQueue({ concurrency: 2 });

  const tasks: Array<Promise<unknown>> = [];

  for (let i = 1; i <= 6; i++) {
    const p = queue.add(async ({ signal }) => {
      console.log(`    Task ${i} started`);
      await sleep(400, signal);
      console.log(`    Task ${i} completed`);
      return i;
    });
    tasks.push(p);
  }

  await sleep(100);

  console.log('  Cancelling queue...');
  queue.cancel();

  const settled = await Promise.allSettled(tasks);
  const cancelled = settled.filter((r) => r.status === 'rejected' && r.reason instanceof AbortError).length;
  const succeeded = settled.filter((r) => r.status === 'fulfilled').length;

  console.log(`  Results: ${succeeded} succeeded, ${cancelled} cancelled`);
  console.log('  Queue can accept new tasks after cancel.');

  const afterCancel = await queue.add(async () => 'post-cancel ok');
  console.log(`  Post-cancel task result: "${afterCancel}"`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
