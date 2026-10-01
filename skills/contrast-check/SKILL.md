---
name: contrast-check
description: >-
  Calculates the WCAG 2.x contrast ratio between two colors, grades it against
  the AA and AAA thresholds for body text, large text and non-text UI parts, and
  finds the closest shade that passes. Use when someone asks to "check the
  contrast", "is this text readable on this background", "does our palette meet
  WCAG AA", "fix the low-contrast text", "audit the design tokens for
  accessibility", or brings a failed contrast finding from an audit. Handles hex
  and rgb() values, alpha, whole palettes, light and dark themes and a CI gate.
license: Apache-2.0
compatibility: "Python 3.8+, standard library only. Thresholds are those of WCAG 2.2 (W3C Recommendation); WCAG 2.1 uses the same formula, and the older 0.03928 threshold printed in WCAG 2.0 gives identical results for 8-bit colors."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: design
  tags: ["accessibility", "wcag", "color-contrast", "design-tokens", "a11y"]
---

# Contrast Check

## Overview

WCAG measures contrast as `(L1 + 0.05) / (L2 + 0.05)`, where L1 and L2 are the relative luminance of the lighter and the darker color. The result runs from 1:1 (same color) to 21:1 (black on white). This skill gives the agent a calculator with no dependencies, the threshold that applies to each kind of element, a way to collect the pairs that really meet on screen, and a repair step that returns the nearest passing shade instead of "make it darker".

## Instructions

### 1. Collect the pairs that meet on screen

A contrast check is about two colors that touch: text and the surface directly behind it, an icon and its button, a border and the page. Before computing anything:

- Ask which level is the target. AA is the usual legal and audit baseline; AAA only when the user names it.
- Find where the colors live: CSS custom properties, a Tailwind `@theme` block or config, a tokens JSON file. Search for the token names to see which ones are used together.
- List every pairing per theme: body text, muted text, links inside body text, placeholder text, error and success messages, button labels on each button color, input borders, icons, focus rings. Placeholder and hover-revealed text count as text.
- Skip what WCAG exempts: disabled controls, pure decoration, logos and brand names.

When a color is written as `oklch()`, `hsl()`, `color-mix()` or a keyword, let the browser resolve it. Computed `hsl()` and keyword colors already come back as `rgb()`, but Chrome returns `oklch()` as written and `color-mix()` as `color(srgb …)`, so paint the value on a canvas and read the pixel. Run this in the DevTools console with the element selected:

```js
const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
const resolve = (css) => {
  ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return `rgba(${r}, ${g}, ${b}, ${+(a / 255).toFixed(3)})`;
};
const style = getComputedStyle($0);
[resolve(style.color), resolve(style.backgroundColor), style.fontSize, style.fontWeight];
```

`oklch(0.7 0.15 250)` comes back as `rgba(75, 163, 247, 1)`. The read-back is exact only for opaque colors (canvas pixels are stored premultiplied, so `rgba(15, 23, 42, 0.1)` returns as `rgba(20, 20, 39, 0.102)`): when the computed value is already `rgba()` with an alpha below 1, use it as it is. A background of `rgba(0, 0, 0, 0)` means the element is transparent: walk up to the first ancestor that paints one.

### 2. Pick the threshold

| What is checked | AA | AAA | Criterion |
|---|---|---|---|
| Body text: under 24 px, or under 18.66 px when bold | 4.5 | 7 | 1.4.3, 1.4.6 |
| Large text: 24 px (18 pt) and up, or 18.66 px (14 pt) bold and up | 3 | 4.5 | 1.4.3, 1.4.6 |
| What identifies a control or its state (input border, checkbox tick, toggle), icons, chart parts needed to read the chart | 3 | — | 1.4.11 |
| Focus indicator, the same pixels focused against unfocused | — | 3 | 2.4.13 |

Sizes are CSS pixels as delivered, before any user zoom. Treat a `font-weight` of 700 or more as bold (700 is what the CSS keyword `bold` means).

### 3. Compute

Save as `contrast.py`:

