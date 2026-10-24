---
name: svgo
description: >-
  SVGO is a Node.js tool that optimizes SVG files by removing editor metadata, comments and
  redundant attributes and by shortening paths. Use when asked to reduce SVG file size, clean
  up SVGs exported from Figma, Illustrator or Sketch, configure SVGO plugins, optimize icons
  in a build, or fix an SVG that broke after optimization (lost viewBox, title or IDs).
license: Apache-2.0
compatibility: "Node.js 16+ (svgo 4.x)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/svg/svgo
  tags: ["svg", "optimization", "icons", "minification", "build-tools"]
---

# SVGO

## Overview

SVGO (SVG Optimizer) parses an SVG, runs a list of plugins and prints a smaller file. It removes editor metadata and comments, collapses groups, shortens path data and minifies attributes. The current release is 4.1.0 (Node.js 16+). Version 4 changed two defaults that older guides still assume: `removeViewBox` and `removeTitle` are no longer part of `preset-default`, so the `viewBox` and the `<title>` now survive unless you add those plugins. Plugin names such as `removeScriptElement` were renamed (`removeScripts`). The commands below were run against svgo 4.1.0.

## Instructions

### Install and run the CLI

```console
$ npm install --save-dev svgo
$ npx svgo icons/cart.svg -o icons/cart.min.svg
icons/cart.svg:
Done in 9 ms!
0.473 KiB - 59.9% = 0.189 KiB
```

The CLI prints the saved percentage for every file. Without `-o`, the input file is overwritten in place, so commit or copy first.

| Task | Command |
|------|---------|
| One file to another | `npx svgo in.svg -o out.svg` |
| Folder, recursive, to a new folder | `npx svgo -r -f ./icons --output ./icons-optimized` |
| Folder, rewrite in place | `npx svgo -r -f ./icons` |
| Print to stdout | `npx svgo in.svg -o -` |
| Pretty-printed output | `npx svgo in.svg --pretty --indent 2 -o -` |
| From stdin | `cat in.svg \| npx svgo -i - -o -` |
| Several passes | `npx svgo --multipass in.svg -o out.svg` |
| Fewer decimals | `npx svgo -p 1 in.svg -o out.svg` |
| Data URI for CSS | `npx svgo --datauri unenc in.svg -o -` |
| List plugins | `npx svgo --show-plugins` |
| Use a specific config | `npx svgo --config svgo.config.mjs in.svg -o out.svg` |

SVGO loads `svgo.config.js`, `.mjs` or `.cjs` from the current directory automatically, so a config next to your icons changes every run, including the ones in the table above.

### Configuration

Use ESM (`export default`) in a project with `"type": "module"` and `module.exports` in a CommonJS project; `.mjs` and `.cjs` work in either.

```javascript
// svgo.config.mjs
/** @type {import('svgo').Config} */
export default {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          mergePaths: false,         // keeps separate paths for icon animation
          convertShapeToPath: false, // keeps <rect> and <circle> readable
        },
      },
    },
    "removeDimensions", // drop width/height, size the icon with CSS from the viewBox
    "removeXMLNS",      // only for SVG pasted inline into HTML, never for standalone .svg files
  ],
};
```

Plugins outside `preset-default` go after it in the list. `removeViewBox`, `removeTitle`, `removeDimensions`, `removeXMLNS`, `removeStyleElement`, `prefixIds` and `reusePaths` are opt-in. Putting an opt-in plugin in `overrides` (for example `removeViewBox: false`) throws "You are trying to configure removeViewBox which is not part of preset-default", so delete such lines left from v3 configs.

### Programmatic API

`optimize` is synchronous, takes a string, and throws `SvgoParserError` on invalid SVG. Pass `path` so the error names the file. SVGO v4 has named exports only.

```typescript
// src/svg/optimize.ts
import { optimize, type Config } from "svgo";

const config: Config = {
  multipass: true,
  plugins: ["preset-default", "removeDimensions"],
};

export function optimizeSvg(svg: string, file: string): string {
  return optimize(svg, { ...config, path: file }).data;
}
```

