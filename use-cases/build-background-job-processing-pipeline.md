---
title: "Build a Background Job Processing Pipeline for Media and Webhooks"
slug: build-background-job-processing-pipeline
description: "Process file uploads, transcode media, handle webhooks reliably, and manage async job queues with retry logic and dead letter handling."
skills:
  - job-queue
  - webhook-processor
  - file-upload-processor
  - media-transcoder
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

Your application accepts user file uploads, receives webhooks from Stripe and GitHub, and needs to generate thumbnails for images and transcode videos. Currently, all of this happens synchronously in the API request handler. A user uploads a 50MB video and the request times out after 30 seconds. Stripe webhooks occasionally fail because the processing takes longer than Stripe's 20-second timeout, causing missed payment confirmations. When a transcoding job fails halfway through, there is no retry mechanism -- the user has to re-upload the file.

## The Solution

Use the **job-queue** skill to set up async job processing with retries and dead letter queues, **file-upload-processor** to handle multipart uploads with validation and virus scanning, **webhook-processor** to receive and reliably process external webhooks, and **media-transcoder** to convert uploaded videos and images into the required formats.

## Step-by-Step Walkthrough

### 1. Set up the job queue infrastructure

Move all slow operations out of the request/response cycle into background jobs.

> Set up BullMQ with Redis for background job processing. Create separate queues for file-processing, media-transcoding, webhook-handling, and email-sending. Configure each queue with appropriate concurrency (file processing: 3 concurrent, transcoding: 2, webhooks: 10, email: 5). Add retry logic with exponential backoff and a dead letter queue for jobs that fail 3 times.

The API endpoint returns a 202 Accepted with a job ID immediately. The client polls a status endpoint or receives a WebSocket event when the job completes.

### 2. Handle file uploads with validation

Accept large files without blocking the API server.

> Build a file upload endpoint that accepts files up to 500MB. Validate file types (images: jpg/png/webp, video: mp4/mov, documents: pdf). Stream uploads directly to S3 instead of buffering in memory. After upload completes, enqueue a processing job that generates thumbnails for images and extracts metadata. Reject files that fail MIME type verification.

### 3. Process webhooks reliably

External services expect a 200 response within seconds. Do the actual processing asynchronously.

> Set up webhook endpoints for Stripe and GitHub. Verify webhook signatures immediately, return 200, then enqueue the payload for async processing. Handle idempotency: if Stripe retries a webhook we already processed, skip it without errors. Log every webhook with its processing status for debugging. Alert if any webhook type fails more than 3 times in an hour.

### 4. Transcode media in the background

Convert uploaded videos to multiple formats and resolutions for streaming.

> When a video is uploaded, enqueue a transcoding job that produces three variants: 1080p h264 for desktop, 720p for mobile, and a 15-second preview clip. Generate a thumbnail from the 5-second mark. Update the database with URLs for each variant as they complete. If transcoding fails, retry twice with the same input file from S3 before moving to the dead letter queue.

## Real-World Example

A video course platform was losing uploads because their synchronous processing hit the 30-second request timeout on files larger than 20MB. After implementing the job queue pipeline, uploads completed in 2-3 seconds regardless of file size because files streamed directly to S3. Transcoding ran in the background, with students receiving a notification when their video was ready. Stripe webhook reliability went from 94% to 99.97% because the endpoint returned 200 immediately instead of processing the payment logic synchronously. The dead letter queue caught 12 failed transcoding jobs in the first week -- corrupted video files that would have previously disappeared silently, leaving students confused about their missing uploads.
