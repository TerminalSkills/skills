---
name: s3-storage
description: >-
  Manages S3-compatible object storage (AWS S3, MinIO, Cloudflare R2,
  DigitalOcean Spaces, Backblaze B2, Wasabi, Supabase Storage). Use when
  the user wants to create buckets, upload/download files, set up lifecycle
  policies, configure CORS, manage presigned URLs, implement multipart
  uploads, set up replication, handle versioning, configure access policies,
  or build file management features on top of S3-compatible APIs. Trigger
  words: s3, minio, r2, object storage, bucket, presigned url, multipart
  upload, lifecycle policy, s3 cors, storage backend, file storage, blob
  storage, spaces, backblaze, wasabi.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+. Requires AWS SDK v3 or compatible S3 client library."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["s3", "object-storage", "minio", "cloud-storage"]
---

# S3 Storage

## Overview

Manages S3-compatible object storage across all major providers. Covers bucket operations, file upload/download, presigned URLs, multipart uploads, lifecycle policies, versioning, access control, CORS, and event notifications. All examples use AWS SDK v3 which works with any S3-compatible endpoint.

## Instructions

### 1. Client Setup

```javascript
import { S3Client } from '@aws-sdk/client-s3';

// AWS S3
const s3 = new S3Client({ region: 'us-east-1' }); // Uses env vars or IAM role

// MinIO (self-hosted)
const s3 = new S3Client({
  region: 'us-east-1', endpoint: 'http://localhost:9000',
  credentials: { accessKeyId: process.env.MINIO_ACCESS_KEY, secretAccessKey: process.env.MINIO_SECRET_KEY },
  forcePathStyle: true,
});

// Cloudflare R2
const s3 = new S3Client({
  region: 'auto', endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY, secretAccessKey: process.env.R2_SECRET_KEY },
});

// Python (boto3) — works with all providers
import boto3
s3 = boto3.client('s3', endpoint_url='http://localhost:9000',
    aws_access_key_id=os.environ['ACCESS_KEY'], aws_secret_access_key=os.environ['SECRET_KEY'])
```

### 2. File Operations

```javascript
import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';

// Upload
await s3.send(new PutObjectCommand({
  Bucket: 'my-app-uploads', Key: 'users/123/avatar.jpg',
  Body: fileBuffer, ContentType: 'image/jpeg',
  Metadata: { 'uploaded-by': 'user-123' },
}));

// Download
const { Body, ContentType } = await s3.send(new GetObjectCommand({ Bucket: 'my-app-uploads', Key: 'users/123/avatar.jpg' }));
const chunks = [];
for await (const chunk of Body) chunks.push(chunk);
const buffer = Buffer.concat(chunks);

// List with pagination
let token;
const allKeys = [];
do {
  const { Contents, NextContinuationToken, IsTruncated } = await s3.send(
    new ListObjectsV2Command({ Bucket: 'my-app-uploads', Prefix: 'users/123/', MaxKeys: 1000, ContinuationToken: token })
  );
  allKeys.push(...(Contents || []).map(o => o.Key));
  token = IsTruncated ? NextContinuationToken : undefined;
} while (token);

// Delete (single and bulk)
await s3.send(new DeleteObjectCommand({ Bucket: 'my-app-uploads', Key: 'old-file.txt' }));
await s3.send(new DeleteObjectsCommand({
  Bucket: 'my-app-uploads', Delete: { Objects: keys.map(Key => ({ Key })), Quiet: true },
}));

// Copy (move = copy + delete)
await s3.send(new CopyObjectCommand({ Bucket: 'my-app-uploads', CopySource: 'my-app-uploads/old/path.jpg', Key: 'new/path.jpg' }));
```

### 3. Presigned URLs

```javascript
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Upload URL (client uploads directly to S3)
const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
  Bucket: 'my-app-uploads', Key: `uploads/${userId}/${filename}`, ContentType: contentType,
}), { expiresIn: 3600 });

// Download URL
const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: 'my-app-uploads', Key: 'reports/q4-2024.pdf',
}), { expiresIn: 900 });
```

