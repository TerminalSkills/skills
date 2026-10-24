---
title: "Build a File Storage System with CDN"
description: "Replace your patchwork of S3 + Cloudinary with a unified file storage layer — presigned uploads, CDN delivery, on-the-fly image processing, access control, and per-user quotas."
skills: [s3-storage, aws-cloudfront]
slug: build-file-storage-and-cdn
difficulty: intermediate
time_estimate: "6 hours"
tags: [s3, cdn, cloudfront, storage, image-processing, presigned-urls, saas]
---

# Build a File Storage System with CDN

Your SaaS stitches together S3 for uploads, Cloudinary for image transforms, and random signed URLs that expire at the wrong time. It works — barely. You want one clean system for all of it.

## What You'll Build

- Direct-to-S3 uploads with presigned POST (the size limit is enforced by S3, not by your server)
- CloudFront CDN for global delivery, with the bucket kept private behind Origin Access Control
- Public vs private files with CloudFront signed URLs
- On-the-fly image resize and format conversion with AWS's Dynamic Image Transformation for Amazon CloudFront
- Per-user storage quotas
- File deletion that removes both the object and the database row

## Architecture

```
Client requests presigned URL
  → API validates quota + permissions
  → S3 presigned POST returned (5 min expiry, content-length-range)
  → Client uploads directly to S3
  → S3 event notification → Lambda or queue → mark file READY
  → CloudFront serves files from the private bucket via OAC
     (private files need a signed URL or cookie)
  → public images are requested through the Dynamic Image Transformation distribution
```

## Step 1: Presigned Upload with a Real Size Limit

A presigned `PutObject` URL cannot enforce a maximum size: signing `ContentLength` only fixes the exact length the client declares, and the client picks that. A presigned POST carries a policy with `content-length-range`, which S3 itself enforces.

```typescript
// lib/storage.ts  (@aws-sdk/client-s3, @aws-sdk/s3-presigned-post)
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { randomUUID } from "node:crypto";

export const s3 = new S3Client({ region: process.env.AWS_REGION! });
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);

export async function createUpload(userId: string, contentType: string, size: number) {
  if (!ALLOWED.has(contentType)) throw new Error("unsupported_type");
  const key = `users/${userId}/${randomUUID()}`; // never put the client filename in the key
  const post = await createPresignedPost(s3, {
    Bucket: process.env.S3_BUCKET!,
    Key: key,
    Conditions: [
      ["content-length-range", 1, size],
      ["eq", "$Content-Type", contentType],
    ],
    Fields: { "Content-Type": contentType },
    Expires: 300,
  });
  return { key, ...post }; // { url, fields }
}
```

```typescript
// app/api/upload/presign/route.ts
export async function POST(req: Request) {
  const { filename, contentType, size } = await req.json();
  const userId = await getSessionUserId(req);

  // Count PENDING rows too, otherwise parallel presigns bypass the quota
  if ((await getUserStorageUsage(userId)) + BigInt(size) > (await getUserQuota(userId))) {
    return Response.json({ error: "quota_exceeded" }, { status: 403 });
  }
  const upload = await createUpload(userId, contentType, size);
  await prisma.file.create({
    data: { key: upload.key, userId, filename, size, contentType, status: "PENDING" },
  });
  return Response.json(upload);
}
```

The browser sends a `multipart/form-data` POST to `upload.url` with every entry of `upload.fields` first and the `file` field last. The bucket needs a CORS rule allowing `POST` from your origin.

## Step 2: Mark the File READY

Configure an S3 event notification for `s3:ObjectCreated:*` on the `users/` prefix, targeting a Lambda function or SQS queue. The handler checks the real object and flips the row:

```typescript
import { HeadObjectCommand } from "@aws-sdk/client-s3";

export async function onObjectCreated(key: string) {
  const head = await s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
  await prisma.file.update({
    where: { key },
    data: { status: "READY", size: BigInt(head.ContentLength ?? 0), uploadedAt: new Date() },
  });
}
```

Add an S3 lifecycle rule to abort incomplete multipart uploads, and a cron that deletes `PENDING` rows (and any stray objects) older than 24 hours.

## Step 3: Private Bucket, CloudFront Signed URLs

Keep Block Public Access on. Give the distribution an S3 origin with Origin Access Control (OAC) and a bucket policy that allows only `cloudfront.amazonaws.com` for your distribution ARN. For private files, create a CloudFront public key and key group, and set the behavior's "trusted key groups" to it so viewers need a signed URL.

```typescript
import { getSignedUrl } from "@aws-sdk/cloudfront-signer";

export function getFileUrl(file: { key: string; isPrivate: boolean }, expiresInSeconds = 3600) {
  const url = `${process.env.CLOUDFRONT_DOMAIN}/${file.key}`;
  if (!file.isPrivate) return url;
  return getSignedUrl({
    url,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID!, // the public key ID, not an account key pair
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY!,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000),
  });
}
```

