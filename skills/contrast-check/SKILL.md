---
name: contrast-check
description: >-
  Check color contrast ratios for WCAG accessibility compliance. Use when: auditing UI
  components for accessibility, validating color schemes meet AA/AAA standards, fixing
  low-contrast text in designs.
license: MIT
compatibility: "Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: [accessibility, wcag, contrast, color, design]
---

# Contrast Check

## Overview

Check color pairs against WCAG 2.1 contrast requirements. Pass in hex colors and get contrast ratios with AA/AAA pass/fail results for both normal and large text.

- Checking if a text color is readable against a background color
- Auditing an entire color palette for accessibility compliance
- Verifying colors extracted from a design meet WCAG standards

## Instructions

1. Takes a list of hex colors as arguments
2. Computes the contrast ratio for every foreground/background pair
3. Tests each pair against WCAG 2.1 AA and AAA thresholds for normal and large text

WCAG thresholds:
- **AA normal text** — ratio >= 4.5:1
- **AA large text** — ratio >= 3:1
- **AAA normal text** — ratio >= 7:1
- **AAA large text** — ratio >= 4.5:1

Run the script with two or more hex colors (with or without `#` prefix):

```bash
bash <skill-path>/scripts/contrast-check.sh <color1> <color2> [color3] [color4] ...
```

The script outputs JSON with contrast ratios and pass/fail results:

```json
{
  "pairs": [
    {
      "foreground": "#1a1a2e",
      "background": "#ffffff",
      "ratio": 16.57,
      "aa": { "normal": true, "large": true },
      "aaa": { "normal": true, "large": true }
    }
  ],
  "summary": {
    "totalPairs": 2,
    "passAA": 1,
    "passAAA": 1,
    "failAA": 1
  }
}
```

After checking, present a table to the user:

```
Contrast Check Results:

  #1a1a2e on #ffffff — 16.57:1 — AA: Pass — AAA: Pass
  #e94560 on #ffffff —  3.94:1 — AA: Fail (normal) / Pass (large) — AAA: Fail

Summary: 1/2 pairs pass AA for normal text, 1/2 pass AAA.
```

Flag any failing pairs and suggest fixes (darken/lighten the color to reach the threshold).

## Examples

### Example 1: Check a dark theme header against white text

```bash
bash <skill-path>/scripts/contrast-check.sh "#1a1a2e" "#ffffff"
```

Output:

```json
{
  "pairs": [
    {
      "foreground": "#1a1a2e",
      "background": "#ffffff",
      "ratio": 16.57,
      "aa": { "normal": true, "large": true },
      "aaa": { "normal": true, "large": true }
    }
  ],
  "summary": { "totalPairs": 1, "passAA": 1, "passAAA": 1, "failAA": 0 }
}
```

### Example 2: Audit a full brand palette

```bash
bash <skill-path>/scripts/contrast-check.sh "#1a1a2e" "#e94560" "#ffffff" "#3d83f7" "#bdbdbd"
```

The script checks all foreground/background combinations and reports which pairs fail AA or AAA. For example, `#e94560` on `#ffffff` yields a ratio of 3.94:1 which fails AA for normal text but passes for large text.

## Guidelines

- Colors must be valid hex values (3 or 6 digits, with or without `#`).
- Pair with the `image-analysis` skill to extract colors from a design first, then pipe the hex values into this skill to audit accessibility.
- When a pair fails, suggest darkening or lightening one of the colors to meet the target ratio.
