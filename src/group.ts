// ---------------------------------------------------------------------------
// Orqis – TaskGroup
// ---------------------------------------------------------------------------

import { randomUUID } from 'node:crypto';
import type { Task, TaskAddOptions } from './types.js';
import type { TaskQueue } from './queue.js';
import { AbortError } from './errors.js';

export interface GroupOptions {
  id?: string;
  concurrency?: number;
}

export class TaskGroup {
  readonly id: string;

  readonly #queue: TaskQueue;
  readonly #concurrency: number;
  readonly #controller: AbortController;

  #activeCount = 0;
  #pendingCount = 0;
  #completeResolvers: Array<() => void> = [];
  #completeRejectors: Array<(e: unknown) => void> = [];

  constructor(queue: TaskQueue, options: GroupOptions = {}) {
    this.#queue       = queue;
    this.id           = options.id ?? randomUUID();
    this.#concurrency = options.concurrency ?? Infinity;
    this.#controller  = new AbortController();

    // Listen on the queue's 'cancel' event (fired by queue.cancel()) rather
    // than queue.signal.addEventListener. queue.cancel() replaces the internal
    // AbortController, so the old signal's 'abort' listener would never fire
    // for a new cancel() call. The 'cancel' event is emitted reliably for
    // every pending task discard, but we need to detect when the QUEUE itself
    // is cancelled (i.e. running tasks are aborted). We do this by watching
    // the queue's EventEmitter for a special internal signal — the simplest
    // reliable approach is to listen on 'idle' after a cancel. But the cleanest
    // way is: queue.cancel() emits 'active' → false; instead we provide a
    // dedicated hook via the queue's signal getter which always returns the
    // current signal.
    //
    // Solution: poll queue.signal on each add(), and also attach to it lazily.
    // The group attaches a one-time listener to the CURRENT signal each time
    // add() is called, so it always has the live signal.
    this.#attachToQueueSignal(queue);
  }

  #attachToQueueSignal(queue: TaskQueue): void {
    const sig = queue.signal;
    if (sig.aborted) {
      this.cancel();
      return;
    }
    sig.addEventListener('abort', () => {
      if (!this.#controller.signal.aborted) {
        this.cancel();
      }
    }, { once: true });
  }

  get size(): number { return this.#pendingCount; }
  get pending(): number { return this.#activeCount; }

  add<T>(fn: Task<T>, opts: TaskAddOptions = {}): Promise<T> {
    if (this.#controller.signal.aborted) {
      return Promise.reject(new AbortError('TaskGroup has been cancelled'));
    }

    // Re-attach to queue signal in case queue.cancel() replaced the controller
    // since the last add(). The new signal needs a listener too.
    this.#attachToQueueSignal(this.#queue);

    this.#pendingCount++;
    this.#activeCount++;

    const signals: AbortSignal[] = [this.#controller.signal];
    if (opts.signal !== undefined) { signals.push(opts.signal); }

    const mergedSignal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any(signals)
        : signals[0] as AbortSignal;

    const promise = this.#queue.add(fn, {
      ...opts,
      signal: mergedSignal,
      id: opts.id ?? `${this.id}:${randomUUID()}`,
    });

    void promise
      .then(() => { this.#pendingCount--; })
      .catch(() => { this.#pendingCount--; })
      .finally(() => { this.#tryResolveComplete(); });

    return promise;
  }

  onComplete(): Promise<void> {
    if (this.#activeCount === 0 && this.#pendingCount === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      this.#completeResolvers.push(resolve);
      this.#completeRejectors.push(reject);
    });
  }

  cancel(): void {
    this.#controller.abort(new AbortError(`TaskGroup ${this.id} cancelled`));
    const rejectors = this.#completeRejectors;
    this.#completeResolvers = [];
    this.#completeRejectors = [];
    this.#activeCount = 0;
    this.#pendingCount = 0;
    for (const r of rejectors) { r(new AbortError()); }
  }

  #tryResolveComplete(): void {
    this.#activeCount = Math.max(0, this.#activeCount - 1);

    if (this.#activeCount === 0 && this.#pendingCount === 0) {
      const resolvers = this.#completeResolvers;
      this.#completeResolvers = [];
      this.#completeRejectors = [];
      for (const r of resolvers) { r(); }
    }
  }
}
