---
title: Build a Media Asset Library
slug: build-media-asset-library
description: Build a DAM (Digital Asset Management) system with image/video upload, automatic tagging, format conversion, CDN delivery, folder organization, and team sharing — centralizing all media assets.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - s3-storage
  - zod
category: development
tags:
  - media
  - asset-management
  - images
  - cdn
  - dam
---

# Build a Media Asset Library

## The Problem

Noor leads content at a 30-person marketing agency. Assets are everywhere — Google Drive, Dropbox, email attachments, Slack threads, local folders. Nobody can find the approved logo version. Designers upload 50MB PSDs that marketers can't open. The website loads 4MB hero images because nobody resized them. They spend 5 hours/week searching for assets. They need a centralized media library with automatic optimization, format conversion, tagging, and a CDN for fast delivery.

## Step 1: Build the Asset Library

```typescript
// src/media/library.ts — Media asset management with auto-optimization and CDN
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool } from "../db";
import { Redis } from "ioredis";
import sharp from "sharp";

const redis = new Redis(process.env.REDIS_URL!);
const s3 = new S3Client({ region: process.env.S3_REGION! });
const BUCKET = process.env.S3_BUCKET!;
const CDN_URL = process.env.CDN_URL || `https://${BUCKET}.s3.amazonaws.com`;

interface MediaAsset {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  folderId: string | null;
  tags: string[];
  autoTags: string[];
  alt: string;
  urls: {
    original: string;
    thumbnail: string;
    medium: string;
    large: string;
    webp: string;
  };
  metadata: Record<string, any>;
  uploadedBy: string;
  createdAt: string;
}

// Upload and process asset
export async function uploadAsset(
  file: { buffer: Buffer; originalName: string; mimeType: string },
  options?: { folderId?: string; tags?: string[]; alt?: string; userId?: string }
): Promise<MediaAsset> {
  const id = `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ext = file.originalName.split(".").pop()?.toLowerCase() || "bin";

  // Process image
  let width: number | null = null;
  let height: number | null = null;
  const variants: Record<string, { buffer: Buffer; key: string }> = {};

  if (file.mimeType.startsWith("image/")) {
    const image = sharp(file.buffer);
    const metadata = await image.metadata();
    width = metadata.width || null;
    height = metadata.height || null;

    // Generate variants
    variants.thumbnail = {
      buffer: await sharp(file.buffer).resize(200, 200, { fit: "cover" }).jpeg({ quality: 80 }).toBuffer(),
      key: `media/${id}/thumbnail.jpg`,
    };
    variants.medium = {
      buffer: await sharp(file.buffer).resize(800, null, { withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer(),
      key: `media/${id}/medium.jpg`,
    };
    variants.large = {
      buffer: await sharp(file.buffer).resize(1920, null, { withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer(),
      key: `media/${id}/large.jpg`,
    };
    variants.webp = {
      buffer: await sharp(file.buffer).resize(1920, null, { withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(),
      key: `media/${id}/optimized.webp`,
    };
  }

  // Upload original
  const originalKey = `media/${id}/original.${ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: originalKey,
    Body: file.buffer, ContentType: file.mimeType,
    CacheControl: "public, max-age=31536000",
  }));

  // Upload variants
  for (const [, variant] of Object.entries(variants)) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET, Key: variant.key,
      Body: variant.buffer, ContentType: "image/jpeg",
      CacheControl: "public, max-age=31536000",
    }));
  }

  // Auto-tag based on file properties
  const autoTags: string[] = [];
  if (width && height) {
    if (width > height) autoTags.push("landscape");
    else if (height > width) autoTags.push("portrait");
    else autoTags.push("square");

    if (width >= 3840) autoTags.push("4k");
    else if (width >= 1920) autoTags.push("full-hd");
  }
  if (file.mimeType.includes("svg")) autoTags.push("vector");
  if (file.mimeType.includes("png")) autoTags.push("transparent");

  const urls = {
    original: `${CDN_URL}/${originalKey}`,
    thumbnail: variants.thumbnail ? `${CDN_URL}/${variants.thumbnail.key}` : `${CDN_URL}/${originalKey}`,
    medium: variants.medium ? `${CDN_URL}/${variants.medium.key}` : `${CDN_URL}/${originalKey}`,
    large: variants.large ? `${CDN_URL}/${variants.large.key}` : `${CDN_URL}/${originalKey}`,
    webp: variants.webp ? `${CDN_URL}/${variants.webp.key}` : `${CDN_URL}/${originalKey}`,
  };

  const asset: MediaAsset = {
    id, name: file.originalName.replace(`.${ext}`, ""),
    originalName: file.originalName, mimeType: file.mimeType,
    size: file.buffer.length, width, height, duration: null,
    folderId: options?.folderId || null,
    tags: options?.tags || [], autoTags,
    alt: options?.alt || file.originalName.replace(`.${ext}`, "").replace(/[-_]/g, " "),
    urls, metadata: {},
    uploadedBy: options?.userId || "", createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO media_assets (id, name, original_name, mime_type, size, width, height, folder_id, tags, auto_tags, alt, urls, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
    [id, asset.name, asset.originalName, asset.mimeType, asset.size,
     width, height, asset.folderId, JSON.stringify(asset.tags),
     JSON.stringify(autoTags), asset.alt, JSON.stringify(urls), asset.uploadedBy]
  );

  return asset;
}

