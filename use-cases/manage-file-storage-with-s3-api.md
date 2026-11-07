---
title: "Build a Production File Storage System with S3-Compatible APIs"
slug: manage-file-storage-with-s3-api
description: "Design and implement a complete file storage backend with uploads, presigned URLs, image processing, lifecycle policies, and CDN delivery using AWS S3 or another S3-compatible provider."
skills: [s3-storage, coding-agent, security-audit]
category: devops
tags: [s3, object-storage, file-upload, cloud-storage, cdn]
---

# Build a Production File Storage System with S3-Compatible APIs

## The Problem

A SaaS platform stores user files on the application server's local disk. The `/uploads` directory has grown to 280 GB -- not backed up, not replicated, and a single disk failure would lose everything. There's no RAID, no snapshots, no recovery plan. The last time someone asked about backups, the answer was "we should probably set those up."

File downloads go through the API server, eating 60% of its bandwidth during peak hours. Every image request hits the Express server, which reads the file from disk and pipes it to the response -- a 5 MB photo ties up a connection for the entire transfer. There is no access control: anyone who guesses the file path pattern (`/uploads/{userId}/{filename}`) can download any user's files. Image thumbnails are generated on every request instead of being cached, so the same 200x200 avatar gets resized hundreds of times per day. Last month the disk hit 95% capacity at 2 AM and the entire platform went down -- the database transaction logs had nowhere to write, and Postgres crashed.

## The Solution

Using **s3-storage** to implement a proper object storage backend with presigned URLs for direct client uploads, **coding-agent** to build the file management API and image processing pipeline, and **security-audit** to lock down bucket policies and access patterns, the agent replaces the fragile local disk setup with a production-grade storage system.

## Step-by-Step Walkthrough

### Step 1: Design the Storage Architecture and Migrate Existing Files

```text
We have 280 GB of user files on a local disk in /uploads/{userId}/{filename}.
Design an S3 bucket structure and migrate everything. Requirements:
- Separate buckets for user uploads, processed images, and system backups
- Object key pattern that supports efficient listing by user
- Metadata on each object: original filename, uploader ID, upload timestamp
- Migrate all existing files preserving the directory structure
- Verify migration by comparing file counts and checksums

We want to use AWS S3 for production and a local S3-compatible server for
development. Write a storage abstraction layer that works with both.
```

The architecture uses three buckets -- `uploads-raw` for original files, `uploads-processed` for thumbnails and optimized images, and `system-backups` for database dumps and configuration snapshots. Object keys follow the pattern `{userId}/{fileId}/{filename}` for efficient per-user listing.

A storage client factory builds an AWS SDK v3 `S3Client` from environment variables: production uses the default AWS credential chain, development sets `endpoint` and `forcePathStyle: true` for a local S3-compatible server (for example SeaweedFS, Apache-2.0; the community MinIO repository was archived in 2026, so do not build new tooling on it). Recent SDK releases add a CRC32 checksum to every upload by default, which some compatible servers reject. The factory sets `requestChecksumCalculation` and `responseChecksumValidation` to `WHEN_REQUIRED` for the local endpoint only. The migration script streams files from disk in batches with progress tracking -- no loading 280 GB into memory. Each file is hashed with SHA-256 locally and the hash is stored as object metadata; the verification pass compares file counts and hashes between source and destination. (An S3 ETag is not a content hash for multipart or KMS-encrypted objects, so do not compare against it.)

A Docker Compose file starts the local server bound to `127.0.0.1` with the buckets pre-created, so developers never need an AWS account to work on file features. The 280 GB copy itself runs best with `aws s3 sync` or a similar tool; the agent's script then handles only the verification and the metadata.

### Step 2: Implement Secure Direct Uploads with Presigned URLs

```text
Replace our current upload flow (file -> API server -> disk) with direct-to-S3
uploads using presigned URLs. The flow should be:
1. Client requests upload URL from our API (sends filename, size, content type)
2. API validates: file type allowlist (images, PDFs, docs), max size 50MB,
   user has upload quota remaining
3. API generates a presigned POST (size-limited) or PUT URL with 15-minute expiry
4. Client uploads directly to S3 using the presigned URL
5. An S3 event notification (to SQS or EventBridge) triggers our processing worker
6. Worker validates the upload, scans for malware, updates the database

Include CORS configuration for browser uploads and handle multipart uploads
for files over 10MB.
```

The old flow proxied every byte through the API server -- a 50 MB upload occupied a server connection for the entire transfer. The new flow eliminates that bottleneck entirely.

An Express endpoint validates the request (file type against an allowlist, size within limits, user quota not exceeded) and generates a presigned URL with the content type signed into it. A presigned PUT cannot enforce a size range, so the size cap uses a presigned POST (`createPresignedPost` from `@aws-sdk/s3-presigned-post`) with a `content-length-range` condition, plus a `HeadObject` check in the worker. The client uploads directly to S3 -- the API server never touches the file data.

For files over 10 MB, the API starts a multipart upload and returns one presigned `UploadPart` URL per part; the frontend uploads parts of at least 5 MiB (the last part may be smaller) in parallel with retries, then asks the API to complete the upload. A progress bar tracks completion across all parts.

