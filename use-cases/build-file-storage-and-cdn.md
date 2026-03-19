---
title: "Build a File Storage System with CDN"
description: "Replace your patchwork of S3 + Cloudinary with a unified file storage layer — presigned uploads, CDN delivery, on-the-fly image processing, access control, and per-user quotas."
skills: [s3-storage, aws-cloudfront]
difficulty: intermediate
time_estimate: "6 hours"
tags: [s3, cdn, cloudfront, storage, image-processing, presigned-urls, saas]
---

# Build a File Storage System with CDN

Your SaaS stitches together S3 for uploads, Cloudinary for image transforms, and random signed URLs that expire at the wrong time. It works — barely. You want one clean system for all of it.

## What You'll Build

- Direct-to-S3 uploads via presigned URLs (no proxy overhead)
- CloudFront CDN for global delivery with low latency
- Public vs private files with signed URL expiry
- On-the-fly image transforms: resize, format convert, watermark
- Per-user storage quotas with enforcement
- File management: list, delete, move between buckets

## Architecture

```
Client requests presigned URL
  → API validates quota + permissions
  → S3 presigned PUT URL returned (5 min expiry)
  → Client uploads directly to S3
  → S3 event → Lambda → update DB metadata
  → CloudFront serves files (public: direct, private: signed)
  → Image transforms via CloudFront + Lambda@Edge
```

## Step 1: S3 Presigned Upload

```typescript
// lib/storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CloudFrontClient } from "@aws-sdk/client-cloudfront";

const s3 = new S3Client({ region: process.env.AWS_REGION! });

export async function createPresignedUpload(params: {
  key: string;
  contentType: string;
  maxSizeBytes: number;
}) {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: params.key,
    ContentType: params.contentType,
    // Enforce max file size server-side
    ContentLength: params.maxSizeBytes,
  });

  const url = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min
  return url;
}

// POST /api/upload/presign
export async function POST(req: Request) {
  const { filename, contentType, size } = await req.json();
  const userId = await getSessionUserId(req);

  // Check quota
  const usage = await getUserStorageUsage(userId);
  const quota = await getUserQuota(userId);
  if (usage + size > quota) {
    return Response.json({ error: "quota_exceeded" }, { status: 403 });
  }

  const key = `users/${userId}/${Date.now()}-${filename}`;
  const uploadUrl = await createPresignedUpload({ key, contentType, maxSizeBytes: size });

  // Record pending file in DB
  await prisma.file.create({
    data: { key, userId, filename, size, contentType, status: "PENDING" },
  });

  return Response.json({ uploadUrl, key });
}
```

## Step 2: CloudFront Signed URLs for Private Files

```typescript
import { getSignedUrl as getCFSignedUrl } from "@aws-sdk/cloudfront-signer";

export function getPrivateFileUrl(key: string, expiresInSeconds = 3600) {
  const url = `${process.env.CLOUDFRONT_DOMAIN}/${key}`;

  return getCFSignedUrl({
    url,
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID!,
    privateKey: process.env.CLOUDFRONT_PRIVATE_KEY!,
    dateLessThan: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
  });
}

export function getPublicFileUrl(key: string) {
  return `${process.env.CLOUDFRONT_DOMAIN}/${key}`;
}

// GET /api/files/[id]/url
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const userId = await getSessionUserId(req);
  const file = await prisma.file.findUnique({ where: { id: params.id } });

  if (!file || (file.isPrivate && file.userId !== userId)) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const url = file.isPrivate
    ? getPrivateFileUrl(file.key)
    : getPublicFileUrl(file.key);

  return Response.json({ url });
}
```

## Step 3: Image Processing via CloudFront + Lambda@Edge

Use the AWS Serverless Image Handler (open source) or a custom Lambda@Edge:

```typescript
// Image transform URL format:
// /images/{bucket}/{key}?w=800&h=600&fit=cover&format=webp&q=85

export function getImageUrl(key: string, transforms?: {
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill";
  format?: "webp" | "jpeg" | "png";
  quality?: number;
  watermark?: boolean;
}) {
  const base = `${process.env.CLOUDFRONT_DOMAIN}/images/${key}`;
  if (!transforms) return base;

  const params = new URLSearchParams();
  if (transforms.width) params.set("w", String(transforms.width));
  if (transforms.height) params.set("h", String(transforms.height));
  if (transforms.fit) params.set("fit", transforms.fit);
  if (transforms.format) params.set("format", transforms.format);
  if (transforms.quality) params.set("q", String(transforms.quality));
  if (transforms.watermark) params.set("wm", "1");

  return `${base}?${params}`;
}

// Examples:
// getImageUrl("user/avatar.png", { width: 200, height: 200, fit: "cover", format: "webp" })
// getImageUrl("products/photo.jpg", { width: 1200, format: "webp", watermark: true })
```

## Step 4: Quota Management

```prisma
model User {
  id             String @id @default(cuid())
  storageQuotaBytes BigInt @default(1073741824) // 1 GB default
  files          File[]
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
export async function getUserStorageUsage(userId: string): Promise<bigint> {
  const result = await prisma.file.aggregate({
    where: { userId, status: "READY", deletedAt: null },
    _sum: { size: true },
  });
  return result._sum.size ?? 0n;
}

export async function enforceQuota(userId: string, additionalBytes: number) {
  const [usage, user] = await Promise.all([
    getUserStorageUsage(userId),
    prisma.user.findUnique({ where: { id: userId }, select: { storageQuotaBytes: true } }),
  ]);

  if (usage + BigInt(additionalBytes) > (user?.storageQuotaBytes ?? 0n)) {
    throw new Error(`Storage quota exceeded. Used: ${usage}, Limit: ${user?.storageQuotaBytes}`);
  }
}
```

## Step 5: File Delete (S3 + DB)

```typescript
export async function deleteFile(fileId: string, userId: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file || file.userId !== userId) throw new Error("Not found");

  // Delete from S3
  await s3.send(new DeleteObjectCommand({
    Bucket: process.env.S3_BUCKET!,
    Key: file.key,
  }));

  // Soft delete in DB
  await prisma.file.update({
    where: { id: fileId },
    data: { status: "DELETED", deletedAt: new Date() },
  });
}
```

## Environment Variables

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=my-app-storage
CLOUDFRONT_DOMAIN=https://d1234abcd.cloudfront.net
CLOUDFRONT_KEY_PAIR_ID=APKA...
CLOUDFRONT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] S3 bucket with CORS policy for direct browser uploads
- [ ] CloudFront distribution pointed at S3 origin
- [ ] CloudFront key pair created for signed URLs
- [ ] Lambda@Edge or Serverless Image Handler deployed
- [ ] S3 event notification → confirm upload in DB
- [ ] Quota UI: show usage bar per user plan
- [ ] Auto-delete PENDING files after 24h (cleanup cron)

## What's Next

- Virus scanning via ClamAV Lambda on upload
- Multi-region replication for compliance
- ZIP download of multiple files
- Usage-based billing via Stripe metered billing
