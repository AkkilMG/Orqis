# TaskGroup

A scoped batch of related tasks. A group lives inside a parent `TaskQueue` and can be independently awaited or cancelled without affecting sibling groups or the parent queue.

```ts
import { TaskGroup } from 'orqis/group';
```

## Constructor

```ts
new TaskGroup(queue: TaskQueue, options?: GroupOptions)
```

Creates a group backed by `queue`. Tasks added to the group consume slots from `queue`.

## GroupOptions

```ts
interface GroupOptions {
  id?: string;
  concurrency?: number;
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | auto UUID | A label used in event payloads and debug output. |
| `concurrency` | `number` | parent's concurrency | Additional inner concurrency cap for this group. Must be ≤ parent's concurrency. |

## Methods

### `add<T>(task, options?): Promise<T>`

Same signature as `TaskQueue.add()`. Enqueues into the parent queue, tagged to this group.

### `onComplete(): Promise<void>`

Returns a promise that resolves when every task added **to this group** has settled (regardless of success or failure).

```ts
await group.onComplete();
```

### `cancel(): void`

Aborts all pending and running tasks **belonging to this group only**. Tasks in other groups or ungrouped tasks on the parent queue are unaffected.

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Group identifier. |
| `size` | `number` | Pending tasks in this group. |
| `pending` | `number` | Running tasks in this group. |
