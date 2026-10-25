---
name: swc
description: >-
  SWC (Speedy Web Compiler) is a Rust-based compiler and minifier for JavaScript and TypeScript, used as a faster replacement for Babel and Terser. Use when a user asks to compile TypeScript or JSX with swc, configure .swcrc, replace babel-jest with @swc/jest, minify code, use the @swc/core API, or understand why Next.js builds with SWC.
license: Apache-2.0
compatibility: "Node.js 20.19+ for @swc/cli 0.8 (@swc/core itself runs on older Node). @swc/core 1.x, @swc/cli 0.8, @swc/jest 0.2. Prebuilt native binaries for Linux, macOS and Windows."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "compiler, rust, typescript, babel-alternative, minifier"
  repository: https://github.com/swc-project/swc
---

# SWC — Rust-Based JavaScript and TypeScript Compiler

## Overview

SWC compiles TypeScript, JSX and modern JavaScript down to a chosen target, converts module formats and minifies output. It is a native Rust binary exposed to Node.js as `@swc/core`, so it is much faster than Babel on large codebases. It strips types but does not type-check; run `tsc --noEmit` separately. Next.js uses SWC internally, and Parcel and many Vite, Jest and webpack setups use it through plugins and loaders.

Packages: `@swc/core` (API), `@swc/cli` (the `swc` command), `@swc/jest` (Jest transformer), `swc-loader` (webpack), `@swc/helpers` (runtime helpers when `externalHelpers` is on).

## Instructions

### Install and compile

```bash
npm install -D @swc/core @swc/cli chokidar   # chokidar only for -w
npx swc src/index.ts -o dist/index.js     # one file
npx swc src -d dist --strip-leading-paths # directory -> dist/index.js (without the flag the output is dist/src/index.js)
npx swc src -d dist -w                    # watch
npx swc src -d dist -C module.type=commonjs   # override a .swcrc key
```

### `.swcrc`

```json
{
  "$schema": "https://swc.rs/schema.json",
  "jsc": {
    "parser": { "syntax": "typescript", "tsx": true, "decorators": true },
    "transform": {
      "react": { "runtime": "automatic" },
      "decoratorVersion": "2022-03"
    },
    "target": "es2020"
  },
  "module": { "type": "es6" },
  "sourceMaps": true
}
```

- `module.type` is one of `es6`, `commonjs`, `umd`, `amd`, `nodenext`; SWC never rewrites import specifiers, so write the `.js` extension yourself when the output runs as ESM on Node.
- `jsc.target` and `env` (browserslist targets, `env.targets`, `env.mode: "usage"` with `env.coreJs`) are alternatives (setting both fails with "`env` and `jsc.target` cannot be used together"): use `env` for browser support matrices, `jsc.target` for a fixed ES version.
- `jsc.paths` plus `jsc.baseUrl` rewrite tsconfig-style path aliases at compile time.

### Programmatic API

```typescript
import { minify, transform } from "@swc/core";

const { code, map } = await transform(source, {
  filename: "Greeting.tsx",   // needed so .swcrc and the parser are chosen correctly
  jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } }, target: "es2020" },
  module: { type: "es6" },
  sourceMaps: true,
});

const small = await minify("function add(first, second) { return first + second }", { compress: true, mangle: true });
```

`transformSync` and `minifySync` exist for build tools that cannot await. Prefer the async versions: they run on the thread pool.

### Minify

Either set `"minify": true` at the top level of `.swcrc` with options under `jsc.minify`, or call `minify()`:

```json
{ "minify": true, "jsc": { "minify": { "compress": { "drop_console": true, "passes": 2 }, "mangle": true } } }
```

There is no separate `swc-minify` command.

### Jest

```bash
npm install -D jest @swc/core @swc/jest
```

```javascript
// jest.config.js
module.exports = {
  transform: {
    "^.+\\.(t|j)sx?$": ["@swc/jest", {
      jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } } },
    }],
  },
};
```

If a `.swcrc` exists, `@swc/jest` reads it; passing inline options in the transform entry is the clearer route.

## Examples

### Example 1: Build a TypeScript library to ESM and CommonJS

Request: "Compile src to dist for both module systems, with source maps."

```bash
npx swc src -d dist/esm --strip-leading-paths -C module.type=es6 --source-maps
npx swc src -d dist/cjs --strip-leading-paths -C module.type=commonjs --source-maps
npx tsc --noEmit
```

Result: `dist/esm/index.js` and `dist/cjs/index.js` with `.js.map` files; the last command catches type errors because SWC does not.

### Example 2: Minified production bundle step without console logs

Request: "Minify this React component and remove console.log."

With the `.swcrc` above extended by `"minify": true` and `jsc.minify.compress.drop_console: true`, `npx swc src -d dist` turns a component with `console.log("render")` into one line of mangled JavaScript using `react/jsx-runtime` with no `console` call.

## Guidelines

- SWC does not type-check and does not emit `.d.ts` in the default setup (the experimental `jsc.experimental.emitIsolatedDts` needs explicit type annotations, as in TypeScript's `isolatedDeclarations`); keep `tsc` for declarations and checks.
- Without `--strip-leading-paths`, `swc src -d dist` writes to `dist/src`.
- With `"minify": true` at the top level SWC minifies every output; keep it in a production-only config (`npx swc src -d dist --config-file .swcrc.prod`).
- `isolatedModules` rules apply: re-exporting types needs `export type`.
- In Next.js, a custom `.babelrc` turns SWC off for that app; remove it unless a Babel plugin is required.
- Plugins are WebAssembly built against a specific `@swc/core` version range; upgrade them together.
- Speed-up figures vary by project; measure your own build instead of trusting headline multipliers.
