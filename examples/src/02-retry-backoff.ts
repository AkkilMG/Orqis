import { TaskQueue } from 'orqis';

export async function demoRetryBackoff(): Promise<void> {
  console.log('  [02] Retry & Backoff — Exponential backoff with jitter');
  console.log('  ------------------------------------------------------');

  const queue = new TaskQueue({
    concurrency: 2,
    retry: {
      attempts: 4,
      backoff: { type: 'exponential', delay: 50, factor: 2, jitter: 0.2, maxDelay: 2000 },
    },
  });

  let callCount = 0;

  const result = await queue.add(async () => {
    callCount++;
    console.log(`    Attempt ${callCount}...`);
    if (callCount < 3) {
      throw new Error(`Simulated failure on attempt ${callCount}`);
    }
    return 'Success after retries';
  });

  console.log(`  Final result: "${result}" (succeeded on attempt ${callCount})`);
}
