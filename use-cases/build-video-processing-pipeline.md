---
title: "Build a Video Processing Pipeline"
slug: build-video-processing-pipeline
description: "Create an automated pipeline that handles video uploads, transcodes them into multiple formats and resolutions, and stores the results in S3-compatible storage using a job queue."
skills: [ffmpeg, media-transcoder, s3-storage, job-queue]
category: development
tags: [video, transcoding, ffmpeg, s3, pipeline, media]
---

# Build a Video Processing Pipeline

## The Problem

Kai is building a video-sharing feature for a community platform. Users upload raw video files — sometimes 4K from a DSLR, sometimes vertical phone recordings, sometimes ancient AVI files from 2008. Each upload needs to be transcoded into multiple resolutions (1080p, 720p, 480p), converted to HLS for adaptive streaming, have thumbnails generated, and be stored reliably. Doing this synchronously on the web server would time out and block every other request.

The naive approach — running ffmpeg inline in the request handler — works for one video at a time. But when 20 instructors upload after a weekend, the server crashes under the load. And when a transcode fails halfway through a 2GB file, there is no retry mechanism — the user has to re-upload from scratch.

## The Solution

Using the **job-queue**, **ffmpeg**, **media-transcoder**, and **s3-storage** skills, the agent builds an async pipeline that accepts uploads instantly, processes them through a multi-step worker with retries, and stores the results in S3 with proper organization and lifecycle rules.

## Step-by-Step Walkthrough

### Step 1: Set Up the Upload Endpoint and Job Queue

```text
I need a video upload endpoint that accepts files up to 2GB, validates
the file type (mp4, mov, avi, mkv, webm), stores the raw upload temporarily,
and queues a processing job. Use BullMQ with Redis for the queue. The endpoint
should return immediately with a job ID so the client can poll for progress.
```

The upload endpoint does one thing fast: accept the file and get out of the way.

```typescript
// api/upload.ts — POST /videos/upload
// Multer middleware: 2GB limit, temp storage in /tmp/uploads
// Validates MIME type against allowlist
// Returns 202 { videoId, status: 'queued' } in <100ms

// queue/video-queue.ts — BullMQ configuration
const videoQueue = new Queue('video-processing', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 30_000 },
    removeOnComplete: { age: 86_400 },  // Clean up after 24h
  },
});
```

A separate status endpoint (`GET /videos/:videoId/status`) lets the client poll for progress. Status moves through `queued -> processing -> complete | failed`, with a percentage for the transcode step so the UI can show a real progress bar.

### Step 2: Extract Metadata and Generate Thumbnails

```text
When a job starts, first extract the video metadata (duration, resolution,
codec, fps, file size) and generate 3 thumbnail candidates at 10%, 50%,
and 90% of the duration. Save metadata to the database.
```

Before transcoding, `ffprobe` extracts everything about the input file: duration, resolution, codec, frame rate, and bitrate. This metadata determines which output resolutions to target — the pipeline never upscales:

| Original Resolution | Output Targets |
|---|---|
| 4K (3840+) | 1080p, 720p, 480p |
| 1080p (1920+) | 1080p, 720p, 480p |
| 720p (1280+) | 720p, 480p |
| Below 720p | Original resolution, 480p |

Thumbnails are extracted at 10%, 50%, and 90% of the video duration — three candidates because the first frame is often black and the last is often credits. The 50% frame becomes the default thumbnail:

```bash
ffmpeg -ss {timestamp} -i input -vframes 1 -vf scale=640:-2 thumb_{n}.jpg
```

### Step 3: Transcode Into Multiple Resolutions and HLS

```text
Transcode each video into the target resolutions as MP4 (H.264 + AAC)
and also produce an HLS adaptive streaming bundle. Use hardware-friendly
settings — these will run on standard cloud VMs, no GPU.
```

Each resolution gets its own ffmpeg pass with tuned quality settings. The CRF values increase slightly at lower resolutions because the quality difference is less perceptible on smaller screens:

