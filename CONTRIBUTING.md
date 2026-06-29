# Contributing to Orqis

Thank you for your interest in contributing! This guide explains how to set up the project, write code, and submit changes.

---

## Development Setup

```bash
git clone https://github.com/AkkilMG/orqis.git
cd orqis
npm install
```

### Available Scripts

| Script | Purpose |
|--------|---------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm test` | Run the full test suite (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint TypeScript source files |
| `npm run typecheck` | Type-check without emitting |

---

## Project Structure

```
orqis/
├── src/
│   ├── index.ts          # Main exports (TaskQueue, errors)
│   ├── queue.ts          # TaskQueue implementation
│   ├── group.ts          # TaskGroup implementation
│   ├── scheduler.ts      # Scheduling loop
│   ├── retry.ts          # Retry/backoff logic
│   ├── errors.ts         # TimeoutError, AbortError
│   └── types.ts          # Shared TypeScript interfaces
├── test/
│   ├── queue.test.ts
│   ├── group.test.ts
│   ├── retry.test.ts
│   ├── timeout.test.ts
│   └── cancel.test.ts
├── docs/
│   ├── getting-started.md
│   ├── api/README.md
│   ├── recipes.md
│   ├── migration.md
│   ├── architecture.md
│   └── testing.md
├── package.json
├── tsconfig.json
├── CHANGELOG.md
├── CONTRIBUTING.md
└── README.md
```

---

## Guidelines

### Code Style

- All source is TypeScript. No `any` types.
- Follow existing patterns. Run `npm run lint` before committing.
- Prefer `const` over `let`. Avoid mutation of objects owned by the caller.
- Async functions should propagate errors via rejected Promises — never swallow silently.

### Tests

- Every behavioural change must be accompanied by a test.
- Use descriptive test names (`it('rejects with TimeoutError when task exceeds configured timeout')`).
- Avoid arbitrary `setTimeout` waits in tests — prefer fake timers (`vi.useFakeTimers()`).
- Aim to keep the test suite fast (< 5 seconds total on CI).

### Commits

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add per-task signal merging
fix: clear timeout on task cancel
docs: add retry recipe
test: cover stopOnError behaviour
chore: upgrade vitest to 2.x
```

### Pull Requests

1. Open a PR against `main`.
2. Include a short description of what changed and why.
3. Reference any related issues (`Closes #42`).
4. Update `CHANGELOG.md` under `[Unreleased]`.
5. Ensure `npm test`, `npm run typecheck`, and `npm run lint` all pass.

---

## Reporting Issues

Please use [GitHub Issues](https://github.com/AkkilMG/orqis/issues). Include:
- Node.js version and OS.
- A minimal reproduction (code snippet or repo link).
- Expected vs actual behaviour.

---

## Code of Conduct

This project follows the [Contributor Covenant v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/). Be kind, respectful, and constructive.