### Batch processing

```javascript
// scripts/optimize-icons.mjs
import { optimize } from "svgo";
import fs from "node:fs/promises";
import path from "node:path";

export async function optimizeDirectory(inputDir, outputDir) {
  const files = (await fs.readdir(inputDir)).filter((f) => f.endsWith(".svg"));
  await fs.mkdir(outputDir, { recursive: true });
  let before = 0;
  let after = 0;
  for (const file of files) {
    const input = await fs.readFile(path.join(inputDir, file), "utf-8");
    const { data } = optimize(input, { path: file, multipass: true });
    before += Buffer.byteLength(input);
    after += Buffer.byteLength(data);
    await fs.writeFile(path.join(outputDir, file), data);
  }
  console.log(`Optimized ${files.length} files, saved ${((1 - after / before) * 100).toFixed(1)}%`);
}

await optimizeDirectory("icons", "icons-optimized");
```

### Custom plugin

A plugin's `fn` returns visitors. This one adds a class to every `<path>`:

```javascript
const addPathClass = {
  name: "addPathClass",
  fn: () => ({
    element: {
      enter: (node) => {
        if (node.name === "path") node.attributes.class = "icon-path";
      },
    },
  }),
};

optimize(svgString, { plugins: ["preset-default", addPathClass] });
```

In TypeScript, type it as `CustomPlugin` imported from `svgo`.

### Build tools

`vite-plugin-svgo` (3.x) loads `.svg` imports as optimized raw strings, not as components; it takes the same `multipass` and `plugins` options.

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import svgo from "vite-plugin-svgo";

export default defineConfig({
  plugins: [svgo({ multipass: true, plugins: ["preset-default", "removeDimensions"] })],
});
```

For React components from SVG files use SVGR (`@svgr/webpack` or the Vite plugin), which runs SVGO internally. In CI, run `npx svgo -r -f src/assets/icons` and fail the job if `git diff --exit-code` shows changes.

## Examples

### Example 1: "Clean up the SVGs Sketch exported for our icon set"

Run `npx svgo -r -f ./design/icons --output ./public/icons` with the `svgo.config.mjs` above. A 0.47 KiB Sketch export with an XML prolog, generator comment, `sketch:type` attributes and an unused style became 0.15 KiB (about 69% smaller), keeping `viewBox="0 0 24 24"` and dropping `width` and `height` so CSS controls the size.

### Example 2: "The optimized SVG shows the wrong colors or disappears in my page"

Two optimized SVGs on one page can collide: `cleanupIds` shortens IDs to `a`, `b`, and CSS classes from `<style>` get merged, so one icon's gradient or style hits another. Add `prefixIds` (without a `prefix` parameter it prefixes IDs with the file name, so each file gets its own prefix; the CLI and the API with `path` both pass it) or disable `cleanupIds` in `overrides`; for inline icons that need per-icon CSS, keep `removeStyleElement` off.

## Guidelines

- Check the result visually. Lossy plugins (`convertPathData` precision, `mergePaths`, `removeHiddenElems`) can change a drawing; compare before and after in a browser before replacing originals, and lower precision with `-p` only if the icon stays sharp.
- Keep `viewBox`. Without it an SVG cannot scale to the size CSS gives it. This is the v4 default; do not add `removeViewBox` to a v4 config.
- Keep `<title>` for accessible standalone images; add `removeTitle` only for decorative icons.
- Do not run SVGO on SVGs you do not control and then inline them without sanitizing: SVGO does not remove scripts unless you add `removeScripts`, and it is not a security filter.
- `removeXMLNS` breaks SVGs loaded through `<img>` or CSS `url()`; use it only for inline SVG.
- Animated SVGs (SMIL, CSS animations with IDs) often need `cleanupIds`, `mergePaths` and `collapseGroups` disabled.
- Running with `--multipass` in CI makes output stable; pin the svgo version, because minor releases can change output bytes.
