import { TaskQueue, TimeoutError } from 'orqis';

export async function demoTimeout(): Promise<void> {
  console.log('  [03] Timeout — Task exceeding deadline');
  console.log('  --------------------------------------');

  const queue = new TaskQueue({ timeout: 200 });

  try {
    await queue.add(async ({ signal }) => {
      await sleep(500, signal);
    });
  } catch (err) {
    if (err instanceof TimeoutError) {
      console.log(`  Caught TimeoutError: ${err.message} (${err.timeoutMs}ms)`);
    } else {
      console.log(`  Caught: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('  Queue still functional after timeout.');
  const ok = await queue.add(async () => 'still works');
  console.log(`  Subsequent task result: "${ok}"`);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
  });
}
