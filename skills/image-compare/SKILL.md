---
name: image-compare
description: >-
  Compare two images visually using Vision AI to identify differences, similarities, and
  changes. Use when: comparing design mockups vs implementation, visual regression testing,
  identifying what changed between two versions.
license: MIT
compatibility: "Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [image-compare, visual-regression, design, testing, diff]
---

# Image Compare

## Overview

Compare two images pixel-by-pixel. Returns a diff count, mismatch percentage, and generates a diff image highlighting the differences in red.

- Comparing an implementation screenshot against the original design
- Spotting visual regressions between two versions of a page
- Verifying that a UI matches a Figma export

## Instructions

1. Both images are loaded and resized to match dimensions (uses the smaller of the two)
2. `pixelmatch` compares every pixel and flags differences above a configurable threshold
3. Returns mismatch stats and writes a diff image showing changes in red

Run the comparison script:

```bash
bash <skill-path>/scripts/image-compare.sh <image1> <image2> [diff-output.png] [threshold]
```

**Arguments:**
- `image1` — First image path (required)
- `image2` — Second image path (required)
- `diff-output.png` — Path to write the diff image (optional, defaults to `./diff.png`)
- `threshold` — Pixel matching threshold 0-1, lower is stricter (optional, defaults to `0.1`)

The script outputs JSON with comparison results:

```json
{
  "totalPixels": 921600,
  "differentPixels": 4523,
  "mismatchPercentage": 0.49,
  "dimensions": { "width": 1280, "height": 720 },
  "diffImage": "./diff.png",
  "threshold": 0.1
}
```

Interpret the mismatch percentage:
- **< 0.1%** — Essentially identical
- **0.1% - 1%** — Minor differences, likely anti-aliasing or sub-pixel rendering
- **1% - 5%** — Noticeable differences, worth reviewing
- **> 5%** — Significant visual changes

## Examples

### Example 1: Compare a Figma design against the implemented page

```bash
bash <skill-path>/scripts/image-compare.sh design.png screenshot.png
```

Output:

```
Comparison: design.png vs screenshot.png

Mismatch: 0.49% (4,523 pixels out of 921,600)
Diff image saved to: ./diff.png

The images are nearly identical. Differences are highlighted in red in the diff image.
```

### Example 2: Visual regression test with strict threshold

```bash
bash <skill-path>/scripts/image-compare.sh before.png after.png ./changes.png 0.05
```

Using a stricter threshold of 0.05 catches even subtle rendering differences between deployments. The diff image at `./changes.png` highlights all detected changes in red.

## Guidelines

- The script automatically resizes both images to the smaller dimensions. For best results, use images of the same size.
- If you see too many false positives, increase the threshold (e.g., `0.2`). Anti-aliasing differences are common between browsers.
- For CI/CD visual regression, set a mismatch threshold (e.g., fail if > 1%) and compare screenshots taken with the same viewport size.
