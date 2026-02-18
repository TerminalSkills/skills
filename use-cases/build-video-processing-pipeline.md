---
title: "Build a Video Processing Pipeline"
slug: build-video-processing-pipeline
description: "Create an automated pipeline that handles video uploads, transcodes them into multiple formats and resolutions, and stores the results in S3-compatible storage using a job queue."
skills: [ffmpeg-video-editing, media-transcoder, s3-storage, job-queue]
category: development
tags: [video, transcoding, ffmpeg, s3, pipeline, media]
---

# Build a Video Processing Pipeline

## The Problem

Kai is building a video-sharing feature for a community platform. Users upload raw video files — sometimes 4K, sometimes vertical phone recordings, sometimes ancient AVI files from 2008. Each upload needs to be transcoded into multiple resolutions (1080p, 720p, 480p), converted to HLS for adaptive streaming, have a thumbnail generated, and be stored reliably. Doing this synchronously on the web server would time out and block everything.

## The Solution

Use **job-queue** to handle uploads asynchronously with retry logic, **ffmpeg-video-editing** to extract metadata and generate thumbnails, **media-transcoder** to produce multiple output formats and resolutions, and **s3-storage** to manage the final file storage with proper organization and lifecycle rules.

## Step-by-Step Walkthrough

### 1. Set up the upload endpoint and job queue

```text
I need a video upload endpoint that accepts files up to 2GB, validates
the file type (mp4, mov, avi, mkv, webm), stores the raw upload temporarily,
and queues a processing job. Use BullMQ with Redis for the queue. The endpoint
should return immediately with a job ID so the client can poll for progress.
```

```text
Created api/upload.ts — POST /videos/upload
  - Multer middleware: 2GB limit, temp storage in /tmp/uploads
  - Validates MIME type against allowlist (video/mp4, video/quicktime,
    video/x-msvideo, video/x-matroska, video/webm)
  - Generates unique videoId (nanoid, 12 chars)
  - Enqueues job to 'video-processing' queue:
      { videoId, originalPath, originalName, uploadedBy, uploadedAt }
  - Returns 202 { videoId, status: 'queued' }

Created queue/video-queue.ts — BullMQ queue configuration:
  Queue: 'video-processing'
  Connection: Redis from env REDIS_URL
  Default job options:
    attempts: 3
    backoff: { type: 'exponential', delay: 30000 }
    removeOnComplete: { age: 86400 }  // 24h

Created api/status.ts — GET /videos/:videoId/status
  - Returns { videoId, status, progress, outputs, error }
  - Status: queued → processing → complete | failed
```

### 2. Extract metadata and generate thumbnails

```text
When a job starts, first extract the video metadata (duration, resolution,
codec, fps, file size) and generate 3 thumbnail candidates at 10%, 50%,
and 90% of the duration. Save metadata to the database.
```

```text
Created workers/steps/analyze.ts — Video analysis step:
  Uses ffprobe to extract:
    duration, width, height, codec (video + audio), fps, bitrate, fileSize
  Stores in videos table:
    { videoId, duration, originalWidth, originalHeight, codec, fps, fileSize }

  Determines transcode targets based on original resolution:
    4K (3840+) → outputs: 1080p, 720p, 480p
    1080p (1920+) → outputs: 1080p, 720p, 480p
    720p (1280+) → outputs: 720p, 480p
    Below 720p → outputs: original resolution, 480p
    (Never upscales — only downscales or keeps original)

Created workers/steps/thumbnails.ts — Thumbnail generation:
  Extracts frames at 10%, 50%, 90% of duration using ffmpeg:
    ffmpeg -ss {timestamp} -i input -vframes 1 -vf scale=640:-2 thumb_{n}.jpg
  Quality: 85% JPEG, max width 640px, aspect ratio preserved
  Picks the middle frame (50%) as default thumbnail
  All three uploaded to S3 in next steps
```

### 3. Transcode into multiple resolutions and HLS

```text
Transcode each video into the target resolutions as MP4 (H.264 + AAC)
and also produce an HLS adaptive streaming bundle. Use hardware-friendly
settings — these will run on standard cloud VMs, no GPU.
```

