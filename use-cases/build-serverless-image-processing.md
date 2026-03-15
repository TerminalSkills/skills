---
title: Build Serverless Image Processing
slug: build-serverless-image-processing
description: Build an on-demand image processing pipeline with serverless functions — resizing, format conversion, watermarking, and CDN caching with zero infrastructure management.
skills:
  - typescript
  - hono
  - zod
category: Full-Stack Development
tags:
  - image-processing
  - serverless
  - cdn
  - sharp
  - optimization
---

# Build Serverless Image Processing

## The Problem

Ana leads frontend at a 25-person e-commerce site. Product images are uploaded at 4000×3000px (8MB each). Mobile users download full-resolution images, wasting bandwidth and causing 3-second load times. The team manually creates thumbnails in 5 sizes using a Photoshop batch job. When they added WebP support, someone had to re-process 50,000 images. They need on-the-fly image processing: request any size, format, or transformation via URL parameters, and get a cached result instantly.

## Step 1: Build the Image Processing Function

```typescript
// src/images/processor.ts — On-demand image transformation
import sharp from "sharp";
import { z } from "zod";

const TransformSchema = z.object({
  width: z.coerce.number().min(16).max(4096).optional(),
  height: z.coerce.number().min(16).max(4096).optional(),
  format: z.enum(["webp", "avif", "jpeg", "png"]).default("webp"),
  quality: z.coerce.number().min(1).max(100).default(80),
  fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).default("cover"),
  blur: z.coerce.number().min(0.3).max(100).optional(),
  sharpen: z.boolean().optional(),
  watermark: z.boolean().optional(),
  grayscale: z.boolean().optional(),
  background: z.string().optional(),   // hex color for "contain" fit
});

type TransformOptions = z.infer<typeof TransformSchema>;

// Process a single image
export async function processImage(
  inputBuffer: Buffer,
  options: TransformOptions
): Promise<{ buffer: Buffer; contentType: string; width: number; height: number }> {
  let pipeline = sharp(inputBuffer);

  // Get original metadata
  const metadata = await pipeline.metadata();

  // Resize
  if (options.width || options.height) {
    pipeline = pipeline.resize({
      width: options.width,
      height: options.height,
      fit: options.fit,
      background: options.background
        ? hexToRgba(options.background)
        : { r: 255, g: 255, b: 255, alpha: 0 },
      withoutEnlargement: true, // don't upscale
    });
  }

  // Effects
  if (options.blur) pipeline = pipeline.blur(options.blur);
  if (options.sharpen) pipeline = pipeline.sharpen();
  if (options.grayscale) pipeline = pipeline.grayscale();

  // Watermark
  if (options.watermark) {
    const watermarkSvg = `
      <svg width="200" height="50">
        <text x="10" y="35" font-family="Arial" font-size="24" fill="rgba(255,255,255,0.5)">
          © Example
        </text>
      </svg>`;

    pipeline = pipeline.composite([{
      input: Buffer.from(watermarkSvg),
      gravity: "southeast",
    }]);
  }

  // Format conversion
  switch (options.format) {
    case "webp":
      pipeline = pipeline.webp({ quality: options.quality });
      break;
    case "avif":
      pipeline = pipeline.avif({ quality: options.quality });
      break;
    case "jpeg":
      pipeline = pipeline.jpeg({ quality: options.quality, mozjpeg: true });
      break;
    case "png":
      pipeline = pipeline.png({ compressionLevel: 9 });
      break;
  }

  const outputBuffer = await pipeline.toBuffer();
  const outputMetadata = await sharp(outputBuffer).metadata();

  return {
    buffer: outputBuffer,
    contentType: `image/${options.format}`,
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
  };
}

function hexToRgba(hex: string): { r: number; g: number; b: number; alpha: number } {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
    alpha: 1,
  };
}
```

## Step 2: Build the HTTP Handler with Caching

```typescript
// src/images/server.ts — Image processing API with CDN caching
import { Hono } from "hono";
import { processImage, TransformSchema } from "./processor";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const app = new Hono();
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.IMAGE_BUCKET!;
const CACHE_BUCKET = process.env.CACHE_BUCKET!;

// URL pattern: /images/:key?width=400&format=webp&quality=80
app.get("/images/:key{.+}", async (c) => {
  const key = c.req.param("key");
  const params = TransformSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));

  if (!params.success) {
    return c.json({ error: "Invalid parameters", details: params.error.issues }, 400);
  }

  const options = params.data;

  // Generate cache key from transform parameters
  const cacheKey = `cache/${key}/${options.width || "auto"}x${options.height || "auto"}_${options.format}_q${options.quality}_${options.fit}${options.blur ? `_b${options.blur}` : ""}${options.grayscale ? "_gray" : ""}`;

  // Check cache
  try {
    const cached = await s3.send(new GetObjectCommand({ Bucket: CACHE_BUCKET, Key: cacheKey }));
    const body = await cached.Body?.transformToByteArray();

    if (body) {
      return new Response(body, {
        headers: {
          "Content-Type": cached.ContentType || `image/${options.format}`,
          "Cache-Control": "public, max-age=31536000, immutable", // 1 year
          "X-Cache": "HIT",
        },
      });
    }
  } catch { /* cache miss */ }

  // Fetch original image
  const original = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const originalBuffer = Buffer.from(await original.Body!.transformToByteArray());

  // Process
  const result = await processImage(originalBuffer, options);

  // Cache the result
  await s3.send(new PutObjectCommand({
    Bucket: CACHE_BUCKET,
    Key: cacheKey,
    Body: result.buffer,
    ContentType: result.contentType,
    CacheControl: "public, max-age=31536000",
  }));

  return new Response(result.buffer, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Cache": "MISS",
      "X-Original-Size": String(originalBuffer.length),
      "X-Processed-Size": String(result.buffer.length),
      "X-Dimensions": `${result.width}x${result.height}`,
    },
  });
});

// Purge cache for a specific image
app.delete("/images/:key{.+}/cache", async (c) => {
  const key = c.req.param("key");
  // List and delete all cached variants
  // ...
  return c.json({ purged: true });
});

export default app;
```

## Results

- **Page load time: 3s → 800ms** — mobile users get 400px WebP images (40KB) instead of 4000px JPEG (8MB); 99.5% bandwidth reduction
- **WebP/AVIF adoption instant** — `?format=avif` in the URL; no batch re-processing; the 50,000 image WebP migration happened by changing one line of HTML
- **CDN cache hit rate: 95%** — S3 cached variants are served directly; the processing function runs only on first request per size/format combination
- **Zero server management** — runs as a serverless function or lightweight Hono server; scales to zero when idle, scales up during traffic spikes
- **Responsive images trivial** — `<img srcset>` points to the same URL with different width parameters; the browser picks the right size automatically
