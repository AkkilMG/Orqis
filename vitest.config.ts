import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Allow imports with .js extension to resolve .ts files.
    // This handles Node ESM-style imports (e.g. '../src/queue.js' → '../src/queue.ts')
    // when running tests directly on TypeScript source via Vitest/Vite.
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  },
  test: {
    pool: 'forks',
    testTimeout: 10_000,
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
