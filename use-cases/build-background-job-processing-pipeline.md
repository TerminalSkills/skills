---
title: "Build a Background Job Processing Pipeline for Media and Webhooks"
slug: build-background-job-processing-pipeline
description: "Process file uploads, transcode media, handle webhooks reliably, and manage async job queues with retry logic and dead letter handling."
skills:
  - job-queue
  - webhook-processor
  - file-upload-processor
  - ffmpeg
category: development
tags:
  - background-jobs
  - queues
  - webhooks
  - file-processing
  - media
---

# Build a Background Job Processing Pipeline for Media and Webhooks

## The Problem

Your application accepts user file uploads, receives webhooks from Stripe and GitHub, and needs to generate thumbnails for images and transcode videos. Currently, all of this happens synchronously in the API request handler. A user uploads a 50MB video and the request times out after 30 seconds. GitHub gives a webhook delivery only 10 seconds to answer and Stripe expects a quick 2xx, so slow handlers produce failed deliveries and missed payment confirmations. When a transcoding job fails halfway through, there is no retry mechanism -- the user has to re-upload the file.

## The Solution

Use the **job-queue** skill to set up async job processing with retries and dead letter queues, **file-upload-processor** to handle multipart uploads with validation and virus scanning, **webhook-processor** to receive and reliably process external webhooks, and **ffmpeg** to convert uploaded videos into the required formats and extract thumbnails.

## Step-by-Step Walkthrough

### 1. Set up the job queue infrastructure

Move all slow operations out of the request/response cycle into background jobs.

> Set up BullMQ with Redis for background job processing. Create separate queues for file-processing, media-transcoding, webhook-handling, and email-sending. Configure each queue with appropriate concurrency (file processing: 3 concurrent, transcoding: 2, webhooks: 10, email: 5). Add retry logic with exponential backoff, and a dead letter queue for jobs that fail 3 times (BullMQ has no built-in one, so add a `failed` listener that copies the exhausted job into a `dead-letter` queue).

In BullMQ the retry policy is `{ attempts: 3, backoff: { type: "exponential", delay: 1000 } }` on the job options, and queue and worker both take `connection: { host: "127.0.0.1", port: 6379 }`. The API endpoint returns a 202 Accepted with a job ID immediately. The client polls a status endpoint or receives a WebSocket event when the job completes.

The queue dashboard shows job throughput and failure rates:

```text
BullMQ Queue Status
====================
Queue               Active    Waiting    Completed (24h)    Failed (24h)    DLQ
file-processing     2/3       14         1,847              3               1
media-transcoding   2/2       8          312                7               2
webhook-handling    4/10      0          23,491             12              0
email-sending       1/5       0          4,208              0               0

Retry Policy: exponential backoff (1s, then 2s between the 3 attempts)
Dead Letter Queue: jobs moved after 3 failures, retained 7 days
```

### 2. Handle file uploads with validation

Accept large files without blocking the API server.

> Build a file upload endpoint that accepts files up to 500MB. Validate file types (images: jpg/png/webp, video: mp4/mov, documents: pdf). Stream uploads directly to S3 instead of buffering in memory. After upload completes, enqueue a processing job that generates thumbnails for images and extracts metadata. Reject files that fail MIME type verification.

The upload endpoint uses multipart streaming so memory usage stays flat regardless of file size. Memory stays flat because the stream pipes the request body straight to S3 (multer's `memoryStorage()` would buffer the whole file in RAM, so avoid it here; for the largest files let the client upload to a presigned URL instead). The response includes a job ID that the client uses to poll for processing status or subscribe to a WebSocket channel for real-time updates.

### 3. Process webhooks reliably

External services expect a 200 response within seconds. Do the actual processing asynchronously.

> Set up webhook endpoints for Stripe and GitHub. Read the raw request body (`express.raw`), verify the signature immediately (Stripe: `stripe.webhooks.constructEvent` with the endpoint secret; GitHub: HMAC-SHA256 of the raw body against `X-Hub-Signature-256`, compared with `crypto.timingSafeEqual`), return 200, then enqueue the payload for async processing. Handle idempotency: if Stripe retries a webhook we already processed, skip it without errors. Log every webhook with its processing status for debugging. Alert if any webhook type fails more than 3 times in an hour.

### 4. Transcode media in the background

Convert uploaded videos to multiple formats and resolutions for streaming.

> When a video is uploaded, enqueue a transcoding job that runs FFmpeg to produce three variants: 1080p h264 for desktop, 720p for mobile, and a 15-second preview clip. Generate a thumbnail from the 5-second mark. Update the database with URLs for each variant as they complete. If transcoding fails, retry twice with the same input file from S3 before moving to the dead letter queue.

The worker spawns FFmpeg with an argument array (never a shell string built from the file name). The commands it runs look like this:

```bash
ffmpeg -i in.mp4 -vf "scale=-2:1080" -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -movflags +faststart out-1080.mp4
ffmpeg -i in.mp4 -vf "scale=-2:720" -c:v libx264 -crf 23 -pix_fmt yuv420p -c:a aac -movflags +faststart out-720.mp4
ffmpeg -ss 00:00:05 -i in.mp4 -t 15 -c:v libx264 -crf 28 -c:a aac preview.mp4
ffmpeg -ss 00:00:05 -i in.mp4 -frames:v 1 thumb.jpg
```

FFmpeg exits non-zero on a corrupt file, which the worker turns into a thrown error, so the job retries and finally lands in the dead letter queue.

## Real-World Example

A video course platform was losing uploads because their synchronous processing hit the 30-second request timeout on files larger than 20MB. After implementing the job queue pipeline, uploads completed in 2-3 seconds regardless of file size because files streamed directly to S3. Transcoding ran in the background, with students receiving a notification when their video was ready. Stripe deliveries stopped failing on timeouts because the endpoint returned 200 immediately instead of processing the payment logic synchronously. The dead letter queue caught 12 failed transcoding jobs in the first week -- corrupted video files that would have previously disappeared silently, leaving students confused about their missing uploads.

## Tips

- Set different concurrency limits per queue based on resource intensity. Transcoding is CPU-heavy (limit to 2), while webhook processing is IO-bound and can run 10 or more concurrently.
- Always store the original uploaded file in S3 before enqueuing processing jobs. If transcoding fails, you can re-enqueue without asking the user to upload again.
- Build a dead letter queue dashboard early. Reviewing failed jobs weekly reveals patterns -- corrupted files, unsupported codecs, or rate limit hits from external APIs -- that inform better validation and retry strategies.
- Use webhook idempotency keys (Stripe's event ID, GitHub's delivery ID) as the BullMQ job ID so a retried delivery is not enqueued twice.

## Related Skills

- **job-queue**: BullMQ queues, concurrency, retries and graceful shutdown for every stage.
- **webhook-processor**: raw-body signature verification, idempotent enqueue and dead letter handling for Stripe and GitHub.
- **file-upload-processor**: validated, streamed uploads and status tracking before processing jobs run.
- **ffmpeg**: the transcoding, preview and thumbnail commands the video worker runs.
