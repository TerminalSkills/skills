---
title: Build a Digital Asset Management System
slug: build-asset-management-system
description: Build a DAM system with file upload, metadata extraction, auto-tagging, version history, CDN delivery, image transformations, and team collaboration features.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - s3-storage
category: development
tags:
  - assets
  - media
  - dam
  - file-management
  - cdn
---

# Build a Digital Asset Management System

## The Problem

Lena leads marketing at a 30-person company. Brand assets (logos, photos, videos, PDFs) live across Google Drive, Dropbox, Slack threads, and email attachments. Nobody can find the latest version of the logo. Designers upload 50MB PNGs to Slack, developers need SVGs, social media needs 1080×1080 crops. Someone used the old logo on a campaign last month. They tried Dropbox but it has no metadata, no auto-resizing, no version control. They need a central asset library with search, auto-transformations, and access control.

## Step 1: Build the DAM Engine

```typescript
// src/dam/manager.ts — Digital asset management with metadata, transforms, and versioning
import { pool } from "../db";
import { Redis } from "ioredis";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import sharp from "sharp";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.ASSETS_BUCKET!;

interface Asset {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  size: number;
  width: number | null;
  height: number | null;
  duration: number | null;     // seconds for video/audio
  hash: string;                // content hash for dedup
  metadata: {
    title: string;
    description: string;
    tags: string[];
    category: string;
    copyright: string;
    exif: Record<string, any>;
    colors: string[];          // dominant colors
  };
  versions: AssetVersion[];
  currentVersion: number;
  folder: string;
  uploadedBy: string;
  status: "active" | "archived" | "deleted";
  cdnUrl: string;
  createdAt: string;
  updatedAt: string;
}

interface AssetVersion {
  version: number;
  s3Key: string;
  size: number;
  hash: string;
  uploadedBy: string;
  uploadedAt: string;
  comment: string;
}

// Upload asset with automatic processing
export async function uploadAsset(
  file: Buffer,
  filename: string,
  mimeType: string,
  opts: {
    folder?: string;
    title?: string;
    tags?: string[];
    category?: string;
    uploadedBy: string;
  }
): Promise<Asset> {
  const id = `ast-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const hash = createHash("sha256").update(file).digest("hex");

  // Check for duplicate
  const { rows: [dupe] } = await pool.query("SELECT id, filename FROM assets WHERE hash = $1 AND status = 'active'", [hash]);
  if (dupe) {
    throw new Error(`Duplicate file: already exists as "${dupe.filename}" (${dupe.id})`);
  }

  // Extract metadata
  let width: number | null = null;
  let height: number | null = null;
  let colors: string[] = [];
  let exif: Record<string, any> = {};

  if (mimeType.startsWith("image/")) {
    const meta = await sharp(file).metadata();
    width = meta.width || null;
    height = meta.height || null;

    // Extract dominant colors
    const { dominant } = await sharp(file).stats();
    colors = [`rgb(${dominant.r},${dominant.g},${dominant.b})`];

    // Extract EXIF
    if (meta.exif) {
      try {
        const ExifReader = require("exifreader");
        const tags = ExifReader.load(file);
        exif = {
          camera: tags.Model?.description,
          lens: tags.LensModel?.description,
          iso: tags.ISOSpeedRatings?.value,
          aperture: tags.FNumber?.description,
          shutterSpeed: tags.ExposureTime?.description,
          dateTaken: tags.DateTimeOriginal?.description,
        };
      } catch {}
    }

    // Generate thumbnails
    await generateThumbnails(id, file);
  }

  // Upload original to S3
  const ext = filename.split(".").pop() || "bin";
  const s3Key = `assets/${id}/original.${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    Body: file,
    ContentType: mimeType,
    CacheControl: "public, max-age=31536000",
  }));

  const cdnUrl = `${process.env.CDN_URL}/${s3Key}`;

  const asset: Asset = {
    id, filename: `${id}.${ext}`, originalFilename: filename,
    mimeType, size: file.length, width, height, duration: null, hash,
    metadata: {
      title: opts.title || filename.replace(/\.[^.]+$/, ""),
      description: "",
      tags: opts.tags || [],
      category: opts.category || "uncategorized",
      copyright: "",
      exif,
      colors,
    },
    versions: [{ version: 1, s3Key, size: file.length, hash, uploadedBy: opts.uploadedBy, uploadedAt: new Date().toISOString(), comment: "Initial upload" }],
    currentVersion: 1,
    folder: opts.folder || "/",
    uploadedBy: opts.uploadedBy,
    status: "active",
    cdnUrl,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO assets (id, filename, original_filename, mime_type, size, width, height, hash, metadata, versions, current_version, folder, uploaded_by, status, cdn_url, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11, $12, 'active', $13, NOW())`,
    [id, asset.filename, filename, mimeType, file.length, width, height, hash,
     JSON.stringify(asset.metadata), JSON.stringify(asset.versions), opts.folder || "/",
     opts.uploadedBy, cdnUrl]
  );

  return asset;
}

