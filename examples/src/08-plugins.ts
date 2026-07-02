import { TaskQueue, PluginRunner, loggingPlugin, metricsPlugin } from 'orqis';

export async function demoPlugins(): Promise<void> {
  console.log('  [08] Plugins — Logging & Metrics');
  console.log('  ---------------------------------');

  const queue = new TaskQueue({ concurrency: 2, retry: { attempts: 2, backoff: { type: 'fixed', delay: 20 } } });
  const runner = new PluginRunner();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner.register(loggingPlugin({ prefix: '[demo]', verbose: false }), queue as any);

  const { plugin: metrics, snapshot } = metricsPlugin();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  runner.register(metrics, queue as any);

  const pendingRunners: Array<Promise<void>> = [];

  queue.on('start', (p) => {
    pendingRunners.push(runner.runBefore({ id: p.id, task: null as never, options: {}, startedAt: Date.now(), meta: {} }));
  });
  queue.on('success', (p) => {
    const now = Date.now();
    const durationMs = p.durationMs ?? 0;
    const ctx = { id: p.id, task: null as never, options: {}, startedAt: now - durationMs, meta: {}, durationMs, result: p.result, attempt: 1 };
    pendingRunners.push(runner.runAfter(ctx));
  });
  queue.on('error', (p) => {
    const now = Date.now();
    const error = p.error;
    const attempt = p.attempt ?? 1;
    const ctx = { id: p.id, task: null as never, options: {}, startedAt: now, meta: {}, durationMs: 0, error, attempt };
    pendingRunners.push(runner.runAfter(ctx));
    pendingRunners.push(runner.runError({ ...ctx, error }));
  });
  queue.on('cancel', (p) => {
    pendingRunners.push(runner.runCancel({ id: p.id, task: null as never, options: {}, startedAt: Date.now(), meta: {}, reason: new Error('cancelled') }));
  });

  const results = await Promise.allSettled([
    queue.add(async () => 'ok-1'),
    queue.add(async () => { throw new Error('boom'); }),
    queue.add(async () => 'ok-2'),
  ]);

  await Promise.all(pendingRunners);

  const s = snapshot();
  console.log(`\n  Task results: ${results.filter(r => r.status === 'fulfilled').length} succeeded, ${results.filter(r => r.status === 'rejected').length} failed`);
  console.log(`\n  Metrics snapshot:`);
  console.log(`    Total:        ${s.total}`);
  console.log(`    Succeeded:    ${s.succeeded}`);
  console.log(`    Failed:       ${s.failed}`);
  console.log(`    Cancelled:    ${s.cancelled}`);
  console.log(`    Avg duration: ${s.avgDurationMs.toFixed(1)}ms`);
  console.log(`    Min duration: ${s.minDurationMs}ms`);
  console.log(`    Max duration: ${s.maxDurationMs}ms`);
}
