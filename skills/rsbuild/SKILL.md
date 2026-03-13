---
name: rsbuild
description: >-
   You are an expert in Rsbuild, the Rspack-based build tool for web
  applications. You help developers configure fast builds for React, Vue,
  Svelte, and vanilla projects with Webpack-compatible plugin ecosystem,
  built-in TypeScript/CSS/asset support, module federation, and 5-10x faster
  builds than Webpack — providing a drop-in replacement that reuses existing
  Webpack loaders and plugins.
category: Developer Tools
tags: [bundler, rust, rspack, fast, webpack-compatible, build-tool]
version: 1.0.0
author: terminal-skills
---

# Rsbuild — Rust-Powered Build Tool

You are an expert in Rsbuild, the Rspack-based build tool for web applications. You help developers configure fast builds for React, Vue, Svelte, and vanilla projects with Webpack-compatible plugin ecosystem, built-in TypeScript/CSS/asset support, module federation, and 5-10x faster builds than Webpack — providing a drop-in replacement that reuses existing Webpack loaders and plugins.

## Core Capabilities

### Configuration

```typescript
// rsbuild.config.ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { pluginSass } from "@rsbuild/plugin-sass";
import { pluginTypeCheck } from "@rsbuild/plugin-type-check";

export default defineConfig({
  plugins: [
    pluginReact(),
    pluginSass(),
    pluginTypeCheck(),
  ],
  source: {
    entry: { index: "./src/index.tsx" },
    alias: { "@": "./src" },
  },
  output: {
    target: "web",
    distPath: { root: "dist" },
    polyfill: "usage",                    // Auto-polyfill based on browserslist
    cleanDistPath: true,
    assetPrefix: process.env.CDN_URL || "/",
  },
  html: {
    title: "My App",
    favicon: "./src/assets/favicon.ico",
    template: "./public/index.html",
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  performance: {
    chunkSplit: {
      strategy: "split-by-experience",    // Auto-split React, lodash, etc.
    },
    bundleAnalyze: process.env.ANALYZE === "true"
      ? { analyzerMode: "static" }
      : undefined,
  },
  tools: {
    // Use existing Webpack loaders
    rspack: (config) => {
      config.module?.rules?.push({
        test: /\.graphql$/,
        use: "graphql-tag/loader",
      });
    },
  },
});
```

### Usage

```bash
# Create new project
npm create rsbuild@latest

# Development
npx rsbuild dev                           # HMR dev server

# Production build
npx rsbuild build                         # Optimized production bundle

# Preview
npx rsbuild preview                       # Serve production build locally
```

## Installation

```bash
npm install -D @rsbuild/core @rsbuild/plugin-react
```

## Best Practices

1. **Webpack compatibility** — Reuse existing Webpack loaders via `tools.rspack`; most plugins work without changes
2. **Plugin system** — Use official plugins for React, Vue, Svelte, Sass, Less, TypeScript; composable and fast
3. **Auto code splitting** — `split-by-experience` strategy auto-splits vendor libraries; optimal chunking out of box
4. **Polyfill on demand** — Set `polyfill: "usage"` with browserslist; only includes polyfills for target browsers
5. **Module Federation** — Built-in support for micro-frontends; share components between independently deployed apps
6. **Type checking** — Use `pluginTypeCheck()` for parallel TypeScript checking; doesn't slow down builds
7. **Proxy for API** — Configure dev server proxy; avoid CORS issues during development
8. **5-10x faster** — Rspack (Rust) core provides Webpack semantics at native speed; same configs, faster builds