### 4. Multipart Upload (large files)

```javascript
import { Upload } from '@aws-sdk/lib-storage';

const upload = new Upload({
  client: s3,
  params: { Bucket: 'my-app-uploads', Key: 'large-file.zip', Body: stream },
  partSize: 10 * 1024 * 1024, // 10MB
  leavePartsOnError: false,
});
upload.on('httpUploadProgress', (p) => console.log(`${p.loaded}/${p.total}`));
await upload.done();
```

### 5. Lifecycle Policies

```javascript
import { PutBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';

await s3.send(new PutBucketLifecycleConfigurationCommand({
  Bucket: 'my-app-uploads',
  LifecycleConfiguration: {
    Rules: [
      { ID: 'delete-temp-after-1-day', Prefix: 'tmp/', Status: 'Enabled', Expiration: { Days: 1 } },
      { ID: 'archive-old-logs', Prefix: 'logs/', Status: 'Enabled',
        Transitions: [{ Days: 30, StorageClass: 'STANDARD_IA' }, { Days: 90, StorageClass: 'GLACIER' }],
        Expiration: { Days: 365 } },
      { ID: 'cleanup-incomplete-uploads', Prefix: '', Status: 'Enabled',
        AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 } },
    ],
  },
}));
```

### 6. Versioning and CORS

```javascript
import { PutBucketVersioningCommand, PutBucketCorsCommand } from '@aws-sdk/client-s3';

// Enable versioning
await s3.send(new PutBucketVersioningCommand({
  Bucket: 'my-app-uploads', VersioningConfiguration: { Status: 'Enabled' },
}));

// CORS (required for browser uploads)
await s3.send(new PutBucketCorsCommand({
  Bucket: 'my-app-uploads',
  CORSConfiguration: {
    CORSRules: [{
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'POST', 'HEAD'],
      AllowedOrigins: ['https://myapp.com', 'http://localhost:3000'],
      ExposeHeaders: ['ETag'],
      MaxAgeSeconds: 3600,
    }],
  },
}));
```

## Examples

### Example 1: User Avatar Upload System

**Input:** "Build a secure avatar upload system. Users get a presigned URL from our API, upload directly to S3, then we resize to 3 sizes and serve through CloudFront."

**Output:** API endpoint generating presigned PUT URLs with content-type validation (images only), CORS config for browser uploads, S3 event notification triggering a Lambda for resizing (64x64, 256x256, 512x512), CloudFront distribution pointing to processed images, lifecycle rule deleting originals after processing.

### Example 2: Self-Hosted MinIO for Development

**Input:** "Set up MinIO as a local S3 replacement. Docker Compose setup, create same buckets and policies as production, write a helper module that switches between MinIO and real S3 via env var."

**Output:** Docker Compose with MinIO + health check, init script creating buckets and policies, storage module with `createStorageClient()` that configures for MinIO or AWS based on `STORAGE_PROVIDER`, wrapper functions for common operations with consistent error handling, integration tests running against local MinIO.

## Guidelines

- Always use `forcePathStyle: true` for MinIO and self-hosted S3-compatible stores
- Use presigned URLs for client-side uploads — never proxy large files through your API
- Set lifecycle rules on every bucket — at minimum, abort incomplete multipart uploads after 7 days
- Block public access by default, whitelist only when necessary
- Use object key prefixes for logical organization (`users/{id}/`, `uploads/{date}/`)
- Never put user input directly in object keys — sanitize filenames
- Set `ContentType` explicitly — S3 defaults to `application/octet-stream`
- Use `ContentDisposition: 'attachment; filename="name.pdf"'` for downloadable files
- Always handle `NoSuchKey` errors gracefully on downloads
- Use bucket versioning for critical data, not ephemeral files
- R2 has no egress fees — consider it for CDN-heavy workloads
- MinIO is fully S3-compatible — use it for local development and testing
