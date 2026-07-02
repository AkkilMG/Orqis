import { TaskQueue } from 'orqis';

export async function demoEvents(): Promise<void> {
  console.log('  [04] Events — Subscribing to queue lifecycle');
  console.log('  --------------------------------------------');

  const queue = new TaskQueue({ concurrency: 2, retry: { attempts: 2, backoff: { type: 'fixed', delay: 30 } } });

  const log: string[] = [];

  queue.on('start', ({ id }) => log.push(`start(${id.slice(0, 6)})`));
  queue.on('success', ({ id, durationMs }) => log.push(`success(${id.slice(0, 6)}, ${durationMs}ms)`));
  queue.on('error', ({ id, error }) => log.push(`error(${id.slice(0, 6)}, ${error.message})`));
  queue.on('retry', ({ id, attempt }) => log.push(`retry(${id.slice(0, 6)}, attempt ${attempt})`));
  queue.on('idle', () => log.push('idle()'));
  queue.on('empty', () => log.push('empty()'));
  queue.on('active', () => log.push('active()'));

  queue.add(async () => 'ok');
  queue.add(async () => { throw new Error('fail-1'); });
  queue.add(async () => 'ok-2');

  await queue.onIdle();

  console.log('  Events emitted (in order):');
  for (const entry of log) {
    console.log(`    • ${entry}`);
  }
}
