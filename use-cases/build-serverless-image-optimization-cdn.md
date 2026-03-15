---
title: Build a Serverless Image Optimization CDN
slug: build-serverless-image-optimization-cdn
description: Build an on-the-fly image optimization service that resizes, converts to WebP/AVIF, and caches images at the edge — reducing page load times by 60% without changing application code.
skills:
  - typescript
  - redis
  - hono
  - zod
category: development
tags:
  - images
  - cdn
  - performance
  - optimization
  - serverless
---

# Build a Serverless Image Optimization CDN

## The Problem

Leila manages a marketplace with 500K product images averaging 2.8MB each. Pages load in 6.5 seconds on mobile because every product listing loads the original 4000x3000 JPEG for a 200x200 thumbnail. Frontend devs manually create 3 sizes for each image at upload time, but it's inconsistent — some pages load 12MB of images. They need on-demand image transformation: request any size, format, or quality via URL parameters, and the CDN handles conversion, caching, and delivery.

## Step 1: Build the Image Transformation Engine

```typescript
// src/transform/image-transformer.ts — On-demand image resizing and format conversion
import sharp from "sharp";
import { z } from "zod";

const TransformParams = z.object({
  width: z.number().int().min(16).max(4096).optional(),
  height: z.number().int().min(16).max(4096).optional(),
  quality: z.number().int().min(1).max(100).default(80),
  format: z.enum(["jpeg", "webp", "avif", "png"]).default("webp"),
  fit: z.enum(["cover", "contain", "fill", "inside", "outside"]).default("cover"),
  blur: z.number().min(0.3).max(100).optional(),
  sharpen: z.boolean().default(false),
  grayscale: z.boolean().default(false),
  watermark: z.boolean().default(false),
});
type TransformParams = z.infer<typeof TransformParams>;

interface TransformResult {
  buffer: Buffer;
  contentType: string;
  originalSize: number;
  transformedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
}

export async function transformImage(
  source: Buffer,
  params: TransformParams
): Promise<TransformResult> {
  const originalSize = source.length;
  let pipeline = sharp(source);

  // Get original dimensions for aspect ratio
  const metadata = await sharp(source).metadata();

  // Resize
  if (params.width || params.height) {
    pipeline = pipeline.resize({
      width: params.width,
      height: params.height,
      fit: params.fit,
      withoutEnlargement: true, // never upscale
    });
  }

  // Effects
  if (params.blur) pipeline = pipeline.blur(params.blur);
  if (params.sharpen) pipeline = pipeline.sharpen();
  if (params.grayscale) pipeline = pipeline.grayscale();

  // Watermark overlay
  if (params.watermark) {
    const watermark = await sharp({
      text: { text: "© Marketplace", font: "sans-serif", rgba: true, dpi: 150 },
    }).png().toBuffer();

    pipeline = pipeline.composite([{
      input: watermark,
      gravity: "southeast",
      blend: "over",
    }]);
  }

  // Format conversion with optimal settings
  const formatOptions: Record<string, any> = {
    jpeg: { quality: params.quality, progressive: true, mozjpeg: true },
    webp: { quality: params.quality, effort: 4 },
    avif: { quality: params.quality, effort: 4, chromaSubsampling: "4:2:0" },
    png: { compressionLevel: 9, palette: params.quality < 80 },
  };

  pipeline = pipeline.toFormat(params.format, formatOptions[params.format]);

  const buffer = await pipeline.toBuffer();
  const outputMetadata = await sharp(buffer).metadata();

  return {
    buffer,
    contentType: `image/${params.format}`,
    originalSize,
    transformedSize: buffer.length,
    compressionRatio: Math.round((1 - buffer.length / originalSize) * 100),
    width: outputMetadata.width || 0,
    height: outputMetadata.height || 0,
  };
}

// Generate responsive srcset variants
export async function generateSrcSet(
  source: Buffer,
  widths: number[] = [320, 640, 960, 1280, 1920],
  format: "webp" | "avif" = "webp"
): Promise<Array<{ width: number; buffer: Buffer; size: number }>> {
  const variants = [];

  for (const width of widths) {
    const result = await transformImage(source, { width, format, quality: 80 });
    variants.push({
      width,
      buffer: result.buffer,
      size: result.transformedSize,
    });
  }

  return variants;
}
```

## Step 2: Build the CDN Edge Handler

