---
name: rspack
description: >-
  Bundle JavaScript/TypeScript applications with Rspack — Rust-based webpack
  replacement that's 5-10x faster. Use when someone asks to "speed up webpack",
  "Rspack", "fast bundler", "Rust bundler for JavaScript", "replace webpack",
  "migrate from webpack", or "faster build times". Covers webpack compatibility,
  configuration, loaders, plugins, and migration from webpack.
license: Apache-2.0
compatibility: "Node.js 18+. Drop-in webpack replacement."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["bundling", "rspack", "webpack", "rust", "build-tools"]
---

# Rspack

## Overview

Rspack is a Rust-based JavaScript bundler fully compatible with webpack — same config format, same loaders, same plugins, 5-10x faster builds. Created by ByteDance, it's a drop-in webpack replacement: rename your config file, install Rspack, and your existing webpack project builds in a fraction of the time. No config rewrite, no loader migration, no plugin hunting.

## When to Use

- Webpack builds taking too long (>30 seconds)
- Want faster builds without rewriting config (unlike Vite migration)
- Large enterprise projects with heavy webpack configs
- Need webpack compatibility (loaders, plugins, config) with better performance
- Migration from Create React App or webpack-based setups

## Instructions

### New Project

```bash
npm create rspack@latest my-app
cd my-app
npm start
```

### Migrate from Webpack

```bash
# Install Rspack
npm install -D @rspack/core @rspack/cli

# Remove webpack
npm uninstall webpack webpack-cli webpack-dev-server
```

```javascript
// rspack.config.js — Almost identical to webpack.config.js
const { defineConfig } = require("@rspack/cli");
const { HtmlRspackPlugin } = require("@rspack/core");

module.exports = defineConfig({
  entry: "./src/index.tsx",
  output: {
    path: "./dist",
    filename: "[name].[contenthash].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: { "@": "./src" },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: "builtin:swc-loader",  // Built-in SWC — no babel needed
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: { react: { runtime: "automatic" } },
            },
          },
        },
      },
      {
        test: /\.css$/,
        type: "css",  // Built-in CSS support
      },
      {
        test: /\.module\.css$/,
        type: "css/module",  // CSS Modules built-in
      },
      {
        test: /\.(png|jpg|svg|gif)$/,
        type: "asset",  // Built-in asset handling
      },
    ],
  },
  plugins: [
    new HtmlRspackPlugin({ template: "./index.html" }),
  ],
  devServer: {
    port: 3000,
    hot: true,
  },
});
```

### Key Differences from Webpack

```javascript
// What's built-in (no extra loaders/plugins needed):
// ✅ TypeScript/JSX via SWC — builtin:swc-loader
// ✅ CSS/CSS Modules — type: "css" / "css/module"
// ✅ Asset handling — type: "asset"
// ✅ HTML generation — HtmlRspackPlugin
// ✅ Code splitting — same as webpack
// ✅ Tree shaking — built-in
// ✅ Hot Module Replacement — built-in

// What still uses webpack loaders:
// ✅ sass-loader, less-loader — work as-is
// ✅ postcss-loader — works as-is
// ✅ Most webpack loaders — compatible
```

### With React and Tailwind

```javascript
// rspack.config.js — React + Tailwind CSS project
module.exports = {
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              parser: { syntax: "typescript", tsx: true },
              transform: { react: { runtime: "automatic" } },
            },
          },
        },
      },
      {
        test: /\.css$/,
        use: ["postcss-loader"],  // PostCSS processes Tailwind
        type: "css",
      },
    ],
  },
};
```

## Examples

### Example 1: Migrate a webpack project to Rspack

**User prompt:** "Our webpack build takes 60 seconds. Speed it up without rewriting the config."

The agent will install Rspack, adapt the existing webpack.config.js (minimal changes), replace babel-loader with builtin:swc-loader, and benchmark the improvement.

### Example 2: Set up a new React project with Rspack

**User prompt:** "Create a new React + TypeScript project with fast builds."

The agent will scaffold an Rspack project with SWC for TypeScript/JSX, CSS Modules, asset handling, and dev server with HMR.

## Guidelines

- **Drop-in webpack replacement** — same config format, most loaders work
- **`builtin:swc-loader`** — replaces babel-loader, 20x faster transpilation
- **`type: "css"`** — no css-loader/style-loader needed
- **`type: "asset"`** — no file-loader/url-loader needed
- **Most webpack plugins work** — check @rspack/compat for compatibility layer
- **HMR is built-in** — faster than webpack's HMR
- **Tree shaking built-in** — no extra config needed
- **5-10x faster** — Rust parallelism beats single-threaded JS
- **Production-ready** — used by ByteDance at scale
- **`@rspack/cli`** — provides `rspack serve` and `rspack build` commands
