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

## Step 1: Schema

PostgreSQL holds the metadata (**postgresql** skill): JSONB for title, tags and colors; one row per version; and a partial unique index on the content hash, so two people uploading the same file at the same moment cannot both succeed. Files themselves live in a private S3 bucket (**s3-storage** skill), not in the database.

```sql
CREATE TABLE assets (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_filename text        NOT NULL,
  mime_type         text        NOT NULL,
  size              bigint      NOT NULL,
  width             int,
  height            int,
  hash              text        NOT NULL,                 -- sha256 of the current version
  metadata          jsonb       NOT NULL DEFAULT '{}',    -- title, tags, colors
  current_version   int         NOT NULL DEFAULT 1,
  folder            text        NOT NULL DEFAULT '/',
  uploaded_by       text        NOT NULL,
  status            text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX assets_active_hash ON assets (hash) WHERE status = 'active';
CREATE INDEX assets_tags ON assets USING gin ((metadata -> 'tags'));

CREATE TABLE asset_versions (
  asset_id    uuid        NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  version     int         NOT NULL,
  s3_key      text        NOT NULL,
  size        bigint      NOT NULL,
  hash        text        NOT NULL,
  uploaded_by text        NOT NULL,
  comment     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (asset_id, version)
);
```

## Step 2: The DAM Engine

Install: `npm i hono @hono/node-server @hono/zod-validator zod pg ioredis sharp @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` plus `typescript`, `@types/node`, `@types/pg` (**typescript** skill; the code type-checks with `tsc --noEmit` under `"module": "nodenext"`). Set `DATABASE_URL`, `REDIS_URL`, `AWS_REGION`, `ASSETS_BUCKET` and `DAM_TOKEN`.

Choices that differ from the first draft most teams write:

- **The file decides its type, not the client.** `sharp` identifies raster images and throws on anything else; PDFs and SVGs are sniffed from their first bytes. SVG and PDF objects get `Content-Disposition: attachment`, so a script inside an uploaded SVG never runs on your domain.
- **Dedup is a database constraint**, inside a transaction that also writes the S3 objects. A failed upload rolls back the row (an orphaned S3 object is possible and harmless; a lifecycle rule can clean it up).
- **Transform parameters are validated with Zod** (**zod** skill): width and height capped at 4096, `limitInputPixels` set, and the Redis cache key includes the asset version (**redis** skill), so uploading a new logo cannot serve the old one from cache.