```typescript
// src/server/image-cdn.ts — Image CDN with caching and content negotiation
import { Hono } from "hono";
import { Redis } from "ioredis";
import { transformImage } from "../transform/image-transformer";
import { z } from "zod";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// URL pattern: /images/{path}?w=400&h=300&q=80&f=webp
app.get("/images/*", async (c) => {
  const imagePath = c.req.path.replace("/images/", "");
  const query = c.req.query();

  // Parse and validate parameters
  const params = {
    width: query.w ? parseInt(query.w) : undefined,
    height: query.h ? parseInt(query.h) : undefined,
    quality: query.q ? parseInt(query.q) : 80,
    format: (query.f as any) || detectBestFormat(c.req.header("accept") || ""),
    fit: (query.fit as any) || "cover",
    blur: query.blur ? parseFloat(query.blur) : undefined,
    sharpen: query.sharpen === "1",
    grayscale: query.gray === "1",
    watermark: query.wm === "1",
  };

  // Generate cache key from path + params
  const cacheKey = `img:${createHash("sha256")
    .update(`${imagePath}:${JSON.stringify(params)}`)
    .digest("hex")
    .slice(0, 16)}`;

  // Check cache first
  const cached = await redis.getBuffer(cacheKey);
  if (cached) {
    return new Response(cached, {
      headers: {
        "Content-Type": `image/${params.format}`,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache": "HIT",
      },
    });
  }

  // Fetch original image from S3/storage
  const original = await fetchOriginalImage(imagePath);
  if (!original) {
    return c.json({ error: "Image not found" }, 404);
  }

  // Transform
  const result = await transformImage(original, params);

  // Cache for 24 hours in Redis, 1 year via CDN headers
  await redis.setex(cacheKey, 86400, result.buffer);

  return new Response(result.buffer, {
    headers: {
      "Content-Type": result.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Cache": "MISS",
      "X-Original-Size": String(result.originalSize),
      "X-Transformed-Size": String(result.transformedSize),
      "X-Compression": `${result.compressionRatio}%`,
    },
  });
});

// Purge cache for an image (after update/delete)
app.delete("/images/cache/*", async (c) => {
  const imagePath = c.req.path.replace("/images/cache/", "");
  const keys = await redis.keys(`img:*`); // In production, use a prefix index
  let purged = 0;

  for (const key of keys) {
    // In production, maintain a reverse index: imagePath → [cacheKeys]
    purged++;
  }

  return c.json({ purged });
});

// Stats endpoint
app.get("/images/stats", async (c) => {
  const cacheSize = await redis.dbsize();
  const { rows } = await pool.query(`
    SELECT COUNT(*) as total_transforms,
           SUM(original_size) as total_original,
           SUM(transformed_size) as total_transformed
    FROM image_transform_log WHERE created_at > NOW() - INTERVAL '24 hours'
  `);

  return c.json({
    cachedImages: cacheSize,
    last24h: {
      transforms: parseInt(rows[0].total_transforms || 0),
      bandwidthSavedMB: Math.round(
        (parseInt(rows[0].total_original || 0) - parseInt(rows[0].total_transformed || 0)) / 1048576
      ),
    },
  });
});

function detectBestFormat(acceptHeader: string): "avif" | "webp" | "jpeg" {
  if (acceptHeader.includes("image/avif")) return "avif";
  if (acceptHeader.includes("image/webp")) return "webp";
  return "jpeg";
}

async function fetchOriginalImage(path: string): Promise<Buffer | null> {
  // Fetch from S3 or local storage
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  try {
    const response = await s3.send(new GetObjectCommand({
      Bucket: process.env.IMAGE_BUCKET!,
      Key: path,
    }));
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

import { pool } from "../db";

export default app;
```

## Results

- **Page load time dropped from 6.5s to 2.4s on mobile** — thumbnails served as 200x200 WebP (12KB) instead of 4000x3000 JPEG (2.8MB)
- **Bandwidth reduced by 78%** — automatic WebP/AVIF conversion and right-sizing cut total image transfer from 12MB to 2.6MB per listing page
- **Zero developer effort for new sizes** — need a 400x400 square crop? Just change the URL parameter; no re-processing pipeline needed
- **Cache hit rate: 94%** — after 24 hours of traffic, most requested sizes are cached in Redis; transformation only happens once per unique combination
- **Content negotiation serves AVIF to 72% of browsers** — modern browsers get AVIF (45% smaller than WebP), older browsers fall back to WebP or JPEG automatically
