---
name: image-compare
description: >-
  Compares two images and reports whether, how much and where they differ: the
  count of changed pixels, an SSIM score, the bounding box of every changed
  region and a diff picture. Use when someone asks to "compare these two
  screenshots", "what changed between before and after", "does the build match
  the design", "diff these images", "find the visual regression", or wants a
  pass/fail image check in CI. Handles different sizes and scales, lossy
  formats, areas to ignore and rendering noise.
license: Apache-2.0
compatibility: "Python 3.12+ with Pillow, NumPy and scikit-image (run on Pillow 12.3, NumPy 2.5, scikit-image 0.26, SciPy 1.18). Optional: Node.js for the pixelmatch 7.2 command line (run on Node 24)."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: design
  tags: ["image-diff", "visual-regression", "ssim", "screenshots", "testing"]
---

# Image Compare

## Overview

"Are these two images the same?" has four separate answers, and a useful comparison gives all of them: whether any pixel differs, how many differ beyond a tolerance, how alike the two are in structure (SSIM), and where the differences sit. This skill runs one script that prints those numbers with a list of changed regions and writes a diff picture, then has the agent look at the regions and say in words what changed. A percentage alone cannot tell a re-encoded copy from a missing button.

## Instructions

### 1. Establish what is being compared

Find out, from the user or from the files:

- **Which image is the reference** (the design, the baseline, "before") and which is the candidate.
- **Whether both came out of the same renderer.** Two PNG screenshots from one browser on one machine can be compared exactly. A design export against a browser capture, captures from two operating systems, or anything saved as JPEG or WebP cannot: fonts, anti-aliasing and compression move pixel values without changing the picture.
- **What is supposed to differ** (the change under review) and what changes on its own: clocks, avatars, ads, carousels, a blinking caret.
- **Sizes.** The script prints both. Equal sizes compare directly; a longer page or a 2x export needs a choice in step 3.

### 2. Install and save the script

```bash
python3 -m venv .venv
.venv/bin/pip install pillow numpy scikit-image
```

SciPy arrives as a dependency of scikit-image. Save as `imgdiff.py`:

```python
#!/usr/bin/env python3
"""Compare two images: changed pixels, SSIM, changed regions, diff picture.
imgdiff.py BEFORE AFTER [--out diff.png] [--tolerance 0] [--fit pad|resize] [--ignore X,Y,W,H ...] [--max-changed 0.5]"""
import argparse, json, sys
import numpy as np
from PIL import Image, ImageDraw, ImageOps
from scipy import ndimage
from skimage.metrics import structural_similarity

def load(path):
    im = ImageOps.exif_transpose(Image.open(path)).convert('RGBA')
    return Image.alpha_composite(Image.new('RGBA', im.size, 'white'), im).convert('RGB')  # transparency -> white

p = argparse.ArgumentParser()
p.add_argument('before'); p.add_argument('after')
p.add_argument('--out', default='diff.png')
p.add_argument('--tolerance', type=int, default=0, help='largest per-channel difference (0-255) still treated as equal')
p.add_argument('--fit', choices=['pad', 'resize'], default='pad', help='what to do when the sizes differ')
p.add_argument('--ignore', nargs='*', default=[], help='rectangles X,Y,W,H to leave out (clock, avatar, ad slot)')
p.add_argument('--max-changed', type=float, help='exit with 1 when more than this percent of pixels changed')
args = p.parse_args()

a, b = load(args.before), load(args.after)
size_a, size_b = a.size, b.size
outside = None
if a.size != b.size and args.fit == 'resize':  # same picture at two scales: bring the larger down to the smaller
    if abs(a.width / a.height - b.width / b.height) > 0.01:
        sys.exit(f'aspect ratios differ ({a.size} vs {b.size}): crop both to the same area, or use --fit pad')
    small = min(a.size, b.size)
    a, b = (im if im.size == small else im.resize(small, Image.Resampling.LANCZOS) for im in (a, b))
elif a.size != b.size:  # same scale, different extent: anchor top-left, count the uncovered strip as changed
    w, h = max(a.width, b.width), max(a.height, b.height)
    outside = np.ones((h, w), bool)
    outside[:min(a.height, b.height), :min(a.width, b.width)] = False
    padded = [Image.new('RGB', (w, h), 'white'), Image.new('RGB', (w, h), 'white')]
    padded[0].paste(a, (0, 0)); padded[1].paste(b, (0, 0))
    a, b = padded

x, y = np.asarray(a).astype(np.int16), np.asarray(b).astype(np.int16)
for box in args.ignore:
    bx, by, bw, bh = (int(v) for v in box.split(','))
    x[by:by + bh, bx:bx + bw] = y[by:by + bh, bx:bx + bw] = 127
delta = np.abs(x - y).max(axis=2)
changed = delta > args.tolerance
if outside is not None:
    changed |= outside
ssim = None
if min(a.size) >= 7:  # the default SSIM window is 7x7
    ssim = round(float(structural_similarity(x.astype(np.uint8), y.astype(np.uint8), channel_axis=2, data_range=255)), 4)

# Grow every changed pixel by 8 px, so changes up to 16 px apart join: one word or one button is one region.
labels, _ = ndimage.label(ndimage.binary_dilation(changed, iterations=8))
regions = []
for i, sl in enumerate(ndimage.find_objects(labels), start=1):
    ys, xs = np.nonzero(changed[sl] & (labels[sl] == i))
    left, top = sl[1].start + int(xs.min()), sl[0].start + int(ys.min())
    regions.append({'box': [left, top, int(xs.max() - xs.min()) + 1, int(ys.max() - ys.min()) + 1], 'changed_pixels': len(ys)})
regions.sort(key=lambda r: -r['changed_pixels'])

faded = (np.asarray(a.convert('L')).astype(np.float32) * 0.25 + 191).astype(np.uint8)
picture = np.stack([faded] * 3, axis=2)
picture[changed] = (220, 0, 60)
out = Image.fromarray(picture)
draw = ImageDraw.Draw(out)
for r in regions[:20]:
    left, top, w, h = r['box']
    draw.rectangle([left - 4, top - 4, left + w + 3, top + h + 3], outline=(0, 90, 200), width=2)
out.save(args.out)

percent = 100 * changed.mean()
print(json.dumps({
    'before': list(size_a), 'after': list(size_b), 'compared_at': list(a.size),
    'fit': None if size_a == size_b else args.fit, 'tolerance': args.tolerance,
    'identical': bool(delta.max() == 0 and outside is None),
    'changed_pixels': int(changed.sum()), 'changed_percent': round(percent, 3),
    'largest_channel_difference': int(delta.max()), 'ssim': ssim,
    'regions': regions[:20], 'regions_total': len(regions), 'diff_image': args.out}, indent=2))
sys.exit(1 if args.max_changed is not None and percent > args.max_changed else 0)
```

