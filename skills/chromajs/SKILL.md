---
name: chromajs
description: >-
  Manipulate colors with chroma.js — convert between color spaces (RGB, HSL,
  LAB, LCH), generate palettes and scales, mix and blend colors, check contrast
  ratios, and build accessible color systems. Use when tasks involve creating
  color palettes, theming, accessibility checks, or data visualization color
  scales.
license: Apache-2.0
compatibility: "Node.js 14+ or browser"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["color", "palette", "accessibility", "chroma", "design-tokens"]
---

# chroma.js

Color manipulation library for JavaScript. Handles conversions, scales, blending, and WCAG contrast calculations.

## Setup

```bash
# Install chroma.js — works in Node and browser.
npm install chroma-js
npm install -D @types/chroma-js
```

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
console.log(red.hsl());       // [0, 1, 0.5]
console.log(red.lab());       // [53.23, 80.11, 67.22]

// Adjust properties
const lighter = red.brighten(2);
const muted = red.desaturate(1.5);
const translucent = red.alpha(0.5);
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

// Find the best text color for a given background
export function autoTextColor(bg: string): string {
  return chroma(bg).luminance() > 0.45 ? "#000000" : "#ffffff";
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
