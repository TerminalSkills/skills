---
title: Build a Media Asset Library
slug: build-media-asset-library
description: Build a DAM (Digital Asset Management) system for images with upload, automatic tagging, format conversion, CDN delivery, search, and team sharing — centralizing all media assets.
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

Noor leads content at a 30-person marketing agency. Assets are everywhere: Google Drive, Dropbox, email attachments, Slack threads, local folders. Nobody can find the approved logo version. Designers upload 50 MB files that marketers can't open. The website loads 4 MB hero images because nobody resized them. They need one library with automatic optimization, format conversion, tagging, search, and a CDN for fast delivery.

## The Solution

A small **Hono** API (Node 20+) in **TypeScript**: uploads are validated with **zod** and **sharp**, files go to private **S3** storage behind a CDN, metadata lives in **PostgreSQL**, and transformed copies are cached in **Redis**. Images only; video needs a separate transcoding job.

```bash
npm init -y && npm pkg set type=module && npm install hono @hono/node-server @hono/zod-validator zod sharp @aws-sdk/client-s3 pg ioredis
npm install -D typescript @types/node @types/pg tsx
```

Type-check with `npx tsc --noEmit`, run with `npx tsx src/index.ts`; keep `@hono/zod-validator` on a version matching your Zod major.

## Step-by-Step Walkthrough

### Step 1: The metadata table

Tags are a `text[]` column with a GIN index, so "all assets tagged logo and approved" is an indexed query. The file itself is never stored in the database.

```sql
CREATE TABLE media_assets (
  id            uuid PRIMARY KEY,
  name          text NOT NULL,
  original_name text NOT NULL,
  mime_type     text NOT NULL,
  size          integer NOT NULL,
  width         integer NOT NULL,
  height        integer NOT NULL,
  folder_id     uuid,
  tags          text[] NOT NULL DEFAULT '{}',
  auto_tags     text[] NOT NULL DEFAULT '{}',
  alt           text NOT NULL DEFAULT '',
  uploaded_by   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_assets_tags_idx ON media_assets USING gin (tags);
CREATE INDEX media_assets_created_idx ON media_assets (created_at DESC);
```

### Step 2: Connections

```typescript
// src/clients.ts
import { S3Client } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
export const s3 = new S3Client({ region: process.env.S3_REGION ?? "us-east-1" });
export const BUCKET = process.env.S3_BUCKET ?? "";
export const CDN_URL = process.env.CDN_URL ?? ""; // CloudFront (or other CDN) in front of the private bucket
```

The bucket stays private. The CDN (CloudFront with origin access control, or any CDN that can sign requests to S3) reads from it; browsers never get bucket credentials or a public bucket.

### Step 3: Validate and process an image

The upload is checked by its bytes, not by the client's `Content-Type` or file name. SVG and other formats that can carry scripts are rejected, because the CDN would serve them from your domain. Variants are WebP (which keeps transparency), plus a JPEG fallback with transparency flattened to white; EXIF rotation is applied so phone photos are not sideways.

```typescript
// src/process.ts
import sharp from "sharp";

const FORMATS = new Set(["jpeg", "png", "webp", "avif", "gif"]);
const MIME: Record<string, string> = {
  jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif",
};
const open = (input: Buffer) => sharp(input, { limitInputPixels: 100_000_000 });

export async function processImage(input: Buffer) {
  const meta = await open(input).metadata().catch(() => null); // unreadable data is also "unsupported"
  // Trust the bytes, not the client's Content-Type; SVG is rejected
  if (!meta?.format || !FORMATS.has(meta.format) || !meta.width || !meta.height) {
    throw new Error("Unsupported image: upload JPEG, PNG, WebP, AVIF or GIF");
  }
  // EXIF orientation 5-8 means the image is displayed rotated by 90 degrees
  const swap = (meta.orientation ?? 1) >= 5;
  const width = swap ? meta.height : meta.width;
  const height = swap ? meta.width : meta.height;

  const resized = (w: number) => open(input).rotate().resize({ width: w, withoutEnlargement: true });
  const variants = {
    "thumbnail.webp": await open(input).rotate().resize(200, 200, { fit: "cover" }).webp({ quality: 80 }).toBuffer(),
    "medium.webp": await resized(800).webp({ quality: 82 }).toBuffer(),
    "large.webp": await resized(1920).webp({ quality: 82 }).toBuffer(),
    // JPEG fallback for clients without WebP; flatten replaces transparency with white
    "large.jpg": await resized(1920).flatten({ background: "#ffffff" }).jpeg({ quality: 85 }).toBuffer(),
  };

  const autoTags = [width > height ? "landscape" : height > width ? "portrait" : "square"];
  if (width >= 3840) autoTags.push("4k");
  else if (width >= 1920) autoTags.push("full-hd");
  if (meta.hasAlpha) autoTags.push("transparent");

  return { format: meta.format, mimeType: MIME[meta.format], width, height, variants, autoTags };
}
```