```text
Created workers/steps/transcode.ts — Multi-resolution transcoding:

  For each target resolution:
    ffmpeg -i input.mov \
      -vf scale=-2:{height} \
      -c:v libx264 -preset medium -crf 23 \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      output_{height}p.mp4

  Preset tuning by resolution:
    1080p: crf 23, preset medium (~2x realtime on 4-core VM)
    720p:  crf 24, preset medium (~3x realtime)
    480p:  crf 25, preset fast (~5x realtime)

Created workers/steps/hls.ts — HLS adaptive streaming:
  Produces master playlist with all available resolutions:
    ffmpeg -i input.mov \
      -filter_complex "[0:v]split=3[v1][v2][v3]; \
        [v1]scale=-2:1080[o1];[v2]scale=-2:720[o2];[v3]scale=-2:480[o3]" \
      -map "[o1]" -map "[o2]" -map "[o3]" -map 0:a \
      -c:v libx264 -c:a aac \
      -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
      -hls_time 6 -hls_playlist_type vod \
      -master_pl_name master.m3u8 \
      stream_%v/playlist.m3u8

  Reports progress via job.updateProgress({ step: 'transcode', percent })
  Progress calculated from ffmpeg stderr time output vs total duration
```

### 4. Upload outputs to S3 and clean up

```text
Upload all generated files (MP4s, HLS segments, thumbnails) to S3.
Organize by videoId. Set proper content types. Delete temp files after
successful upload. Add lifecycle rules to move old videos to cheaper storage.
```

```text
Created workers/steps/store.ts — S3 upload orchestrator:

  Bucket structure:
    videos/{videoId}/original.{ext}
    videos/{videoId}/mp4/1080p.mp4
    videos/{videoId}/mp4/720p.mp4
    videos/{videoId}/mp4/480p.mp4
    videos/{videoId}/hls/master.m3u8
    videos/{videoId}/hls/stream_0/playlist.m3u8
    videos/{videoId}/hls/stream_0/segment_*.ts
    videos/{videoId}/thumbnails/thumb_0.jpg
    videos/{videoId}/thumbnails/thumb_1.jpg
    videos/{videoId}/thumbnails/thumb_2.jpg

  Upload settings:
    MP4: Content-Type video/mp4, Cache-Control max-age=31536000
    HLS playlists: Content-Type application/vnd.apple.mpegurl, no-cache
    HLS segments: Content-Type video/mp2t, Cache-Control max-age=31536000
    Thumbnails: Content-Type image/jpeg, Cache-Control max-age=31536000

  Multipart upload for files > 100MB (part size: 50MB)
  Parallel uploads: 4 concurrent streams

Created config/s3-lifecycle.json — Lifecycle rules:
  Rule 1: Move originals to S3 Glacier after 30 days
  Rule 2: Delete failed processing temp files after 7 days

  Cleanup: removes all files from /tmp/uploads/{videoId} after S3 upload
```

### 5. Wire up the worker and monitoring

```text
Create the main worker that orchestrates all steps in order, handles
failures gracefully, and updates job progress. I want to see what's
happening — add structured logging and a simple dashboard endpoint.
```

```text
Created workers/video-worker.ts — Main worker process:

  Pipeline steps (sequential):
    1. analyze  → extract metadata, determine targets
    2. thumbnails → generate 3 thumbnail frames
    3. transcode → MP4 files for each resolution
    4. hls → adaptive streaming bundle
    5. store → upload everything to S3
    6. cleanup → remove temp files

  Error handling:
    Each step wrapped in try/catch
    On failure: logs error, marks job failed with step name
    Retries (3 attempts) restart from the failed step, not from scratch
    Step state saved to job.data.completedSteps array

  Progress reporting:
    analyze: 5%, thumbnails: 10%, transcode: 10-80%, hls: 80-90%,
    store: 90-98%, cleanup: 100%

Created api/dashboard.ts — GET /videos/processing/stats
  Returns: { queued, active, completed, failed, avgProcessingTime }
  Reads from BullMQ queue metrics

Structured logging (pino):
  Every step logs: { videoId, step, duration, details }
  Errors include: { videoId, step, error, attempt }
```

## Real-World Example

Marta runs a cooking tutorial platform where instructors upload lesson videos from phones and DSLRs alike. Before this pipeline, she manually ran ffmpeg commands and uploaded files through the AWS console. Now instructors upload through the app, get a progress bar, and within minutes their video is available in adaptive streaming quality. The queue handles bursts — when 20 instructors upload after a weekend — without crashing the server. Storage costs dropped 40% after the lifecycle rules moved old originals to Glacier.