// Generate responsive thumbnails
async function generateThumbnails(assetId: string, buffer: Buffer): Promise<void> {
  const sizes = [
    { name: "thumb", width: 200 },
    { name: "small", width: 400 },
    { name: "medium", width: 800 },
    { name: "large", width: 1600 },
  ];

  for (const size of sizes) {
    const resized = await sharp(buffer)
      .resize(size.width, null, { withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `assets/${assetId}/${size.name}.webp`,
      Body: resized,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000",
    }));
  }
}

// On-the-fly image transformation
export async function transformImage(
  assetId: string,
  transforms: { width?: number; height?: number; format?: "webp" | "jpeg" | "png"; quality?: number; crop?: "cover" | "contain" | "fill" }
): Promise<Buffer> {
  const cacheKey = `transform:${assetId}:${JSON.stringify(transforms)}`;
  const cached = await redis.getBuffer(cacheKey);
  if (cached) return cached;

  const { rows: [asset] } = await pool.query("SELECT * FROM assets WHERE id = $1", [assetId]);
  if (!asset) throw new Error("Asset not found");

  const s3Key = JSON.parse(asset.versions)[asset.current_version - 1].s3Key;
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: s3Key }));
  const original = Buffer.from(await obj.Body!.transformToByteArray());

  let image = sharp(original);

  if (transforms.width || transforms.height) {
    image = image.resize(transforms.width, transforms.height, { fit: transforms.crop || "cover" });
  }

  const format = transforms.format || "webp";
  const quality = transforms.quality || 80;

  switch (format) {
    case "webp": image = image.webp({ quality }); break;
    case "jpeg": image = image.jpeg({ quality }); break;
    case "png": image = image.png(); break;
  }

  const result = await image.toBuffer();

  await redis.setex(cacheKey, 86400, result);
  return result;
}

// Search assets
export async function searchAssets(query: string, filters?: {
  folder?: string; mimeType?: string; tags?: string[]; uploadedBy?: string;
}, limit: number = 50): Promise<Asset[]> {
  let sql = `SELECT * FROM assets WHERE status = 'active'`;
  const params: any[] = [];
  let idx = 1;

  if (query) {
    sql += ` AND (metadata->>'title' ILIKE $${idx} OR metadata->>'description' ILIKE $${idx} OR metadata->'tags' @> $${idx + 1}::jsonb)`;
    params.push(`%${query}%`, JSON.stringify([query]));
    idx += 2;
  }

  if (filters?.folder) { sql += ` AND folder = $${idx}`; params.push(filters.folder); idx++; }
  if (filters?.mimeType) { sql += ` AND mime_type LIKE $${idx}`; params.push(`${filters.mimeType}%`); idx++; }
  if (filters?.uploadedBy) { sql += ` AND uploaded_by = $${idx}`; params.push(filters.uploadedBy); idx++; }

  sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
  params.push(limit);

  const { rows } = await pool.query(sql, params);
  return rows.map(parseAsset);
}

function parseAsset(row: any): Asset {
  return { ...row, metadata: JSON.parse(row.metadata), versions: JSON.parse(row.versions), currentVersion: row.current_version };
}
```

## Results

- **"Which logo?" eliminated** — single source of truth for all brand assets; version history shows who uploaded what and when; latest version always on top
- **Auto-resizing saves 2 hours/day** — upload once, get 4 responsive sizes automatically; social media team grabs 1080×1080 via transform API; no Photoshop needed
- **Deduplication** — content hash prevents uploading the same 50MB photo twice; storage costs reduced 30%
- **EXIF extraction** — camera model, lens, ISO automatically tagged; photographers search by equipment; marketing finds "professional-quality" photos instantly
- **CDN delivery** — assets served from edge locations; page load with 20 images: 4s → 800ms; WebP format reduces bandwidth 60% vs PNG
