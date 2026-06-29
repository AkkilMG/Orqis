'use strict';

/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // Intentionally NOT setting `project` here — type-aware rules require
    // a matching TS version. We rely on tsc for type checking instead.
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    // ── TypeScript ──────────────────────────────────────────────────────────
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': [
      'error',
      { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
    ],
    // Allow non-null assertions in source (we use them carefully in the heap)
    '@typescript-eslint/no-non-null-assertion': 'off',
    // Allow `void promise` pattern for fire-and-forget
    '@typescript-eslint/no-floating-promises': 'off',

    // ── Style ────────────────────────────────────────────────────────────────
    'curly': ['error', 'all'],
    'prefer-const': 'error',
    'no-var': 'error',
    eqeqeq: ['error', 'always', { null: 'ignore' }],
    'no-throw-literal': 'error',
    // Console is intentional in plugins.ts (plugin error logging)
    'no-console': 'off',

    // Allow .js extensions on local imports (Node ESM requirement)
    'no-restricted-imports': 'off',
  },
  overrides: [
    {
      files: ['test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'curly': 'off',
      },
    },
  ],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', '*.cjs', '*.mjs', 'vitest.config.ts'],
};
