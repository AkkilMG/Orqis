---
name: Bug report
about: Something isn't working as documented
title: '[bug] '
labels: bug
assignees: ''
---

## Describe the bug

A clear and concise description of what the bug is.

## Minimal reproduction

```ts
import { TaskQueue } from 'orqis';

// Paste the smallest code that reproduces the issue
const queue = new TaskQueue({ concurrency: 2 });
```

## Expected behaviour

What you expected to happen.

## Actual behaviour

What actually happened. Include the full error message and stack trace if applicable.

## Environment

- **Orqis version**: <!-- e.g. 0.1.0 -->
- **Node.js version**: <!-- e.g. 20.12.0 -->
- **OS**: <!-- e.g. macOS 14, Ubuntu 22.04, Windows 11 -->
- **Package manager**: <!-- npm / pnpm / yarn + version -->
- **TypeScript version** (if applicable): <!-- e.g. 5.4.5 -->

## Additional context

Any other context about the problem (related issues, links, etc.).
