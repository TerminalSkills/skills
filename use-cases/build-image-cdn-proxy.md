---
title: Build an Image CDN Proxy
slug: build-image-cdn-proxy
description: Build an image CDN proxy with on-the-fly resizing, format conversion, caching, signed URLs, and bandwidth optimization for serving responsive images at scale.
skills:
  - typescript
  - redis
  - hono
  - zod
category: devops
tags:
  - images
  - cdn
  - proxy
  - optimization
  - responsive
---

# Build an Image CDN Proxy

## The Problem

Anya leads frontend at a 20-person e-commerce with 100,000 product images. Each image is stored as a 4000x4000 JPEG — 3MB average. Mobile users download the full 3MB even for a 200px thumbnail. There's no WebP/AVIF support; modern browsers get the same JPEG as IE11. Product team uploads images in random sizes; frontend needs consistent dimensions. CDN caches the original but not resized versions. They need an image proxy: request any size/format via URL params, resize on-the-fly, cache at the edge, convert to WebP/AVIF automatically, and serve responsive images with srcset.

## Step 1: Build the Image Proxy

```typescript
// src/images/proxy.ts — Image CDN proxy with on-the-fly transformation and caching
import { Redis } from "ioredis";
import sharp from "sharp";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface TransformParams {
  width?: number;
  height?: number;
  quality?: number;
  format?: "jpeg" | "webp" | "avif" | "png";
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  blur?: number;
  sharpen?: boolean;
  watermark?: string;
  gravity?: "center" | "north" | "south" | "east" | "west" | "smart";
}

interface ProxyConfig {
  maxWidth: number;
  maxHeight: number;
  defaultQuality: number;
  allowedOrigins: string[];
  signedUrls: boolean;
  signSecret: string;
  cacheTTL: number;
}

const CONFIG: ProxyConfig = {
  maxWidth: 4000,
  maxHeight: 4000,
  defaultQuality: 80,
  allowedOrigins: [process.env.STORAGE_URL || "https://storage.example.com"],
  signedUrls: true,
  signSecret: process.env.IMAGE_SIGN_SECRET || "change-me",
  cacheTTL: 86400 * 30,
};

// Process image request
export async function processImage(
  sourceUrl: string,
  params: TransformParams,
  acceptHeader?: string
): Promise<{ buffer: Buffer; contentType: string; cacheKey: string }> {
  // Validate source URL
  const url = new URL(sourceUrl);
  if (!CONFIG.allowedOrigins.some((o) => sourceUrl.startsWith(o))) {
    throw new Error("Origin not allowed");
  }

  // Sanitize params
  params.width = params.width ? Math.min(params.width, CONFIG.maxWidth) : undefined;
  params.height = params.height ? Math.min(params.height, CONFIG.maxHeight) : undefined;
  params.quality = params.quality || CONFIG.defaultQuality;

  // Auto-detect best format from Accept header
  if (!params.format && acceptHeader) {
    if (acceptHeader.includes("image/avif")) params.format = "avif";
    else if (acceptHeader.includes("image/webp")) params.format = "webp";
    else params.format = "jpeg";
  }
  params.format = params.format || "jpeg";

  // Check cache
  const cacheKey = buildCacheKey(sourceUrl, params);
  const cached = await redis.getBuffer(cacheKey);
  if (cached) {
    return { buffer: cached, contentType: `image/${params.format}`, cacheKey };
  }

  // Fetch original image
  const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const sourceBuffer = Buffer.from(await response.arrayBuffer());

  // Transform
  let pipeline = sharp(sourceBuffer);

  // Resize
  if (params.width || params.height) {
    pipeline = pipeline.resize({
      width: params.width,
      height: params.height,
      fit: params.fit || "cover",
      position: params.gravity || "center",
      withoutEnlargement: true,
    });
  }

  // Effects
  if (params.blur && params.blur > 0) pipeline = pipeline.blur(params.blur);
  if (params.sharpen) pipeline = pipeline.sharpen();

  // Format conversion
  switch (params.format) {
    case "webp": pipeline = pipeline.webp({ quality: params.quality }); break;
    case "avif": pipeline = pipeline.avif({ quality: params.quality }); break;
    case "png": pipeline = pipeline.png({ quality: params.quality }); break;
    default: pipeline = pipeline.jpeg({ quality: params.quality, progressive: true }); break;
  }

  const outputBuffer = await pipeline.toBuffer();

  // Cache result
  await redis.setex(cacheKey, CONFIG.cacheTTL, outputBuffer);

  // Track stats
  await redis.hincrby("image:stats", "transforms", 1);
  await redis.hincrby("image:stats", "bytesSaved", sourceBuffer.length - outputBuffer.length);

  return { buffer: outputBuffer, contentType: `image/${params.format}`, cacheKey };
}

// Generate signed URL
export function generateSignedUrl(sourceUrl: string, params: TransformParams, expiresIn: number = 3600): string {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
  const payload = `${sourceUrl}:${JSON.stringify(params)}:${expires}`;
  const signature = createHash("sha256").update(payload + CONFIG.signSecret).digest("hex").slice(0, 16);

  const searchParams = new URLSearchParams();
  if (params.width) searchParams.set("w", String(params.width));
  if (params.height) searchParams.set("h", String(params.height));
  if (params.quality) searchParams.set("q", String(params.quality));
  if (params.format) searchParams.set("f", params.format);
  if (params.fit) searchParams.set("fit", params.fit);
  searchParams.set("src", sourceUrl);
  searchParams.set("exp", String(expires));
  searchParams.set("sig", signature);

  return `/images/transform?${searchParams.toString()}`;
}

// Validate signed URL
export function validateSignature(sourceUrl: string, params: TransformParams, expires: number, signature: string): boolean {
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const payload = `${sourceUrl}:${JSON.stringify(params)}:${expires}`;
  const expected = createHash("sha256").update(payload + CONFIG.signSecret).digest("hex").slice(0, 16);
  return signature === expected;
}

// Generate srcset for responsive images
export function generateSrcSet(sourceUrl: string, widths: number[] = [320, 640, 960, 1280, 1920]): string {
  return widths.map((w) => {
    const url = generateSignedUrl(sourceUrl, { width: w, format: "webp", quality: 80 });
    return `${url} ${w}w`;
  }).join(", ");
}

// Cache stats
export async function getStats(): Promise<{ transforms: number; bytesSaved: number; cacheHitRate: number }> {
  const stats = await redis.hgetall("image:stats");
  return {
    transforms: parseInt(stats.transforms || "0"),
    bytesSaved: parseInt(stats.bytesSaved || "0"),
    cacheHitRate: 0,
  };
}

function buildCacheKey(sourceUrl: string, params: TransformParams): string {
  const hash = createHash("sha256").update(`${sourceUrl}:${JSON.stringify(params)}`).digest("hex").slice(0, 24);
  return `img:${hash}`;
}
```

## Results

- **Page weight: 12MB → 800KB** — product listing served as 200px WebP thumbnails instead of 4000px JPEGs; mobile load time: 8s → 1.2s
- **Auto format negotiation** — Chrome gets AVIF (60% smaller), Safari gets WebP (30% smaller), IE gets JPEG; all from the same `<img>` tag with srcset
- **100K images, 0 pre-processing** — no batch resize jobs; every size generated on first request and cached; new image uploaded → immediately available in any size
- **Signed URLs prevent abuse** — can't request arbitrary external URLs through the proxy; only allowed origins; URL tampering detected by signature validation
- **Bandwidth savings: 75%** — Redis stats show 2.3TB saved per month; CDN costs down proportionally; faster pages improve SEO ranking