After the file lands in S3, an event notification triggers the worker, which validates the actual file content (magic bytes check, not just the extension the client claimed), runs a malware scan (for example GuardDuty Malware Protection for S3 or ClamAV), updates the database record, and queues processing jobs. CORS configuration on the upload bucket allows browser-based POST and PUT requests (and the `ETag` response header, which multipart parts need) from the application domain only.

### Step 3: Build the Image Processing Pipeline

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

A worker service listens for S3 `ObjectCreated` events on the raw uploads bucket. When an image arrives, Sharp handles the processing: resize to thumbnail (150x150 cover crop), generate a medium variant (800px wide, aspect preserved), strip all EXIF data from the original for privacy, and convert variants to WebP. All three versions upload to the processed bucket, and the database record updates with their URLs.

The on-demand fallback is the safety net. If a client requests a processed image that doesn't exist yet -- maybe the worker fell behind or crashed mid-job -- the request generates the variant on the fly, caches the result in the processed bucket, and serves it. Zero broken image links, ever.

### Step 4: Set Up Lifecycle Policies and Cost Optimization

```text
Configure lifecycle policies for all buckets:
- Raw uploads: move to Standard-IA after 30 days, delete after 1 year
  (unless the user has a premium plan)
- Processed images: keep in Standard (served to users frequently)
- Temp uploads (failed/abandoned): delete after 24 hours
- Incomplete multipart uploads: abort after 7 days
- System backups: move to Glacier after 90 days, delete after 3 years

Also enable versioning on the raw uploads bucket so we can recover
accidentally deleted files within 30 days. Add a lifecycle rule to
delete old versions after 30 days.
```

Lifecycle rules handle the boring but expensive work of storage class management automatically. Raw uploads transition to Standard-IA after 30 days (the minimum S3 allows for that class, and objects under 128 KB are not worth moving) -- most files are accessed heavily in the first week then rarely again. After a year, they're deleted unless the user has a premium plan. An intelligent cleanup script checks the user's plan before applying deletion rules, so premium users keep their files indefinitely.

Incomplete multipart uploads are the hidden cost sink -- abandoned uploads from crashed browsers or network failures accumulate silently. The 7-day abort rule prevents them from piling up.

Versioning on the raw uploads bucket enables 30-day recovery for accidentally deleted files. A noncurrent version expiration rule automatically cleans up old versions after 30 days, preventing version history from inflating storage costs.

Cost alerts come from AWS Budgets, and S3 Storage Lens shows usage per bucket and per storage class.

### Step 5: Secure the Storage and Add CDN Delivery

```text
Security audit all bucket configurations:
- Block all public access on raw uploads bucket
- Processed images served through CloudFront (origin access control) with signed cookies for premium content
- All presigned URLs have minimum necessary expiry time
- No wildcard CORS origins in production
- Confirm default encryption on all buckets (SSE-S3, AES-256, is on by default; use SSE-KMS where keys must be audited)
- Enable access logging to a separate logging bucket
- IAM policy for the application: least privilege (only the operations it needs)

Set up CloudFront distribution for processed images with 1-year cache headers
for immutable content (thumbnails, processed images with content-addressed keys).
```

Security starts with S3 Block Public Access on all three buckets, and ACLs stay disabled (the default for new buckets). Processed images route through a CloudFront distribution that reaches S3 with origin access control (OAC); AWS documents the older origin access identity as legacy and not recommended. The bucket policy allows only the `cloudfront.amazonaws.com` service principal, conditioned on the distribution's ARN, so files are never reachable via direct S3 URLs. Premium content uses CloudFront signed cookies.

Since January 2023 S3 encrypts every new object with SSE-S3 (AES-256) automatically, so the audit confirms the setting instead of enabling it. Access logging goes to a separate logging bucket for audit trails. The application's IAM policy follows least privilege: `PutObject` on the raw bucket, `GetObject` on both raw and processed, `DeleteObject` only on raw, and no permissions it doesn't need.

Cache headers on processed images use `max-age=31536000, immutable` because the content-addressed keys (containing a hash of the source file) guarantee that a URL always maps to the same content. (The earlier `{userId}/{fileId}/thumb.webp` keys are not content-addressed; add the hash to the key, or keep a short TTL.) CloudFront serves repeat requests from the edge cache.

## Real-World Example

A CTO at a 15-person SaaS company watches the `/uploads` directory grow past 280 GB on a single server. File downloads eat 60% of API bandwidth, images are re-processed on every request, and a disk failure would mean total data loss.

She migrates all 280 GB to S3 with hash verification and compares counts before switching traffic. Direct uploads via presigned URLs stop the API server from proxying file bytes, so its bandwidth and CPU load fall and it moves to a smaller instance. Thumbnails are generated once and served through CloudFront. Lifecycle rules move old files to Standard-IA automatically.

S3 Standard stores data redundantly across at least three Availability Zones in a region and is designed for 99.999999999% durability. The team sleeps through the night without disk space alerts.

The biggest change is psychological. The team stops worrying about storage. No more disk space monitoring, no more manual cleanup scripts, no more "what happens if the server dies" anxiety. S3 handles durability, CloudFront handles performance, and lifecycle policies handle cost optimization -- all automatically.
