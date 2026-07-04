# Installation

## Requirements

- **Node.js ≥ 16** (for `AbortController` and `AbortSignal` native support)
- npm, pnpm, or yarn

## Install

```bash
npm install orqis
# or
pnpm add orqis
# or
yarn add orqis
```

Orqis ships a **dual package** — it works with both ESM (`import`) and CommonJS (`require`) out of the box, with no configuration needed. It has **zero production dependencies**.

## Bundle Size

The entire library is under **5 KB minzipped**. No `node_modules` subtree to audit, no transitive CVE surface, nothing that needs updating when a dependency releases a patch.

## Quick Check

```bash
npm ls orqis
```

That should show the installed version. No other commands needed — Orqis is ready to import.
