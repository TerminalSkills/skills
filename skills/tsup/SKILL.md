---
name: tsup
description: >-
  Bundle TypeScript libraries with tsup — zero-config, powered by esbuild.
  Use when someone asks to "bundle a TypeScript library", "build npm package",
  "tsup", "publish TypeScript to npm", "build ESM and CJS", "bundle with
  esbuild", or "library bundling with zero config". Covers ESM/CJS dual
  output, declaration files, tree-shaking, and npm publishing.
license: Apache-2.0
compatibility: "Node.js 22.18+ (tsup 9) or Node.js 18+ (tsup 8). TypeScript 5 or 6."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["bundling", "typescript", "tsup", "esbuild", "library"]
  repository: https://github.com/egoist/tsup
---

# tsup

## Overview

tsup bundles TypeScript libraries for npm publishing — zero config, powered by esbuild (100x faster than tsc). Outputs ESM + CJS dual packages, generates `.d.ts` declaration files, and handles tree-shaking. 

**Status:** tsup 9.0.0 (October 2026) is the current release, but the project README says it is no longer actively maintained and recommends [tsdown](https://tsdown.dev/guide/migrate-from-tsup) (a Rolldown-based successor with a migration guide). tsup still builds fine; use it for existing projects, and consider tsdown for new ones. tsup 9 requires Node.js 22.18+, 24.11+ or 26+; stay on tsup 8 for older Node.

## When to Use

- Publishing a TypeScript library to npm
- Need both ESM and CJS output (dual package)
- Building internal packages in a monorepo
- Want fast builds without configuring Rollup/Webpack
- Generating .d.ts files alongside bundled output

## Instructions

### Setup

```bash
npm install -D tsup typescript@6
```

`dts: true` needs the TypeScript compiler API, which TypeScript 7 no longer ships. With `typescript@7` the build stops with "rollup-plugin-dts requires the TypeScript compiler API"; install `typescript@6` (or add `@typescript/typescript6` as the error suggests).

### Zero Config

```jsonc
// package.json — Minimal setup
{
  "name": "my-lib",
  "version": "1.0.0",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch"
  }
}
```

```typescript
// tsup.config.ts — Build configuration
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],       // Dual ESM + CJS output
  dts: true,                     // Generate .d.ts files
  splitting: true,               // Code splitting for ESM
  clean: true,                   // Clean dist/ before build
  treeshake: true,               // Remove unused code
  sourcemap: true,
  minify: false,                 // Don't minify libraries
  outDir: "dist",
});
```

### Multiple Entry Points

```typescript
// tsup.config.ts — Library with subpath exports
import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    client: "src/client.ts",
    server: "src/server.ts",
    utils: "src/utils/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
});
```

```jsonc
// package.json — Subpath exports
{
  "exports": {
    ".": {
      "import": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
      "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
    },
    "./client": {
      "import": { "types": "./dist/client.d.ts", "default": "./dist/client.js" },
      "require": { "types": "./dist/client.d.cts", "default": "./dist/client.cjs" }
    }
  }
}
```

### Environment-Specific Builds

```typescript
// tsup.config.ts — Different builds for browser and Node
import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["iife"],             // globalName applies to IIFE output
    platform: "browser",          // Browser-optimized
    globalName: "MyLib",
    minify: true,
    outDir: "dist/browser",   // dist/browser/index.global.js
  },
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    platform: "node",             // Node.js optimized
    target: "node18",
    outDir: "dist/node",
    dts: true,
  },
]);
```

## Examples

### Example 1: Publish a TypeScript utility library

**User prompt:** "I have a collection of TypeScript utility functions. Package them for npm with ESM and CJS support."

The agent adds `tsup.config.ts` (entry `src/index.ts`, `format: ["esm", "cjs"]`, `dts: true`, `clean: true`) and the `exports` map above, then runs `npx tsup`. Result: `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` and `dist/index.d.cts`, which both `import` and `require` consumers resolve. This was built and loaded in Node 24 with tsup 9.0.0.

### Example 2: Build a React component library

**User prompt:** "Bundle my React component library with TypeScript types and tree-shaking."

The agent will set up tsup with React external, multiple entry points per component, CSS handling, and declaration file generation.

## Guidelines

- **`format: ["esm", "cjs"]`** — always ship both for maximum compatibility
- **`dts: true`** — generate TypeScript declarations (uses a separate process)
- **`clean: true`** — prevent stale files in dist/
- **Don't minify libraries** — let the consumer's bundler handle it
- **`external` for peer deps** — don't bundle React, Vue, etc.
- **`splitting` for ESM** — enables tree-shaking for consumers
- **File extensions** — with `"type": "module"`, ESM is `.js` and CJS is `.cjs` (types `.d.ts` / `.d.cts`). Without it, ESM becomes `.mjs` and CJS `.js`, so the `exports` paths must match
- **`exports` in package.json** — modern Node.js resolution, types condition first
- **`files: ["dist"]`** — only publish the built output
- **`treeshake: true`** — remove internal unused code from output
- **Watch mode** — `tsup --watch` for development
