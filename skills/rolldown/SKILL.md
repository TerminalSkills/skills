---
name: rolldown
description: >-
  Bundle JavaScript with Rolldown — Rust-based Rollup replacement, future Vite
  bundler. Use when someone asks to "Rolldown", "Rust Rollup", "fast Rollup
  alternative", "future Vite bundler", "Rolldown bundler", or "OXC bundler".
  Covers Rollup-compatible config, Vite integration roadmap, performance
  comparison, and migration from Rollup.
license: Apache-2.0
compatibility: "Node.js 18+. Rollup-compatible API."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["bundling", "rolldown", "rollup", "rust", "vite", "oxc", "build-tools"]
---

# Rolldown

## Overview

Rolldown is a Rust-based JavaScript bundler designed to replace Rollup — and eventually become Vite's production bundler. Built on OXC (the Rust toolchain behind oxlint), it aims for full Rollup API compatibility with 10-100x better performance. Currently in active development; when stable, Vite will use Rolldown instead of Rollup for production builds, unifying dev and prod bundling.

## When to Use

- Rollup builds are slow on large projects
- Want to prepare for Vite's future bundler
- Building libraries where Rollup-compatible output matters
- Need faster bundling than Rollup without switching to webpack/esbuild
- Following the OXC ecosystem (oxlint → Rolldown → OXC resolver)

## Instructions

### Setup

```bash
npm install -D rolldown
```

### Basic Configuration

```javascript
// rolldown.config.js — Rollup-compatible config format
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
  },
});
```

### Library Build

```javascript
// rolldown.config.js — Build a library with multiple outputs
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  external: ["react", "react-dom"],  // Don't bundle peer deps
  output: [
    {
      dir: "dist",
      format: "esm",
      entryFileNames: "[name].js",
      sourcemap: true,
    },
    {
      dir: "dist",
      format: "cjs",
      entryFileNames: "[name].cjs",
      sourcemap: true,
    },
  ],
});
```

### With Plugins

```javascript
// rolldown.config.js — Using Rollup-compatible plugins
import { defineConfig } from "rolldown";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default defineConfig({
  input: "src/index.ts",
  plugins: [
    resolve(),       // Resolve node_modules
    commonjs(),      // Convert CommonJS to ESM
  ],
  output: {
    dir: "dist",
    format: "esm",
  },
});
```

### Build Commands

```bash
# Build
npx rolldown -c

# Build with specific config
npx rolldown -c rolldown.config.js

# Watch mode
npx rolldown -c --watch
```

### Migration from Rollup

```diff
// package.json — Swap the dependency
- "rollup": "^4.0.0"
+ "rolldown": "^1.0.0"

// Config is compatible — rename if needed
// rollup.config.js → rolldown.config.js (optional)
```

```javascript
// Most Rollup configs work unchanged. Key differences:
// ✅ TypeScript built-in — no @rollup/plugin-typescript needed
// ✅ Node resolve built-in — @rollup/plugin-node-resolve often unnecessary
// ✅ Most Rollup plugins compatible — plugin API is the same
// ⚠️ Some advanced plugin hooks may differ — check docs
```

## Examples

### Example 1: Migrate a Rollup library build

**User prompt:** "My library uses Rollup and builds are slow. Migrate to Rolldown."

The agent will swap rollup for rolldown, remove unnecessary plugins (TypeScript and node-resolve are built-in), and benchmark the improvement.

### Example 2: Prepare a Vite project for Rolldown

**User prompt:** "I want to be ready when Vite switches to Rolldown. What should I do?"

The agent will audit the current Vite config for Rollup-specific plugin usage, identify potential compatibility issues, and suggest config changes.

## Guidelines

- **Rollup-compatible config** — same format, most plugins work
- **TypeScript built-in** — no separate TypeScript plugin needed
- **Still in development** — API may change; check compatibility for production use
- **Vite integration coming** — Rolldown will replace Rollup in Vite's production builds
- **OXC ecosystem** — part of the Rust JS toolchain (oxlint, oxc-resolver, Rolldown)
- **10-100x faster than Rollup** — Rust parallelism over JavaScript
- **Tree shaking built-in** — same quality as Rollup
- **ESM-first** — designed for modern JavaScript output
- **Watch mode supported** — `--watch` for development
- **Plugin compatibility** — @rollup/plugin-* packages generally work
