import { TaskQueue, TaskGroup, AbortError } from 'orqis';

export async function demoTaskGroup(): Promise<void> {
  console.log('  [06] TaskGroup — Scoped task orchestration');
  console.log('  -------------------------------------------');

  const queue = new TaskQueue({ concurrency: 3 });

  const groupA = new TaskGroup(queue, { id: 'group-a', concurrency: 2 });
  const groupB = new TaskGroup(queue, { id: 'group-b' });

  const resultsA = await Promise.allSettled([
    groupA.add(async ({ signal }) => { await sleep(150, signal); return 'A-1'; }),
    groupA.add(async ({ signal }) => { await sleep(100, signal); return 'A-2'; }),
  ]);

  console.log('  Group A results:');
  for (const r of resultsA) {
    console.log(`    ${r.status === 'fulfilled' ? `fulfilled: ${r.value}` : `rejected: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`}`);
  }

  console.log(`  Group A size after completion: ${groupA.size}, pending: ${groupA.pending}`);

  groupB.add(async ({ signal }) => { await sleep(300, signal); return 'B-1'; });
  groupB.add(async ({ signal }) => { await sleep(400, signal); return 'B-2'; });

  console.log('  Cancelling group B while tasks are running...');
  await sleep(50);
  groupB.cancel();

  try {
    await groupB.onComplete();
  } catch (err) {
    if (err instanceof AbortError) {
      console.log('  groupB.onComplete() rejected with AbortError (expected)');
    }
  }

  await queue.onIdle();
  console.log('  Queue idle after group operations.');
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
