// ---------------------------------------------------------------------------
// Orqis – Public API surface
// ---------------------------------------------------------------------------

export { TaskQueue } from './queue.js';
export { TaskGroup } from './group.js';
export { TimeoutError, AbortError } from './errors.js';

export type {
  // Core
  Task,
  TaskContext,
  // Options
  QueueOptions,
  TaskAddOptions,
  RetryOptions,
  BackoffOptions,
  // Events
  QueueEventName,
  QueueEvents,
  StartPayload,
  SuccessPayload,
  ErrorPayload,
  RetryPayload,
  TimeoutPayload,
  CancelPayload,
} from './types.js';

// Plugin / middleware system
export { PluginRunner, loggingPlugin, metricsPlugin, retryObserverPlugin } from './plugins.js';
export type {
  OrqisPlugin,
  PluginHooks,
  HookContext,
  BeforeHookContext,
  AfterHookContext,
  MetricsSnapshot,
} from './plugins.js';