```bash
# 1080p: crf 23, preset medium (~2x realtime on 4-core VM)
ffmpeg -i input.mov -vf scale=-2:1080 \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k -movflags +faststart output_1080p.mp4

# 720p:  crf 24, preset medium (~3x realtime)
# 480p:  crf 25, preset fast (~5x realtime)
```

The HLS bundle produces a master playlist with all available resolutions. Players that support adaptive bitrate streaming will automatically switch between quality levels based on the viewer's connection speed:

```bash
ffmpeg -i input.mov \
  -filter_complex "[0:v]split=3[v1][v2][v3]; \
    [v1]scale=-2:1080[o1];[v2]scale=-2:720[o2];[v3]scale=-2:480[o3]" \
  -map "[o1]" -map "[o2]" -map "[o3]" -map 0:a \
  -c:v libx264 -c:a aac \
  -var_stream_map "v:0,a:0 v:1,a:1 v:2,a:2" \
  -hls_time 6 -hls_playlist_type vod \
  -master_pl_name master.m3u8 stream_%v/playlist.m3u8
```

Progress is calculated by parsing ffmpeg's stderr output — comparing the current timestamp against the total duration — and fed back through `job.updateProgress()` so the client sees a real percentage.

### Step 4: Upload Outputs to S3 and Clean Up

```text
Upload all generated files (MP4s, HLS segments, thumbnails) to S3.
Organize by videoId. Set proper content types. Delete temp files after
successful upload. Add lifecycle rules to move old videos to cheaper storage.
```

The S3 bucket is organized by video ID, with separate directories for each output type:

```
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
```

Content types matter for streaming — HLS playlists need `application/vnd.apple.mpegurl` with `no-cache`, while segments and MP4s get `Cache-Control: max-age=31536000` (one year, since they are immutable). Files larger than 100MB use multipart upload with 50MB parts and 4 concurrent streams.

Two lifecycle rules keep storage costs down:
- **Originals** move to S3 Glacier after 30 days (rarely accessed after processing)
- **Failed processing temp files** are deleted after 7 days

After successful upload, all temp files under `/tmp/uploads/{videoId}` are cleaned up.

### Step 5: Wire Up the Worker and Monitoring

```text
Create the main worker that orchestrates all steps in order, handles
failures gracefully, and updates job progress. I want to see what's
happening — add structured logging and a simple dashboard endpoint.
```

The worker runs steps sequentially, but retries are smart — they restart from the failed step, not from scratch. If a 2GB video fails during S3 upload, the retry skips the 20-minute transcode and goes straight to uploading:

```typescript
// workers/video-worker.ts
const pipeline = [
  { name: 'analyze',    progress: 5   },
  { name: 'thumbnails', progress: 10  },
  { name: 'transcode',  progress: 80  },  // 10-80%, bulk of the work
  { name: 'hls',        progress: 90  },
  { name: 'store',      progress: 98  },
  { name: 'cleanup',    progress: 100 },
];

// Each step is wrapped in try/catch
// Completed steps are saved to job.data.completedSteps
// Retries skip already-completed steps
```

A dashboard endpoint (`GET /videos/processing/stats`) pulls metrics from the BullMQ queue: jobs queued, active, completed, failed, and average processing time. Structured logging via `pino` records every step with `videoId`, step name, duration, and error details.

## Real-World Example

Marta runs a cooking tutorial platform where instructors upload lesson videos from phones and DSLRs alike. Before this pipeline, she manually ran ffmpeg commands and uploaded files through the AWS console — a 30-minute process per video that she personally handled every time.

Now instructors upload through the app, get a progress bar, and within minutes their video is available in adaptive streaming quality. The queue handles weekend bursts — when 20 instructors upload their Monday content on Sunday night — without crashing the server. Each video processes at roughly 2-3x realtime on a standard 4-core VM, meaning a 10-minute video takes about 4 minutes to produce all outputs.

Storage costs dropped 40% after the lifecycle rules moved old originals to Glacier. The total infrastructure cost for processing 200+ videos per month: one $40/month VM for the worker and about $15/month in S3 storage.
