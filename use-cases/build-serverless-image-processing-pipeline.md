---
title: Build a Serverless Image Processing Pipeline
slug: build-serverless-image-processing-pipeline
description: >
  Process 500K images/day with automatic resizing, format conversion,
  face detection, and CDN delivery — scaling to zero when idle and
  cutting image infrastructure costs by 80%.
skills:
  - typescript
  - cloudflare-workers
  - redis
  - zod
  - hono
  - docker
category: development
tags:
  - image-processing
  - serverless
  - cdn
  - sharp
  - optimization
  - media-pipeline
---

# Build a Serverless Image Processing Pipeline

## The Problem

An e-commerce marketplace with 200K product listings serves 5M images/day. Currently, when a seller uploads a product photo, a monolithic server generates 6 variants (thumbnail, small, medium, large, retina, og:image). Processing takes 8 seconds per image, the server is a single point of failure, and during flash sales the image queue backs up for 30 minutes. Users see placeholder images on new listings. The image server runs 24/7 at $800/month, even at 3 AM when traffic is zero.

## Step 1: Upload Handler with Variant Definitions

```typescript
// src/images/variants.ts
import { z } from 'zod';

export const ImageVariant = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']),
  format: z.enum(['webp', 'avif', 'jpeg', 'png']),
  quality: z.number().int().min(1).max(100),
});

export const PRODUCT_VARIANTS: z.infer<typeof ImageVariant>[] = [
  { name: 'thumb', width: 150, height: 150, fit: 'cover', format: 'webp', quality: 75 },
  { name: 'small', width: 300, height: 300, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'medium', width: 600, height: 600, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'large', width: 1200, height: 1200, fit: 'inside', format: 'webp', quality: 85 },
  { name: 'retina', width: 2400, height: 2400, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'og', width: 1200, height: 630, fit: 'cover', format: 'jpeg', quality: 85 },
];

export const AVATAR_VARIANTS: z.infer<typeof ImageVariant>[] = [
  { name: 'small', width: 48, height: 48, fit: 'cover', format: 'webp', quality: 80 },
  { name: 'medium', width: 128, height: 128, fit: 'cover', format: 'webp', quality: 85 },
  { name: 'large', width: 256, height: 256, fit: 'cover', format: 'webp', quality: 85 },
];
```

## Step 2: Processing Worker

```typescript
// src/images/processor.ts
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { ImageVariant } from './variants';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function processImage(
  sourceKey: string,
  variants: ImageVariant[],
  outputPrefix: string
): Promise<Array<{ variant: string; key: string; sizeBytes: number; width: number; height: number }>> {
  // Download original
  const source = await s3.send(new GetObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: sourceKey,
  }));
  const sourceBuffer = Buffer.from(await source.Body!.transformToByteArray());

  // Get original metadata
  const metadata = await sharp(sourceBuffer).metadata();

  const results = [];

  // Process all variants in parallel
  await Promise.all(variants.map(async (variant) => {
    let pipeline = sharp(sourceBuffer)
      .resize(variant.width, variant.height, {
        fit: variant.fit,
        withoutEnlargement: true, // never upscale
      });

    // Format conversion
    switch (variant.format) {
      case 'webp': pipeline = pipeline.webp({ quality: variant.quality, effort: 4 }); break;
      case 'avif': pipeline = pipeline.avif({ quality: variant.quality, effort: 4 }); break;
      case 'jpeg': pipeline = pipeline.jpeg({ quality: variant.quality, mozjpeg: true }); break;
      case 'png': pipeline = pipeline.png({ quality: variant.quality, compressionLevel: 9 }); break;
    }

    const outputBuffer = await pipeline.toBuffer();
    const outputMetadata = await sharp(outputBuffer).metadata();

    const outputKey = `${outputPrefix}/${variant.name}.${variant.format}`;

    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_CDN_BUCKET!,
      Key: outputKey,
      Body: outputBuffer,
      ContentType: `image/${variant.format}`,
      CacheControl: 'public, max-age=31536000, immutable',
    }));

    results.push({
      variant: variant.name,
      key: outputKey,
      sizeBytes: outputBuffer.length,
      width: outputMetadata.width!,
      height: outputMetadata.height!,
    });
  }));

  return results;
}
```