```python
#!/usr/bin/env python3
"""WCAG 2.x contrast. Pair: contrast.py TEXT BACKGROUND [--need 4.5]. Palette: contrast.py --palette C1 C2 C3 ..."""
import colorsys, json, math, re, sys

def parse(text):
    """'#rgb', '#rrggbb', '#rrggbbaa', 'rgb(31 41 55)', 'rgba(31, 41, 55, 0.6)' -> (r, g, b, alpha), channels 0-255."""
    c = text.strip().lower()
    m = re.fullmatch(r'#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})', c)
    if m:
        h = m[1] if len(m[1]) > 4 else ''.join(ch * 2 for ch in m[1])
        v = [int(h[i:i + 2], 16) for i in range(0, len(h), 2)]
        return (*v[:3], v[3] / 255 if len(v) == 4 else 1.0)
    m = re.fullmatch(r'rgba?\(([^)]+)\)', c)
    if m:
        p = [x for x in re.split(r'[\s,/]+', m[1].strip()) if x]
        if len(p) in (3, 4) and not any(x.endswith('%') for x in p[:3]):
            alpha = 1.0 if len(p) == 3 else float(p[3].rstrip('%')) / (100 if p[3].endswith('%') else 1)
            return (*(float(x) for x in p[:3]), alpha)
    raise SystemExit(f'cannot read color "{text}": pass hex or rgb()/rgba() with 0-255 channels')

def over(top, below):
    """The opaque color the screen shows when `top` (with alpha) is painted on `below`."""
    a = top[3]
    return tuple(round(top[i] * a + below[i] * (1 - a)) for i in range(3)) + (1.0,)

def luminance(color):
    def linear(v):
        s = v / 255
        return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4
    r, g, b = (linear(v) for v in color[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(a, b):
    lighter, darker = sorted((luminance(a), luminance(b)), reverse=True)
    return (lighter + 0.05) / (darker + 0.05)

def to_hex(color):
    return '#%02x%02x%02x' % tuple(round(v) for v in color[:3])

def shown(r):
    return math.floor(r * 100) / 100  # cut, never round up: 4.499 must not print as 4.5

def nearest_passing(color, fixed, need):
    """`color` with hue and saturation kept, lightness pushed away from `fixed` just far enough to reach `need`."""
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in color[:3]))
    at = lambda light: tuple(round(v * 255) for v in colorsys.hls_to_rgb(h, light, s))
    passes = 0.0 if luminance(color) <= luminance(fixed) else 1.0
    if ratio(at(passes), fixed) < need:
        return None  # black or white on this side is still short: the other color has to move
    fails = l
    for _ in range(24):
        mid = (fails + passes) / 2
        if ratio(at(mid), fixed) >= need: passes = mid
        else: fails = mid
    return to_hex(at(passes))

def check(text, background, need=None, canvas='#ffffff'):
    bg = over(parse(background), parse(canvas))
    fg = over(parse(text), bg)
    r = ratio(fg, bg)
    out = {'text': to_hex(fg), 'background': to_hex(bg), 'ratio': shown(r),
           'body_text': 'AAA' if r >= 7 else 'AA' if r >= 4.5 else 'fail',
           'large_text': 'AAA' if r >= 4.5 else 'AA' if r >= 3 else 'fail',
           'non_text': 'AA' if r >= 3 else 'fail'}
    if need and r < need:
        out['fix'] = {'need': need, 'text_instead': nearest_passing(fg, bg, need),
                      'background_instead': nearest_passing(bg, fg, need)}
    return out, r

if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--palette':
        colors = args[1:]
        pairs = [(check(a, b)[1], a, b) for i, a in enumerate(colors) for b in colors[i + 1:]]
        for r, a, b in sorted(pairs, reverse=True):
            use = ('body text AAA' if r >= 7 else 'body text AA' if r >= 4.5 else
                   'large text and UI parts only' if r >= 3 else 'fail')
            print(f'{a} + {b}  {shown(r):5.2f}  {use}')
        sys.exit(0)
    need = float(args[args.index('--need') + 1]) if '--need' in args else None
    result, r = check(args[0], args[1], need)
    print(json.dumps(result, indent=2))
    sys.exit(1 if need and r < need else 0)
```

Confirm the copy before trusting it: `python3 contrast.py '#000000' '#ffffff'` must print `"ratio": 21.0`, `'#777777'` on `'#ffffff'` must print `4.47` (a fail) and `'#767676'` must print `4.54` (a pass).

- **Pair.** The first argument is the text or foreground, the second is what it sits on. Alpha is flattened first: the foreground over the background, and a translucent background over white (pass a different `canvas` to `check()` when the page is not white). The `text` and `background` fields in the output are the opaque colors that were actually compared.
- **`--need`** takes the threshold from step 2, adds a `fix` block on failure and makes the exit code 1.
- **`--palette`** prints every unordered pairing once, best first, with what that pairing is good for. It is a map of what may be combined, not a list of failures: two colors that never touch do not need contrast.

### 4. Repair and report

`fix.text_instead` and `fix.background_instead` keep the hue and saturation and move lightness the smallest distance that passes. `null` means that side cannot get there by moving further from the other color (white text cannot get lighter), so the other side has to change. Both `null` means neither color alone can reach the target: change the pairing. When a brand color may not change, keep it for large text and UI parts and add a darker text variant as its own token. After changing a token, re-run every pair that uses it, in every theme.

Report in this shape, worst first, and state what was not checked:

