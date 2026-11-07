---
title: Build a File Manager with S3
slug: build-file-manager-with-s3
description: Build a file management system with folders, presigned uploads, image thumbnails, sharing links, storage quotas, and trash/restore — a Dropbox-style file manager backed by S3-compatible storage.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - s3-storage
category: development
tags:
  - file-management
  - s3
  - uploads
  - storage
  - cloud
---

# Build a File Manager with S3

## The Problem

Dani leads engineering at a 25-person company. Files are scattered across Google Drive, Slack attachments, email threads, and local machines. Employees can't find the latest version of documents. Client files have no access control — anyone with the link can see everything. Large file uploads fail because the API has a 10MB body limit. They're paying $500/month for a file management SaaS that doesn't integrate with their app. They need an in-app file manager with folders, secure uploads, access control, and preview.

The browser uploads straight to S3 with a presigned URL, so the API never carries file bytes. Postgres holds metadata, Redis caches quota usage and queues thumbnail jobs, Hono serves the API, and zod validates request bodies.

## Step 1: Schema

```sql
-- assumes workspace_members(workspace_id, user_id) exists
CREATE TABLE folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id text NOT NULL,
  parent_id uuid REFERENCES folders(id), name text NOT NULL
);

CREATE TABLE files (
  id           uuid PRIMARY KEY,
  workspace_id text NOT NULL,
  folder_id    uuid REFERENCES folders(id),
  name text NOT NULL, mime_type text NOT NULL, size bigint NOT NULL,
  s3_key text NOT NULL UNIQUE, uploaded_by text NOT NULL,
  status       text NOT NULL DEFAULT 'uploading',  -- uploading | active | trashed
  deleted_at   timestamptz,
  deleted_by   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE file_shares (
  id text PRIMARY KEY,                             -- random token, see createShareLink
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE, created_by text NOT NULL,
  password_hash text,                              -- "salt:hash", scrypt
  expires_at timestamptz, max_downloads int, download_count int NOT NULL DEFAULT 0
);
```

## Step 2: File Manager Backend

```typescript
// src/files/manager.ts — S3 uploads, sharing, quotas and trash
import { randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Redis } from "ioredis";
import { pool } from "../db"; // a pg Pool
const scrypt = promisify(scryptCb);
const redis = new Redis(process.env.REDIS_URL!);

// Credentials: default chain. For MinIO/R2 set S3_ENDPOINT (R2: S3_REGION=auto).
const s3 = new S3Client({
  region: process.env.S3_REGION!,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: !!process.env.S3_ENDPOINT,
  // Default: the SDK puts the empty-body x-amz-checksum-crc32 into presigned PUT URLs, so uploads fail
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});
const BUCKET = process.env.S3_BUCKET!;
export const MAX_FILE_SIZE = 500 * 1024 * 1024;          // 500MB
const QUOTA_BYTES = 10 * 1024 * 1024 * 1024;             // 10GB per workspace

export async function verifyAccess(workspaceId: string, userId: string) {
  const { rowCount } = await pool.query(
    "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2",
    [workspaceId, userId]
  );
  if (!rowCount) throw new Error("Access denied");
}

export async function createUploadUrl(
  workspaceId: string, userId: string,
  fileName: string, mimeType: string, fileSize: number, folderId?: string | null
) {
  await verifyAccess(workspaceId, userId);
  if (fileSize > MAX_FILE_SIZE) throw new Error(`File too large. Maximum: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  const usage = await getStorageUsage(workspaceId);
  if (usage + fileSize > QUOTA_BYTES) throw new Error(`Storage quota exceeded (${(usage / 1024 ** 3).toFixed(1)}GB used)`);
  const fileId = randomUUID();
  const s3Key = `${workspaceId}/${fileId}`;   // never build keys from user-supplied names

  // ContentLength is signed (content-length;host): S3 rejects a PUT of another size. ContentType is not signed.
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: s3Key, ContentType: mimeType, ContentLength: fileSize }),
    { expiresIn: 900 }
  );
  await pool.query(
    `INSERT INTO files (id, name, mime_type, size, s3_key, folder_id, workspace_id, uploaded_by, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'uploading')`,
    [fileId, fileName, mimeType, fileSize, s3Key, folderId ?? null, workspaceId, userId]
  );
  await redis.del(`storage:usage:${workspaceId}`);
  return { uploadUrl, fileId };
}
export async function confirmUpload(fileId: string, userId: string) {
  const { rows: [file] } = await pool.query("SELECT * FROM files WHERE id = $1 AND status = 'uploading'", [fileId]);
  if (!file) throw new Error("File not found");
  await verifyAccess(file.workspace_id, userId);
  const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: file.s3_key }));
  if (Number(head.ContentLength) !== Number(file.size)) throw new Error("Uploaded size does not match");
  await pool.query("UPDATE files SET status = 'active' WHERE id = $1", [fileId]);
  if (file.mime_type.startsWith("image/")) {
    await redis.rpush("thumbnail:queue", JSON.stringify({ fileId, s3Key: file.s3_key })); // worker resizes with sharp
  }
  return file;
}

