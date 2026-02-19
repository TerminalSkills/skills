---
name: sharp
description: >-
  Process and transform images with Sharp for Node.js. Use when a user asks to
  resize images, convert image formats (WebP, AVIF, PNG, JPEG), compress images,
  crop or rotate photos, generate thumbnails, add watermarks, optimize images
  for web, batch process images, create responsive image variants, extract image
  metadata, or build image processing pipelines. Covers resizing, format
  conversion, compression, cropping, compositing, and metadata extraction.
license: Apache-2.0
compatibility: 'Node.js 18+ (Linux, macOS, Windows)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - sharp
    - image
    - resize
    - convert
    - compress
    - thumbnail
    - webp
---

# Sharp

## Overview

Sharp is the fastest image processing library for Node.js, built on libvips. It handles resizing, format conversion (JPEG, PNG, WebP, AVIF, TIFF, GIF), compression, cropping, rotation, compositing, and metadata extraction. Use it for thumbnail generation, responsive image variants, web optimization, watermarking, and batch processing pipelines.

## Instructions

### Step 1: Installation

```bash
npm install sharp
```

### Step 2: Resize and Convert

```javascript
// resize.js — Resize images and convert between formats
import sharp from 'sharp'

// Resize to specific dimensions
await sharp('input.jpg')
  .resize(800, 600)           // width, height
  .toFile('output.jpg')

// Resize maintaining aspect ratio (fit within bounds)
await sharp('input.jpg')
  .resize(800, 600, { fit: 'inside', withoutEnlargement: true })
  .toFile('resized.jpg')

// Convert JPEG to WebP
await sharp('photo.jpg')
  .webp({ quality: 80 })
  .toFile('photo.webp')

// Convert to AVIF (best compression, modern browsers)
await sharp('photo.jpg')
  .avif({ quality: 50 })     // AVIF quality scale differs — 50 ≈ JPEG 80
  .toFile('photo.avif')

// PNG with compression
await sharp('screenshot.png')
  .png({ compressionLevel: 9, palette: true })   // palette mode for smaller files
  .toFile('optimized.png')
```

### Step 3: Generate Responsive Image Variants

```javascript
// responsive.js — Generate multiple sizes for srcset
import sharp from 'sharp'

const sizes = [320, 640, 960, 1280, 1920]    // common breakpoints

async function generateVariants(inputPath, outputDir) {
  /**
   * Generate responsive image variants in WebP and JPEG fallback.
   * Args:
   *   inputPath: Source image path
   *   outputDir: Directory for output variants
   */
  const image = sharp(inputPath)
  const metadata = await image.metadata()
  const baseName = inputPath.replace(/\.[^.]+$/, '').split('/').pop()

  for (const width of sizes) {
    if (width > metadata.width) continue    // don't upscale

    // WebP variant (primary)
    await sharp(inputPath)
      .resize(width)
      .webp({ quality: 80 })
      .toFile(`${outputDir}/${baseName}-${width}w.webp`)

    // JPEG fallback
    await sharp(inputPath)
      .resize(width)
      .jpeg({ quality: 80, progressive: true })
      .toFile(`${outputDir}/${baseName}-${width}w.jpg`)
  }
}
```

### Step 4: Crop, Rotate, and Transform

```javascript
// transform.js — Crop, rotate, flip, and extract regions
import sharp from 'sharp'

// Center crop to square (for avatars/thumbnails)
await sharp('portrait.jpg')
  .resize(300, 300, { fit: 'cover', position: 'centre' })
  .toFile('avatar.jpg')

// Extract specific region
await sharp('photo.jpg')
  .extract({ left: 100, top: 50, width: 500, height: 500 })
  .toFile('cropped.jpg')

// Rotate (auto-rotate based on EXIF, or manual)
await sharp('photo.jpg')
  .rotate()                   // auto-rotate from EXIF orientation
  .toFile('rotated.jpg')

await sharp('photo.jpg')
  .rotate(90)                 // explicit 90° clockwise
  .toFile('rotated90.jpg')

// Flip and flop
await sharp('photo.jpg').flip().toFile('flipped.jpg')     // vertical flip
await sharp('photo.jpg').flop().toFile('flopped.jpg')     // horizontal mirror
```

### Step 5: Watermark and Compositing