```typescript
// src/dam.ts - asset engine: metadata, dedup, versions, thumbnails, transforms, search
import { createHash } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Redis } from "ioredis";
import pg from "pg";
import sharp from "sharp";
import { z } from "zod";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.ASSETS_BUCKET!;

// Whitelisted by content, never by the client's Content-Type header.
const RASTER = new Set(["jpeg", "png", "webp", "gif", "avif"]);
const THUMBS = [["thumb", 200], ["small", 400], ["medium", 800], ["large", 1600]] as const;
export const transformSchema = z.object({
  width: z.coerce.number().int().min(1).max(4096).optional(),
  height: z.coerce.number().int().min(1).max(4096).optional(),
  format: z.enum(["webp", "jpeg", "png"]).default("webp"),
  quality: z.coerce.number().int().min(1).max(100).default(80),
  fit: z.enum(["cover", "contain", "fill"]).default("cover"),
});
export type Transform = z.infer<typeof transformSchema>;

export interface UploadOptions {
  folder: string; title?: string; tags: string[]; uploadedBy: string; comment?: string;
}
function sniff(file: Buffer): { mime: string; ext: string; raster: boolean } | null {
  if (file.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf", raster: false };
  const head = file.subarray(0, 512).toString("utf8").trimStart();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) {
    return { mime: "image/svg+xml", ext: "svg", raster: false };
  }
  return null; // raster formats are identified by sharp below
}
async function describe(file: Buffer) {
  const known = sniff(file);
  if (known) return { ...known, width: null, height: null, colors: [] as string[] };
  const meta = await sharp(file, { limitInputPixels: 50_000_000 }).metadata(); // throws on non-images
  const format = meta.format === "heif" && meta.compression === "av1" ? "avif" : meta.format; // sharp reports AVIF as "heif"
  if (!format || !RASTER.has(format)) throw new Error(`Unsupported file type: ${format}`);
  const { dominant } = await sharp(file).stats();
  return { mime: `image/${format}`, ext: format === "jpeg" ? "jpg" : format, raster: true,
           width: meta.width ?? null, height: meta.height ?? null,
           colors: [`rgb(${dominant.r},${dominant.g},${dominant.b})`] };
}
async function putVersionFiles(id: string, version: number, file: Buffer, d: Awaited<ReturnType<typeof describe>>) {
  const key = `assets/${id}/v${version}/original.${d.ext}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: file, ContentType: d.mime,
    // SVG and PDF are downloaded, never rendered on our domain, so embedded scripts cannot run.
    ...(d.raster ? {} : { ContentDisposition: "attachment" }),
    CacheControl: "private, max-age=31536000, immutable",
  }));
  if (d.raster) {
    for (const [name, width] of THUMBS) {
      const body = await sharp(file).resize({ width, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: `assets/${id}/v${version}/${name}.webp`,
        Body: body, ContentType: "image/webp", CacheControl: "private, max-age=31536000, immutable" }));
    }
  }
  return key;
}
export async function uploadAsset(file: Buffer, filename: string, o: UploadOptions) {
  const d = await describe(file);
  const hash = createHash("sha256").update(file).digest("hex");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    // The partial unique index on hash makes the duplicate check race-free.
    const { rows: [asset] } = await db.query(
      `INSERT INTO assets (original_filename, mime_type, size, width, height, hash, metadata, folder, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (hash) WHERE status = 'active' DO NOTHING RETURNING id`,
      [filename, d.mime, file.length, d.width, d.height, hash,
       { title: o.title ?? filename.replace(/\.[^.]+$/, ""), tags: o.tags, colors: d.colors },
       o.folder, o.uploadedBy]);
    if (!asset) throw new Error("Duplicate file: this content is already in the library");
    const key = await putVersionFiles(asset.id, 1, file, d);
    await db.query(
      `INSERT INTO asset_versions (asset_id, version, s3_key, size, hash, uploaded_by, comment)
       VALUES ($1,1,$2,$3,$4,$5,$6)`, [asset.id, key, file.length, hash, o.uploadedBy, o.comment ?? "Initial upload"]);
    await db.query("COMMIT");
    return { id: asset.id as string, key };
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
export async function addVersion(id: string, file: Buffer, uploadedBy: string, comment: string) {
  const d = await describe(file);
  const hash = createHash("sha256").update(file).digest("hex");
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [a] } = await db.query("SELECT current_version FROM assets WHERE id=$1 AND status='active' FOR UPDATE", [id]);
    if (!a) throw new Error("Asset not found");
    const version = a.current_version + 1;
    const key = await putVersionFiles(id, version, file, d);
    await db.query(`INSERT INTO asset_versions (asset_id, version, s3_key, size, hash, uploaded_by, comment)
                    VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, version, key, file.length, hash, uploadedBy, comment]);
    await db.query(`UPDATE assets SET current_version=$2, hash=$3, size=$4, width=$5, height=$6, updated_at=now() WHERE id=$1`,
      [id, version, hash, file.length, d.width, d.height]);
    await db.query("COMMIT");
    return version;
  } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
}
async function currentKey(id: string): Promise<{ key: string; version: number; raster: boolean }> {
  const { rows: [r] } = await pool.query(
    `SELECT v.s3_key, v.version, a.mime_type FROM assets a
     JOIN asset_versions v ON v.asset_id = a.id AND v.version = a.current_version
     WHERE a.id = $1 AND a.status = 'active'`, [id]);
  if (!r) throw new Error("Asset not found");
  return { key: r.s3_key, version: r.version, raster: r.mime_type.startsWith("image/") && r.mime_type !== "image/svg+xml" };
}

// Short-lived signed link: the bucket stays private, so access control stays in the API.
export async function downloadUrl(id: string): Promise<string> {
  const { key } = await currentKey(id);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: 300 });
}
export async function transformImage(id: string, t: Transform): Promise<Buffer> {
  const { key, version, raster } = await currentKey(id);
  if (!raster) throw new Error("Only raster images can be transformed");
  const cacheKey = `dam:t:${id}:v${version}:${JSON.stringify(t)}`; // version in the key: new upload, new cache
  const hit = await redis.getBuffer(cacheKey);
  if (hit) return hit;

  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const original = Buffer.from(await obj.Body!.transformToByteArray());
  let img = sharp(original, { limitInputPixels: 50_000_000 });
  if (t.width || t.height) img = img.resize(t.width, t.height, { fit: t.fit });
  img = t.format === "png" ? img.png() : t.format === "jpeg" ? img.jpeg({ quality: t.quality }) : img.webp({ quality: t.quality });
  const out = await img.toBuffer();
  await redis.set(cacheKey, out, "EX", 86400);
  return out;
}
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");
export async function searchAssets(q: string | undefined, f: { folder?: string; tag?: string; mime?: string }, limit: number) {
  const where = ["status = 'active'"];
  const p: unknown[] = [];
  if (q) { p.push(`%${escapeLike(q)}%`); where.push(`(metadata->>'title' ILIKE $${p.length} OR original_filename ILIKE $${p.length})`); }
  if (f.tag) { p.push(f.tag); where.push(`metadata->'tags' ? $${p.length}`); }
  if (f.folder) { p.push(f.folder); where.push(`folder = $${p.length}`); }
  if (f.mime) { p.push(`${escapeLike(f.mime)}%`); where.push(`mime_type LIKE $${p.length}`); }
  p.push(limit);
  const { rows } = await pool.query(
    `SELECT id, original_filename, mime_type, width, height, folder, metadata, current_version, created_at
     FROM assets WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${p.length}`, p);
  return rows; // jsonb columns arrive already parsed
}
```

## Step 3: The API

Hono (**hono** skill) validates every input with Zod, limits upload size to 50 MB, and binds to `127.0.0.1`; put a reverse proxy with TLS in front of it. The bearer token is one shared team secret, enough for a pilot; replace it with `hono/jwt` and per-user identities (and per-folder permissions) before wider rollout. Downloads are 5-minute presigned URLs, so the bucket never has to be public.

```typescript
// src/server.ts - HTTP API on Hono
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { downloadUrl, searchAssets, transformImage, transformSchema, uploadAsset } from "./dam.js";

const app = new Hono();
app.use("*", bearerAuth({ token: process.env.DAM_TOKEN! })); // constant-time compare; swap for hono/jwt with real users
app.onError((err, c) => c.json({ error: err.message }, err.message.startsWith("Duplicate") ? 409 : 400));

const upload = z.object({
  title: z.string().max(200).optional(),
  tags: z.string().max(500).default("").transform((s) => s.split(",").map((t) => t.trim()).filter(Boolean)),
  folder: z.string().regex(/^\/([\w-]+\/?)*$/).default("/"),
});

app.post("/assets", bodyLimit({ maxSize: 50 * 1024 * 1024, onError: (c) => c.json({ error: "File too large" }, 413) }), async (c) => {
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) return c.json({ error: "multipart field 'file' is required" }, 400);
  const meta = upload.parse(form);
  const res = await uploadAsset(Buffer.from(await file.arrayBuffer()), file.name, { ...meta, uploadedBy: "marketing" });
  return c.json(res, 201);
});

const search = z.object({ q: z.string().max(100).optional(), tag: z.string().max(50).optional(),
  folder: z.string().optional(), mime: z.string().max(50).optional(), limit: z.coerce.number().int().min(1).max(100).default(50) });

app.get("/assets", zValidator("query", search), async (c) => {
  const { limit, q, ...filters } = c.req.valid("query");
  return c.json(await searchAssets(q, filters, limit));
});

app.get("/assets/:id/download", async (c) => c.redirect(await downloadUrl(c.req.param("id")), 302));

app.get("/assets/:id/transform", zValidator("query", transformSchema), async (c) => {
  const t = c.req.valid("query");
  const img = await transformImage(c.req.param("id"), t);
  return c.body(new Uint8Array(img), 200, { "Content-Type": `image/${t.format}`, "Cache-Control": "private, max-age=3600" });
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" });
```

```console
$ curl -H "Authorization: Bearer $DAM_TOKEN" -F file=@logo-2026.png -F tags=logo,brand -F folder=/brand http://127.0.0.1:3000/assets
$ curl -H "Authorization: Bearer $DAM_TOKEN" "http://127.0.0.1:3000/assets/<id>/transform?width=1080&height=1080" -o social.webp
```

The `thumb`, `small`, `medium` and `large` WebP files sit next to each original; a CDN in front of the private bucket can serve them, with signed URLs or cookies keeping them private.

## What Lena's Team Gets

- **One library, one latest logo.** Each file keeps a version row (who, when, why) and a content hash; `addVersion` adds the next one. Search by title, filename, tag, folder or type.
- **Upload once, get sizes automatically.** Four WebP thumbnails are generated on upload, and the social team asks the transform endpoint for 1080x1080 crops instead of opening an image editor.
- **No duplicate uploads.** The same bytes are rejected with a 409.

## Related Skills

- [typescript](/skills/typescript) — compiler settings and type-checking for the engine and API
- [postgresql](/skills/postgresql) — JSONB metadata, the partial unique index and version table in Step 1
- [redis](/skills/redis) — caches transformed images for a day, keyed by asset version
- [hono](/skills/hono) — the HTTP API, body limit and bearer auth in Step 3
- [zod](/skills/zod) — validates upload fields, search filters and transform parameters
- [s3-storage](/skills/s3-storage) — private bucket, uploads and presigned download links
