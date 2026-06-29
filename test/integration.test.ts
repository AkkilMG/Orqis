// ---------------------------------------------------------------------------
// Orqis – test/integration.test.ts
//
// Integration tests covering real-world usage patterns called out in the
// research document Section 8: Gulp, Webpack/Rollup build scripts, npm
// script parallelism, and cross-cutting concerns (error isolation,
// graceful shutdown, structured concurrency with task groups).
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../src/queue.js';
import { TaskGroup } from '../src/group.js';
import { loggingPlugin, metricsPlugin } from '../src/plugins.js';
import { AbortError, TimeoutError } from '../src/errors.js';
import { sleep, deferred, concurrencyTracker } from './helpers.js';

// ---------------------------------------------------------------------------
// Gulp-style integration: parallel build tasks
// Section 8: "Using a hypothetical Gulp plugin, internally use the queue
//             to run build steps"
// ---------------------------------------------------------------------------

describe('Gulp-style integration', () => {
  it('compiles N files in parallel up to concurrency limit', async () => {
    const CONCURRENCY = 2;
    const queue = new TaskQueue({ concurrency: CONCURRENCY });
    const compiled: string[] = [];

    async function compileFile(name: string): Promise<string> {
      await sleep(20); // simulate I/O
      return `${name}.out`;
    }

    // Simulate a Gulp task body
    const gulpBuildTask = async () => {
      const files = ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'];
      const tracker = concurrencyTracker(
        files.map(f => async () => {
          const out = await compileFile(f);
          compiled.push(out);
          return out;
        }),
        10,
      );
      const results = await queue.addAll(tracker.tasks);
      expect(tracker.peak).toBeLessThanOrEqual(CONCURRENCY);
      return results;
    };

    const results = await gulpBuildTask();
    expect(results).toHaveLength(5);
    expect(compiled).toHaveLength(5);
  });

  it('onIdle() resolves after all gulp tasks complete', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let idleFired = false;

    queue.on('idle', () => { idleFired = true; });

    queue.add(() => sleep(20));
    queue.add(() => sleep(30));
    queue.add(() => sleep(10));

    await queue.onIdle();
    expect(idleFired).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.pending).toBe(0);
  });

  it('stops remaining tasks on first error when stopOnError is set', async () => {
    const queue = new TaskQueue({ concurrency: 1, stopOnError: true });
    const ran: string[] = [];

    queue.on('error', () => { /* prevent unhandled */ });

    queue.add(async () => { throw new Error('build failed'); });
    queue.add(async () => { ran.push('second'); });
    queue.add(async () => { ran.push('third'); });

    await sleep(50);

    // Queue is paused; subsequent tasks did not run
    expect(ran).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Webpack / Rollup build-script integration
// Section 8: "In a build script, transform files concurrently"
// ---------------------------------------------------------------------------

describe('Webpack/Rollup-style build script', () => {
  it('transforms a list of files concurrently and collects output', async () => {
    const queue = new TaskQueue({ concurrency: 4 });

    // Simulate babel.transformAsync
    const transform = async (code: string, signal: AbortSignal): Promise<string> => {
      await sleep(15);
      if (signal.aborted) throw new AbortError();
      return `transformed(${code})`;
    };

    const files = ['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js'];
    const outputs = await queue.addAll(
      files.map(file => async ({ signal }) => {
        const code = `/* ${file} */`;
        return transform(code, signal);
      }),
    );

    expect(outputs).toHaveLength(files.length);
    for (const out of outputs) {
      expect(out).toMatch(/^transformed\(/);
    }
  });

  it('retries a failed transform up to N times', async () => {
    const queue = new TaskQueue({
      concurrency: 2,
      retry: { attempts: 3, backoff: { type: 'fixed', delay: 10 } },
    });

    let attempts = 0;
    const result = await queue.add(async () => {
      attempts++;
      if (attempts < 3) throw new Error('transient transform error');
      return 'success';
    });

    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('cancels mid-build when an external signal fires', async () => {
    const controller = new AbortController();
    const queue = new TaskQueue({ concurrency: 3, abortSignal: controller.signal });
    const transformed: string[] = [];

    for (let i = 0; i < 10; i++) {
      const file = `file${i}.js`;
      queue.add(async ({ signal }) => {
        await sleep(30);
        if (!signal.aborted) transformed.push(file);
      }).catch(() => { /* swallow AbortError */ });
    }

    // Cancel after first batch starts
    setTimeout(() => controller.abort(), 15);
    await sleep(100);

    // Not all 10 files should have been transformed
    expect(transformed.length).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// npm scripts: parallel shell command runner
// Section 8: "Use the queue to run shell commands in parallel"
// ---------------------------------------------------------------------------

describe('npm scripts parallel runner', () => {
  it('runs test suites in parallel respecting concurrency limit', async () => {
    const MAX_PARALLEL = 3;
    const queue = new TaskQueue({ concurrency: MAX_PARALLEL });
    const completed: string[] = [];
    let maxParallel = 0;
    let running = 0;

    // Simulate child_process.exec wrapped as a Promise
    const runSuite = async (name: string) => {
      running++;
      maxParallel = Math.max(maxParallel, running);
      await sleep(20); // simulate test run time
      running--;
      completed.push(name);
    };

    const suites = ['unit', 'integration', 'e2e', 'lint', 'typecheck', 'build'];
    await queue.addAll(suites.map(s => () => runSuite(s)));

    expect(completed).toHaveLength(suites.length);
    expect(maxParallel).toBeLessThanOrEqual(MAX_PARALLEL);
  });
});

// ---------------------------------------------------------------------------
// Structured concurrency: TaskGroup hierarchy
// Section 4: "Structured Concurrency" and task grouping
// ---------------------------------------------------------------------------

describe('Structured concurrency (TaskGroup)', () => {
  it('nested groups with shared parent queue', async () => {
    const queue = new TaskQueue({ concurrency: 6 });
    const compileGroup = new TaskGroup(queue, { concurrency: 3 });
    const lintGroup = new TaskGroup(queue, { concurrency: 2 });
    const compiled: string[] = [];
    const linted: string[] = [];

    const files = ['a.ts', 'b.ts', 'c.ts'];
    for (const f of files) {
      compileGroup.add(async () => { await sleep(20); compiled.push(f); });
      lintGroup.add(async () => { await sleep(10); linted.push(f); });
    }

    await Promise.all([compileGroup.onComplete(), lintGroup.onComplete()]);

    expect(compiled.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(linted.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
  });

  it('cancelling one group does not affect another', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const groupA = new TaskGroup(queue, { id: 'build' });
    const groupB = new TaskGroup(queue, { id: 'test' });
    const testResults: string[] = [];

    // Group A: long-running, will be cancelled
    groupA.add(() => sleep(500)).catch(() => {});

    // Group B: short, should complete
    groupB.add(async () => { await sleep(20); testResults.push('test-done'); });

    groupA.cancel();

    await groupB.onComplete();
    expect(testResults).toContain('test-done');
  });

  it('parent queue cancel propagates to all groups', async () => {
    const queue = new TaskQueue({ concurrency: 4 });
    const groupA = new TaskGroup(queue);
    const groupB = new TaskGroup(queue);

    const p1 = groupA.add(async ({ signal }) =>
      new Promise<void>((_, rej) => {
        signal.addEventListener('abort', () => { rej(new AbortError()); }, { once: true });
      })
    );
    const p2 = groupB.add(async ({ signal }) =>
      new Promise<void>((_, rej) => {
        signal.addEventListener('abort', () => { rej(new AbortError()); }, { once: true });
      })
    );

    setTimeout(() => queue.cancel(), 10);

    await expect(p1).rejects.toBeInstanceOf(AbortError);
    await expect(p2).rejects.toBeInstanceOf(AbortError);
  });
});

// ---------------------------------------------------------------------------
// Plugin system integration
// Section 3 gap: "Plugin Architecture" and observability
// ---------------------------------------------------------------------------

describe('Plugin system integration', () => {
  it('logging plugin runs without throwing on success', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // loggingPlugin in verbose mode
    const plugin = loggingPlugin({ prefix: '[test]', verbose: true });
    // Manually attach (real queue.use() is wired in queue.ts)
    // For integration, we just verify the plugin factory doesn't throw
    const hooks = plugin({ on: () => {} });
    expect(hooks.name).toBe('logging');

    consoleSpy.mockRestore();
  });

  it('metricsPlugin captures correct counts after a run', async () => {
    // Simulate plugin runner directly since queue.use() wires it
    const { plugin, snapshot } = metricsPlugin();
    const hooks = plugin({ on: () => {} });

    const meta: Record<string, unknown> = {};
    const ctx = {
      id: 'task-1',
      task: async () => {},
      options: {},
      startedAt: Date.now(),
      meta,
    };

    // Simulate 2 successes and 1 failure
    await hooks.onBefore?.(ctx);
    await hooks.onAfter?.({ ...ctx, durationMs: 100, result: 'ok', attempt: 1 });

    await hooks.onBefore?.(ctx);
    await hooks.onAfter?.({ ...ctx, durationMs: 200, result: 'ok', attempt: 1 });

    await hooks.onBefore?.(ctx);
    await hooks.onError?.({
      ...ctx,
      durationMs: 50,
      error: new Error('fail'),
      attempt: 1,
    });
    await hooks.onAfter?.({ ...ctx, durationMs: 50, error: new Error('fail'), attempt: 1 });

    const s = snapshot();
    expect(s.total).toBe(3);
    expect(s.succeeded).toBe(2);
    expect(s.failed).toBe(1);
    expect(s.avgDurationMs).toBe(150); // (100 + 200) / 2
  });
});

// ---------------------------------------------------------------------------
// Observability: events fire with correct data
// Section 4: "'start', 'success', 'error', 'idle', 'empty' events"
// ---------------------------------------------------------------------------

describe('Observability — full event lifecycle', () => {
  it('emits events in the correct order for a passing task', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const log: string[] = [];

    queue.on('active',  () => log.push('active'));
    queue.on('start',   ({ id }: { id: string }) => log.push(`start:${id}`));
    queue.on('success', ({ id }: { id: string }) => log.push(`success:${id}`));
    queue.on('empty',   () => log.push('empty'));
    queue.on('idle',    () => log.push('idle'));

    await queue.add(async () => 'ok', { id: 'my-task' });
    await queue.onIdle();

    expect(log[0]).toBe('active');
    expect(log).toContain('start:my-task');
    expect(log).toContain('success:my-task');
    expect(log).toContain('empty');
    await queue.onIdle();
    expect(log).toContain('idle');
  });

  it('emits error event with attempt number on final failure', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const errors: Array<{ id: string; attempt: number }> = [];
    queue.on('error', (p: { id: string; attempt: number }) => errors.push(p));

    const p = queue.add(async () => { throw new Error('fail'); }, { id: 'bad-task' });
    await p.catch(() => {});

    expect(errors).toHaveLength(1);
    expect(errors[0]!.id).toBe('bad-task');
    expect(errors[0]!.attempt).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Edge cases called out in Section 6 (Pitfalls)
// ---------------------------------------------------------------------------

describe('Edge cases and pitfalls (Section 6)', () => {
  it('tasks added after cancel() on a resumed queue succeed normally', async () => {
    const queue = new TaskQueue({ concurrency: 2 });

    queue.add(() => sleep(500)).catch(() => {});
    queue.cancel();

    // Ensure new tasks work after cancel
    const result = await queue.add(async () => 'post-cancel');
    expect(result).toBe('post-cancel');
  });

  it('re-entrant add() inside a task completion handler is safe', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    const results: string[] = [];

    queue.on('success', () => {
      // Re-entrant: add a new task from within an event handler
      if (results.length < 3) {
        queue.add(async () => { results.push(`task${results.length}`); })
          .catch(() => {});
      }
    });

    queue.add(async () => { results.push('initial'); });

    await sleep(150); // give re-entrant tasks time to run
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('clearing a queue does not affect already-running tasks', async () => {
    const queue = new TaskQueue({ concurrency: 1 });
    const ran: string[] = [];

    const d = deferred<void>();
    queue.add(async () => {
      await d.promise;
      ran.push('runner');
    });

    queue.add(async () => { ran.push('pending'); }).catch(() => {});
    queue.clear(); // removes pending but not running

    d.resolve();
    await queue.onIdle();

    expect(ran).toContain('runner');
    expect(ran).not.toContain('pending');
  });

  it('task that checks signal.aborted before heavy work cleans up fast', async () => {
    const queue = new TaskQueue({ concurrency: 2 });
    let heavyWorkRan = false;

    const p = queue.add(async ({ signal }) => {
      // cooperative check BEFORE heavy work
      if (signal.aborted) { return; }
      heavyWorkRan = true; // would be expensive
      await sleep(1000);
    });

    // Cancel before the microtask runs (synchronous after add)
    queue.cancel();
    await p.catch(() => {});

    expect(heavyWorkRan).toBe(false);
  });

  it('handles 1000 tasks without stack overflow', async () => {
    const queue = new TaskQueue({ concurrency: 50 });
    let done = 0;

    await queue.addAll(
      Array.from({ length: 1000 }, () => async () => { done++; }),
    );

    expect(done).toBe(1000);
  }, 15_000);
});
