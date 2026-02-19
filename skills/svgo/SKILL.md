---
name: svgo
description: >-
  Optimize SVG files with SVGO — remove unnecessary metadata, minify paths,
  merge shapes, configure plugins, and integrate into build pipelines. Use when
  tasks involve reducing SVG file size, cleaning up exported SVGs from design
  tools, building icon systems, or automating SVG optimization in CI/CD.
license: Apache-2.0
compatibility: "Node.js 14+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["svg", "optimization", "icons", "minification", "build-tools"]
---

# SVGO

SVG Optimizer. Removes editor metadata, collapses groups, shortens paths, and minifies without visual changes.

## Setup

```bash
# Install SVGO as a CLI tool and Node.js library.
npm install -D svgo
```

## CLI Usage

```bash
# Optimize a single SVG file and overwrite it.
npx svgo input.svg -o output.svg

# Optimize all SVGs in a directory recursively.
npx svgo -r -f ./icons --output ./icons-optimized

# Show optimization stats without writing.
npx svgo input.svg --pretty --indent 2 -o -
```

## Programmatic API

```typescript
// src/svg/optimize.ts — Optimize SVG strings programmatically with custom config.
import { optimize, Config } from "svgo";

const config: Config = {
  multipass: true,
  plugins: [
    "preset-default",
    "removeDimensions",
    {
      name: "sortAttrs",
      params: { xmlnsOrder: "alphabetical" },
    },
  ],
};

export function optimizeSvg(svgString: string): string {
  const result = optimize(svgString, config);
  return result.data;
}
```

## Custom Plugin Configuration

```typescript
// svgo.config.js — Project-level SVGO config. Disable plugins that break
// specific SVGs (e.g., keep viewBox, don't merge paths in icons).
/** @type {import('svgo').Config} */
module.exports = {
  multipass: true,
  plugins: [
    {
      name: "preset-default",
      params: {
        overrides: {
          removeViewBox: false,        // keep viewBox for responsive scaling
          mergePaths: false,           // don't merge — breaks some icon animations
          convertShapeToPath: false,   // keep semantic shapes (rect, circle)
        },
      },
    },
    "removeXMLNS",          // remove xmlns for inline SVG use
    "removeDimensions",     // remove width/height, rely on viewBox
    "sortAttrs",
    "removeStyleElement",
  ],
};
```

## Batch Processing

```typescript
// src/svg/batch.ts — Optimize all SVGs in a directory and report savings.
import { optimize } from "svgo";
import fs from "fs";
import path from "path";

export async function optimizeDirectory(inputDir: string, outputDir: string) {
  const files = fs.readdirSync(inputDir).filter((f) => f.endsWith(".svg"));
  let totalBefore = 0;
  let totalAfter = 0;

  fs.mkdirSync(outputDir, { recursive: true });

  for (const file of files) {
    const input = fs.readFileSync(path.join(inputDir, file), "utf-8");
    const result = optimize(input, { multipass: true, plugins: ["preset-default"] });

    totalBefore += input.length;
    totalAfter += result.data.length;

    fs.writeFileSync(path.join(outputDir, file), result.data);
  }

  const savings = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
  console.log(`Optimized ${files.length} files. Saved ${savings}%`);
}
```

## Writing a Custom Plugin

```typescript
// src/svg/custom-plugin.ts — SVGO custom plugin that adds a class attribute
// to all <path> elements for CSS styling.
import type { CustomPlugin } from "svgo";

export const addPathClass: CustomPlugin = {
  name: "addPathClass",
  fn: () => ({
    element: {
      enter: (node) => {
        if (node.name === "path") {
          node.attributes.class = "icon-path";
        }
      },
    },
  }),
};

// Usage: optimize(svg, { plugins: [addPathClass] })
```

## Build Integration

```typescript
// vite.config.ts — Use vite-plugin-svgo to optimize SVGs at build time.
// SVGs imported as components are automatically optimized.
import { defineConfig } from "vite";
import svgo from "vite-plugin-svgo";

export default defineConfig({
  plugins: [
    svgo({
      multipass: true,
      plugins: [
        { name: "preset-default", params: { overrides: { removeViewBox: false } } },
        "removeDimensions",
      ],
    }),
  ],
});
```
