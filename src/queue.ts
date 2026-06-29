// ---------------------------------------------------------------------------
// Orqis – TaskQueue
// ---------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

import type {
  Task,
  TaskAddOptions,
  TaskDescriptor,
  QueueOptions,
  QueueEvents,
  QueueEventName,
} from './types.js';
import { AbortError } from './errors.js';
import { runTask } from './scheduler.js';

// ---------------------------------------------------------------------------
// Minimal binary max-heap (used when priority: true)
// ---------------------------------------------------------------------------

class MaxHeap<T extends { priority: number }> {
  private readonly data: T[] = [];

  get size(): number { return this.data.length; }

  push(item: T): void {
    this.data.push(item);
    this.#bubbleUp(this.data.length - 1);
  }

  pop(): T | undefined {
    if (this.data.length === 0) { return undefined; }
    const top = this.data[0];
    const last = this.data.pop();
    if (this.data.length > 0 && last !== undefined) {
      this.data[0] = last;
      this.#sinkDown(0);
    }
    return top;
  }

  clear(): T[] {
    return this.data.splice(0);
  }

  #bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const p = this.data[parent];
      const c = this.data[i];
      if (p === undefined || c === undefined || p.priority >= c.priority) { break; }
      [this.data[parent], this.data[i]] = [c, p];
      i = parent;
    }
  }

  #sinkDown(i: number): void {
    const n = this.data.length;
    let running = true;
    while (running) {
      let largest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      const dl = this.data[l];
      const dr = this.data[r];
      const dg = this.data[largest];
      if (l < n && dl !== undefined && dg !== undefined && dl.priority > dg.priority) {
        largest = l;
      }
      const dl2 = this.data[largest];
      if (r < n && dr !== undefined && dl2 !== undefined && dr.priority > dl2.priority) {
        largest = r;
      }
      if (largest === i) {
        running = false;
      } else {
        const a = this.data[i];
        const b = this.data[largest];
        if (a !== undefined && b !== undefined) {
          [this.data[i], this.data[largest]] = [b, a];
        }
        i = largest;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal pending-queue item
// ---------------------------------------------------------------------------

interface PendingItem<T> extends TaskDescriptor<T> {
  priority: number;
}

// ---------------------------------------------------------------------------
// TaskQueue
// ---------------------------------------------------------------------------

export class TaskQueue extends EventEmitter {
  readonly #concurrency: number;
  readonly #usePriority: boolean;
  readonly #stopOnError: boolean;
  readonly #defaultTimeout: number;
  readonly #defaultRetry: QueueOptions['retry'];

  #activeCount = 0;
  #paused: boolean;
  #controller: AbortController;

  readonly #fifo: PendingItem<unknown>[] = [];
  readonly #heap: MaxHeap<PendingItem<unknown>>;

  #idleResolvers: Array<() => void> = [];
  #emptyResolvers: Array<() => void> = [];
  #wasIdle = true;

  constructor(options: QueueOptions = {}) {
    super();
    this.#concurrency    = options.concurrency ?? Infinity;
    this.#usePriority    = options.priority ?? false;
    this.#stopOnError    = options.stopOnError ?? false;
    this.#defaultTimeout = options.timeout ?? 0;
    this.#defaultRetry   = options.retry;
    this.#paused         = !(options.autoStart ?? true);
    this.#controller     = new AbortController();
    this.#heap           = new MaxHeap();

    if (options.abortSignal !== undefined) {
      const ext = options.abortSignal;
      if (ext.aborted) {
        this.#controller.abort(ext.reason);
      } else {
        ext.addEventListener('abort', () => { this.cancel(); }, { once: true });
      }
    }
  }

  get size(): number {
    return this.#usePriority ? this.#heap.size : this.#fifo.length;
  }
  get pending(): number { return this.#activeCount; }
  get isPaused(): boolean { return this.#paused; }
  get signal(): AbortSignal { return this.#controller.signal; }

  add<T>(task: Task<T>, opts: TaskAddOptions = {}): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.#controller.signal.aborted) {
        reject(new AbortError());
        return;
      }

      const descriptor = {
        fn:         task as Task<unknown>,
        attempt:    1,
        priority:   opts.priority ?? 0,
        controller: new AbortController(),
        resolve:    resolve as (v: unknown) => void,
        reject,
        options: {
          id:       opts.id ?? randomUUID(),
          priority: opts.priority ?? 0,
          timeout:  opts.timeout ?? this.#defaultTimeout,
          retry:    opts.retry ?? this.#defaultRetry,
          signal:   opts.signal,
        },
      } as PendingItem<unknown>;

      this.#enqueue(descriptor);
      this.#schedule();
    });
  }

  addAll<T>(tasks: Array<Task<T>>, opts: TaskAddOptions = {}): Promise<T[]> {
    const promises = tasks.map(t => this.add(t, opts));
    return Promise.all(promises);
  }

  onIdle(): Promise<void> {
    if (this.size === 0 && this.#activeCount === 0) { return Promise.resolve(); }
    return new Promise<void>(resolve => { this.#idleResolvers.push(resolve); });
  }

  onEmpty(): Promise<void> {
    if (this.size === 0) { return Promise.resolve(); }
    return new Promise<void>(resolve => { this.#emptyResolvers.push(resolve); });
  }

  pause(): void { this.#paused = true; }

  resume(): void {
    this.#paused = false;
    this.#schedule();
  }

  clear(): void {
    const items = this.#usePriority
      ? this.#heap.clear()
      : this.#fifo.splice(0);

    for (const item of items) {
      this.#emit('cancel', { id: item.options.id });
      item.reject(new AbortError());
    }
  }

  cancel(): void {
    // Capture the old controller BEFORE replacing it.
    // Running tasks hold a reference to old.signal; we abort that.
    const old = this.#controller;
    // New controller so add() calls after cancel() work immediately
    this.#controller = new AbortController();
    // Discard pending (uses new controller, so add() is already safe)
    this.clear();
    // Abort running tasks
    old.abort(new AbortError());
  }

  override on<K extends QueueEventName>(event: K, listener: QueueEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends QueueEventName>(event: K, listener: QueueEvents[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends QueueEventName>(event: K, listener: QueueEvents[K]): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  #enqueue(item: PendingItem<unknown>): void {
    if (this.#usePriority) {
      this.#heap.push(item);
    } else {
      this.#fifo.push(item);
    }
  }

  #dequeue(): PendingItem<unknown> | undefined {
    if (this.#usePriority) { return this.#heap.pop(); }
    return this.#fifo.shift();
  }

  #schedule(): void {
    if (this.#paused || this.#controller.signal.aborted) { return; }

    while (this.#activeCount < this.#concurrency && this.size > 0) {
      const item = this.#dequeue();
      if (item === undefined) { break; }

      if (this.#activeCount === 0 && this.#wasIdle) {
        this.#wasIdle = false;
        this.#emit('active');
      }

      this.#activeCount++;

      if (this.size === 0) {
        const emptyResolvers = this.#emptyResolvers;
        this.#emptyResolvers = [];
        this.#emit('empty');
        for (const r of emptyResolvers) { r(); }
      }

      // Use Promise microtask (not setImmediate) so vi.useFakeTimers() works.
      void Promise.resolve().then(() =>
        runTask(item, () => { this.#onSettle(); }, this.#emit.bind(this))
      );
    }
  }

  #onSettle(): void {
    this.#activeCount--;

    if (this.#stopOnError) {
      this.pause();
    }

    // Schedule next tasks + check idle in microtask so results are processed first
    void Promise.resolve().then(() => {
      this.#schedule();
      this.#checkIdle();
    });
  }

  #checkIdle(): void {
    if (this.size === 0 && this.#activeCount === 0 && !this.#wasIdle) {
      this.#wasIdle = true;
      const resolvers = this.#idleResolvers;
      this.#idleResolvers = [];
      this.#emit('idle');
      for (const r of resolvers) { r(); }
    }
  }

  #emit(event: string, payload?: unknown): void {
    // Node.js EventEmitter throws if 'error' is emitted with no listener.
    // Guard against this so unhandled task failures don't crash the process.
    if (event === 'error' && this.listenerCount('error') === 0) {
      return;
    }
    if (payload !== undefined) {
      super.emit(event, payload);
    } else {
      super.emit(event);
    }
  }
}
