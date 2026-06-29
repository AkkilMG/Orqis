// ---------------------------------------------------------------------------
// Orqis – Shared TypeScript interfaces
// ---------------------------------------------------------------------------

/** Context object passed to every task function. */
export interface TaskContext {
  /**
   * Fires when the task is cancelled (via queue.cancel(), group.cancel(),
   * a timeout, or an external AbortSignal).  Pass this to fetch(), Node
   * streams, or any other abort-aware API.
   */
  signal: AbortSignal;
}

/** A user-supplied task function. */
export type Task<T = unknown> = (ctx: TaskContext) => T | Promise<T>;

// ---------------------------------------------------------------------------
// Retry / Backoff
// ---------------------------------------------------------------------------

export interface BackoffOptions {
  /** 'exponential': delay × factor^attempt  |  'fixed': always delay ms */
  type: 'exponential' | 'fixed';
  /** Base delay in milliseconds. */
  delay: number;
  /** Multiplier for exponential backoff (default: 2). */
  factor?: number;
  /**
   * Fraction of computed delay to add/subtract randomly (0–1).
   * E.g. 0.2 → ±20%.  Helps prevent thundering-herd on mass failures.
   */
  jitter?: number;
  /** Cap on computed delay (ms). Useful for unbounded exponential growth. */
  maxDelay?: number;
}

export interface RetryOptions {
  /**
   * Total number of attempts, including the first.
   * 1 = no retry, 3 = initial + 2 retries.
   */
  attempts: number;
  /** Delay strategy between retries.  Omit for immediate re-enqueue. */
  backoff?: BackoffOptions;
}

// ---------------------------------------------------------------------------
// Queue options
// ---------------------------------------------------------------------------

export interface QueueOptions {
  /** Max tasks running simultaneously (default: Infinity). */
  concurrency?: number;
  /** Begin processing immediately on add() (default: true). */
  autoStart?: boolean;
  /** Default timeout in ms applied to every task. */
  timeout?: number;
  /** Default retry policy applied to every task. */
  retry?: RetryOptions;
  /**
   * When true, the pending queue is a binary max-heap sorted by
   * TaskAddOptions.priority (higher = sooner).  Default: false (FIFO).
   */
  priority?: boolean;
  /**
   * External AbortSignal.  When it fires, the queue behaves as if
   * cancel() were called.
   */
  abortSignal?: AbortSignal;
  /**
   * When true, the queue pauses and rejects onIdle() on the first
   * unretried failure.  Default: false.
   */
  stopOnError?: boolean;
}

// ---------------------------------------------------------------------------
// Per-task add options
// ---------------------------------------------------------------------------

export interface TaskAddOptions {
  /**
   * Higher values run earlier.  Only effective when QueueOptions.priority
   * is true.  Default: 0.
   */
  priority?: number;
  /** Override the queue-level timeout for this task (ms). 0 = no timeout. */
  timeout?: number;
  /**
   * Additional external AbortSignal.  The task's ctx.signal fires when
   * either this signal or the queue's own signal fires.
   */
  signal?: AbortSignal;
  /** Override the queue-level retry policy for this task. */
  retry?: RetryOptions;
  /** Optional label used in events and debug output. */
  id?: string;
}

// ---------------------------------------------------------------------------
// Internal task descriptor (not exported to consumers)
// ---------------------------------------------------------------------------

export interface TaskDescriptor<T = unknown> {
  fn: Task<T>;
  options: Required<Omit<TaskAddOptions, 'signal'>> & { signal?: AbortSignal };
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  attempt: number;
  controller: AbortController;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type QueueEventName =
  | 'start'
  | 'success'
  | 'error'
  | 'retry'
  | 'timeout'
  | 'cancel'
  | 'idle'
  | 'empty'
  | 'active';

export interface StartPayload  { id: string }
export interface SuccessPayload<T = unknown> { id: string; result: T; durationMs: number }
export interface ErrorPayload   { id: string; error: Error; attempt: number }
export interface RetryPayload   { id: string; attempt: number; delay: number }
export interface TimeoutPayload { id: string }
export interface CancelPayload  { id: string }

export type QueueEvents = {
  start:   (payload: StartPayload)   => void;
  success: (payload: SuccessPayload) => void;
  error:   (payload: ErrorPayload)   => void;
  retry:   (payload: RetryPayload)   => void;
  timeout: (payload: TimeoutPayload) => void;
  cancel:  (payload: CancelPayload)  => void;
  idle:    () => void;
  empty:   () => void;
  active:  () => void;
};
