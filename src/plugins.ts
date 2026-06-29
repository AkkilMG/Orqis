// ---------------------------------------------------------------------------
// Orqis – Plugin / Middleware System
// ---------------------------------------------------------------------------

import type { Task, TaskAddOptions } from './types.js';

// ---------------------------------------------------------------------------
// Hook context types
// ---------------------------------------------------------------------------

export interface HookContext<T = unknown> {
  id: string;
  task: Task<T>;
  options: TaskAddOptions;
  startedAt: number;
  meta: Record<string, unknown>;
}

export interface BeforeHookContext<T = unknown> extends HookContext<T> {}

export interface AfterHookContext<T = unknown> extends HookContext<T> {
  durationMs: number;
  result?: T;
  error?: Error;
  attempt: number;
}

// ---------------------------------------------------------------------------
// Plugin interface
// ---------------------------------------------------------------------------

export interface PluginHooks<T = unknown> {
  name: string;
  onBefore?: (ctx: BeforeHookContext<T>) => void | Promise<void>;
  onAfter?: (ctx: AfterHookContext<T>) => void | Promise<void>;
  onError?: (ctx: AfterHookContext<T> & { error: Error }) => void | Promise<void>;
  onCancel?: (ctx: HookContext<T> & { reason: Error }) => void | Promise<void>;
}

export type OrqisPlugin<T = unknown> = (
  queue: { on: (event: string, listener: (...args: unknown[]) => void) => void }
) => PluginHooks<T>;

// ---------------------------------------------------------------------------
// PluginRunner
// ---------------------------------------------------------------------------

export class PluginRunner {
  readonly #hooks: Array<PluginHooks<unknown>> = [];

  register(
    plugin: OrqisPlugin,
    queue: { on: (event: string, listener: (...args: unknown[]) => void) => void },
  ): void {
    this.#hooks.push(plugin(queue) as PluginHooks<unknown>);
  }

  get hasPlugins(): boolean { return this.#hooks.length > 0; }

  async runBefore(ctx: BeforeHookContext): Promise<void> {
    for (const hook of this.#hooks) {
      if (hook.onBefore !== undefined) {
        await hook.onBefore(ctx);
      }
    }
  }

  async runAfter(ctx: AfterHookContext): Promise<void> {
    for (const hook of this.#hooks) {
      if (hook.onAfter !== undefined) {
        try {
          await hook.onAfter(ctx);
        } catch (err) {
          console.error(`[orqis] Plugin "${hook.name}" onAfter threw:`, err);
        }
      }
    }
  }

  async runError(ctx: AfterHookContext & { error: Error }): Promise<void> {
    for (const hook of this.#hooks) {
      if (hook.onError !== undefined) {
        try {
          await hook.onError(ctx);
        } catch (err) {
          console.error(`[orqis] Plugin "${hook.name}" onError threw:`, err);
        }
      }
    }
  }

  async runCancel(ctx: HookContext & { reason: Error }): Promise<void> {
    for (const hook of this.#hooks) {
      if (hook.onCancel !== undefined) {
        try {
          await hook.onCancel(ctx);
        } catch (err) {
          console.error(`[orqis] Plugin "${hook.name}" onCancel threw:`, err);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Built-in plugins
// ---------------------------------------------------------------------------

export function loggingPlugin(opts: { prefix?: string; verbose?: boolean } = {}): OrqisPlugin {
  const { prefix = '[orqis]', verbose = false } = opts;

  return (): PluginHooks => ({
    name: 'logging',

    onBefore: ({ id }) => {
      if (verbose) { console.log(`${prefix} start  ${id}`); }
    },

    onAfter: ({ id, durationMs, error }) => {
      if (error !== undefined) {
        console.error(`${prefix} error  ${id} (${durationMs}ms)`, error.message);
      } else if (verbose) {
        console.log(`${prefix} done   ${id} (${durationMs}ms)`);
      }
    },

    onCancel: ({ id }) => {
      if (verbose) { console.log(`${prefix} cancel ${id}`); }
    },
  });
}

export interface MetricsSnapshot {
  total: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  totalDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  avgDurationMs: number;
}

export function metricsPlugin(): {
  plugin: OrqisPlugin;
  snapshot: () => MetricsSnapshot;
} {
  const data: MetricsSnapshot = {
    total:          0,
    succeeded:      0,
    failed:         0,
    cancelled:      0,
    totalDurationMs: 0,
    minDurationMs:  Infinity,
    maxDurationMs:  0,
    avgDurationMs:  0,
  };

  const plugin: OrqisPlugin = (): PluginHooks => ({
    name: 'metrics',

    onBefore: () => { data.total++; },

    onAfter: ({ durationMs, error }) => {
      if (error !== undefined) {
        data.failed++;
      } else {
        data.succeeded++;
        data.totalDurationMs += durationMs;
        if (durationMs < data.minDurationMs) { data.minDurationMs = durationMs; }
        if (durationMs > data.maxDurationMs) { data.maxDurationMs = durationMs; }
        data.avgDurationMs =
          data.succeeded > 0 ? data.totalDurationMs / data.succeeded : 0;
      }
    },

    onCancel: () => { data.cancelled++; },
  });

  return {
    plugin,
    snapshot: () => ({ ...data }),
  };
}

export function retryObserverPlugin(
  onRetry: (id: string, attempt: number, delay: number) => void,
): OrqisPlugin {
  return (queue): PluginHooks => {
    queue.on('retry', (payload: unknown) => {
      const p = payload as { id: string; attempt: number; delay: number };
      onRetry(p.id, p.attempt, p.delay);
    });
    return { name: 'retry-observer' };
  };
}