```
| Pair                  | Colors             | Ratio | Needs | Result | Change                 |
|-----------------------|--------------------|-------|-------|--------|------------------------|
| Label on amber button | #ffffff on #f59e0b | 2.14  | 4.5   | fail   | label to #1c1917 (8.14)|
| Muted text on card    | #94a3b8 on #f8fafc | 2.45  | 4.5   | fail   | text to #607591 (4.50) |
| Body text on page     | #0f172a on #f8fafc | 17.06 | 4.5   | AAA    | —                      |
Not checked: text over the hero photo (needs pixel sampling), disabled buttons (exempt).
```

## Examples

### Example 1: A failed audit finding on a bookshop storefront

Marta Lindqvist's audit of the Harbor Books storefront reports "insufficient contrast" on the grey helper text and on the amber "Add to basket" button. The stylesheet has `--muted: #94a3b8`, `--surface: #f8fafc`, `--accent: #f59e0b`, and the button label is white at 16 px, weight 600, so both are body text and need 4.5.

```bash
python3 contrast.py '#94a3b8' '#f8fafc' --need 4.5
python3 contrast.py '#ffffff' '#f59e0b' --need 4.5
```

Both exit with 1. The output, with line breaks condensed:

```json
{ "text": "#94a3b8", "background": "#f8fafc", "ratio": 2.45, "body_text": "fail", "large_text": "fail", "non_text": "fail",
  "fix": { "need": 4.5, "text_instead": "#607591", "background_instead": null } }
{ "text": "#ffffff", "background": "#f59e0b", "ratio": 2.14, "body_text": "fail", "large_text": "fail", "non_text": "fail",
  "fix": { "need": 4.5, "text_instead": null, "background_instead": "#a56a07" } }
```

The helper text becomes `#607591`, which also clears the white cards (4.71). For the button, darkening the amber to `#a56a07` would change the brand color, so the label changes instead: `python3 contrast.py '#1c1917' '#f59e0b'` gives 8.14. The agent edits `--muted`, sets the button label to `#1c1917`, and reports both rows as in the table above.

### Example 2: A dark theme with translucent text, gated in CI

A dashboard for the logistics firm Tidewater Freight uses near-white text (`#f8fafc`) at reduced opacity on `#0f172a`. Opacity changes the color that reaches the eye, so the rgba value goes in as written:

```bash
python3 contrast.py 'rgba(248, 250, 252, 0.6)' '#0f172a'      # text #9b9fa8, ratio 6.73, body text AA
python3 contrast.py 'rgba(248, 250, 252, 0.38)' '#0f172a' --need 4.5   # text #686d7a, ratio 3.44, fail
```

The 38% step fails as body text; its `fix.text_instead` is `#7a808e`. To keep the theme from regressing, the pairs go into `contrast-pairs.txt` (text, background, threshold, label):

```
#e2e8f0 #0f172a 4.5 body-text-dark
#64748b #0f172a 4.5 placeholder-dark
#38bdf8 #0f172a 4.5 link-dark
#334155 #0f172a 3 input-border-dark
```

```bash
failed=0
while read -r text background need label; do
  python3 contrast.py "$text" "$background" --need "$need" > /dev/null \
    || { echo "FAIL $label: $text on $background needs $need"; failed=1; }
done < contrast-pairs.txt
exit "$failed"
```

```
FAIL placeholder-dark: #64748b on #0f172a needs 4.5
FAIL input-border-dark: #334155 on #0f172a needs 3
```

The script exits 1, so the pipeline stops. The placeholder (3.75) moves to `#718198` and the input border (1.72) to `#506585`, the values the `fix` block returns for each.

## Guidelines

- Compare the unrounded ratio. W3C's Understanding document for 1.4.3 says a computed 4.499 does not meet 4.5, which is why the script cuts the displayed number and tests the full value.
- Use the colors declared in code, not pixels picked from a screenshot: anti-aliasing blends glyph edges with the background and reads lower than the real pair.
- CSS `opacity` on an ancestor fades the text as well. Multiply it into the alpha before checking.
- Text over a gradient or a photo has no single background. Sample the lightest and darkest pixels behind the text (the `image-analysis` skill does this) and check the worst one, or put a solid scrim behind the text.
- A hover or visited color does not need 3:1 against the default state; it must still meet its threshold against what surrounds it.
- The formula assumes sRGB. A `display-p3` color outside the sRGB range is clipped by the canvas conversion, so treat a ratio near the limit as uncertain.
- The ratio ignores stroke width. Thin weights at small sizes are harder to read than the number suggests; leave headroom rather than landing on 4.50.
- The WCAG 2.x ratio is the one audits and regulations cite. WCAG 3.0 is still a Working Draft (September 2026) and states that its contrast algorithm is not yet decided, so do not report APCA values as conformance.
- Passing contrast is one criterion out of many. For keyboard access, names, roles and the rest, use the `accessibility-auditor` skill.