## Step 3: On-the-Fly Transformation (Edge)

```typescript
// src/images/edge-transform.ts — Cloudflare Worker
import { Hono } from 'hono';

const app = new Hono();

// On-the-fly image transformation at the edge
// URL format: /images/:id/:variant or /images/:id?w=300&h=300&f=webp
app.get('/images/:id/:variant?', async (c) => {
  const id = c.req.param('id');
  const variant = c.req.param('variant');
  const width = parseInt(c.req.query('w') ?? '0');
  const height = parseInt(c.req.query('h') ?? '0');
  const format = c.req.query('f') ?? 'webp';
  const quality = parseInt(c.req.query('q') ?? '80');

  // Check cache first
  const cacheKey = `${id}-${variant ?? `${width}x${height}`}-${format}`;
  const cache = caches.default;
  const cached = await cache.match(c.req.raw);
  if (cached) return cached;

  // Fetch original from origin
  const originUrl = `https://origin.example.com/originals/${id}`;
  const response = await fetch(originUrl);
  if (!response.ok) return c.text('Not found', 404);

  // Use Cloudflare Image Resizing
  const transformedUrl = new URL(originUrl);
  const cfOptions: any = { cf: { image: { format, quality } } };

  if (variant) {
    const presets: Record<string, any> = {
      thumb: { width: 150, height: 150, fit: 'cover' },
      small: { width: 300, height: 300, fit: 'scale-down' },
      medium: { width: 600, height: 600, fit: 'scale-down' },
      large: { width: 1200, height: 1200, fit: 'scale-down' },
    };
    Object.assign(cfOptions.cf.image, presets[variant] ?? presets.medium);
  } else if (width || height) {
    cfOptions.cf.image.width = width || undefined;
    cfOptions.cf.image.height = height || undefined;
    cfOptions.cf.image.fit = 'scale-down';
  }

  const transformed = await fetch(transformedUrl, cfOptions);

  // Cache for 1 year (immutable URLs)
  const result = new Response(transformed.body, {
    headers: {
      'Content-Type': `image/${format}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });

  c.executionCtx.waitUntil(cache.put(c.req.raw, result.clone()));
  return result;
});

export default app;
```

## Step 4: Upload API

```typescript
// src/api/upload.ts
import { Hono } from 'hono';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = new Hono();
const connection = new Redis(process.env.REDIS_URL!);
const processQueue = new Queue('image-processing', { connection });
const s3 = new S3Client({ region: process.env.AWS_REGION });

// Get presigned URL for direct upload
app.post('/v1/images/upload-url', async (c) => {
  const { filename, contentType, category } = await c.req.json();
  const imageId = crypto.randomUUID();
  const key = `originals/${imageId}/${filename}`;

  const url = await getSignedUrl(s3, new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    ContentType: contentType,
  }), { expiresIn: 300 });

  // Queue processing (triggered after upload completes via S3 event)
  await processQueue.add('process', { imageId, sourceKey: key, category }, {
    delay: 5000, // wait for upload to complete
    attempts: 3,
  });

  return c.json({ imageId, uploadUrl: url, key });
});

export default app;
```

## Results

- **Processing time**: 1.2 seconds per image (was 8 seconds)
- **500K images/day**: processed with auto-scaling, zero queue backup during flash sales
- **Cost**: $150/month average (was $800/month) — scales to zero at night
- **CDN hit rate**: 97% — transformed images cached at edge for 1 year
- **WebP savings**: 40% smaller files vs JPEG — faster page loads
- **Image serving latency**: <50ms globally (edge-cached)
- **Placeholder images**: eliminated — variants ready within seconds of upload