### 3. Choose the settings for the situation

| Situation | Run with | What to trust |
|---|---|---|
| Same page, same browser and machine, PNG files | defaults (exact match) | Every changed pixel is real |
| JPEG or WebP involved, or captures from different machines | `--tolerance` set just above the measured noise | Regions that fill an area; SSIM |
| Design export against a build at another scale | `--fit resize --tolerance 32` | Large filled regions; thin outlines around text are resampling noise |
| One image is longer or wider at the same scale | default `--fit pad` | The uncovered strip is reported as a region; content below an insertion shows as shifted |
| Parts that change on their own | `--ignore X,Y,W,H` for each part | Everything outside the rectangles |
| Pass or fail in CI | `--max-changed 0.05` (a percentage) | Exit status 1 when the budget is exceeded |

To measure noise, compare two captures of the same unchanged thing. `largest_channel_difference` from that run is the noise ceiling: set `--tolerance` a little above it, and set `--max-changed` above its `changed_percent`.

### 4. Read the numbers, then look

- `identical: true` means every pixel matches. Stop there.
- `changed_pixels` and `changed_percent` count pixels whose largest channel difference exceeds the tolerance. The percentage depends on image size: the same button is a smaller share of a longer page, so judge by regions.
- `largest_channel_difference` shows how strong the biggest change is on a 0-255 scale. Zero changed pixels with a non-zero value here means something differs below the tolerance: rerun with `--tolerance 0`.
- `ssim` is 1.0 for identical images. It is a mean over small windows of the whole image, so a local change on a large image barely moves it, while blur, compression or a different picture pull it down. Many changed pixels with SSIM near 1 is the signature of a re-encoded or re-rendered copy of the same picture.
- `regions` are `[x, y, width, height]` boxes in the coordinates of `compared_at`, largest first. Each changed pixel is grown by 8 px before grouping, so changes up to 16 px apart in a row or column form one region.

Open the diff picture (changed pixels in red on a faded copy of the first image, regions framed in blue). For each region that matters, crop both images and view them side by side:

```python
from PIL import Image
left, top, w, h = 56, 496, 161, 41   # a box from "regions"
pad = 12
box = (max(left - pad, 0), max(top - pad, 0), left + w + pad, top + h + pad)
crops = [Image.open(name).convert('RGB').crop(box) for name in ('before.png', 'after.png')]
pair = Image.new('RGB', (crops[0].width * 2 + 10, crops[0].height), 'white')
pair.paste(crops[0], (0, 0)); pair.paste(crops[1], (crops[0].width + 10, 0))
pair.resize((pair.width * 3, pair.height * 3), Image.Resampling.NEAREST).save('region-1.png')
```

