---
name: rolldown
description: >-
  Bundle JavaScript with Rolldown, the Rust-based Rollup-compatible bundler
  that powers Vite 8. Use when someone asks for "Rolldown", "Rust Rollup",
  "fast Rollup alternative", "Vite 8 bundler", or "OXC bundler". Covers config, CLI, library builds, built-in TypeScript and CommonJS handling, and migration from Rollup.
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.12+ (rolldown 1.x engines field)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/rolldown/rolldown
  category: devops
  tags: ["bundling", "rolldown", "rollup", "rust", "vite"]
---

# Rolldown

## Overview

Rolldown is a Rust bundler with a Rollup-compatible plugin and config API, built on the OXC toolchain. It reached 1.x (1.2.15 checked on 2026-10-24) and is the bundler inside Vite 8 (`vite@8.3.5` depends on `rolldown ~1.2`). Use it directly for library and app builds when Rollup is slow. It handles TypeScript, JSX, Node module resolution and CommonJS dependencies without extra plugins. The npm package needs Node `^20.19.0 || >=22.12.0`.

## Instructions

### Setup

```bash
npm install -D rolldown
```

The config file is loaded as an ES module. Set `"type": "module"` in `package.json` or name the file `rolldown.config.mjs`; with a plain `.js` file in a CommonJS package the build fails with "Failed to load the ES module".

### Basic configuration

```javascript
// rolldown.config.js
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

### Library build with two formats

```javascript
// rolldown.config.js
import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/index.ts",
  external: ["react", "react-dom"], // peer dependencies stay out of the bundle
  output: [
    { dir: "dist", format: "esm", entryFileNames: "[name].js", sourcemap: true },
    { dir: "dist", format: "cjs", entryFileNames: "[name].cjs", sourcemap: true },
  ],
});
```

### Plugins

Rollup plugins that use standard hooks usually work; the plugin object is passed in `plugins`. Rolldown warns (`checks.preferBuiltinFeature`) when you use a plugin that duplicates a built-in feature, so drop `@rollup/plugin-node-resolve`, `@rollup/plugin-commonjs` and `@rollup/plugin-typescript` first. Type declarations (`.d.ts`) are not produced by the bundler core; add the separate `rolldown-plugin-dts` package for that (it needs Rolldown 1.2+ and Node 22.18+).

### CLI

```bash
npx rolldown -c                       # use rolldown.config.js
npx rolldown -c rolldown.config.mjs   # explicit config file
npx rolldown -c --watch               # rebuild on change
npx rolldown src/index.ts -d dist -f esm -m   # no config: input, out dir, format, minify
```

Other flags from `rolldown --help`: `-o/--file` (single file), `-e/--external`, `-s/--sourcemap`, `-p/--platform` (node, browser, neutral), `--tsconfig`, `--cleanDir`.

### Migrating from Rollup

1. `npm uninstall rollup @rollup/plugin-node-resolve @rollup/plugin-commonjs @rollup/plugin-typescript` and `npm install -D rolldown`.
2. Rename `rollup.config.js` to `rolldown.config.js` (or `.mjs`) and change the import to `import { defineConfig } from "rolldown"`.
3. Change scripts from `rollup -c` to `rolldown -c`.
4. Build and compare the output; check any plugin that relies on unusual hooks.

### Vite

Vite 8 already uses Rolldown for both dev dependency optimization and production builds, so a Vite project needs no separate install. Put bundler options under `build.rolldownOptions` in `vite.config.ts` and check your plugins against the Vite 8 migration guide.

## Examples

### Example 1: Migrate a Rollup library build

**User prompt:** "My library uses Rollup with the typescript and commonjs plugins and builds take 40 seconds. Move it to Rolldown."

The agent removes `rollup` and the three `@rollup/plugin-*` packages, installs `rolldown`, writes the two-format config above with `external: ["react"]`, and sets `"type": "module"`. It runs `npx rolldown -c`; the result is `dist/index.js` and `dist/index.cjs` with `.map` files, and the console prints each chunk with its size and a line like `Finished in 7 ms` for a small project. It then asks whether `.d.ts` files are needed and adds `rolldown-plugin-dts` if so.

### Example 2: Bundle a script with a CommonJS dependency, no config

**User prompt:** "Bundle src/b.ts, which imports left-pad, into one minified ESM file."

The agent runs `npx rolldown src/b.ts -d out -f esm -m`. The CommonJS dependency is resolved from `node_modules` and converted without plugins, and the output appears in `out/b.js`.

## Guidelines

- The config is an ES module; a CommonJS package needs `.mjs` or `"type": "module"`.
- Do not carry over Rollup's resolve, commonjs or TypeScript plugins; they are built in.
- Declaration files need `rolldown-plugin-dts`; the bundler alone does not emit them.
- Mark peer dependencies as `external` in library builds, or they get bundled.
- Plugins that depend on Rollup internals outside the documented hooks may fail; test the build output.
- Inside a Vite project, configure through Vite instead of running Rolldown separately.
