---
name: imagemagick
description: >-
  ImageMagick is a command-line toolkit for converting, resizing, cropping,
  compositing and inspecting images in over 200 formats. Use it to batch resize
  photos, convert PNG or SVG to WebP, generate thumbnails, add watermarks, build
  contact sheets and animated GIFs, or read image metadata with `magick`,
  `magick mogrify` and `magick identify`.
license: Apache-2.0
compatibility: ImageMagick 7 (`magick` command); 6.x uses `convert`
metadata:
  author: terminal-skills
  repository: https://github.com/ImageMagick/ImageMagick
  version: 1.1.0
  category: design
  tags:
    - image-processing
    - cli
    - batch
    - resize
    - thumbnail
---

# ImageMagick — Command-Line Image Processing

## Overview

ImageMagick 7 (current release 7.1.2) is driven by one executable, `magick`. The old `convert`, `mogrify`, `identify`, `compare`, `montage` and `composite` commands still exist as legacy names in version 6; in 7 call them as `magick mogrify`, `magick identify`, `magick compare`, `magick montage`. Options are applied left to right, so order matters: settings such as `-density` must come before the file they affect.

## Instructions

### Install

```bash
brew install imagemagick        # macOS
sudo apt install imagemagick    # Debian/Ubuntu (may still ship 6.x: then use `convert`, `identify`)
magick -version                 # confirm 7.x and the delegates (webp, heic, rsvg)
```

### Basic operations

```bash
magick photo.jpg -resize 800x600 out.jpg       # fit inside 800x600, keep ratio
magick photo.jpg -resize 800x600^ out.jpg      # fill 800x600 (one side larger)
magick photo.jpg -resize 50% out.jpg
magick photo.jpg -resize 800x600! out.jpg      # exact size, distorts
magick logo.png -strip -quality 80 logo.webp   # convert, drop metadata
magick -density 300 diagram.svg diagram.png    # density BEFORE the input rasterizes at 300 dpi
magick photo.jpg -crop 500x500+100+50 +repage tile.jpg
magick photo.jpg -auto-orient -resize 1600x1600\> fixed.jpg   # fix EXIF rotation; \> = only shrink
```

### Batch processing

`magick mogrify` edits files in place, so write to another directory with `-path` or work on copies.

```bash
mkdir -p resized
magick mogrify -path resized -auto-orient -resize 1200x1200\> -quality 85 *.jpg

for f in *.png; do magick "$f" -quality 80 "${f%.png}.webp"; done

mkdir -p thumbnails
for f in images/*.jpg; do
  magick "$f" -auto-orient -resize 200x200^ -gravity center -extent 200x200 "thumbnails/$(basename "$f")"
done
```

### Compositing and effects

```bash
magick photo.jpg -gravity southeast -fill 'rgba(255,255,255,0.5)' -pointsize 24 \
  -annotate +10+10 '© 2026 Harbor Studio' watermarked.jpg
magick photo.jpg badge.png -gravity southeast -geometry +20+20 -composite badged.jpg
magick montage images/*.jpg -geometry 200x200+5+5 -tile 4x3 contact-sheet.jpg
magick -delay 50 -loop 0 frame_*.png animation.gif
magick compare -metric AE before.png after.png diff.png   # prints number of differing pixels
```

### Inspect

```bash
magick identify photo.jpg                          # name, format, size, depth, colorspace
magick identify -format '%w x %h\n' photo.jpg
magick identify -list format | grep -i webp        # is a format supported?
```

### Chaining without temp files

```bash
magick photo.jpg -resize 50% png:- | magick png:- -colorspace Gray gray.png
```

Name the format on the pipe (`png:-`); a bare `-` does not tell ImageMagick what to write. The upstream hardened policy sets `path` rights to none for `-`, so pipes fail under it ("not authorized"); use temp files there.

## Examples

### Example 1: "Make 300px WebP thumbnails of every photo in ./uploads"

```bash
mkdir -p thumbs
for f in uploads/*.{jpg,jpeg,png}; do
  [ -e "$f" ] || continue
  magick "$f" -auto-orient -thumbnail 300x300^ -gravity center -extent 300x300 -strip -quality 80 \
    "thumbs/$(basename "${f%.*}").webp"
done
```

Result: `thumbs/` holds square 300x300 WebP files, rotated upright, with EXIF removed. `-thumbnail` is `-resize` plus metadata stripping, optimized for small sizes.

### Example 2: "Create a 1200x630 social card for my blog post"

```bash
magick -size 1200x630 gradient:'#667eea-#764ba2' \
  -gravity center -fill white -font DejaVu-Sans-Bold \
  -pointsize 56 -annotate +0-40 'Shipping Postgres Upgrades Safely' \
  -pointsize 26 -annotate +0+50 'harborstudio.dev/blog' og-image.png
magick identify og-image.png     # og-image.png PNG 1200x630 ...
```

If the font name is rejected, pick one from `magick -list font`.

## Guidelines

- Untrusted images: tighten `policy.xml` (check the active one with `magick identify -list policy`). The upstream hardened policy caps memory, area and disk, and allows only GIF, JPEG, PNG and WEBP; run in a sandbox for user uploads. Many distributions already block PDF/PS/EPS in `policy.xml`, so `magick doc.pdf[0] page.jpg` can fail with "attempt to perform an operation not allowed by the security policy". PDF also needs Ghostscript.
- Cap resources in batch jobs: `-limit memory 256MiB -limit disk 1GiB`.
- `mogrify` overwrites originals unless you pass `-path`; test on copies first.
- Use `-auto-orient` before resizing phone photos, and `-strip` before publishing (removes EXIF location data).
- Use `+repage` after `-crop` so a stale canvas offset does not leak into the output (especially GIF/PNG).
- Prefix user-supplied filenames with `./` so a name starting with `-` is not read as an option.
- For massive concurrent web workloads, libvips (`vips`) uses less memory; ImageMagick wins on breadth of operations and formats.