export async function getDownloadUrl(fileId: string, userId: string) {
  const { rows: [file] } = await pool.query(
    "SELECT s3_key, name, workspace_id FROM files WHERE id = $1 AND status = 'active'", [fileId]);
  if (!file) throw new Error("File not found");
  await verifyAccess(file.workspace_id, userId);
  return signDownload(file.s3_key, file.name, 3600);
}

function signDownload(s3Key: string, name: string, expiresIn: number) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET, Key: s3Key,
    // RFC 5987 encoding: a file name with quotes or CRLF cannot break out of the header
    ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  }), { expiresIn });
}

// --- Share links
async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(pw, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  const candidate = (await scrypt(pw, Buffer.from(salt, "hex"), 64)) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(hash, "hex"));   // constant-time compare
}

export async function createShareLink(
  fileId: string, userId: string,
  options?: { password?: string; expiresInHours?: number; maxDownloads?: number }
) {
  const { rows: [file] } = await pool.query("SELECT workspace_id FROM files WHERE id = $1 AND status = 'active'", [fileId]);
  if (!file) throw new Error("File not found");
  await verifyAccess(file.workspace_id, userId);
  const shareId = randomBytes(24).toString("base64url");   // unguessable, unlike Math.random()
  await pool.query(
    `INSERT INTO file_shares (id, file_id, created_by, password_hash, expires_at, max_downloads)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [shareId, fileId, userId,
     options?.password ? await hashPassword(options.password) : null,
     options?.expiresInHours ? new Date(Date.now() + options.expiresInHours * 3600_000) : null,
     options?.maxDownloads ?? null]
  );
  return { shareId, shareUrl: `${process.env.APP_URL}/files/shared/${shareId}` };
}

// Public endpoint: every limit is enforced here
export async function openShare(shareId: string, password?: string): Promise<string> {
  const { rows: [share] } = await pool.query(
    `SELECT s.password_hash, f.s3_key, f.name FROM file_shares s JOIN files f ON f.id = s.file_id
     WHERE s.id = $1 AND f.status = 'active'`, [shareId]);
  if (!share) throw new Error("Link not found");
  if (share.password_hash) {
    const key = `share:fail:${shareId}`;
    if (Number(await redis.get(key)) >= 10) throw new Error("Too many attempts, try later");
    if (!(password && await checkPassword(password, share.password_hash))) {
      if (await redis.incr(key) === 1) await redis.expire(key, 900); // 10 wrong guesses per 15 min
      throw new Error("Wrong password");
    }
  }
  // One atomic UPDATE checks expiry and the download limit and counts the download,
  // so two parallel requests cannot both take the last download.
  const { rowCount } = await pool.query(
    `UPDATE file_shares SET download_count = download_count + 1
     WHERE id = $1 AND (expires_at IS NULL OR expires_at > now())
       AND (max_downloads IS NULL OR download_count < max_downloads)`, [shareId]);
  if (!rowCount) throw new Error("Link expired or download limit reached");
  return signDownload(share.s3_key, share.name, 300);
}

// --- Trash
async function setStatus(fileId: string, userId: string, from: string, to: string): Promise<void> {
  const { rows: [file] } = await pool.query("SELECT workspace_id FROM files WHERE id = $1", [fileId]);
  if (!file) throw new Error("File not found");
  await verifyAccess(file.workspace_id, userId);
  await pool.query(
    `UPDATE files SET status = $3, deleted_at = CASE WHEN $3 = 'trashed' THEN now() END,
       deleted_by = CASE WHEN $3 = 'trashed' THEN $2 END WHERE id = $1 AND status = $4`,
    [fileId, userId, to, from]);
  await redis.del(`storage:usage:${file.workspace_id}`);
}
export const moveToTrash = (id: string, userId: string) => setStatus(id, userId, "active", "trashed");
export const restoreFromTrash = (id: string, userId: string) => setStatus(id, userId, "trashed", "active");

// Daily job: purge files trashed over 30 days ago and uploads abandoned for over a day
export async function cleanupTrash(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT id, s3_key FROM files
     WHERE (status = 'trashed' AND deleted_at < now() - interval '30 days')
        OR (status = 'uploading' AND created_at < now() - interval '1 day')`);
  for (const file of rows) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file.s3_key })); // no error if the key is absent
    await pool.query("DELETE FROM files WHERE id = $1", [file.id]);
  }
  return rows.length;
}

