---
name: opentype-js
description: >-
  Parse and manipulate OpenType/TrueType fonts with opentype.js — read font
  metadata, access glyph outlines, measure text, generate font subsets, and
  render text to SVG paths. Use when tasks involve custom text rendering,
  font analysis, glyph extraction, or building font tools.
license: Apache-2.0
compatibility: "Node.js 14+ or browser"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["fonts", "typography", "opentype", "glyphs", "text-rendering"]
---

# opentype.js

Read and write OpenType fonts. Access every glyph, measure text, convert to SVG paths.

## Setup

```bash
# Install opentype.js for font parsing and manipulation.
npm install opentype.js
```

## Loading a Font

```typescript
// src/fonts/load.ts — Load a font from file or URL and read metadata.
import opentype from "opentype.js";
import fs from "fs";

// From file (Node.js)
const buffer = fs.readFileSync("./fonts/Inter-Regular.otf");
const font = opentype.parse(buffer.buffer);

console.log(font.names.fontFamily);       // "Inter"
console.log(font.names.designer);         // designer name
console.log(font.unitsPerEm);             // 2048
console.log(font.numGlyphs);              // total glyph count
```

## Measuring Text

```typescript
// src/fonts/measure.ts — Calculate text width and bounding box at a given size.
// Useful for layout engines and canvas text positioning.
import opentype from "opentype.js";

export function measureText(font: opentype.Font, text: string, fontSize: number) {
  const path = font.getPath(text, 0, 0, fontSize);
  const bb = path.getBoundingBox();
  const advance = font.getAdvanceWidth(text, fontSize);

  return {
    width: advance,
    height: bb.y2 - bb.y1,
    boundingBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
  };
}
```

## Rendering Text to SVG

```typescript
// src/fonts/to-svg.ts — Convert a text string to an SVG path element.
// This produces resolution-independent text that doesn't require the font file.
import opentype from "opentype.js";

export function textToSvg(
  font: opentype.Font,
  text: string,
  fontSize: number,
  x: number,
  y: number
): string {
  const path = font.getPath(text, x, y, fontSize);
  const pathData = path.toPathData(2); // precision
  const bb = path.getBoundingBox();

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1} ${bb.y1} ${bb.x2 - bb.x1} ${bb.y2 - bb.y1}">
  <path d="${pathData}" fill="currentColor"/>
</svg>`;
}
```

## Accessing Individual Glyphs

```typescript
// src/fonts/glyphs.ts — Extract glyph outlines and metadata for specific characters.
import opentype from "opentype.js";

export function getGlyphInfo(font: opentype.Font, char: string) {
  const glyph = font.charToGlyph(char);
  const path = glyph.getPath(0, 0, 72);

  return {
    name: glyph.name,
    unicode: glyph.unicode,
    advanceWidth: glyph.advanceWidth,
    pathData: path.toPathData(2),
    commands: path.commands,
  };
}

// List all glyphs in a font
export function listGlyphs(font: opentype.Font) {
  const glyphs: { index: number; name: string; unicode: number | undefined }[] = [];
  for (let i = 0; i < font.numGlyphs; i++) {
    const g = font.glyphs.get(i);
    glyphs.push({ index: i, name: g.name, unicode: g.unicode });
  }
  return glyphs;
}
```

## Font Subsetting

```typescript
// src/fonts/subset.ts — Create a subset font containing only the glyphs needed
// for a specific string. Reduces font file size for web embedding.
import opentype from "opentype.js";
import fs from "fs";

export function subsetFont(font: opentype.Font, chars: string, outputPath: string) {
  const glyphs = [font.glyphs.get(0)]; // always include .notdef
  const seen = new Set<number>();

  for (const char of chars) {
    const glyph = font.charToGlyph(char);
    if (glyph.index !== 0 && !seen.has(glyph.index)) {
      glyphs.push(glyph);
      seen.add(glyph.index);
    }
  }

  const subset = new opentype.Font({
    familyName: font.names.fontFamily?.en || "Subset",
    styleName: font.names.fontSubfamily?.en || "Regular",
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs,
  });

  const buffer = Buffer.from(subset.download() as any);
  fs.writeFileSync(outputPath, buffer);
}
```
