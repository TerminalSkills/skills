---
name: rsbuild
description: >-
  Rsbuild is a Rspack-based build tool for web applications with a built-in dev server, TypeScript, CSS and asset support, and 5 to 10 times faster builds than webpack. Use when a developer asks to set up Rsbuild for React, Vue, Svelte or vanilla projects, migrate from webpack, Create React App or Vite, configure the dev server proxy, code splitting or Module Federation, or upgrade Rsbuild v1 to v2.
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.12+ (Rsbuild v2); Rsbuild v1 supports Node.js 18.12+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["bundler", "rspack", "build-tool", "webpack-migration", "react"]
  repository: https://github.com/web-infra-dev/rsbuild
---

# Rsbuild — Rspack-Powered Build Tool

## Overview

Rsbuild is a build tool from the Rstack team built on Rspack, the Rust bundler that follows webpack's architecture. It gives you a dev server with HMR, production builds, TypeScript, CSS (PostCSS, CSS Modules, Sass and Less through plugins), assets, HTML generation, code splitting and Module Federation with sensible defaults, so a project needs little configuration. Rspack accepts most webpack loaders, which eases migration, but not every webpack plugin works; check each one. Rsbuild v2 (current, 2.x) is a pure ESM package on Rspack v2; the v1 to v2 changes below trip up older configs.

## Instructions

### 1. Create or add

```bash
npm create rsbuild@latest          # templates: vanilla, react, vue, lit, preact, svelte, solid
npm add -D @rsbuild/core @rsbuild/plugin-react   # to add to an existing project
```

Scripts: `rsbuild dev` (dev server with HMR), `rsbuild build` (production bundle into `dist/`), `rsbuild preview` (serve the build locally). Useful flags: `--open`, `--port 3001`, `--host` (listen on the network), `--mode`, `-c rsbuild.staging.config.ts`, `--environment web`. Rsbuild v2 requires `@rsbuild/plugin-react` 2.x and `@rsbuild/plugin-svgr` 2.x alongside `@rsbuild/core` 2.x.

### 2. Configuration (v2)

```typescript
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSass } from "@rsbuild/plugin-sass";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

export default defineConfig({
  plugins: [pluginReact(), pluginSass(), pluginTypeCheck()],
  source: {
    entry: { index: "./src/index.tsx" },
  },
  resolve: {
    alias: { "@": "./src" },              // v2: was source.alias
  },
  output: {
    target: "web",
    distPath: { root: "dist" },
    assetPrefix: process.env.CDN_URL ?? "/",
    polyfill: "usage",                    // default "off"; needs core-js installed
  },
  html: {
    title: "Acme Dashboard",
    template: "./static/index.html",
  },
  server: {
    port: 3000,
    proxy: {
      "/api": { target: "http://localhost:8080" },   // changeOrigin defaults to true in v2
    },
  },
  splitChunks: { preset: "default" },     // v2: replaces performance.chunkSplit
  tools: {
    rspack: (config) => {                 // object form is deep-merged; function form can override
      config.module?.rules?.push({ test: /\.graphql$/, use: "graphql-tag/loader" });
    },
  },
});
```

`polyfill: "usage"` or `"entry"` needs `npm add core-js`, which is an optional peer dependency in v2. `@rsbuild/plugin-type-check` runs TypeScript checking in a separate process, so it does not slow the build. Module Federation: set `moduleFederation.options`, and in v2 install `@module-federation/runtime-tools` when using Module Federation v1.5 options.

### 3. Upgrading v1 to v2

- Node.js 20.19+ or 22.12+; `@rsbuild/core` is pure ESM; upgrade the React, SVGR and other plugins to their v2 releases (`npx taze major --include /rsbuild/ -w`).
- Removed: `source.alias` (use `resolve.alias`), `source.aliasStrategy` (use `resolve.aliasStrategy`), `performance.bundleAnalyze` (use Rsdoctor or register `webpack-bundle-analyzer` via `tools.rspack`), `performance.removeMomentLocale`, `performance.profile`.
- `performance.chunkSplit` is deprecated in favour of top-level `splitChunks`: `split-by-experience` becomes `preset: "default"`, `split-by-module` becomes `"per-package"`, `single-vendor` stays, `custom` becomes `"none"`.
- `server.host` now defaults to `localhost` (was `0.0.0.0`); use `--host` or set it to reach the server from a phone or another machine.
- Default browserslist moved to "baseline widely available on 2025-05-01" (Chrome 107, Safari 16); a `.browserslistrc` or `package.json` browserslist still wins. Node target defaults to Node 20+.
- Node builds (`output.target: "node"`) emit ESM and are not minified by default.
- Proxy: `context` becomes `pathFilter`; events use the unified `on` option.
- Default decorators version is `2023-11`.

### 4. Migrating

webpack: remove `webpack`, `webpack-cli`, `webpack-dev-server`, add `@rsbuild/core`, translate `webpack.config.js` into `rsbuild.config.ts`, keep custom loaders through `tools.rspack`, then check each plugin against Rspack's compatibility list. Create React App, Vue CLI and Vite have dedicated migration guides on rsbuild.rs.

## Examples

### Example 1: "Move our CRA app to Rsbuild"

```bash
npm remove react-scripts
npm add -D @rsbuild/core @rsbuild/plugin-react
```

Add the `rsbuild.config.ts` above (with `source.entry` pointing at `src/index.tsx` and `html.template` at `public/index.html` if you use one), change scripts to `"dev": "rsbuild dev"`, `"build": "rsbuild build"`. Result: `npm run dev` starts at `http://localhost:3000` with HMR and `npm run build` writes hashed files to `dist/static/`.

### Example 2: "Rsbuild build broke after upgrading to 2.x"

Typical errors and fixes: an unknown `source.alias` or `performance.bundleAnalyze` option means moving to `resolve.alias` or Rsdoctor; `Cannot find module 'core-js'` means `npm add core-js`; "require() of ES Module" in a CommonJS config means renaming it to `rsbuild.config.mjs` or `.ts` or setting `"type": "module"`; phones cannot reach the dev server because the host is now `localhost`, so run `rsbuild dev --host`. Result: after these edits `rsbuild build` completes and prints the output sizes.

## Guidelines

- Run builds on a supported Node version; v2 no longer works on Node 18.
- Prefer built-in options and official plugins over `tools.rspack`; its built-in config can change between releases without semver notice.
- Check polyfill needs against your browserslist; the v2 default targets newer browsers, so older ones need an explicit `.browserslistrc` and `output.polyfill`.
- Do not expose the dev server on `0.0.0.0` on shared networks unless needed.
- Analyze bundle size with Rsdoctor (`@rsdoctor/rspack-plugin`) rather than the removed bundle analyzer option.
- Environment variables reach client code only when prefixed `PUBLIC_` (see the env-vars guide); do not put secrets in them.
- Library bundling is a separate tool (Rslib); Rsbuild targets applications.