```javascript
// watermark.js — Overlay watermark, compose multiple images
import sharp from 'sharp'

// Add watermark
await sharp('photo.jpg')
  .composite([{
    input: 'watermark.png',
    gravity: 'southeast',      // bottom-right corner
    blend: 'over',
  }])
  .toFile('watermarked.jpg')

// Text watermark (create text as SVG, then overlay)
const svgText = `
  <svg width="400" height="50">
    <text x="0" y="35" font-size="30" fill="white" opacity="0.5"
          font-family="Arial">© 2025 My Company</text>
  </svg>`

await sharp('photo.jpg')
  .composite([{
    input: Buffer.from(svgText),
    gravity: 'south',
  }])
  .toFile('branded.jpg')

// Create image collage (multiple images on a canvas)
await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#ffffff' } })
  .composite([
    { input: await sharp('img1.jpg').resize(400, 300).toBuffer(), left: 0, top: 0 },
    { input: await sharp('img2.jpg').resize(400, 300).toBuffer(), left: 400, top: 0 },
    { input: await sharp('img3.jpg').resize(400, 300).toBuffer(), left: 800, top: 0 },
  ])
  .jpeg()
  .toFile('collage.jpg')
```

### Step 6: Metadata and Analysis

```javascript
// metadata.js — Extract image metadata and stats
import sharp from 'sharp'

const metadata = await sharp('photo.jpg').metadata()
console.log(metadata)
// { width: 4032, height: 3024, format: 'jpeg', space: 'srgb',
//   channels: 3, depth: 'uchar', density: 72, hasAlpha: false,
//   orientation: 1, exif: Buffer, icc: Buffer }

// Get image statistics (min, max, mean for each channel)
const stats = await sharp('photo.jpg').stats()
console.log(stats.channels[0])    // { min: 0, max: 255, sum: 12345678, mean: 128.5, ... }

// Strip metadata (EXIF, ICC) for privacy
await sharp('photo.jpg')
  .rotate()                     // apply EXIF rotation first
  .withMetadata({ orientation: undefined })   // strip EXIF
  .toFile('stripped.jpg')
```

### Step 7: Batch Processing

```javascript
// batch.js — Process all images in a directory
import sharp from 'sharp'
import { readdir } from 'fs/promises'
import path from 'path'

async function optimizeDirectory(inputDir, outputDir, maxWidth = 1920) {
  /**
   * Batch optimize all images: resize, convert to WebP, compress.
   * Args:
   *   inputDir: Source directory with images
   *   outputDir: Destination for optimized images
   *   maxWidth: Maximum width (maintains aspect ratio)
   */
  const files = await readdir(inputDir)
  const imageFiles = files.filter(f => /\.(jpe?g|png|tiff?|webp)$/i.test(f))

  let processed = 0
  for (const file of imageFiles) {
    const inputPath = path.join(inputDir, file)
    const outputName = file.replace(/\.[^.]+$/, '.webp')
    const outputPath = path.join(outputDir, outputName)

    const meta = await sharp(inputPath).metadata()
    const pipeline = sharp(inputPath)

    if (meta.width > maxWidth) {
      pipeline.resize(maxWidth)
    }

    await pipeline.webp({ quality: 80 }).toFile(outputPath)
    processed++
  }

  console.log(`Optimized ${processed} images`)
}
```

## Examples

### Example 1: Build an image upload pipeline for a web app
**User prompt:** "Users upload profile photos. I need to generate a 200x200 avatar thumbnail, a 800px wide display version, and a tiny 40x40 version for comments, all in WebP."

The agent will:
1. Accept the upload buffer via `sharp(buffer)`.
2. Auto-rotate based on EXIF to handle phone photos.
3. Generate three variants with `resize()` + `webp()`, using `fit: 'cover'` for the square crops.
4. Strip EXIF metadata for privacy.
5. Return buffers or save to disk/S3.

### Example 2: Optimize a website's image assets for performance
**User prompt:** "Our marketing site has 200+ images totaling 800MB. Optimize them — convert to WebP, resize anything over 1920px, and generate AVIF variants for modern browsers."

The agent will:
1. Scan the images directory, read metadata for each file.
2. Skip already-small images, resize large ones to max 1920px width.
3. Generate WebP (quality 80) and AVIF (quality 50) variants.
4. Report total size savings and per-file breakdown.

## Guidelines

- Sharp is the fastest Node.js image library (10-100x faster than ImageMagick/GraphicsMagick via Node bindings). Prefer it for server-side image processing.
- Always call `.rotate()` before other transforms when processing user uploads — it applies EXIF orientation, preventing rotated phone photos.
- Use WebP (quality 80) as the default web format — it's 25-35% smaller than JPEG at equivalent quality and supported by all modern browsers.
- AVIF offers even better compression (50% smaller than JPEG) but encoding is slower. Use it for static assets, not real-time processing.
- Sharp operations are chainable and lazy — they only execute when you call `.toFile()` or `.toBuffer()`. Chain all transforms before outputting.
- For concurrent processing, Sharp uses a thread pool. It handles parallelism internally — you don't need to manage worker threads.
- Strip EXIF metadata from user uploads for privacy — photos from phones contain GPS coordinates, camera model, and timestamps.
