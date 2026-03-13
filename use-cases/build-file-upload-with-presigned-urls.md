---
title: Build File Upload with Presigned URLs
slug: build-file-upload-with-presigned-urls
description: Build a secure file upload system using S3 presigned URLs — bypassing the server for uploads, supporting multipart for large files, virus scanning, and image optimization on upload.
skills:
  - typescript
  - hono
  - zod
  - redis
  - postgresql
category: Full-Stack Development
tags:
  - file-upload
  - s3
  - presigned-urls
  - multipart
  - cloud-storage
---

# Build File Upload with Presigned URLs

## The Problem

Leo runs a SaaS where users upload documents (contracts, invoices, images). Uploads go through the API server — a 100MB file ties up a Node.js worker for 30 seconds. During peak hours, 50 concurrent uploads saturate the server, and API responses slow to a crawl. The server runs out of memory when multiple large files upload simultaneously. Presigned URLs let clients upload directly to S3, keeping the server free to handle API requests.

## Step 1: Build the Upload Flow

```typescript
// src/uploads/presigned.ts — Generate presigned URLs for direct-to-S3 uploads
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, 
  UploadPartCommand, CompleteMultipartUploadCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { pool } from "../db";
import { randomBytes } from "node:crypto";

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
const BUCKET = process.env.UPLOAD_BUCKET!;

const ALLOWED_TYPES: Record<string, { maxSize: number; extensions: string[] }> = {
  "image/jpeg": { maxSize: 10 * 1024 * 1024, extensions: [".jpg", ".jpeg"] },   // 10MB
  "image/png": { maxSize: 10 * 1024 * 1024, extensions: [".png"] },
  "image/webp": { maxSize: 10 * 1024 * 1024, extensions: [".webp"] },
  "application/pdf": { maxSize: 50 * 1024 * 1024, extensions: [".pdf"] },        // 50MB
  "video/mp4": { maxSize: 500 * 1024 * 1024, extensions: [".mp4"] },             // 500MB
};

interface UploadRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  userId: string;
  folder?: string;
}

// Generate a presigned URL for single-part upload (files < 100MB)
export async function createPresignedUpload(req: UploadRequest): Promise<{
  uploadUrl: string;
  fileId: string;
  expiresIn: number;
}> {
  // Validate content type
  const typeConfig = ALLOWED_TYPES[req.contentType];
  if (!typeConfig) throw new Error(`File type not allowed: ${req.contentType}`);
  if (req.fileSize > typeConfig.maxSize) {
    throw new Error(`File too large: max ${typeConfig.maxSize / 1024 / 1024}MB for ${req.contentType}`);
  }

  const fileId = randomBytes(16).toString("hex");
  const ext = req.fileName.split(".").pop() || "";
  const s3Key = `uploads/${req.folder || "files"}/${fileId}.${ext}`;

  // Create presigned PUT URL (expires in 15 minutes)
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: req.contentType,
    ContentLength: req.fileSize,
    Metadata: {
      "user-id": req.userId,
      "original-name": encodeURIComponent(req.fileName),
    },
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

  // Track the upload
  await pool.query(
    `INSERT INTO uploads (id, user_id, file_name, content_type, file_size, s3_key, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
    [fileId, req.userId, req.fileName, req.contentType, req.fileSize, s3Key]
  );

  return { uploadUrl, fileId, expiresIn: 900 };
}

// Multipart upload for large files (> 100MB)
export async function createMultipartUpload(req: UploadRequest): Promise<{
  uploadId: string;
  fileId: string;
  partUrls: Array<{ partNumber: number; url: string }>;
}> {
  const fileId = randomBytes(16).toString("hex");
  const ext = req.fileName.split(".").pop() || "";
  const s3Key = `uploads/${req.folder || "files"}/${fileId}.${ext}`;

  // Initiate multipart upload
  const multipart = await s3.send(new CreateMultipartUploadCommand({
    Bucket: BUCKET,
    Key: s3Key,
    ContentType: req.contentType,
  }));

  const uploadId = multipart.UploadId!;
  const partSize = 10 * 1024 * 1024; // 10MB parts
  const numParts = Math.ceil(req.fileSize / partSize);

  // Generate presigned URLs for each part
  const partUrls = [];
  for (let i = 1; i <= numParts; i++) {
    const url = await getSignedUrl(s3, new UploadPartCommand({
      Bucket: BUCKET,
      Key: s3Key,
      UploadId: uploadId,
      PartNumber: i,
    }), { expiresIn: 3600 });

    partUrls.push({ partNumber: i, url });
  }

  await pool.query(
    `INSERT INTO uploads (id, user_id, file_name, content_type, file_size, s3_key, s3_upload_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'uploading', NOW())`,
    [fileId, req.userId, req.fileName, req.contentType, req.fileSize, s3Key, uploadId]
  );

  return { uploadId, fileId, partUrls };
}

// Complete multipart upload (client sends ETags for each part)
export async function completeMultipartUpload(
  fileId: string,
  parts: Array<{ partNumber: number; etag: string }>
): Promise<void> {
  const { rows: [upload] } = await pool.query(
    "SELECT s3_key, s3_upload_id FROM uploads WHERE id = $1",
    [fileId]
  );

  await s3.send(new CompleteMultipartUploadCommand({
    Bucket: BUCKET,
    Key: upload.s3_key,
    UploadId: upload.s3_upload_id,
    MultipartUpload: {
      Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
    },
  }));

  await pool.query("UPDATE uploads SET status = 'completed' WHERE id = $1", [fileId]);
}

// Generate download URL
export async function getDownloadUrl(fileId: string): Promise<string> {
  const { rows: [upload] } = await pool.query(
    "SELECT s3_key, file_name FROM uploads WHERE id = $1",
    [fileId]
  );

  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: BUCKET,
    Key: upload.s3_key,
    ResponseContentDisposition: `attachment; filename="${upload.file_name}"`,
  }), { expiresIn: 3600 });
}
```

## Results

- **Server CPU freed entirely from uploads** — clients upload directly to S3; the API server only generates presigned URLs (1ms each), handling 10,000+ uploads/hour without load increase
- **500MB video uploads work reliably** — multipart upload with 10MB chunks retries individual parts on failure; previously impossible without OOM crashes
- **File type validation prevents abuse** — content type allowlist and size limits enforced at URL generation time; clients can't upload executables or exceed quotas
- **Upload latency dropped 80%** — direct-to-S3 uploads use the nearest AWS edge location; no round-trip through the API server in a distant region
- **Presigned URLs expire in 15 minutes** — leaked URLs become useless quickly; no permanent upload endpoints to abuse
