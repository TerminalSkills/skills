---
name: webpack
description: >-
  webpack is a module bundler that turns a JavaScript project and its CSS, images and dependencies into optimized static files for the browser. Use when someone asks to "set up webpack", "write a webpack config", "split my bundle", "fix a huge bundle", "add content hashes for caching", "run the webpack dev server", "analyze bundle size", or to debug a webpack build error. Covers webpack 5 with webpack-cli 7, loaders, asset modules, code splitting, filesystem caching and bundle analysis.
license: Apache-2.0
compatibility: "Node.js 20.9+ for webpack-cli 7 and 22.15+ for webpack-dev-server 6 (webpack 5 itself runs on Node 10.13+), npm or another package manager"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "webpack, bundler, javascript, code-splitting, build-tools"
  repository: https://github.com/webpack/webpack
---

# webpack — bundle JavaScript, CSS and assets for the browser

## Overview

webpack starts from one or more entry files, follows every `import` and `require`, passes each file through loaders (CSS, Babel, TypeScript, images), and writes bundles to an output directory. Plugins add whole-build behavior such as generating the HTML page or extracting CSS. Production mode minifies and tree-shakes by default.

Versions checked for this skill: `webpack` 5.112.x, `webpack-cli` 7.3.x, `webpack-dev-server` 6.1.x, `html-webpack-plugin` 5.6.x, `mini-css-extract-plugin` 2.10.x. Configuration lives in `webpack.config.js` in the project root.

Choose webpack when a project already uses it or needs its loader and plugin ecosystem, Module Federation, or fine control over chunks. For a new project the faster alternatives are `vite` and `rspack` (Rspack reads most webpack configs); a migration is covered by the use case "Migrate a Webpack Project to Vite for Faster Builds".

## Instructions

### Install

```bash
npm install --save-dev webpack webpack-cli webpack-dev-server html-webpack-plugin mini-css-extract-plugin css-loader style-loader
```

