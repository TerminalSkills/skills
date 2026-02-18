---
title: "Implement a File Upload and Processing Pipeline"
slug: implement-file-upload-pipeline
description: "Build a production file upload system with validation, image/video processing, cloud storage, and async job handling."
skills: [file-upload-processor, media-transcoder, batch-processor]
category: development
tags: [file-upload, image-processing, video, cloud-storage, pipeline]
---

# Implement a File Upload and Processing Pipeline

## The Problem

Every SaaS app eventually needs file uploads — profile avatars, document attachments, video content. But a naive implementation breaks fast: large files time out the request, unvalidated uploads become a security hole, images need resizing into multiple formats, videos need transcoding, and the whole thing needs to work without blocking the web server. Building this pipeline from scratch takes a week of fiddling with streams, queues, and cloud storage APIs.

## The Solution

Use **file-upload-processor** to build the upload endpoint with validation and cloud storage, **media-transcoder** to handle image resizing and video transcoding, and **batch-processor** to orchestrate the async job queue. The agent creates a complete pipeline from upload to processed output.

## Step-by-Step Walkthrough

### 1. Build the upload endpoint with validation

```text
I have a Node.js/Express API. I need a file upload endpoint that handles images
(jpg, png, webp up to 10MB), videos (mp4, webm up to 500MB), and documents
(pdf up to 25MB). Upload to S3-compatible storage. Include validation for file
type, size, and basic malware scanning via magic bytes.
```

```text
Created upload/routes.ts — POST /api/files/upload with multer streaming
Created upload/validators.ts — File type detection via magic bytes, size limits
Created upload/storage.ts — S3 client with presigned URL generation
Created upload/models/file.ts — File record: id, userId, key, status, metadata

Upload flow:
  1. Client sends multipart form data
  2. Server validates magic bytes (not just extension) — rejects disguised files
  3. Streams directly to S3 (no temp file on disk)
  4. Creates database record with status "uploaded"
  5. Dispatches processing job to queue
  6. Returns file ID and status URL immediately

Validation rules:
  Images: JPEG (FF D8 FF), PNG (89 50 4E 47), WebP (52 49 46 46) — max 10MB
  Videos: MP4 (ftyp box), WebM (1A 45 DF A3) — max 500MB
  PDFs: %PDF header — max 25MB
```

### 2. Add image processing pipeline

```text
When an image is uploaded, generate these variants:
- thumbnail: 150x150, cropped to center, webp, quality 80
- medium: max 800px wide, preserve aspect ratio, webp, quality 85
- original: strip EXIF GPS data but keep orientation, convert to webp

Run this asynchronously after upload. Update the file record with variant URLs.
```

```text
Created processing/image.processor.ts — Sharp-based image pipeline
Created processing/jobs/process-image.job.ts — BullMQ job handler
Updated upload/models/file.ts — Added variants JSON field

Pipeline per image:
  1. Download original from S3
  2. Strip GPS from EXIF (privacy), auto-rotate based on orientation
  3. Generate thumbnail (150x150 cover crop)
  4. Generate medium (800px wide, aspect preserved)
  5. Convert original to webp, re-upload
  6. Upload all variants to S3 under files/{id}/thumb.webp, medium.webp, original.webp
  7. Update database: status → "processed", variants → { thumb: url, medium: url, original: url }

Processing time: ~2s for a 5MB JPEG on a 2-core server
```

### 3. Add video transcoding

```text
For video uploads, transcode to H.264/AAC MP4 at 720p and generate a
thumbnail from the 2-second mark. Videos over 100MB should use multipart
upload to S3. Show progress via webhook or polling endpoint.
```

```text
Created processing/video.processor.ts — FFmpeg-based transcoder
Created processing/jobs/process-video.job.ts — Long-running job with progress
Created upload/routes/status.ts — GET /api/files/:id/status (polling)

Video pipeline:
  1. Download from S3 (streaming for large files)
  2. Probe with ffprobe: duration, resolution, codec, bitrate
  3. Transcode: H.264 main profile, AAC 128k, 720p max, CRF 23
  4. Extract thumbnail: PNG at 2-second mark, resize to 400px wide
  5. Upload processed video and thumbnail to S3
  6. Update status with progress (0-100%) during transcode

For files > 100MB:
  Client gets presigned multipart upload URLs directly
  Client uploads parts in parallel to S3
  Server completes multipart upload, then queues processing

Status endpoint returns:
  { "id": "file_abc", "status": "processing", "progress": 65, "variants": null }
```

### 4. Set up the job queue

```text
Set up BullMQ with Redis for the processing jobs. Image jobs should have
concurrency 5, video jobs concurrency 2 (CPU-heavy). Add retry with backoff,
dead letter queue for failed jobs, and cleanup of temp files.
```

```text
Created queue/setup.ts — BullMQ queues for image and video processing
Created queue/workers/image.worker.ts — Concurrency 5, 3 retries
Created queue/workers/video.worker.ts — Concurrency 2, 2 retries
Created queue/cleanup.ts — Cron job to purge completed jobs after 7 days

Configuration:
  image-processing queue: concurrency 5, retry 3x with exponential backoff
  video-processing queue: concurrency 2, retry 2x, timeout 30 minutes
  Dead letter queue: failed jobs moved after max retries for manual review
  Temp file cleanup: /tmp/processing/* cleared after each job completes
```

## Real-World Example

A developer is building a learning platform where instructors upload course videos and slide decks. Students upload assignment PDFs. The current setup saves files to the local disk, which breaks on deployment and doesn't scale.

1. He describes his stack (Next.js API routes, PostgreSQL, S3-compatible storage) and file types
2. The agent builds the upload endpoint with streaming to S3 and magic-byte validation
3. Image processing generates thumbnails for course covers automatically
4. Video transcoding normalizes instructor uploads to 720p H.264 for consistent playback
5. The BullMQ queue handles 50 concurrent instructor uploads during course prep week
6. What took two weeks of stack overflow answers is running in production in two days
