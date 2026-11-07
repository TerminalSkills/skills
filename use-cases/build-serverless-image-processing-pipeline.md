---
title: Build a Serverless Image Processing Pipeline
slug: build-serverless-image-processing-pipeline
description: >
  Turn every seller upload into resized WebP and JPEG variants with a queue-fed
  sharp worker in a container, and serve on-the-fly sizes from a Cloudflare
  Worker with CDN caching.
skills:
  - typescript
  - cloudflare-workers
  - redis
  - zod
  - hono
  - docker-helper
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

An e-commerce marketplace with 200K product listings serves millions of images a day. When a seller uploads a product photo, a monolithic server generates 6 variants (thumbnail, small, medium, large, retina, og:image). It takes 8 seconds per image, the server is a single point of failure, and during flash sales the queue backs up for 30 minutes, so new listings show placeholders. The server runs 24/7 at $800/month, even at 3 AM when nobody uploads anything.

The fix: the browser uploads straight to object storage, a queue hands each image to a containerised worker that makes the variants, and a Cloudflare Worker resizes anything else on demand and caches it at the edge.

## Step 1: Variant Definitions

Describe variants once with Zod and derive the type from the schema; the schema is a value, so `ImageVariant[]` needs the exported type.

```typescript
// src/images/variants.ts
import { z } from 'zod';

export const ImageVariantSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'fill', 'inside', 'outside']),
  format: z.enum(['webp', 'jpeg']),
  quality: z.number().int().min(1).max(100),
});
export type ImageVariant = z.infer<typeof ImageVariantSchema>;

export const PRODUCT_VARIANTS: ImageVariant[] = [
  { name: 'thumb', width: 150, height: 150, fit: 'cover', format: 'webp', quality: 75 },
  { name: 'small', width: 300, height: 300, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'medium', width: 600, height: 600, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'large', width: 1200, height: 1200, fit: 'inside', format: 'webp', quality: 85 },
  { name: 'retina', width: 2400, height: 2400, fit: 'inside', format: 'webp', quality: 80 },
  { name: 'og', width: 1200, height: 630, fit: 'cover', format: 'jpeg', quality: 85 },
];

export const CATEGORIES = {
  product: PRODUCT_VARIANTS,
  avatar: [{ name: 'small', width: 64, height: 64, fit: 'cover', format: 'webp', quality: 80 }] as ImageVariant[],
} as const;
export type Category = keyof typeof CATEGORIES;
```

## Step 2: The Processing Worker

`sharp` reads the original once, applies the EXIF rotation, and writes each variant. (Add `avif` or `png` branches to the `switch` if you need them; PNG takes `compressionLevel`, and `quality` only with `palette: true`.) The BullMQ `Worker` on the other end of the queue calls this function; Redis (see the `redis` skill) is only the job store.

```typescript
// src/images/processor.ts
import sharp from 'sharp';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CATEGORIES, type Category, type ImageVariant } from './variants';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function processImage(sourceKey: string, variants: ImageVariant[], outputPrefix: string) {
  const source = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: sourceKey }));
  const sourceBuffer = Buffer.from(await source.Body!.transformToByteArray());

  return Promise.all(variants.map(async (variant) => {
    let pipeline = sharp(sourceBuffer, { failOn: 'error' })
      .rotate() // apply EXIF orientation, then drop the tag
      .resize(variant.width, variant.height, { fit: variant.fit, withoutEnlargement: true });

    switch (variant.format) {
      case 'webp': pipeline = pipeline.webp({ quality: variant.quality, effort: 4 }); break;
      case 'jpeg': pipeline = pipeline.jpeg({ quality: variant.quality, mozjpeg: true }); break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    const key = `${outputPrefix}/${variant.name}.${variant.format}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_CDN_BUCKET!,
      Key: key,
      Body: data,
      ContentType: `image/${variant.format}`,
      CacheControl: 'public, max-age=31536000, immutable', // safe: every upload gets a new UUID prefix
    }));
    return { variant: variant.name, key, sizeBytes: data.length, width: info.width, height: info.height };
  }));
}

// BullMQ requires maxRetriesPerRequest: null on the connection a Worker uses.
const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

new Worker(
  'image-processing',
  async (job) => {
    const { imageId, sourceKey, category } = job.data as { imageId: string; sourceKey: string; category: Category };
    return processImage(sourceKey, CATEGORIES[category], `images/${imageId}`);
  },
  { connection, concurrency: 2 }, // each job holds decoded pixels; scale with containers
);
```

## Step 3: Package the Worker as a Container

The worker is the only long-running piece, so it is the part to containerise. Use the `docker-helper` conventions (with a `.dockerignore` that excludes `node_modules`, `.git` and `.env`): multi-stage build, a currently supported Node LTS (Node 20 reached end of life in April 2026), a non-root user, and nothing but production dependencies in the final image. `sharp` ships prebuilt binaries for Alpine (musl), so no compiler is needed.

```dockerfile
# Dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
USER node
CMD ["node", "dist/images/processor.js"]
```

For local runs, a Compose file keeps Redis private to the host and takes secrets from `.env` instead of the file:

```yaml
# compose.yaml
services:
  redis:
    image: redis:8-alpine
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD:?set it in .env}"]
    ports:
      - "127.0.0.1:6379:6379"
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD}

  worker:
    build: .
    environment:
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      AWS_REGION: ${AWS_REGION}
      S3_BUCKET: ${S3_BUCKET}
      S3_CDN_BUCKET: ${S3_CDN_BUCKET}
      AWS_ACCESS_KEY_ID: ${AWS_ACCESS_KEY_ID}
      AWS_SECRET_ACCESS_KEY: ${AWS_SECRET_ACCESS_KEY}
    depends_on: [redis]
