---
title: Split an Oversized JavaScript Bundle into Cacheable Chunks
slug: split-an-oversized-javascript-bundle-into-cacheable-chunks
description: A front-end developer breaks a single multi-megabyte script into cacheable, on-demand chunks with webpack, so returning visitors download almost nothing after a deploy.
skills:
  - webpack
category: development
tags:
  - webpack
  - code-splitting
  - bundle-size
  - caching
  - frontend
---

## The Problem

Tomasz Nowak maintains the customer dashboard for a small fleet-tracking company. It is a single-page app built with webpack, and over two years the one `bundle.js` it produces has grown to 2.4 MB. Every release changes that one file, so drivers on slow mobile connections in depots re-download the whole thing each Monday. The reports screen alone pulls in a charting library that most users never open. Tomasz has no budget for a framework migration this quarter; he needs the existing webpack setup to ship less code up front and to keep unchanged code cached between releases.

## The Solution

The agent uses the `webpack` skill to rework the configuration around three ideas: content-hashed filenames so unchanged files stay cached, `splitChunks` and a separate runtime chunk so vendor code is stable, and dynamic `import()` so heavy screens load on demand. It measures with webpack's own stats output before and after, so the claim of an improvement rests on numbers.

## Step-by-Step Walkthrough

### 1. Measure the current build

Prompt: "Build for production and tell me what is in the bundle."

```bash
npx webpack --mode production --json=stats.json
ls -la dist
```

The agent reads `stats.json` (assets with sizes, modules by size) and finds one asset of 2.4 MB, with the charting library and a date library as the largest contributors. It also notes whether the config already sets `performance` limits.

### 2. Make filenames content-hashed and the runtime separate

Prompt: "Make deploys cache-friendly without changing app behavior."

In `webpack.config.js` the agent sets:

```javascript
output: {
  path: path.resolve(__dirname, "dist"),
  filename: "js/[name].[contenthash:8].js",
  chunkFilename: "js/[name].[contenthash:8].chunk.js",
  clean: true,
},
optimization: {
  splitChunks: { chunks: "all" },
  runtimeChunk: "single",
},
performance: { maxEntrypointSize: 250000, maxAssetSize: 250000 },
```

`HtmlWebpackPlugin` (already in the project) rewrites the script tags in `dist/index.html` to the hashed names.

### 3. Load the reports screen on demand

Prompt: "Only load the reports code when someone opens Reports."

```javascript
const { renderReport } = await import(/* webpackChunkName: "report" */ "./pages/report.js");
```

The agent changes the route handler for `/reports` to use this dynamic import. Everything that `report.js` alone imports, including the charting library, moves into the `report` chunk.

### 4. Rebuild and compare

Prompt: "Rebuild and show the before and after."

```bash
npx webpack --mode production
ls -la dist/js
```

The agent lists the new entry assets (runtime, vendor chunk, main) and the lazy `report` chunk, and compares the total of what the first page loads against the 2.4 MB baseline. Any entry above 250,000 bytes still triggers a webpack performance warning that names the file.

### 5. Prove that a release changes only what changed

Prompt: "Change one line in the reports page and show which files get new names."

```bash
ls dist/js > before.txt
npx webpack --mode production
ls dist/js > after.txt
diff before.txt after.txt
```

Only the `report` chunk and the small runtime file change names; main and the vendor chunk keep theirs. The agent confirms this before recommending the deploy headers: `Cache-Control: no-cache` for `index.html`, a long max-age for everything under `js/`.

### 6. Speed up the next builds

Prompt: "CI rebuilds take forever. Cache what we can."

```javascript
cache: { type: "filesystem" },
```

The agent adds the filesystem cache and notes that the CI cache must preserve `node_modules/.cache/webpack` between runs for it to help.

## Real-World Example

After the change, the first page of Tomasz's dashboard loads a runtime file, a vendor chunk and the main bundle instead of one 2.4 MB script; the charting library arrives only when a user opens Reports. The following Monday's release touches two screens, and returning users download those chunks and the small runtime file rather than the full application. In a project of this shape the numbers will differ, which is why step 1 and step 4 produce measurements from the project itself rather than assumptions. If the first-page size is still above the limit, the agent repeats step 3 for the next-largest screen listed in `stats.json`.

## Related Skills

- [webpack](/skills/webpack) — configures hashed output, chunk splitting, dynamic imports, filesystem cache and the stats output used to measure the result.