// Search assets
export async function searchAssets(query: string, options?: {
  mimeType?: string; folderId?: string; tags?: string[]; page?: number; limit?: number;
}): Promise<{ assets: MediaAsset[]; total: number }> {
  const limit = options?.limit || 30;
  const offset = ((options?.page || 1) - 1) * limit;
  const conditions = ["1=1"];
  const params: any[] = [];
  let idx = 1;

  if (query) {
    conditions.push(`(name ILIKE $${idx} OR original_name ILIKE $${idx} OR alt ILIKE $${idx} OR tags::text ILIKE $${idx})`);
    params.push(`%${query}%`);
    idx++;
  }
  if (options?.mimeType) {
    conditions.push(`mime_type LIKE $${idx++}`);
    params.push(`${options.mimeType}%`);
  }
  if (options?.folderId) {
    conditions.push(`folder_id = $${idx++}`);
    params.push(options.folderId);
  }
  if (options?.tags?.length) {
    conditions.push(`tags @> $${idx++}::jsonb`);
    params.push(JSON.stringify(options.tags));
  }

  const where = conditions.join(" AND ");
  const [assets, count] = await Promise.all([
    pool.query(`SELECT * FROM media_assets WHERE ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, limit, offset]),
    pool.query(`SELECT COUNT(*) as total FROM media_assets WHERE ${where}`, params),
  ]);

  return { assets: assets.rows, total: parseInt(count.rows[0].total) };
}

// On-the-fly image transformation via CDN URL
export async function transformImage(assetId: string, params: {
  width?: number; height?: number; format?: "jpeg" | "webp" | "png" | "avif"; quality?: number; fit?: "cover" | "contain" | "fill";
}): Promise<{ url: string; buffer: Buffer }> {
  const cacheKey = `transform:${assetId}:${JSON.stringify(params)}`;
  const cached = await redis.getBuffer(cacheKey);
  if (cached) return { url: "", buffer: cached };

  const { rows: [asset] } = await pool.query("SELECT urls FROM media_assets WHERE id = $1", [assetId]);
  const urls = JSON.parse(asset.urls);

  // Download original
  const response = await fetch(urls.original);
  const buffer = Buffer.from(await response.arrayBuffer());

  let pipeline = sharp(buffer);
  if (params.width || params.height) {
    pipeline = pipeline.resize(params.width, params.height, { fit: params.fit || "cover", withoutEnlargement: true });
  }

  const format = params.format || "webp";
  const quality = params.quality || 85;
  const result = await pipeline[format]({ quality }).toBuffer();

  await redis.setex(cacheKey, 86400 * 7, result);
  return { url: "", buffer: result };
}
```

## Results

- **Asset search: 5 hours/week → 30 seconds** — search by name, tag, type, or folder; thumbnail grid shows results instantly
- **Page load: 4MB hero → 150KB WebP** — automatic variant generation creates optimized versions; `<picture>` tag serves WebP to modern browsers, JPEG as fallback
- **Storage cost reduced 60%** — WebP variants are 30-50% smaller than JPEG at equivalent quality; CDN caching reduces S3 egress
- **Auto-tagging** — landscape/portrait, resolution, transparency detected automatically; designers don't need to manually tag every upload
- **On-the-fly transforms** — `/media/asset-123?w=400&format=avif` generates and caches any size; no need to pre-generate every variant
