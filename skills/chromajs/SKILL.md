---
name: chromajs
description: >-
  Manipulate colors with chroma.js — convert between color spaces (RGB, HSL,
  LAB, LCH), generate palettes and scales, mix and blend colors, check contrast
  ratios, and build accessible color systems. Use when tasks involve creating
  color palettes, theming, accessibility checks, or data visualization color
  scales.
license: Apache-2.0
compatibility: "chroma-js 3.x; Node.js (ESM or CommonJS) or any modern browser"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/gka/chroma.js
  category: design
  tags: ["color", "palette", "accessibility", "chroma", "design-tokens"]
---

# chroma.js

## Overview

chroma.js is a small JavaScript library for color conversion, color scales, mixing and WCAG contrast calculations. Current release is 3.2.0 (ES module package with a CommonJS build behind `require`). It ships no TypeScript types; they come from `@types/chroma-js`. Out-of-gamut or invalid input throws, so validate user-supplied strings with `chroma.valid()`.

## Instructions

```bash
npm install chroma-js
npm install -D @types/chroma-js
```

Use `import chroma from "chroma-js"` (ESM) or `const chroma = require("chroma-js")` (CommonJS).

## Basic Color Operations

```typescript
// src/colors/basics.ts — Create colors, convert between spaces, adjust properties.
import chroma from "chroma-js";

// Parse from any format
const red = chroma("#ff0000");
const blue = chroma("rgb(0, 0, 255)");
const green = chroma(120, 1, 0.5, "hsl");

// Convert between formats
console.log(red.hex());       // "#ff0000"
console.log(red.rgb());       // [255, 0, 0]
console.log(red.hsl());       // [0, 1, 0.5, 1]  (hue, saturation, lightness, alpha)
console.log(red.lab());       // [53.24, 80.09, 67.20]
console.log(red.oklch());     // [0.628, 0.258, 29.23]
console.log(red.css("oklch")); // "oklch(62.8% 0.26 29.23deg)"

// Adjust properties
const lighter = red.brighten(2);
const muted = red.desaturate(1.5);
const translucent = red.alpha(0.5);
console.log(translucent.hex()); // "#ff000080"  (hex keeps alpha when it is below 1)
```

## Generating Color Scales

```typescript
// src/colors/scales.ts — Build continuous color scales for data visualization.
// Scales interpolate between stops and can output any number of discrete colors.
import chroma from "chroma-js";

// Two-stop scale
const heatScale = chroma.scale(["#fafa6e", "#2A4858"]).mode("lch");
console.log(heatScale(0.5).hex()); // midpoint color

// Multi-stop diverging scale
const diverging = chroma
  .scale(["#d73027", "#ffffbf", "#1a9850"])
  .mode("lab")
  .domain([-1, 0, 1]);

// Generate 7 discrete colors from a scale
const palette = chroma.scale(["#fce4ec", "#880e4f"]).colors(7);

// ColorBrewer palettes by name; correctLightness() evens out perceived brightness
const ylgnbu = chroma.scale("YlGnBu").colors(5);
const even = chroma.scale(["#fafa6e", "#2A4858"]).mode("lch").correctLightness();
```

## Accessible Contrast Checking

```typescript
// src/colors/accessibility.ts — Check WCAG contrast ratios between foreground
// and background colors. Returns ratio and pass/fail for AA and AAA.
import chroma from "chroma-js";

export function checkContrast(fg: string, bg: string) {
  const contrast = chroma.contrast(fg, bg);
  return {
    ratio: Math.round(contrast * 100) / 100,
    aa: contrast >= 4.5,
    aaLarge: contrast >= 3,
    aaa: contrast >= 7,
  };
}

// Pick black or white text, whichever has the higher contrast with the background
export function autoTextColor(bg: string): string {
  return chroma.contrast(bg, "#ffffff") >= chroma.contrast(bg, "#000000")
    ? "#ffffff"
    : "#000000";
}
```

## Palette Generation

```typescript
// src/colors/palette.ts — Generate harmonious palettes from a base color
// using color theory (complementary, triadic, analogous).
import chroma from "chroma-js";

export function generatePalette(base: string, type: "complementary" | "triadic" | "analogous") {
  const [h, s, l] = chroma(base).hsl();
  const shifts: Record<string, number[]> = {
    complementary: [0, 180],
    triadic: [0, 120, 240],
    analogous: [-30, 0, 30],
  };
  return shifts[type].map((shift) =>
    chroma.hsl((h + shift + 360) % 360, s, l).hex()
  );
}

// Bezier interpolation for smoother multi-color palettes
const smooth = chroma.bezier(["#f00", "#ff0", "#0f0"]).scale().colors(9);
```

## Mixing and Blending

```typescript
// src/colors/blending.ts — Mix two colors in a given color space.
// LAB mixing produces more perceptually uniform results than RGB.
import chroma from "chroma-js";

const mixed = chroma.mix("#ff0000", "#0000ff", 0.5, "lab");
console.log(mixed.hex()); // perceptual midpoint

// Average multiple colors
const avg = chroma.average(["#ddd", "#ff0", "#09f"], "lab");
```

## Examples

**"Is gray text #777 on white OK for body copy?"**

```typescript
import { checkContrast } from "./src/colors/accessibility";
console.log(checkContrast("#777777", "#ffffff"));
// { ratio: 4.48, aa: false, aaLarge: true, aaa: false }
```

Ratio 4.48 is just under the 4.5 AA threshold, so darken the gray (for example `#767676` passes at 4.54).

**"Give me a 5-step heatmap legend from light yellow to dark blue-green."**

```typescript
import chroma from "chroma-js";
console.log(chroma.scale(["#fafa6e", "#2A4858"]).mode("lch").colors(5));
// [ '#fafa6e', '#86d780', '#23aa8f', '#007882', '#2a4858' ]
```

The LCH mode keeps the midpoints saturated instead of muddy.

## Guidelines

- `chroma.contrast()` implements the WCAG 2 ratio (AA: 4.5 for body text, 3 for large text; AAA: 7). It is not APCA; for APCA use `chroma.contrastAPCA(text, background)`.
- Mix and interpolate in `lab`, `lch` or `oklch`; RGB interpolation gives dull, darker midpoints. `hsl` hue interpolation can take the long way round.
- `brighten`/`darken`/`saturate`/`desaturate` take a step count in LCH units (default 1), not a percentage.
- Color methods return new objects; nothing mutates in place.
- Wrap user-provided strings in `chroma.valid(input)` before constructing, since invalid input throws.
- Do not rely on `luminance()` thresholds for text color; compare contrast against black and white instead.