```

Check the merged file with `docker compose config`, then `docker compose up -d`. In production, give the worker an IAM role or workload identity instead of access keys and run it on whatever container platform you already have; add replicas when the queue grows.

## Step 4: Upload API

The API hands out a short-lived presigned URL, then waits for the browser to say the upload finished. Enqueueing with a fixed delay (guessing when the upload completes) loses images on slow connections, so the queue entry is created by an explicit `complete` call that first checks the object exists and is a sane size.

```typescript
// src/api/upload.ts
import { Hono } from 'hono';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = new Hono();
const connection = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const processQueue = new Queue('image-processing', { connection });
const s3 = new S3Client({ region: process.env.AWS_REGION });
const MAX_BYTES = 25 * 1024 * 1024;

const UploadRequest = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  category: z.enum(['product', 'avatar']),
});

app.post('/v1/images/upload-url', async (c) => {
  const body = UploadRequest.safeParse(await c.req.json());
  if (!body.success) return c.json({ error: body.error.flatten() }, 400);

  const imageId = crypto.randomUUID();
  const key = `originals/${imageId}`; // never put a client-supplied filename in the key
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, ContentType: body.data.contentType }),
    { expiresIn: 300 },
  );
  return c.json({ imageId, uploadUrl, key });
});

app.post('/v1/images/:imageId/complete', async (c) => {
  const imageId = c.req.param('imageId');
  const body = z.object({ category: z.enum(['product', 'avatar']) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success || !z.string().uuid().safeParse(imageId).success) return c.json({ error: 'bad request' }, 400);
  const { category } = body.data;

  const key = `originals/${imageId}`;
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    const size = head.ContentLength ?? 0;
    if (size === 0 || size > MAX_BYTES) return c.json({ error: 'empty or too large' }, size ? 413 : 400);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(head.ContentType ?? '')) return c.json({ error: 'bad type' }, 415);
  } catch {
    return c.json({ error: 'upload not found' }, 404);
  }

  await processQueue.add('process', { imageId, sourceKey: key, category }, {
    jobId: imageId, // a repeated call cannot enqueue the same image twice
    attempts: 3,
  });
  return c.json({ imageId, status: 'queued' }, 202);
});

export default app;
```

A presigned PUT cannot enforce a size limit, so the size is checked at `complete`. Put authentication in front of both routes.

## Step 5: On-the-Fly Sizes at the Edge

For sizes and formats the batch job did not pre-generate, a Cloudflare Worker (see `cloudflare-workers`) fetches the original and asks Cloudflare to transform it with `cf.image` on the subrequest. This needs Image Transformations enabled for the zone, and the Worker's path must not overlap the path of the originals, or the Worker fetches itself in a loop. Transformations are billed to the account that owns the Worker, so callers choose from named presets, not arbitrary sizes.

```typescript
// src/images/edge-transform.ts: Cloudflare Worker
import { Hono } from 'hono';

const app = new Hono<{ Bindings: { ORIGIN_BASE: string } }>();

const PRESETS = {
  thumb: { width: 150, height: 150, fit: 'cover' },
  small: { width: 300, height: 300, fit: 'scale-down' },
  medium: { width: 600, height: 600, fit: 'scale-down' },
  large: { width: 1200, height: 1200, fit: 'scale-down' },
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Serve at /images/:id/:variant?f=webp
app.get('/images/:id/:variant', async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) return c.text('Not found', 404);

  const variant = c.req.param('variant') as keyof typeof PRESETS | undefined;
  const format = c.req.query('f') === 'jpeg' ? 'jpeg' : 'webp';

  if (!variant || !(variant in PRESETS)) return c.text('Unknown variant', 404);
  const size = PRESETS[variant];

  const cache = caches.default;
  const cached = await cache.match(c.req.raw);
  if (cached) return cached;

  // One subrequest: Cloudflare fetches the original and transforms it.
  const upstream = await fetch(`${c.env.ORIGIN_BASE}/originals/${id}`, {
    cf: { image: { ...size, format, quality: 80 } },
  } as RequestInit);
  if (!upstream.ok) return c.text('Not found', 404);

  const response = new Response(upstream.body, {
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? `image/${format}`,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()));
  return response;
});

export default app;
```

`ORIGIN_BASE` is a Worker variable (for example `https://assets.example.com`); the 404 on a bad id keeps callers from walking the origin. It must serve the `originals/` objects over HTTPS, for example through a CDN with origin access to the private bucket.

## Results
The example team's numbers after the switch: processing time per image fell from 8 seconds to about 1.2, flash-sale uploads no longer queue behind each other because workers scale with the queue, and infrastructure cost dropped from $800/month to about $150/month once the always-on server was replaced by a small worker fleet sized to upload volume.

## Related Skills
- `typescript`, `zod`: shared variant types and request validation
- `hono`: the upload API and the edge Worker routes
- `redis`: BullMQ job storage
- `cloudflare-workers`: edge transformation and caching
- `docker-helper`: the worker image and local Compose file