Name each change by element and kind: color, text, position, size, missing, added. Read exact colors with `Image.open('after.png').getpixel((70, 500))` rather than estimating them by eye.

### 5. Report

```
Compared before.png with after.png (1280x800, exact match).
Changed: 1.894% of pixels in 4 regions. SSIM 0.9991. Diff picture: diff.png
1. (56, 496) 161x41   "Add to basket" button, fill #2563eb -> #1d4ed8
2. (472, 496) 161x41  same button, second card
3. (888, 496) 161x41  same button, third card
4. (75, 461) 8x11     price on the first card, "$18.00" -> "$19.00"
Verdict: regions 1-3 are the intended restyle; region 4 is not part of it.
```

Give the settings used, every region or a stated cut-off, and a verdict per region: intended, regression or noise.

## Examples

### Example 1: Check a CSS change on a product page

Ines Carvalho darkened the button color on the Harbor Books storefront and wants to know that nothing else moved. Both screenshots come from the same headless browser at 1280x800, so the comparison is exact.

```bash
.venv/bin/python imgdiff.py before.png after.png --out diff.png
```

The output, with the arrays condensed onto single lines:

```json
{
  "before": [1280, 800], "after": [1280, 800], "compared_at": [1280, 800],
  "fit": null, "tolerance": 0, "identical": false,
  "changed_pixels": 19393, "changed_percent": 1.894,
  "largest_channel_difference": 184, "ssim": 0.9991,
  "regions": [
    {"box": [56, 496, 161, 41], "changed_pixels": 6439},
    {"box": [472, 496, 161, 41], "changed_pixels": 6439},
    {"box": [888, 496, 161, 41], "changed_pixels": 6439},
    {"box": [75, 461, 8, 11], "changed_pixels": 76}
  ],
  "regions_total": 4, "diff_image": "diff.png"
}
```

Three equal regions are the three buttons. The fourth is 76 pixels inside a price: the crop shows "$18.00" became "$19.00", which the CSS change cannot explain. The agent reports it as in step 5 and the stale fixture gets fixed before the change ships. SSIM stayed at 0.9991 throughout, which is why it is never the only number to read.

### Example 2: A 2x design export against the built page

Tomasz Wrona has `design@2x.png` (2560x1600) from the design tool and `build.png` (1280x800) from the browser.

```bash
.venv/bin/python imgdiff.py design@2x.png build.png --fit resize --tolerance 32 --out design-vs-build.png
```

The script scales the larger image down and compares at 1280x800: `changed_percent` 8.469, `ssim` 0.9604, 25 regions. The first two are `[888, 194, 336, 206]` with 69,216 changed pixels and `[888, 496, 161, 41]` with 6,369; the other 23 hold at most 1,634 pixels each and trace the outlines of text and the header edge. The same design against a correct build gives 1.05% and 27 outline regions, so those are resampling noise. Cropping the two large regions shows the third card has no cover image and no button. Report: "Third product card is missing its cover (888, 194, 336x206) and its button (888, 496); the rest matches within scaling noise."

## Guidelines

- A tolerance hides real changes as readily as noise. In Example 1 the button recolor is a 21-level shift: `--tolerance 24` reports only the price digit. Prefer removing noise at the source (same browser, same machine, lossless PNG, animations off, fonts loaded) to raising the tolerance.
- The same applies to pixelmatch, the Node library most screenshot test tools use. `npx pixelmatch before.png after.png diff.png 0.1` reported 24 different pixels for Example 1 and missed the recolor; at `0.05` it reported 18,102. Its command line takes PNG files of equal size, skips anti-aliased pixels unless a fifth argument `true` is given, and exits with 0 for no difference, 66 for a difference and 65 for a size mismatch.
- Inside a Playwright test suite use `await expect(page).toHaveScreenshot()` instead of this script. It compares with pixelmatch (`threshold` defaults to 0.2), accepts `maxDiffPixels`, `maxDiffPixelRatio` and `mask`, and keeps one baseline per browser and platform because rendering differs between them.
- An element inserted near the top pushes everything below it, and all of that shows as changed. When most of the page is red from one point down, look for what was added or removed at that point instead of listing every region.
- Transparency is flattened onto white before comparing, so two images that differ only where both are fully transparent count as equal.
- Pillow compares stored pixel values and does not apply embedded color profiles. A Display P3 screenshot against an sRGB one differs everywhere by a small amount; convert both to sRGB first.
- SSIM needs at least 7 px on each side; for smaller images the field is `null`.
- A 1280x6000 full-page capture takes about 2.5 seconds. For much larger images, compare by tiles.
- This is a comparison of aligned images. Finding the same photo after cropping or rotation, or ranking near-duplicates in a library, is a different job (perceptual hashing or feature matching).