`webpack-cli` provides the `webpack` command; `webpack-dev-server` provides `webpack serve`. Add scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "webpack serve --mode development",
    "build": "webpack --mode production"
  }
}
```

Check the module system first. A `"type": "commonjs"` entry in `package.json` (written by `npm init -y`) makes webpack parse `.js` files as CommonJS, and the first `import` then fails with `'import' and 'export' may appear only with 'sourceType: module'`. Delete the `type` field or set it to `"module"`. With `"type": "module"` name the config `webpack.config.cjs` if it uses `require` (webpack-cli finds it automatically).

### A complete config

```javascript
// webpack.config.js
const path = require("node:path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";
  return {
    entry: "./src/index.js",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: isProd ? "js/[name].[contenthash:8].js" : "js/[name].js",
      chunkFilename: isProd ? "js/[name].[contenthash:8].chunk.js" : "js/[name].chunk.js",
      assetModuleFilename: "assets/[name].[hash:8][ext]",
      clean: true,
    },
    devtool: isProd ? "source-map" : "eval-source-map",
    module: {
      rules: [
        {
          test: /\.css$/i,
          use: [isProd ? MiniCssExtractPlugin.loader : "style-loader", "css-loader"],
        },
        { test: /\.(png|jpe?g|svg|woff2?)$/i, type: "asset" },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({ template: "./public/index.html" }),
      ...(isProd ? [new MiniCssExtractPlugin({ filename: "css/[name].[contenthash:8].css" })] : []),
    ],
    optimization: {
      splitChunks: { chunks: "all" },
      runtimeChunk: "single",
    },
    performance: { maxEntrypointSize: 250000, maxAssetSize: 250000 },
    devServer: { port: 5600, hot: true, historyApiFallback: true },
  };
};
```

Notes on the keys: `output.clean: true` empties `dist/` before each build; `[contenthash]` changes only when a file's content changes, which makes long-lived caching safe; `type: "asset"` is a built-in asset module (small files inline, larger ones are emitted), so no `file-loader` or `url-loader`; `runtimeChunk: "single"` keeps the webpack runtime out of app chunks so their hashes stay stable; `performance` makes webpack warn when an entry exceeds the limit (in bytes).

The exported function receives `env` (values from `--env`) and `argv` (including `mode`). Read the mode from `argv.mode` inside the config function.

### Build, serve, watch

```bash
npx webpack --mode production                  # one-off build into dist/
npx webpack serve --mode development --port 5600   # dev server with HMR
npx webpack --watch --mode development         # rebuild on change, no server
npx webpack configtest                         # validate the config file
npx webpack --mode production --env release=2026.11   # env arrives as {release: "2026.11", ...}
npx webpack info                               # versions of webpack, Node, loaders
```

A successful build ends with `webpack 5.x compiled successfully`. The dev server serves from memory; nothing appears in `dist/` until a real build.

### Code splitting

Dynamic `import()` creates a separate chunk that is downloaded on demand; a magic comment names it:

```javascript
document.addEventListener("click", async () => {
  const { renderReport } = await import(/* webpackChunkName: "report" */ "./pages/report.js");
  renderReport(document.querySelector("#app"));
});
```

`splitChunks: { chunks: "all" }` additionally moves shared and `node_modules` code into vendor chunks. In the sample project a production build emitted a 19 KB vendor chunk, a 3 KB runtime, a 408-byte entry and a 2.5 KB lazy `report` chunk, all with 8-character content hashes. Route-level `import()` is the biggest win for single-page apps.

### Faster rebuilds

```javascript
module.exports = (env, argv) => ({
  // ...config above...
  cache: { type: "filesystem" },
});
```

The filesystem cache stores results under `node_modules/.cache/webpack`; the second identical build in the sample took 156 ms instead of 640 ms. Add `cacheDirectory: true` to `babel-loader` options if you use it. If a build behaves oddly after loader or dependency changes, delete that directory to start from a cold cache.

### Transpile with Babel (optional)

```bash
npm install --save-dev babel-loader @babel/core @babel/preset-env
```

```javascript
{
  test: /\.js$/,
  exclude: /node_modules/,
  use: { loader: "babel-loader", options: { presets: [["@babel/preset-env", { targets: "defaults" }]], cacheDirectory: true } },
}
```

Put this rule before the CSS rule in `module.rules`. For TypeScript use `ts-loader` or `babel-loader` with `@babel/preset-typescript`, and add `resolve: { extensions: [".ts", ".tsx", ".js"] }`; check the loader's own README for the current options.

### Find out why a bundle is big

```bash
npm install --save-dev webpack-bundle-analyzer
npx webpack --mode production --json=stats.json
```

`stats.json` holds every module and chunk with sizes. For a visual report that does not open a browser or start a server, add the plugin in static mode:

```javascript
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
// in plugins:
new BundleAnalyzerPlugin({ analyzerMode: "static", openAnalyzer: false, reportFilename: "bundle-report.html" })
```

The report is written next to the build output. Do not use `webpack --analyze` in automation: it starts a server and the command does not exit.

## Examples

### 1. Make a dashboard load less code on the first page

Request: "Our fleet dashboard ships one 900 KB script. Split it so the report page loads only when opened, and name the chunks."

Change the click handler or route to `import(/* webpackChunkName: "report" */ "./pages/report.js")`, apply the config above, and build:

```bash
npx webpack --mode production
ls -la dist/js
```

Result: `dist/js` holds `runtime.<hash>.js`, a vendor chunk, `main.<hash>.js` and `report.<hash>.chunk.js`, and `dist/index.html` references only the first three. webpack prints `compiled successfully`; any entry over 250,000 bytes gets a performance warning pointing at the offender.

### 2. Cache-safe filenames for deployment

Request: "Browsers keep serving the old app.js after each deploy."

Use `[contenthash:8]` in `output.filename` and `chunkFilename` and let `HtmlWebpackPlugin` write the script tags. Build twice and compare:

```bash
npx webpack --mode production && ls dist/js > /tmp/first.txt
# change one line in src/pages/report.js
npx webpack --mode production && ls dist/js > /tmp/second.txt
diff /tmp/first.txt /tmp/second.txt
```

Result: only the `report` chunk and the tiny runtime file (which holds the chunk-name map) get new names; vendor and main keep their hashes, so users re-download two small files. Serve `dist/index.html` with `Cache-Control: no-cache` and the hashed files with a long max-age.

### 3. Find what bloats the bundle

Request: "Which dependency is making the main chunk so large?"

```bash
npx webpack --mode production -c webpack.analyze.config.js
```

where `webpack.analyze.config.js` imports `webpack.config.js`, calls it with `(env, argv)` and pushes the `BundleAnalyzerPlugin` shown above. Open `dist/bundle-report.html` or read the largest entries from `stats.json`; replace whole-library imports with per-function imports or lazy `import()`.

## Guidelines

- Always set `mode`. Without it webpack defaults to production but prints a warning; `development` is unminified and large, so never deploy it.
- `devtool: "source-map"` emits `.map` files into `dist/`. Do not upload them to a public server unless exposing source is acceptable; use `hidden-source-map` and send the maps to an error tracker instead.
- Keep `dist/` and `node_modules/.cache` out of version control.
- Install loaders and plugins separately; a loader named in `use` that is not installed fails with `Module not found`.
- `output.path` must be an absolute path (`path.resolve(__dirname, "dist")`).
- `webpack serve` is a development tool. Do not expose it beyond localhost, and in tests or scripts start it on an explicit free port and stop it afterwards.
- For a very small script or a library with few files, a lighter tool such as esbuild or Rollup may be enough; for greenfield apps consider `vite`.
