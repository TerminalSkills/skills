---
name: image-analysis
description: >-
  Turns an image into facts an agent can build from: file properties, a color
  palette with the area each color covers, the colors and sizes of individual
  elements, and a structured description of layout and style. Use when someone
  asks to "extract the colors from this screenshot", "get a palette from this
  photo", "match my CSS to this mockup", "what colors and sizes does this
  design use", "describe this reference image", or "why does this image look
  wrong". Produces CSS variables, a Tailwind theme block or a written brief.
license: Apache-2.0
compatibility: "Python 3.10+ with Pillow (run on Pillow 12.3). The optional element finder also needs NumPy and SciPy. Reads PNG, JPEG, WebP, GIF, BMP and TIFF."
metadata:
  author: terminal-skills
  version: "2.0.0"
  category: design
  tags: ["image-analysis", "color-palette", "design-tokens", "screenshots", "pillow"]
---

# Image Analysis

## Overview

An image holds two kinds of information. Some of it can be measured from the pixels: dimensions, format, transparency, which colors cover how much area, where an element sits and how large it is. The rest has to be seen: how the layout is organized, what the hierarchy is, what the picture feels like. This skill gives the agent a script for the first kind, a way of looking for the second, and one rule that keeps them apart: every number in the answer comes from the pixels, never from an impression.

## Instructions

### 1. Find out what the result is for

- **Building a UI from a screenshot or mockup:** exact colors per role, element sizes and spacing, delivered as CSS variables or a Tailwind theme.
- **A palette from a photo or artwork:** five to eight representative colors with their weight, plus the small accents.
- **Checking an asset:** format, dimensions, transparency, orientation, color profile, animation.
- **Describing a reference:** a written brief of layout and style backed by measured values.

Ask where the result goes (stylesheet, token file, design note) when the request does not say.

### 2. Measure

```bash
python3 -m venv .venv
.venv/bin/pip install pillow
```

Save as `analyze.py`:

```python
#!/usr/bin/env python3
"""Facts about an image: file properties and a color palette with area shares.
analyze.py IMAGE [--colors 8] [--region X,Y,W,H] [--method auto|exact|quantize]"""
import argparse, collections, colorsys, io, json, os
from PIL import Image, ImageCms, ImageOps

p = argparse.ArgumentParser()
p.add_argument('image')
p.add_argument('--colors', type=int, default=8)
p.add_argument('--region', help='analyze only this rectangle: X,Y,W,H in pixels')
p.add_argument('--method', choices=['auto', 'exact', 'quantize'], default='auto')
args = p.parse_args()

im = Image.open(args.image)
facts = {'file': args.image, 'bytes': os.path.getsize(args.image), 'format': im.format, 'mode': im.mode,
         'frames': getattr(im, 'n_frames', 1), 'dpi': [round(float(v)) for v in im.info['dpi']] if 'dpi' in im.info else None,
         'exif_orientation': im.getexif().get(0x0112), 'color_profile': None}
if im.info.get('icc_profile'):
    facts['color_profile'] = ImageCms.getProfileDescription(ImageCms.ImageCmsProfile(io.BytesIO(im.info['icc_profile']))).strip()

im = ImageOps.exif_transpose(im).convert('RGBA')   # upright, first frame, one pixel layout for every format
facts['size'] = list(im.size)                      # as displayed, after applying the EXIF orientation
if args.region:
    x, y, w, h = (int(v) for v in args.region.split(','))
    im = im.crop((x, y, x + w, y + h))
    facts['region'] = [x, y, w, h]
alpha = im.getchannel('A').histogram()
visible = sum(alpha[1:])
facts['transparent_percent'] = round(100 * alpha[0] / (im.width * im.height), 2)
facts['partly_transparent_percent'] = round(100 * sum(alpha[1:255]) / (im.width * im.height), 2)

def describe(rgb, share):
    h, l, s = colorsys.rgb_to_hls(*(v / 255 for v in rgb))
    return {'hex': '#%02x%02x%02x' % tuple(rgb), 'rgb': list(rgb), 'share': round(share, 2),
            'hsl': [round(h * 360), round(s * 100), round(l * 100)]}

# Exact counts over visible pixels. Flat artwork (UI, logos, charts) has a few colors covering nearly everything.
counts = sorted(((n, c[:3]) for n, c in im.getcolors(im.width * im.height) if c[3] > 0), reverse=True)
facts['distinct_colors'] = len(counts)
top_cover = 100 * sum(n for n, _ in counts[:args.colors]) / max(visible, 1)
facts['top_colors_cover_percent'] = round(top_cover, 1)
method = args.method if args.method != 'auto' else ('exact' if top_cover >= 60 else 'quantize')
facts['method'] = method

def merged(counts, radius=3, limit=2000):
    """Fold near-identical colors (compression noise, anti-aliasing steps) into the most common neighbor."""
    kept = []
    for n, c in counts[:limit]:
        for k in kept:
            if max(abs(a - b) for a, b in zip(c, k[1])) <= radius:
                k[0] += n
                break
        else:
            kept.append([n, c])
    return sorted(kept, reverse=True)

groups = merged(counts)
facts['accents'] = []
if method == 'exact':
    ranked = [describe(c, 100 * n / visible) for n, c in groups]
    facts['palette'] = ranked[:args.colors]
    # Small but loud: saturated colors the area ranking dropped (buttons, links, badges).
    apart = lambda g: all(max(abs(a - b) for a, b in zip(g['rgb'], e['rgb'])) > 24 for e in facts['palette'])
    facts['accents'] = [g for g in ranked[args.colors:] if g['hsl'][1] >= 50 and 20 <= g['hsl'][2] <= 80
                        and g['share'] >= 0.05 and apart(g)][:4]
else:  # photographs and gradients: group similar pixels; each entry is the average of its group, not a pixel value
    small, mask = im.convert('RGB'), im.getchannel('A')
    small.thumbnail((400, 400), Image.Resampling.BOX)
    mask.thumbnail((400, 400), Image.Resampling.BOX)
    raw = small.tobytes()
    seen = b''.join(raw[3 * i:3 * i + 3] for i, a in enumerate(mask.tobytes()) if a > 127)   # visible pixels only
    facts['palette'] = []
    if seen:
        q = Image.frombytes('RGB', (len(seen) // 3, 1), seen).quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = q.getpalette()
        bins = sorted(q.getcolors(), reverse=True)
        facts['palette'] = [describe(tuple(pal[i * 3:i * 3 + 3]), 300 * n / len(seen)) for n, i in bins]

# Background guess: the most common color on the outer 1 px frame.
edge = [im.getpixel((x, y)) for x in range(im.width) for y in (0, im.height - 1)]
edge += [im.getpixel((x, y)) for y in range(im.height) for x in (0, im.width - 1)]
frame, hits = collections.Counter(edge).most_common(1)[0]
facts['edge_color'] = 'transparent' if frame[3] == 0 else '#%02x%02x%02x' % frame[:3]
facts['edge_color_share_of_frame'] = round(100 * hits / len(edge), 1)
far = [c for n, c in groups if n >= 0.003 * visible] if frame[3] else []   # in a tight region around text: the text color
facts['farthest_from_edge'] = '#%02x%02x%02x' % max(far, key=lambda c: sum((a - b) ** 2 for a, b in zip(c, frame))) if far else None
luma = sum(n * (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) for n, c in counts) / (255 * max(visible, 1))
facts['mean_lightness'] = round(luma, 2)            # visible pixels only: 0 dark, 1 light
print(json.dumps(facts, indent=2))
```

Run `.venv/bin/python analyze.py storefront.png`. How to read the output:

- `size` is the image as displayed. `exif_orientation` other than 1 or `null` means the file stores the pixels rotated or mirrored; the script has already turned them upright, so regions use displayed coordinates.
- `frames` above 1 is an animation; only the first frame is analyzed.
- `color_profile` names an embedded ICC profile. Anything other than an sRGB profile means the hex values are in that color space and will look different when pasted into CSS.
- `method` is `exact` when the most common colors (as many as `--colors`, eight by default) cover at least 60% of the visible pixels, which is what interfaces, logos and charts look like. The palette then holds real pixel values, with colors within 3 levels of each other counted as one. Otherwise it is `quantize`: similar pixels are grouped by median cut and each entry is the average of its group, a representative color rather than one that occurs in the image.
- `share` is the percentage of visible pixels. `accents` lists saturated colors that cover little area and fell below the cut: buttons, links, badges.
- `edge_color` is the most common color on the outer frame, usually the page background; `transparent` means the artwork floats. `farthest_from_edge` is the color least like it among those covering at least 0.3% of the area.

### 3. Sample what the area ranking misses

Text and thin lines cover too few pixels to rank. Point the script at them: `--region X,Y,W,H` restricts the analysis to one rectangle. In a tight region around a line of text, `edge_color` is the background and `farthest_from_edge` is the text color; the colors between them are anti-aliasing blends of the two.

To get the position and size of every solid block of one color (buttons, cards, bands), install NumPy and SciPy next to Pillow and save this as `boxes.py`:

```python
#!/usr/bin/env python3
"""Where a color sits: boxes.py IMAGE '#2563eb' -> one line per solid block of that color, largest first."""
import sys
import numpy as np
from PIL import Image, ImageColor, ImageOps
from scipy import ndimage

pixels = np.asarray(ImageOps.exif_transpose(Image.open(sys.argv[1])).convert('RGB')).astype(int)
target = np.array(ImageColor.getrgb(sys.argv[2]))
mask = np.abs(pixels - target).max(axis=2) <= 3            # same tolerance as the palette merge
labels, _ = ndimage.label(ndimage.binary_fill_holes(mask))  # a label inside a button does not split it
blocks = [(sl[1].start, sl[0].start, sl[1].stop - sl[1].start, sl[0].stop - sl[0].start) for sl in ndimage.find_objects(labels)]
for x, y, w, h in sorted(blocks, key=lambda b: -b[2] * b[3]):
    if w * h >= 64:
        print(f'x={x} y={y} width={w} height={h}')
```

Spacing follows from the boxes: the gap between two cards is the next `x` minus the previous `x + width`.

### 4. Look

Open the image itself, upright and at a size the model reads without shrinking it. Multimodal models downscale large inputs (Anthropic documents a long edge of 1568 px for its standard models and 2576 px for the newest ones), see no metadata and only the first frame of an animation, so crop a region and view it on its own when detail matters. Describe, in this order:

1. **Structure:** regions from top to bottom, columns, alignment, what repeats.
2. **Hierarchy:** what the eye lands on first and why (size, weight, color, position).
3. **Type:** serif or sans, how many sizes, weight contrast. Do not name a typeface unless the user supplied it.
4. **Shape and depth:** corner rounding, borders or shadows, flat or layered.
5. **Imagery and mood:** photography, illustration or none; warm or cool; dense or airy.

Then tie each statement to a measurement: "three cards" becomes three boxes of 383x389 with a 33 px gap.

### 5. Deliver

Name colors by role, not by hue, and keep the measured hex. For a stylesheet:

```css
:root {
  --page: #f8fafc;      /* 47.5% of the screenshot, also the edge color */
  --surface: #ffffff;   /* cards */
  --ink: #0f172a;       /* header band and headings */
  --accent: #2563eb;    /* buttons, 1.75% */
}
```

For Tailwind CSS 4 the same values go into `@theme` under the `--color-` namespace, which creates the utilities (`bg-accent`, `text-ink`):

```css
@import "tailwindcss";
@theme {
  --color-page: #f8fafc;
  --color-surface: #ffffff;
  --color-ink: #0f172a;
  --color-accent: #2563eb;
}
```

State what was measured and what was only seen, and list anything left unsampled.

## Examples

### Example 1: Tokens from a storefront screenshot

Dana Okafor is rebuilding the Harbor Books product page from `storefront.png` (1280x800).

```bash
.venv/bin/python analyze.py storefront.png
.venv/bin/python analyze.py storefront.png --region 56,455,120,20 --colors 4
.venv/bin/python boxes.py storefront.png '#2563eb'
```

