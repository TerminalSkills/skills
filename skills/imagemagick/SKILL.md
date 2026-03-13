---
name: imagemagick
description: >-
   You are an expert in ImageMagick, the powerful command-line tool for
  creating, editing, compositing, and converting images. You help developers
  automate image processing pipelines using ImageMagick's `convert`,
  `mogrify`, `composite`, and `identify` commands — batch resizing, format
  conversion, watermarking, thumbnail generation, PDF manipulation, and
  complex image compositing for web applications, print production, and data
  visualization.
category: Developer Tools
tags: [image-processing, cli, batch, convert, resize, thumbnail, automation]
version: 1.0.0
author: terminal-skills
---

# ImageMagick — Command-Line Image Processing

You are an expert in ImageMagick, the powerful command-line tool for creating, editing, compositing, and converting images. You help developers automate image processing pipelines using ImageMagick's `convert`, `mogrify`, `composite`, and `identify` commands — batch resizing, format conversion, watermarking, thumbnail generation, PDF manipulation, and complex image compositing for web applications, print production, and data visualization.

## Core Capabilities

### Basic Operations

```bash
# Resize
magick input.jpg -resize 800x600 output.jpg        # Fit within 800x600
magick input.jpg -resize 800x600^ output.jpg        # Fill 800x600 (crop overflow)
magick input.jpg -resize 50% output.jpg             # Scale to 50%
magick input.jpg -resize 800x600! output.jpg        # Exact size (distort)

# Format conversion
magick input.png output.webp                         # PNG → WebP
magick input.svg -density 300 output.png             # SVG → high-res PNG
magick input.pdf[0] output.jpg                       # First page of PDF → JPG

# Quality and compression
magick input.jpg -quality 80 output.jpg              # JPEG quality 80%
magick input.png -strip -quality 85 output.webp      # Strip metadata, WebP quality

# Crop
magick input.jpg -crop 500x500+100+50 output.jpg    # 500x500 from position (100,50)
magick input.jpg -gravity center -crop 1:1 output.jpg # Center square crop

# Rotate
magick input.jpg -rotate 90 output.jpg
magick input.jpg -auto-orient output.jpg             # Fix EXIF rotation
```

### Batch Processing

```bash
# Resize all JPGs in directory
magick mogrify -resize 1200x1200 -quality 85 *.jpg

# Convert all PNGs to WebP
for f in *.png; do magick "$f" -quality 80 "${f%.png}.webp"; done

# Generate thumbnails (200x200, center crop)
mkdir -p thumbnails
for f in images/*.jpg; do
    magick "$f" -resize 200x200^ -gravity center -extent 200x200 \
        "thumbnails/$(basename "$f")"
done

# Batch watermark
for f in photos/*.jpg; do
    magick "$f" watermark.png -gravity southeast -composite \
        "watermarked/$(basename "$f")"
done
```

### Compositing and Effects

```bash
# Add text watermark
magick input.jpg -gravity southeast \
    -fill 'rgba(255,255,255,0.5)' -pointsize 24 \
    -annotate +10+10 '© 2026 Company' output.jpg

# Overlay image watermark
magick input.jpg watermark.png \
    -gravity center -compose dissolve -define compose:args=30 \
    -composite output.jpg

# Create social media card (1200x630)
magick -size 1200x630 gradient:'#667eea'-'#764ba2' \
    -font Helvetica-Bold -pointsize 48 -fill white \
    -gravity center -annotate +0-50 'My Blog Post Title' \
    -pointsize 24 -annotate +0+30 'Read more at example.com' \
    og-image.png

# Contact sheet (grid of images)
magick montage images/*.jpg -geometry 200x200+5+5 -tile 4x3 contact-sheet.jpg

# Animated GIF from images
magick -delay 50 frame_*.png -loop 0 animation.gif

# Compare images (diff)
magick compare image1.png image2.png diff.png
```

### Image Information

```bash
# Get image details
magick identify image.jpg
# image.jpg JPEG 3024x4032 3024x4032+0+0 8-bit sRGB 4.2MB

magick identify -verbose image.jpg | head -30     # Full metadata

# Get dimensions as variables
WIDTH=$(magick identify -format '%w' image.jpg)
HEIGHT=$(magick identify -format '%h' image.jpg)
```

## Installation

```bash
brew install imagemagick                   # macOS
apt install imagemagick                   # Ubuntu/Debian
# Or download from https://imagemagick.org/script/download.php
```

## Best Practices

1. **mogrify for in-place** — Use `mogrify` to modify files in-place; `convert`/`magick` for creating new files
2. **WebP for web** — Convert to WebP with quality 80; 30-50% smaller than JPEG at similar quality
3. **Strip metadata** — Use `-strip` to remove EXIF data; reduces file size and protects privacy
4. **Auto-orient** — Always `-auto-orient` before processing; fixes rotation from phone cameras
5. **Thumbnail with crop** — `-resize WxH^` then `-extent WxH` for perfect thumbnails; fill → center crop
6. **Resource limits** — Set `-limit memory 256MiB -limit disk 1GiB` for batch jobs; prevents OOM on large images
7. **Pipeline with pipes** — `magick input.jpg - | magick - -resize 50% output.jpg` for chaining without temp files
8. **SVG at high DPI** — Use `-density 300` before input for SVG/PDF; controls rasterization quality