### Step 4: Store the asset and search the library

All keys contain a random UUID and never change, so the variants can be cached for a year with `immutable`. The `LIKE` input is escaped so a search for `100%` does not match everything, and every value goes in as a bind parameter.

```typescript
// src/assets.ts
import { randomUUID } from "node:crypto";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { BUCKET, CDN_URL, pool, s3 } from "./clients.js";
import { processImage } from "./process.js";

const put = (Key: string, Body: Buffer, ContentType: string) =>
  s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key, Body, ContentType,
    CacheControl: "public, max-age=31536000, immutable", // keys contain the asset id and never change
  }));

export async function uploadAsset(
  file: { buffer: Buffer; originalName: string },
  opts: { userId: string; folderId?: string; tags?: string[]; alt?: string },
) {
  const img = await processImage(file.buffer);
  const id = randomUUID();
  const base = `media/${id}`;
  const name = file.originalName.replace(/\.[^.]+$/, "");

  await Promise.all([
    put(`${base}/original.${img.format}`, file.buffer, img.mimeType),
    ...Object.entries(img.variants).map(([variant, buf]) =>
      put(`${base}/${variant}`, buf, variant.endsWith(".jpg") ? "image/jpeg" : "image/webp")),
  ]);

  await pool.query(
    `INSERT INTO media_assets (id, name, original_name, mime_type, size, width, height,
                               folder_id, tags, auto_tags, alt, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, name, file.originalName, img.mimeType, file.buffer.length, img.width, img.height,
     opts.folderId ?? null, opts.tags ?? [], img.autoTags, opts.alt ?? name.replace(/[-_]/g, " "), opts.userId],
  );
  return { id, width: img.width, height: img.height, autoTags: img.autoTags, urls: assetUrls(id, img.format) };
}
export const assetUrls = (id: string, format: string) => ({
  original: `${CDN_URL}/media/${id}/original.${format}`,
  thumbnail: `${CDN_URL}/media/${id}/thumbnail.webp`,
  medium: `${CDN_URL}/media/${id}/medium.webp`,
  large: `${CDN_URL}/media/${id}/large.webp`,
  largeJpeg: `${CDN_URL}/media/${id}/large.jpg`,
});
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

