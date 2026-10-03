---
name: turbopack
description: >-
  Turbopack is the Rust-based incremental bundler built into Next.js, the
  default for next dev and next build since Next.js 16. Use when someone asks
  to configure Turbopack, migrate a webpack config or loaders to the
  turbopack option in next.config, fix a Turbopack build error, or switch
  back to webpack with --webpack.
license: Apache-2.0
compatibility: 'Next.js 15+ (default bundler from Next.js 16); Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - bundler
    - rust
    - nextjs
    - hmr
    - webpack-migration
  repository: https://github.com/vercel/next.js
---

# Turbopack — Rust-Powered Bundler for Next.js

## Overview

Turbopack is an incremental bundler written in Rust and shipped inside Next.js. It builds one unified graph for client and server code, caches work down to the function level, bundles lazily (only what the dev server is asked for) and persists its cache to disk. Fast Refresh, React Server Components, CSS Modules, PostCSS, Sass, Lightning CSS and `tsconfig` path aliases work without configuration.

Status by version: dev stable in Next.js 15.0, build beta in 15.5, and since Next.js 16.0 Turbopack is the default for both `next dev` and `next build`. Turbopack is not usable on its own outside Next.js; the configuration below lives in `next.config`. Checked against Next.js 16.3 docs.

## Instructions

### Use it (or opt out)

```bash
npx create-next-app@latest        # Turbopack is the default bundler
npm install next@latest           # upgrade an existing project
next dev --webpack                # opt back into webpack
next build --webpack
```

No flag is needed on Next.js 16. On older 15.x, use `next dev --turbopack`. Platforms without native bindings (FreeBSD, OpenBSD) fall back to WASM, which has no Turbopack, so use `--webpack` there.

### Configure with the `turbopack` key

The option was `experimental.turbo` in Next.js 13 to 15.2 (still an alias). Since 15.3 it is the top-level `turbopack`; migrate with `npx @next/codemod@latest next-experimental-turbo-to-turbopack .`.

```typescript
// next.config.ts
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, ".."),            // monorepo / linked packages
    rules: {
      "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" },
    },
    resolveAlias: {
      underscore: "lodash",
      mocha: { browser: "mocha/browser-entry.js" },   // only the `browser` condition exists
    },
    resolveExtensions: [".tsx", ".ts", ".jsx", ".js", ".mjs", ".json"],
  },
};

export default nextConfig;
```

- `rules` run webpack loaders. Only loaders that return JavaScript work, options must be plain values (no `require()`d plugins), and rules are evaluated in order. Tested loaders include `@svgr/webpack`, `raw-loader`, `yaml-loader`, `graphql-tag/loader`, `svg-inline-loader`, `string-replace-loader`.
- Loader options use the object form: `{ loader: "@svgr/webpack", options: { icon: true } }`.
- Restrict a rule with `condition` (`browser`, `foreign`, `development`, `production`, `node`, or `{ path, content, query, contentType }` with `all` / `any` / `not`). Since 16.2 a rule can set `type` (`asset`, `raw`, `css`, ...) without a loader, and an import can opt in with `with { turbopackLoader: "raw-loader", turbopackAs: "*.js" }`.
- `resolveExtensions` replaces the default list, so include the defaults.
- `debugIds: true` (16.0+) adds debug IDs to bundles and source maps.

### Migrate from webpack

1. Delete the `webpack()` function from `next.config`; Turbopack ignores it. Move loaders to `turbopack.rules` and aliases to `turbopack.resolveAlias`.
2. Webpack plugins are not supported. Find a loader or built-in replacement, or stay on `--webpack`.
3. Replace Sass `~` imports (`@import '~bootstrap/...'`) with plain package paths, or alias `'~*': '*'`.
4. Babel: from Next.js 16 a Babel config file is picked up automatically (SWC still does Next's own transforms).

## Examples

### Example 1: Import SVGs as React components

Request: "My `import Logo from './logo.svg'` stopped working after upgrading to Next.js 16."

```bash
npm install --save-dev @svgr/webpack
```

Add the `*.svg` rule from the config above and restart `next dev`. Result: `<Logo />` renders the inline SVG. If you also need `.svg` as a URL elsewhere, use a `condition` array so only certain imports use SVGR.

### Example 2: Build fails on a webpack-only feature

Request: "`next build` errors because of `sassOptions.functions`."

Custom Sass functions cannot run under Turbopack (Rust cannot call your JavaScript). Either rewrite them as Sass or CSS variables, or pin the build to webpack:

```json
{ "scripts": { "dev": "next dev", "build": "next build --webpack", "start": "next start" } }
```

Result: dev stays on Turbopack while the production build uses webpack until the feature is replaced.

## Guidelines

- Turbopack does not type-check; run `tsc --noEmit` or rely on the editor.
- Not supported: webpack plugins, `webpack()` config, Yarn PnP, `experimental.urlImports`, `experimental.esmExternals`, `sassOptions.functions`, and CSS Modules `@value` / `:import` / `:export`.
- Output can differ subtly from webpack: Lightning CSS keeps 5 decimal digits (webpack 10), and CSS module order follows JS import order.
- Files outside the project root are not resolved; set `turbopack.root` for linked or monorepo packages.
- A filesystem cache is on by default for dev (`experimental.turbopackFileSystemCacheForDev`) and for builds; turn the build cache off if CI does not keep `.next/cache`.
- For slow or memory-heavy dev servers, run `next dev --internal-trace` and attach `.next-profiles/trace-turbopack.bin` to a Next.js issue.
- Do not quote speedups from old benchmarks; measure your own app.