async function getStorageUsage(workspaceId: string): Promise<number> {
  const cached = await redis.get(`storage:usage:${workspaceId}`);
  if (cached) return parseInt(cached, 10);
  const { rows: [{ total }] } = await pool.query(
    "SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE workspace_id = $1 AND status IN ('active', 'uploading')", [workspaceId]);
  await redis.setex(`storage:usage:${workspaceId}`, 3600, String(total));
  return parseInt(total, 10);
}
```

The bucket needs a CORS rule allowing `PUT` from your app's origin (see `s3-storage`).

## Step 3: HTTP API with Hono and zod

```typescript
// src/files/routes.ts
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { createUploadUrl, confirmUpload, getDownloadUrl, createShareLink, openShare, MAX_FILE_SIZE } from "./manager";

const app = new Hono<{ Variables: { userId: string } }>();
// an auth middleware (not shown) sets c.set("userId", ...) from the session

const uploadBody = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(255),
  mimeType: z.string().regex(/^[\w.+-]+\/[\w.+-]+$/),
  size: z.number().int().positive().max(MAX_FILE_SIZE),
  folderId: z.uuid().nullish(),
});

app.post("/files/uploads", zValidator("json", uploadBody), async (c) => {
  const b = c.req.valid("json");
  return c.json(await createUploadUrl(b.workspaceId, c.get("userId"), b.name, b.mimeType, b.size, b.folderId));
});

app.post("/files/:id/confirm", async (c) => c.json(await confirmUpload(c.req.param("id"), c.get("userId"))));
app.get("/files/:id/download", async (c) => c.redirect(await getDownloadUrl(c.req.param("id"), c.get("userId"))));

app.post("/files/:id/share",
  zValidator("json", z.object({ password: z.string().min(8).optional(),
    expiresInHours: z.number().int().max(24 * 90).optional(), maxDownloads: z.number().int().positive().optional() })),
  async (c) => c.json(await createShareLink(c.req.param("id"), c.get("userId"), c.req.valid("json"))));

// Public: the share link itself is the credential
app.post("/shared/:shareId", zValidator("json", z.object({ password: z.string().optional() })),
  async (c) => c.redirect(await openShare(c.req.param("shareId"), c.req.valid("json").password)));

export default app;
```

Browser flow: `POST /files/uploads`, then `fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file })`, then `POST /files/:id/confirm`.

## Results

For Dani's team (their own figures, not benchmarks):

- **500MB uploads work** — the PUT goes directly to S3, so no API memory or body limit is involved; `XMLHttpRequest` gives native upload progress. Anything bigger than 5GB needs multipart upload (`Upload` from `@aws-sdk/lib-storage`), because a single presigned PUT is capped at 5GB.
- **Storage bill falls from $500/month to about $25** — roughly 1TB at S3 Standard's $0.023/GB-month is about $23 before request and egress charges. Cloudflare R2 charges $0.015/GB-month with no egress fees.
- **Access control on every path** — workspace membership is checked for each upload, download, listing and trash action; share links can carry a password, an expiry and a download cap.
- **Trash and quotas** — deleted files stay recoverable for 30 days, then the daily job removes them from S3; each workspace is capped at 10GB, counting uploads still in flight.

## Related Skills

- **s3-storage**: presigned PUT/GET URLs, checksum settings for S3-compatible endpoints, CORS and multipart uploads
- **hono**: the HTTP API that issues upload URLs and serves shares
- **zod**: validates upload sizes, MIME types and share options at the edge
- **postgresql**: file, folder and share metadata, plus the atomic download counter
- **redis**: quota usage cache and the thumbnail job queue
- **typescript**: typed backend code shared between routes and manager
