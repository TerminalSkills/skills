---
name: swc
description: >-
   You are an expert in SWC, the Rust-based JavaScript/TypeScript compiler.
  You help developers replace Babel and Terser with SWC for 20-70x faster
  compilation, minification, and bundling — used by Next.js, Vite, Parcel, and
  Deno as their default compiler, handling TypeScript stripping, JSX
  transformation, polyfill injection, and code minification at native speed.
category: Developer Tools
tags: [compiler, rust, fast, babel-alternative, typescript, minifier]
version: 1.0.0
author: terminal-skills
---

# SWC — Super-Fast Rust Compiler

You are an expert in SWC, the Rust-based JavaScript/TypeScript compiler. You help developers replace Babel and Terser with SWC for 20-70x faster compilation, minification, and bundling — used by Next.js, Vite, Parcel, and Deno as their default compiler, handling TypeScript stripping, JSX transformation, polyfill injection, and code minification at native speed.

## Core Capabilities

### Configuration

```json
// .swcrc
{
  "$schema": "https://json.schemastore.org/swcrc",
  "jsc": {
    "parser": {
      "syntax": "typescript",
      "tsx": true,
      "decorators": true,
      "dynamicImport": true
    },
    "transform": {
      "react": {
        "runtime": "automatic",
        "importSource": "react"
      },
      "decoratorVersion": "2022-03"
    },
    "target": "es2020",
    "minify": {
      "compress": {
        "dead_code": true,
        "drop_console": true,
        "passes": 2
      },
      "mangle": true
    }
  },
  "module": {
    "type": "es6",
    "strict": true,
    "lazy": false
  },
  "minify": true,
  "sourceMaps": true
}
```

### CLI Usage

```bash
# Compile single file
npx swc src/index.ts -o dist/index.js

# Compile directory
npx swc src -d dist --source-maps

# Watch mode
npx swc src -d dist -w

# Minify
npx swc-minify input.js -o output.min.js

# Performance comparison (10K file project):
# Babel: 32s compile
# SWC: 0.5s compile (64x faster)
```

### Programmatic API

```typescript
import { transform, transformSync } from "@swc/core";

// Async transform
const output = await transform(sourceCode, {
  filename: "app.tsx",
  jsc: {
    parser: { syntax: "typescript", tsx: true },
    transform: { react: { runtime: "automatic" } },
    target: "es2020",
  },
  module: { type: "es6" },
  sourceMaps: true,
});

console.log(output.code);
console.log(output.map);

// Sync (for build tools)
const syncOutput = transformSync(sourceCode, {
  jsc: { parser: { syntax: "typescript" }, target: "es2022" },
});
```

### Jest Integration

```javascript
// jest.config.js — Replace babel-jest with @swc/jest
module.exports = {
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", {
      jsc: {
        parser: { syntax: "typescript", tsx: true },
        transform: { react: { runtime: "automatic" } },
      },
    }],
  },
};
// Test suite runs 3-5x faster than with babel-jest
```

## Installation

```bash
npm install -D @swc/core @swc/cli
npm install -D @swc/jest                  # For Jest
```

## Best Practices

1. **Replace Babel** — SWC handles TypeScript, JSX, decorators, polyfills; drop `.babelrc` entirely
2. **Next.js default** — Next.js uses SWC by default; no configuration needed
3. **Jest speedup** — Replace `babel-jest` with `@swc/jest`; test suites run 3-5x faster
4. **Minification** — Replace Terser with SWC minifier; same quality, 20x faster
5. **Target wisely** — Set `target: "es2020"` for modern browsers; `"es5"` only for legacy support
6. **Drop console** — Enable `drop_console` in minify config for production; removes console.log automatically
7. **Source maps** — Always enable `sourceMaps: true`; SWC generates source maps at negligible cost
8. **Plugin system** — Write SWC plugins in Rust (WASM); for custom AST transforms beyond configuration