Public files need a separate cache behavior without trusted key groups, matched on a key prefix such as `public/`.

```typescript
// app/api/files/[id]/url/route.ts
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; // params is a Promise in Next.js 15+
  const userId = await getSessionUserId(req);
  const file = await prisma.file.findUnique({ where: { id } });
  if (!file || file.status !== "READY" || (file.isPrivate && file.userId !== userId)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  return Response.json({ url: getFileUrl(file) });
}
```

## Step 4: Image Transforms

Deploy AWS's [Dynamic Image Transformation for Amazon CloudFront](https://github.com/aws-solutions/dynamic-image-transformation-for-amazon-cloudfront) solution in its Lambda architecture (`v7-Stack`, built on Sharp) with your bucket as `SourceBucketsParameter`. It creates its own CloudFront distribution in front of API Gateway and reads source images from the bucket with its own IAM role. It accepts Thumbor-style paths (the v8 ECS architecture instead uses origin mappings, transformation policies and query parameters), so resizing and conversion are part of the URL. Serve transformed images from that distribution's domain, set as `IMAGE_CDN_DOMAIN`:

```typescript
export function getImageUrl(key: string, t: { width?: number; height?: number; format?: "webp" | "jpeg" | "png"; quality?: number } = {}) {
  const size = t.width || t.height ? `fit-in/${t.width ?? 0}x${t.height ?? 0}/` : "";
  const filters = [t.format && `format(${t.format})`, t.quality && `quality(${t.quality})`].filter(Boolean);
  const f = filters.length ? `filters:${filters.join(":")}/` : "";
  return `${process.env.IMAGE_CDN_DOMAIN}/${size}${f}${key}`;
}
// getImageUrl("users/42/avatar", { width: 200, height: 200, format: "webp" })
//   -> https://dyyyy.cloudfront.net/fit-in/200x200/filters:format(webp)/users/42/avatar
```

The transformation function can read any key in the source bucket, so a private file is exposed to anyone who learns its key through this path. Use it for public images only (put them under a separate `public/` prefix or bucket and give the stack only that bucket), and cap the variants (the solution can require signed requests) so nobody can request unlimited sizes. Private files stay on the signed-URL path from Step 3.

## Step 5: Quota and Deletion

```prisma
model User {
  id                String @id @default(cuid())
  storageQuotaBytes BigInt @default(1073741824) // 1 GiB
  files             File[]
}

model File {
  id          String     @id @default(cuid())
  userId      String
  user        User       @relation(fields: [userId], references: [id])
  key         String     @unique
  filename    String
  size        BigInt
  contentType String
  isPrivate   Boolean    @default(true)
  status      FileStatus @default(PENDING)
  uploadedAt  DateTime?
  deletedAt   DateTime?
  createdAt   DateTime   @default(now())
}

enum FileStatus { PENDING READY DELETED }
```

```typescript
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

export async function getUserStorageUsage(userId: string): Promise<bigint> {
  const r = await prisma.file.aggregate({
    where: { userId, status: { in: ["PENDING", "READY"] } },
    _sum: { size: true },
  });
  return r._sum.size ?? 0n;
}

export async function deleteFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) throw new Error("not_found");
  await s3.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: file.key }));
  await prisma.file.update({ where: { id: fileId }, data: { status: "DELETED", deletedAt: new Date() } });
  // Cached copies live in CloudFront until the TTL ends; invalidate the path if that matters.
}
```

The quota check and the insert are two statements, so two simultaneous requests can both pass. For a hard limit, run them in one transaction that locks the user row (`SELECT ... FOR UPDATE`).

## Environment Variables

Load them from your secret manager; on AWS compute use an IAM role instead of access keys.

```bash
AWS_REGION=us-east-1
S3_BUCKET=my-app-storage
CLOUDFRONT_DOMAIN=https://dxxxxxxxx.cloudfront.net
IMAGE_CDN_DOMAIN=https://dyyyyyyyy.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=$CLOUDFRONT_PUBLIC_KEY_ID
CLOUDFRONT_PRIVATE_KEY=$CLOUDFRONT_PRIVATE_KEY_PEM
DATABASE_URL=$DATABASE_URL
```

## Launch Checklist

- [ ] Bucket: Block Public Access on, CORS allows `POST` from your origin, OAC policy for the distribution
- [ ] CloudFront public key and key group; private behavior trusts the key group
- [ ] Image transformation stack deployed with your bucket as its source
- [ ] S3 event notification marks files READY
- [ ] Lifecycle rule for incomplete multipart uploads; cron for stale PENDING files
- [ ] Quota bar in the UI

## What's Next

- Virus scanning on upload before a file becomes READY
- ZIP download of multiple files
- Usage-based billing from the same usage query

## Related Skills

- [s3-storage](../skills/s3-storage/SKILL.md): buckets, presigned requests, CORS and lifecycle rules
- [aws-cloudfront](../skills/aws-cloudfront/SKILL.md): distributions, OAC, behaviors and signed URLs
