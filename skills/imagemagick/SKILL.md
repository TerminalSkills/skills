# ImageMagick — Command-Line Image Processing

> Author: terminal-skills

You are an expert in ImageMagick for batch processing, converting, resizing, compositing, and transforming images from the command line. You automate image pipelines for web optimization, thumbnail generation, watermarking, and format conversion across thousands of files.

## Core Competencies

### Basic Operations
- Convert format: `magick input.png output.jpg`
- Resize: `magick input.jpg -resize 800x600 output.jpg` (fit within, maintain aspect)
- Resize exact: `magick input.jpg -resize 800x600! output.jpg` (force dimensions)
- Resize by percentage: `magick input.jpg -resize 50% output.jpg`
- Quality: `magick input.png -quality 85 output.jpg` (JPEG quality 0-100)
- Strip metadata: `magick input.jpg -strip output.jpg` (remove EXIF, reduce size)

### Crop and Trim
- Crop: `magick input.jpg -crop 800x600+100+50 output.jpg` (width×height+x+y)
- Center crop: `magick input.jpg -gravity center -crop 800x600+0+0 output.jpg`
- Trim whitespace: `magick input.png -trim +repage output.png`
- Auto-crop with fuzz: `magick input.png -fuzz 10% -trim output.png` (tolerance for near-white)

### Text and Watermark
- Text overlay: `magick input.jpg -gravity south -pointsize 24 -fill white -annotate +0+10 "© 2026" output.jpg`
- Image watermark: `magick input.jpg watermark.png -gravity southeast -composite output.jpg`
- Transparent watermark: `magick input.jpg \( watermark.png -alpha set -channel A -evaluate set 30% \) -gravity center -composite output.jpg`

### Effects and Filters
- Blur: `magick input.jpg -blur 0x8 output.jpg`
- Sharpen: `magick input.jpg -sharpen 0x1 output.jpg`
- Grayscale: `magick input.jpg -colorspace Gray output.jpg`
- Sepia: `magick input.jpg -sepia-tone 80% output.jpg`
- Border: `magick input.jpg -border 10 -bordercolor "#333333" output.jpg`
- Shadow: `magick input.png \( +clone -background black -shadow 60x5+5+5 \) +swap -background none -layers merge output.png`
- Round corners: `magick input.jpg \( +clone -alpha extract -draw "roundrectangle 0,0,%w,%h,20,20" \) -alpha off -compose CopyOpacity -composite output.png`

### Compositing
- Overlay: `magick base.jpg overlay.png -composite output.jpg`
- Side by side: `magick input1.jpg input2.jpg +append output.jpg` (horizontal)
- Stack: `magick input1.jpg input2.jpg -append output.jpg` (vertical)
- Grid/montage: `magick montage *.jpg -geometry 200x200+5+5 -tile 4x grid.jpg`

### Batch Processing
- Convert all PNGs to JPG: `magick mogrify -format jpg *.png`
- Resize all in directory: `magick mogrify -resize 800x800 -path thumbnails/ *.jpg`
- Batch watermark: `for f in *.jpg; do magick "$f" watermark.png -gravity southeast -composite "out/$f"; done`

### Format Optimization
- WebP: `magick input.jpg -quality 80 output.webp` (30% smaller than JPEG)
- AVIF: `magick input.jpg output.avif` (50% smaller than JPEG)
- Progressive JPEG: `magick input.jpg -interlace Plane output.jpg`
- PNG optimization: `magick input.png -strip -define png:compression-level=9 output.png`
- SVG to PNG: `magick -density 300 input.svg output.png` (rasterize at high DPI)

### Identify
- `magick identify input.jpg`: format, dimensions, colorspace, filesize
- `magick identify -verbose input.jpg`: full metadata including EXIF
- `magick identify -format "%wx%h %m %b\n" *.jpg`: custom format for batch info

## Code Standards
- Use `magick mogrify` for batch in-place edits, `magick convert` for single-file transformations
- Always `-strip` for web images — EXIF data adds 10-50KB and may contain GPS coordinates (privacy)
- Use `-resize WxH>` (with `>`) to only shrink, never enlarge — enlarging creates blurry images
- Use WebP output for web: `-quality 80` WebP is 25-35% smaller than equivalent JPEG
- Use `-thumbnail` instead of `-resize` for thumbnails — it strips metadata and is optimized for small sizes
- Use `-fuzz` with `-trim` for scanned images — real-world backgrounds aren't perfectly uniform
- Use montage for contact sheets and comparison grids — single command for image grids
