// ---------------------------------------------------------------------------
// Orqis – Custom error classes
// ---------------------------------------------------------------------------

/**
 * Thrown (and emitted on the 'error' event) when a task exceeds its
 * configured timeout.
 */
export class TimeoutError extends Error {
  override readonly name = 'TimeoutError' as const;
  /** The timeout that was exceeded, in milliseconds. */
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Task timed out after ${timeoutMs}ms`);
    this.timeoutMs = timeoutMs;
    // Restore prototype chain (needed when targeting ES5 with tsc)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a task is cancelled — either via queue.cancel(),
 * group.cancel(), or an external AbortSignal.
 *
 * Note: AbortError is emitted via the 'cancel' event, not 'error',
 * because cancellation is intentional, not a failure.
 */
export class AbortError extends Error {
  override readonly name = 'AbortError' as const;

  constructor(message = 'Task was aborted') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