export async function searchAssets(o: { q?: string; tags?: string[]; folderId?: string; page: number; limit: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (o.q) {
    params.push(`%${escapeLike(o.q)}%`);
    where.push(`(name ILIKE $${params.length} OR alt ILIKE $${params.length}
                 OR array_to_string(tags || auto_tags, ' ') ILIKE $${params.length})`);
  }
  if (o.tags?.length) { params.push(o.tags); where.push(`tags @> $${params.length}::text[]`); }
  if (o.folderId) { params.push(o.folderId); where.push(`folder_id = $${params.length}`); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const [items, count] = await Promise.all([
    pool.query(`SELECT * FROM media_assets ${clause} ORDER BY created_at DESC
                LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
               [...params, o.limit, (o.page - 1) * o.limit]),
    pool.query(`SELECT count(*)::int AS total FROM media_assets ${clause}`, params),
  ]);
  return { items: items.rows, total: count.rows[0].total as number, page: o.page, limit: o.limit };
}
```

### Step 5: The Hono API

Every input passes a zod schema before any work happens: size limits on the query, an upload cap of 25 MB, and a UUID check on the id. The transform route reads the original from S3 with the SDK instead of fetching a URL, and clamps width and height to 4000 px so a request for `w=99999` cannot exhaust memory.

```typescript
// src/app.ts
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import sharp from "sharp";
import { z } from "zod";
import { searchAssets, uploadAsset } from "./assets.js";
import { BUCKET, pool, redis, s3 } from "./clients.js";

export const app = new Hono();
const searchQuery = z.object({
  q: z.string().max(100).optional(),
  tag: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

app.get("/assets", zValidator("query", searchQuery), async (c) => {
  const { q, tag, page, limit } = c.req.valid("query");
  return c.json(await searchAssets({ q, tags: tag ? [tag] : undefined, page, limit }));
});

app.post("/assets", bodyLimit({ maxSize: 25 * 1024 * 1024, onError: (c) => c.json({ error: "File too large" }, 413) }),
  async (c) => {
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return c.json({ error: "Field 'file' is required" }, 400);
    try {
      const asset = await uploadAsset(
        { buffer: Buffer.from(await file.arrayBuffer()), originalName: file.name },
        { userId: "demo-user" /* use the session user */, tags: form.getAll("tag").map(String) },
      );
      return c.json(asset, 201);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Upload failed" }, 422);
    }
  });
const transformQuery = z.object({
  w: z.coerce.number().int().min(16).max(4000).optional(),
  h: z.coerce.number().int().min(16).max(4000).optional(),
  format: z.enum(["webp", "avif", "jpeg", "png"]).default("webp"),
  q: z.coerce.number().int().min(30).max(95).default(82),
  fit: z.enum(["cover", "contain"]).default("cover"),
});

// GET /media/<uuid>?w=400&format=avif: any size, rendered once, then served from Redis
app.get("/media/:id", zValidator("param", z.object({ id: z.uuid() })), zValidator("query", transformQuery), async (c) => {
  const { id } = c.req.valid("param");
  const p = c.req.valid("query");
  const key = `transform:${id}:${p.w ?? ""}x${p.h ?? ""}:${p.format}:${p.q}:${p.fit}`;
  const headers = { "Content-Type": `image/${p.format}`, "Cache-Control": "public, max-age=31536000, immutable" };

  const cached = await redis.getBuffer(key);
  if (cached) return c.body(new Uint8Array(cached), 200, headers);

  const { rows } = await pool.query("SELECT mime_type FROM media_assets WHERE id = $1", [id]);
  if (!rows[0]) return c.json({ error: "Not found" }, 404);
  const ext = rows[0].mime_type.split("/")[1];
  const object = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: `media/${id}/original.${ext}` }));
  const original = Buffer.from(await object.Body!.transformToByteArray());

  let img = sharp(original, { limitInputPixels: 100_000_000 }).rotate();
  if (p.w || p.h) img = img.resize(p.w, p.h, { fit: p.fit, withoutEnlargement: true });
  if (p.format === "jpeg") img = img.flatten({ background: "#ffffff" }); // JPEG has no transparency
  const out = await img.toFormat(p.format, { quality: p.q }).toBuffer();

  await redis.set(key, out, "EX", 7 * 24 * 3600);
  return c.body(new Uint8Array(out), 200, headers);
});
```

Serve it on the loopback interface behind your reverse proxy (`src/index.ts`), with real authentication in front of `POST /assets`:

```typescript
import { serve } from "@hono/node-server";
import { app } from "./app.js";
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3030 });
```

### Step 6: Test it

Run the flow without AWS by mocking `src/clients.ts` in vitest: upload a PNG and check the four variants and tags, request `/media/<id>?w=400&format=avif` twice (the second hits Redis), and confirm that `w=99999`, a non-UUID id and an SVG upload are rejected. Run Step 4 once against a throwaway PostgreSQL container to confirm the schema and search.

## Results

Noor's team now finds the approved logo through the search box and thumbnail grid instead of three drives, and the website serves WebP variants instead of the original multi-megabyte hero image. Savings depend on your images: WebP is usually smaller than JPEG at similar quality, and AVIF smaller still, but measure on your own assets.

Search covers name, alt text and tags (including automatic ones such as `landscape`, `4k`, `transparent`); `/media/<id>?w=400&format=avif` renders any size once and caches it for a week; the bucket is private and no user-supplied URL is fetched server-side.

## Related Skills

- [hono](/skills/hono): the API framework, routing, and validator middleware
- [zod](/skills/zod): schemas for query, param, and upload validation
- [s3-storage](/skills/s3-storage): storing originals and variants with the AWS SDK v3
- [postgresql](/skills/postgresql): the `media_assets` table, GIN-indexed tags, and parameterised search
- [redis](/skills/redis): caching rendered transforms with an expiry
- [typescript](/skills/typescript): strict compiler settings and running the code with `tsx`
