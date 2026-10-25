---
name: rspack
description: >-
  Rspack is a Rust-based JavaScript bundler with a webpack-compatible config, loader and plugin API, built for much faster builds. Use when someone asks to "speed up webpack", "migrate from webpack to Rspack", "set up Rspack", "fast bundler for React and TypeScript", or "replace babel-loader and css-loader". Covers installing Rspack 2, converting a webpack config, builtin SWC and CSS support, dev server settings and common migration pitfalls.
license: Apache-2.0
compatibility: "Node.js 20.19+ or 22.12+ for Rspack 2 (Node.js 18.12+ for Rspack 1.x). Linux, macOS, Windows."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/web-infra-dev/rspack
  tags: "bundling, rspack, webpack, rust, build-tools"
---

# Rspack

## Overview

Rspack (by ByteDance's Web Infra team) is a bundler written in Rust whose configuration, loader and plugin interfaces follow webpack 5, so most webpack projects migrate by changing the toolchain rather than rewriting the config. It ships SWC transpilation, CSS and CSS Modules, asset modules and an HTML plugin in the core. The current major version is 2 (`@rspack/core` 2.x); the packages are pure ESM and need Node.js 20.19+ or 22.12+. Rspack 1.x is still published (`latest-v1` dist-tag) for Node 18.

For a new web application the maintainers recommend Rsbuild (`npm create rsbuild@latest`), which adds sensible defaults on top of Rspack. Use plain Rspack when you are migrating a webpack project or need low-level control.

## Instructions

### Start a new Rspack project

```bash
npm create rspack@latest
# non-interactive: npx -y create-rspack --dir storefront --template react-ts
```

### Migrate from webpack

```bash
npm uninstall webpack webpack-cli webpack-dev-server
npm add -D @rspack/core @rspack/cli @rspack/dev-server
```

- `@rspack/cli` no longer pulls in the dev server in v2: install `@rspack/dev-server` yourself if you use `rspack dev`. Keep `@rspack/core` and `@rspack/cli` on the same version.
- Rename `webpack.config.js` to `rspack.config.mjs` (Rspack finds `rspack.config.*` by default).
- Scripts: `"dev": "rspack dev"`, `"build": "rspack build"`, `"preview": "rspack preview"`.
- Remove webpack CLI flags Rspack rejects with `Unknown option`: `--progress`, `--color`, `--bail`, `--output-pathinfo`. Set `stats: { colors: true }` in the config instead of `--color`.
- Replace `babel-loader` with `builtin:swc-loader`, `mini-css-extract-plugin` with `rspack.CssExtractRspackPlugin` (only with css-loader), `html-webpack-plugin` with `rspack.HtmlRspackPlugin`.
- Do not copy webpack `cache` options for the filesystem cache; Rspack has its own persistent cache option shape. `cache: false` and `cache: true` carry over unchanged.

### A working config (React + TypeScript)

```javascript
// rspack.config.mjs
import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(dirname, "dist"), // must be absolute
    filename: "[name].[contenthash].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: { "@": path.resolve(dirname, "src") },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        loader: "builtin:swc-loader",
        options: {
          detectSyntax: "auto",
          jsc: { transform: { react: { runtime: "automatic" } } },
        },
      },
      { test: /\.css$/, type: "css/auto" }, // *.module.css become CSS Modules
      { test: /\.(png|jpg|svg|gif)$/, type: "asset" },
    ],
  },
  plugins: [new rspack.HtmlRspackPlugin({ template: "./index.html" })],
  devServer: { host: "127.0.0.1", port: 3000 },
});
```

Notes verified against Rspack 2.2.9:

- `type: "css/auto"` treats `*.module.css` as CSS Modules and other `.css` as plain CSS; `type: "css"` is plain CSS only, `css/module` and `css/global` force a mode. Built-in CSS cannot be combined with `style-loader` or `CssExtractRspackPlugin`; those need `type: "javascript/auto"` and css-loader.
- CSS Modules export names as named exports, so write `import * as styles from "./app.module.css"` or `import { title } from ...`. A default import (`import styles from`) fails with "export 'default' was not found" unless you set `module.parser["css/auto"].namedExports: false`.
- In v2 `builtin:swc-loader` does not read `.swcrc`; put SWC options in the loader `options`.
- The dev server listens on all interfaces by default and prints a Network URL. Set `devServer.host` to `127.0.0.1` unless you need other devices to reach it.
- `rspack build --analyze` was removed in v2; use Rsdoctor for bundle analysis.

## Examples

### Example 1: Speed up a 60-second webpack build

Request: "Our webpack build takes 60 seconds. Speed it up without rewriting the config."

Steps: run the uninstall and install commands above, rename the config to `rspack.config.mjs`, swap `babel-loader` for `builtin:swc-loader` and `html-webpack-plugin` for `rspack.HtmlRspackPlugin`, update the npm scripts, then run `npx rspack build`. Result: the build prints `Rspack compiled successfully in <time> ms`; compare it with the previous time. Fix any `Unknown option` or missing-loader errors reported before compilation starts.

### Example 2: Hand-built React + TypeScript app

Request: "Set up a React and TypeScript app with CSS Modules and hot reload using Rspack."

Steps: `npm add react react-dom`, `npm add -D @rspack/core @rspack/cli @rspack/dev-server typescript @types/react @types/react-dom`, add the config above and an `index.html`, then `npx rspack dev`. Result: the dev server prints `http://127.0.0.1:3000/`, and `npx rspack build` writes `dist/index.html`, a hashed `main.*.js` and a hashed `main.*.css`. For React Fast Refresh add `@rspack/plugin-react-refresh` and follow its README.

## Guidelines

- Write the config as ESM (`rspack.config.mjs`); the Rspack 2 packages are pure ESM.
- Most webpack loaders (sass-loader, less-loader, postcss-loader) work unchanged. Plugins that depend on webpack internals may not; check the Rspack plugin list before keeping one.
- Expect a faster build than webpack, but measure on your own project; the gain depends on loaders and plugins that still run in JavaScript.
- Upgrading from Rspack 1 to 2 changes defaults: `exportsPresence` is now `error` (missing exports fail the build), `requireAlias` is off, `.swcrc` is ignored. Read the "Upgrading from v1 to v2" page first.
- Avoid options and loaders you do not need; each JavaScript loader runs outside the Rust core.
- Do not use Rspack just to bundle a small app that already builds fast in Vite or Rsbuild.
