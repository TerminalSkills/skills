---
name: tsup
description: >-
  Bundle TypeScript libraries with tsup — zero-config, powered by esbuild.
  Use when someone asks to "bundle a TypeScript library", "build npm package",
  "tsup", "publish TypeScript to npm", "build ESM and CJS", "bundle with
  esbuild", or "library bundling with zero config". Covers ESM/CJS dual
  output, declaration files, tree-shaking, and npm publishing.
license: Apache-2.0
compatibility: "Node.js 18+. TypeScript."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["bundling", "typescript", "npm", "tsup", "esbuild", "library"]
---

# tsup

## Overview

tsup bundles TypeScript libraries for npm publishing — zero config, powered by esbuild (100x faster than tsc). Outputs ESM + CJS dual packages, generates `.d.ts` declaration files, and handles tree-shaking. The standard tool for building TypeScript packages in 2025+.

## When to Use

- Publishing a TypeScript library to npm
- Need both ESM and CJS output (dual package)
- Building internal packages in a monorepo
- Want fast builds without configuring Rollup/Webpack
- Generating .d.ts files alongside bundled output

## Instructions

### Setup

```bash
npm install -D tsup typescript
```

### Zero Config

```json
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

```json
// package.json — Subpath exports
{
  "exports": {
    ".": { "import": "./dist/index.js", "require": "./dist/index.cjs" },
    "./client": { "import": "./dist/client.js", "require": "./dist/client.cjs" },
    "./server": { "import": "./dist/server.js", "require": "./dist/server.cjs" },
    "./utils": { "import": "./dist/utils.js", "require": "./dist/utils.cjs" }
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
    format: ["esm"],
    platform: "browser",          // Browser-optimized
    globalName: "MyLib",
    outDir: "dist/browser",
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

The agent will configure tsup for dual output, set up package.json exports, generate type declarations, and prepare for npm publish.

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
- **`exports` in package.json** — modern Node.js resolution, types condition first
- **`files: ["dist"]`** — only publish the built output
- **`treeshake: true`** — remove internal unused code from output
- **Watch mode** — `tsup --watch` for development