The first run reports `method: exact`, 960 distinct colors with the top eight covering 99.3%, and this palette:

```
#f8fafc 47.53   #ffffff 20.98   #0f172a 8.16   #fecaca 6.81
#fde68a 6.81    #bae6fd 6.81    #2563eb 1.75   #cbd5e1 0.45
```

The region around the price line returns `edge_color` `#ffffff` and `farthest_from_edge` `#475569`, the secondary text color that the full-image ranking never showed. `boxes.py` prints three buttons:

```
x=56 y=496 width=161 height=41
x=472 y=496 width=161 height=41
x=888 y=496 width=161 height=41
```

Looking at the image adds what the numbers do not say: a dark header band, a heading, three equal cards each with a pastel cover block, title, price and a button, and a single line of small print at the bottom. The agent writes the token block from step 5 with `--muted: #475569` and `--line: #cbd5e1` added, and notes "card 383x389, 33 px between cards, button 161x41; pastel covers `#fde68a`, `#bae6fd`, `#fecaca` are placeholders for artwork, not theme colors".

### Example 2: A brand palette from a photograph

Lukas Brandt wants colors for the Tidewater Freight website taken from `harbor-dusk.jpg`, a photo of the harbor at sunset.

```bash
.venv/bin/python analyze.py harbor-dusk.jpg --colors 5
```

```json
{
  "format": "JPEG", "mode": "RGB", "dpi": [300, 300], "exif_orientation": 6,
  "size": [1600, 1067], "distinct_colors": 16616, "top_colors_cover_percent": 3.0, "method": "quantize",
  "palette": [
    {"hex": "#2f395b", "share": 33.33, "hsl": [226, 32, 27]},
    {"hex": "#1c2941", "share": 21.96, "hsl": [219, 40, 18]},
    {"hex": "#4b485f", "share": 17.75, "hsl": [248, 14, 33]},
    {"hex": "#89625b", "share": 15.24, "hsl": [9, 20, 45]},
    {"hex": "#ca865e", "share": 11.72, "hsl": [22, 50, 58]}
  ]
}
```

(Other fields left out.) The file is stored rotated (orientation 6), so the agent views an upright copy: a navy sea, a sky fading from navy to orange, a low sun, a dark headland, one small red boat. The sun and the boat are the memorable parts and neither made the top five, so they are sampled directly:

```bash
.venv/bin/python analyze.py harbor-dusk.jpg --region 1010,540,80,80 --colors 3   # sun:  #feea8b
.venv/bin/python analyze.py harbor-dusk.jpg --region 700,678,60,15 --colors 3    # boat: #c42b31
```

Result: `#1c2941` for dark surfaces, `#2f395b` as the primary, `#ca865e` as the warm secondary, `#feea8b` for highlights and `#c42b31` kept for one call to action. The agent adds that these are group averages from a JPEG and should be checked for text contrast before use.

## Guidelines

- Do not read colors off the image by eye. A model's guess at a hex value is close but not exact; sample the pixels.
- JPEG and lossy WebP smear flat colors. `#2563eb` came back as `#2563ea` from an 85-quality JPEG of the same page. Ask for a PNG or the source file when exact tokens matter, and round toward the known design system when there is one.
- Text color is only exact from a lossless file. From the JPEG of the same page the price text `#475569` read back as `#525355`, because chroma subsampling greys thin glyphs. Never average a text region: the average is a blend with the background.
- A screenshot from a high-density display has 2 or 3 device pixels per CSS pixel. Divide measured sizes by the scale factor (a 2560 px wide capture of a 1280 px viewport is 2x).
- Gradients and photographs have no single correct palette. Report the method, and sample the top and bottom of a gradient separately.
- 16-bit images (mode `I;16`) are clipped by the 8-bit conversion and report as white; rescale them first.
- CMYK files are converted without a color profile, so their hex values are approximate.
- Before using two extracted colors as text and background, run them through the `contrast-check` skill. To read text out of the image use `image-to-text`; to find what changed between two versions use `image-compare`.
- Do not identify real people from photographs, and do not treat a description as proof of where or when a picture was taken.
