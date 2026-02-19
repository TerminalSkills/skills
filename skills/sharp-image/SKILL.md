---
name: sharp-image
description: >-
  Process images at high speed with sharp — resize, crop, convert formats,
  add watermarks, extract metadata, and generate thumbnails. Built on libvips
  for performance far exceeding Canvas or ImageMagick. Use when tasks involve
  image processing pipelines, thumbnail generation, format conversion, or
  building image upload APIs.
license: Apache-2.0
compatibility: "Node.js 14+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: design
  tags: ["sharp", "image-processing", "resize", "thumbnails", "webp"]
---

# Sharp

High-performance Node.js image processing. 4-5x faster than ImageMagick for common operations.

## Setup

```bash
# Install sharp. Pre-built binaries for most platforms.
npm install sharp
```

## Resize and Convert

```typescript
// src/images/resize.ts — Resize images and convert between formats.
// Sharp streams pixels through libvips without loading the full image into memory.
import sharp from "sharp";

// Resize to fit within 800x600, maintaining aspect ratio
await sharp("input.jpg")
  .resize(800, 600, { fit: "inside" })
  .toFile("output.jpg");

// Convert to WebP with quality control
await sharp("input.png")
  .webp({ quality: 80 })
  .toFile("output.webp");

// Generate multiple sizes for responsive images
const sizes = [320, 640, 1024, 1920];
await Promise.all(
  sizes.map((w) =>
    sharp("input.jpg")
      .resize(w)
      .webp({ quality: 80 })
      .toFile(`output-${w}w.webp`)
  )
);
```

## Thumbnails

```typescript
// src/images/thumbnail.ts — Generate square thumbnails with cover cropping.
// Attention-based cropping focuses on the most interesting part of the image.
import sharp from "sharp";

export async function generateThumbnail(
  input: Buffer | string,
  size: number = 200
): Promise<Buffer> {
  return sharp(input)
    .resize(size, size, {
      fit: "cover",
      position: sharp.strategy.attention, // smart crop
    })
    .jpeg({ quality: 85 })
    .toBuffer();
}
```

## Watermarking

```typescript
// src/images/watermark.ts — Composite a watermark image onto photos.
// Supports positioning, opacity, and tiling.
import sharp from "sharp";

export async function addWatermark(
  imagePath: string,
  watermarkPath: string,
  outputPath: string
) {
  const watermark = await sharp(watermarkPath)
    .resize(200)
    .ensureAlpha()
    .modulate({ brightness: 1, saturation: 0 })
    .toBuffer();

  await sharp(imagePath)
    .composite([
      {
        input: watermark,
        gravity: "southeast",
        blend: "over",
      },
    ])
    .toFile(outputPath);
}
```

## Metadata and Stats

```typescript
// src/images/metadata.ts — Read image metadata: dimensions, format, color space,
// EXIF data, and per-channel statistics.
import sharp from "sharp";

export async function getImageInfo(imagePath: string) {
  const metadata = await sharp(imagePath).metadata();
  const stats = await sharp(imagePath).stats();

  return {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    colorSpace: metadata.space,
    hasAlpha: metadata.hasAlpha,
    fileSize: metadata.size,
    channels: stats.channels.map((ch) => ({
      min: ch.min,
      max: ch.max,
      mean: Math.round(ch.mean),
    })),
  };
}
```

## Image Pipeline

```typescript
// src/images/pipeline.ts — Chain multiple operations in a single pass.
// Sharp pipelines are lazy — nothing executes until toFile/toBuffer.
import sharp from "sharp";

export async function processUpload(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()                          // auto-rotate from EXIF
    .resize(1200, 1200, { fit: "inside", withoutEnlargement: true })
    .sharpen({ sigma: 1.5 })
    .modulate({ brightness: 1.05 })    // slight brightness boost
    .removeAlpha()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}
```

## Streaming

```typescript
// src/images/stream.ts — Process images as streams for HTTP responses
// without buffering the entire image in memory.
import sharp from "sharp";
import { createReadStream } from "fs";
import type { Response } from "express";

export function streamResizedImage(imagePath: string, width: number, res: Response) {
  res.type("image/webp");
  createReadStream(imagePath)
    .pipe(sharp().resize(width).webp({ quality: 80 }))
    .pipe(res);
}
```
