---
title: "Build a Production File Storage System with S3-Compatible APIs"
slug: manage-file-storage-with-s3-api
description: "Design and implement a complete file storage backend with uploads, presigned URLs, image processing, lifecycle policies, and CDN delivery using any S3-compatible provider."
skills: [s3-storage, coding-agent, security-audit]
category: devops
tags: [s3, object-storage, file-upload, minio, cloud-storage, cdn]
---

# Build a Production File Storage System with S3-Compatible APIs

## The Problem

A SaaS platform stores user files on the application server's local disk. The `/uploads` directory has grown to 280 GB — it is not backed up, not replicated, and a single disk failure would lose everything. File downloads go through the API server, eating 60% of its bandwidth during peak hours. There is no access control — anyone with the file path can download any file. Image thumbnails are generated on every request instead of being cached. Last month the disk hit 95% capacity at 2 AM and the entire platform went down.

## The Solution

Use `s3-storage` to implement a proper object storage backend with presigned URLs for direct client uploads, `coding-agent` to build the file management API and image processing pipeline, and `security-audit` to lock down bucket policies and access patterns.

```bash
npx terminal-skills install s3-storage coding-agent security-audit
```

## Step-by-Step Walkthrough

### 1. Design the storage architecture and migrate existing files

```text
We have 280 GB of user files on a local disk in /uploads/{userId}/{filename}.
Design an S3 bucket structure and migrate everything. Requirements:
- Separate buckets for user uploads, processed images, and system backups
- Object key pattern that supports efficient listing by user
- Metadata on each object: original filename, uploader ID, upload timestamp
- Migrate all existing files preserving the directory structure
- Verify migration by comparing file counts and checksums

We want to use AWS S3 for production and MinIO for local development.
Write a storage abstraction layer that works with both.
```

The agent designs a 3-bucket architecture (uploads-raw, uploads-processed, system-backups), creates a storage client factory that switches between AWS S3 and MinIO based on environment, writes a migration script that streams files with progress tracking and checksum verification, and produces a Docker Compose setup for local MinIO with matching bucket configuration.

### 2. Implement secure direct uploads with presigned URLs

```text
Replace our current upload flow (file → API server → disk) with direct-to-S3
uploads using presigned URLs. The flow should be:
1. Client requests upload URL from our API (sends filename, size, content type)
2. API validates: file type allowlist (images, PDFs, docs), max size 50MB,
   user has upload quota remaining
3. API generates presigned PUT URL with 15-minute expiry
4. Client uploads directly to S3 using the presigned URL
5. S3 event notification triggers our processing webhook
6. Webhook validates the upload, scans for malware, updates the database

Include CORS configuration for browser uploads and handle multipart uploads
for files over 10MB.
```

The agent implements the full flow: an Express endpoint that validates requests and generates presigned URLs with content-type and size constraints, CORS configuration for the upload bucket, a webhook handler that receives S3 event notifications, file validation (magic bytes check, not just extension), and a multipart upload helper for the frontend that splits large files into 5MB chunks with progress tracking and retry logic.

### 3. Build the image processing pipeline

```text
When a user uploads an image, automatically generate:
- Thumbnail: 150x150, cropped to square, WebP format
- Medium: max 800px width, WebP format
- Original: stripped of EXIF data (privacy), kept in original format

Store processed images in the uploads-processed bucket with keys like:
  {userId}/{fileId}/thumb.webp
  {userId}/{fileId}/medium.webp
  {userId}/{fileId}/original.jpg

Use Sharp for processing. The pipeline should be triggered by S3 events
and run as a background worker. Add a fallback that generates images
on-demand if the processed version doesn't exist yet.
```

The agent creates a worker service that listens for S3 ObjectCreated events, processes images with Sharp (resize, format conversion, EXIF stripping), uploads all variants to the processed bucket, and updates the database with URLs. The on-demand fallback checks if processed versions exist, generates them if missing, and caches the result — ensuring zero broken images even if the worker falls behind.

### 4. Set up lifecycle policies and cost optimization

```text
Configure lifecycle policies for all buckets:
- Raw uploads: move to Infrequent Access after 30 days, delete after 1 year
  (unless the user has a premium plan)
- Processed images: keep in Standard (served to users frequently)
- Temp uploads (failed/abandoned): delete after 24 hours
- Incomplete multipart uploads: abort after 7 days
- System backups: move to Glacier after 90 days, delete after 3 years

Also enable versioning on the raw uploads bucket so we can recover
accidentally deleted files within 30 days. Add a lifecycle rule to
delete old versions after 30 days.
```

The agent configures lifecycle rules for all three buckets, enables versioning with a noncurrent version expiration policy, adds an intelligent cleanup script for premium user exemptions (checks user plan before applying deletion rules), and sets up a cost monitoring dashboard that tracks storage usage per bucket and per storage class.

### 5. Secure the storage and add CDN delivery

```text
Security audit all bucket configurations:
- Block all public access on raw uploads bucket
- Processed images served through CloudFront (or Cloudflare R2 public URL)
  with signed cookies for premium content
- All presigned URLs have minimum necessary expiry time
- No wildcard CORS origins in production
- Enable server-side encryption (AES-256) on all buckets
- Enable access logging to a separate logging bucket
- IAM policy for the application: least privilege (only the operations it needs)

Set up CloudFront distribution for processed images with 1-year cache headers
for immutable content (thumbnails, processed images with content-addressed keys).
```

The agent produces a comprehensive security configuration: bucket policies with explicit deny on public access, CloudFront distribution with OAI (Origin Access Identity) so files are only accessible through the CDN, signed cookies for premium content, AES-256 server-side encryption, access logging, and a minimal IAM policy. Cache headers are set to `max-age=31536000, immutable` for processed images using content-addressed keys.

## Real-World Example

A CTO at a 15-person SaaS company watches the `/uploads` directory grow past 280 GB on a single server. File downloads eat 60% of API bandwidth, images are re-processed on every request, and a disk failure would mean total data loss.

1. She migrates all 280 GB to S3 with checksum verification — zero files lost, migration takes 4 hours
2. Direct uploads via presigned URLs eliminate file proxying — API server CPU drops 40%
3. The image processing pipeline generates thumbnails once and serves them through CloudFront — image load times drop from 1.2s to 80ms
4. Lifecycle policies move old files to Infrequent Access — storage costs drop 35% in the first month
5. After the migration: the API server runs on a smaller instance (saving $200/month), files are replicated across 3 AZs, and the team sleeps through the night without disk space alerts
