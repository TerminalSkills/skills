---
name: image-analysis
description: >-
  Analyze images to extract colors, composition, mood, and visual elements using Vision AI.
  Use when: extracting color palettes from images, analyzing design screenshots, understanding
  visual style of reference images.
license: MIT
compatibility: "Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [image-analysis, color-palette, design, visual, claude]
---

# Image Analysis — Color Extraction

## Overview

Extract dominant colors from any image file (PNG, JPG, WebP, BMP, GIF) and return a structured palette. Useful for implementing UIs that match a screenshot, Figma export, or design mockup.

- The user provides a screenshot or design image and wants to implement it
- The user asks to extract or identify colors from an image
- The user wants a color palette from a photo or mockup
- The user wants to match their code's colors to a reference image

## Instructions

1. Reads the image file using `get-pixels` to obtain raw pixel data
2. Passes pixel data to `extract-colors` to compute dominant colors
3. Returns a sorted palette (by area/prominence) with hex, RGB, HSL values, and area coverage

Run the extraction script, passing the image path as the first argument:

```bash
bash <skill-path>/scripts/extract-colors.sh /path/to/image.png
```

**Arguments:**
- `$1` — Path to the image file (required). Supports PNG, JPG, WebP, BMP, GIF.

The script outputs a JSON array of colors sorted by prominence:

```json
[
  {
    "hex": "#1a1a2e",
    "red": 26, "green": 26, "blue": 46,
    "hue": 0.6667, "saturation": 0.2778, "lightness": 0.1412,
    "area": 0.3241
  }
]
```

After extracting colors, present them as a structured palette and suggest how to use them (CSS custom properties, Tailwind config theme colors, design token definitions, or direct usage in component styles).

## Examples

### Example 1: Extract colors from a landing page screenshot

```bash
bash <skill-path>/scripts/extract-colors.sh ./screenshot.png
```

Output:

```
Color Palette (sorted by prominence):

1. #1a1a2e — 32.4% (dark navy) — Primary background
2. #e94560 — 18.6% (coral red) — Accent color
3. #f5f5f5 — 15.2% (light gray) — Secondary background
```

### Example 2: Extract colors from a Figma export for Tailwind config

```bash
bash <skill-path>/scripts/extract-colors.sh ~/Downloads/figma-design.jpg
```

Use the extracted hex values to populate a Tailwind `theme.extend.colors` config:

```js
colors: {
  primary: '#1a1a2e',
  accent: '#e94560',
  surface: '#f5f5f5',
}
```

## Guidelines

- The script auto-installs dependencies (`extract-colors`, `get-pixels`) on first run. If this fails, install them manually with `cd <skill-path>/scripts && npm install`.
- Supported formats: PNG, JPG, GIF, BMP. For other formats, convert the image first.
- The `extract-colors` library automatically downsamples to 64,000 pixels by default, so large images are already handled efficiently.
- Pair with the `contrast-check` skill to verify that extracted color combinations meet WCAG accessibility standards.
