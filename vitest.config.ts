import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Vitest runs TypeScript directly via ts-node/esbuild.
    // Our source uses Node ESM-style ".js" extensions on imports.
    // This alias rewrites them so Vite finds the actual .ts files.
    alias: [
      {
        find: /^(\.{1,2}\/.+)\.js$/,
        replacement: '$1',
      },
    ],
  },
  test: {
    // 'threads' (worker_threads) is required for vi.useFakeTimers() to work.
    // 'forks' (child_process) isolates fake timers per file but breaks
    // the shared-memory assumption that fake-timer mocking relies on.
    pool: 'threads',

    // Per-test timeout — individual tests can override with { timeout: N }
    testTimeout: 15_000,

    // TypeScript config for test files (rootDir covers both src/ and test/)
    typecheck: {
      tsconfig: './tsconfig.test.json',
    },

    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/types.ts'],
      thresholds: {
        lines:      85,
        functions:  85,
        branches:   80,
        statements: 85,
      },
    },
  },
});
