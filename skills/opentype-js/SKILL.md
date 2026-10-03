---
name: opentype-js
description: >-
  Parse and manipulate OpenType/TrueType fonts with opentype.js — read font
  metadata, access glyph outlines, measure text, generate font subsets, and
  render text to SVG paths. Use when tasks involve custom text rendering,
  font analysis, glyph extraction, or building font tools.
license: Apache-2.0
compatibility: "Node.js (current LTS) or a modern browser; opentype.js 2.x"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: design
  repository: https://github.com/opentypejs/opentype.js
  tags: ["fonts", "typography", "opentype", "glyphs", "text-rendering"]
---

# opentype.js

## Overview
Read and write OpenType fonts. Access every glyph, measure text, convert to SVG paths.

opentype.js 2.0 (npm `opentype.js`, MIT) parses TTF, OTF and WOFF (not WOFF2), handles kerning and ligatures, and also supports variable fonts, COLR/CPAL colour glyphs and TrueType hinting. `opentype.load()` and `loadSync()` are deprecated: read the file yourself and call `opentype.parse()`. In ESM code use the default import (`import opentype from "opentype.js"`); named imports such as `{ Font }` fail under Node because the package is CommonJS.

## Instructions

### Setup

```bash
# Install opentype.js for font parsing and manipulation.
npm install opentype.js
```

### Loading a Font

```typescript
// src/fonts/load.ts — Load a font from file or URL and read metadata.
import opentype from "opentype.js";
import fs from "fs";

// From file (Node.js)
const file = fs.readFileSync("./fonts/LiberationSans-Regular.ttf");
// A Node Buffer may be a view into a shared pool: copy out exactly its bytes.
const font = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));

// In 2.x names are grouped by platform, then field, then language.
console.log(font.names.windows?.fontFamily?.en);   // "Liberation Sans"
console.log(font.names.windows?.designer?.en);     // designer name, if the font has one
console.log(font.unitsPerEm);             // 2048 for this font
console.log(font.numGlyphs);              // total glyph count
```

### Measuring Text

```typescript
// src/fonts/measure.ts — Calculate text width and bounding box at a given size.
// Useful for layout engines and canvas text positioning.
import opentype from "opentype.js";

export function measureText(font: opentype.Font, text: string, fontSize: number) {
  const path = font.getPath(text, 0, 0, fontSize);
  const bb = path.getBoundingBox();
  const advance = font.getAdvanceWidth(text, fontSize); // includes kerning by default

  return {
    width: advance,
    height: bb.y2 - bb.y1,
    boundingBox: { x1: bb.x1, y1: bb.y1, x2: bb.x2, y2: bb.y2 },
  };
}
```

### Rendering Text to SVG

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

### Accessing Individual Glyphs

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

// List all glyphs in a font (glyph.unicode is undefined for unmapped glyphs)
export function listGlyphs(font: opentype.Font) {
  const glyphs: { index: number; name: string; unicode: number | undefined }[] = [];
  for (let i = 0; i < font.numGlyphs; i++) {
    const g = font.glyphs.get(i);
    glyphs.push({ index: i, name: g.name, unicode: g.unicode });
  }
  return glyphs;
}
```

### Font Subsetting

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
    familyName: "Subset",
    styleName: "Regular",
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs,
  });

  // toArrayBuffer() works everywhere; download() only triggers a browser download.
  fs.writeFileSync(outputPath, Buffer.from(subset.toArrayBuffer()));
}

// subsetFont(font, "Hello, world", "./out/liberation-subset.ttf");
// Result: a font with the .notdef glyph plus one glyph per distinct character.
```

The subset keeps only outlines, advance widths and the character map: kerning, ligatures and hinting are dropped. For production web fonts prefer `pyftsubset` (fontTools) or `glyphhanger`, which keep layout tables.

## Examples

### "Turn the headline into an SVG path so it needs no font on the page"

```typescript
import opentype from "opentype.js";
import fs from "fs";
import { textToSvg } from "./src/fonts/to-svg";

const file = fs.readFileSync("./fonts/LiberationSans-Bold.ttf");
const font = opentype.parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
fs.writeFileSync("./out/headline.svg", textToSvg(font, "Spring Sale", 64, 0, 64));
```

Result: `out/headline.svg` holds one `<path>` with the outlines of "Spring Sale". The same width is available as `font.getAdvanceWidth("Spring Sale", 64)`.

### "Make a tiny font with only the digits and a dollar sign"

```typescript
import { subsetFont } from "./src/fonts/subset";

subsetFont(font, "0123456789$.,", "./out/price-digits.ttf");
```

Result: a new TTF containing 14 glyphs (13 characters plus `.notdef`), a few KB instead of hundreds of KB. Re-parse it with `opentype.parse` to check `numGlyphs`.

## Guidelines

- Fonts with GSUB lookups that opentype.js 2.0.0 does not implement make `getPath`, `getAdvanceWidth` and `stringToGlyphs` throw (for example "lookupType: 6 - substFormat: 2 is not yet supported"; seen with DejaVu Sans and Inter). Catch it and fall back to per-character layout: sum `font.charToGlyph(c).advanceWidth` (font units, scale by `fontSize / font.unitsPerEm`) and add `font.getKerningValue(a, b)`.
- WOFF2 is not read directly; decompress it first (for example with `wawoff2`).
- Coordinates are in font units until a `fontSize` is given; SVG y grows downward, and `getPath` already flips the outline.
- Check the font's licence before converting text to outlines or redistributing a subset.
