---
title: "Implement a File Upload and Processing Pipeline"
slug: implement-file-upload-pipeline
description: "Build a production file upload system with validation, image/video processing, cloud storage, and async job handling."
skills: [file-upload-processor, batch-processor]
category: development
tags: [file-upload, image-processing, video, cloud-storage, pipeline]
---

# Implement a File Upload and Processing Pipeline

## The Problem

Every SaaS app eventually needs file uploads: profile avatars, document attachments, video content. A naive implementation breaks fast. Large files time out the request, unvalidated uploads become a security hole, images need resizing into several variants, videos need transcoding, and none of it may block the web server.

The usual progression: start with `multer` saving to disk, hit the first 413 when someone uploads a 200 MB video, add a size limit, then find the disk full of temp files. Move to cloud storage, add thumbnails with Sharp, then discover synchronous processing blocks the API for seconds per upload. Add a queue, then discover failed jobs vanish silently. Each fix introduces the next problem.

## The Solution

Using the **file-upload-processor** and **batch-processor** skills, the agent builds the pipeline in four layers: an upload endpoint that validates before anything reaches storage, direct-to-storage presigned multipart upload for large files, an image and video processing step, and a BullMQ queue that runs the processing asynchronously. file-upload-processor supplies the validation, key naming and storage rules. batch-processor supplies the pattern for running many files through a transform with bounded concurrency and per-file error handling, which the workers and the one-off backfill in Step 4 follow.

## Step-by-Step Walkthrough

### Step 1: Build the upload endpoint with validation

```text
I have a Node.js/Express API. I need a file upload endpoint that accepts
images (jpg, png, webp up to 10 MB) and PDFs (up to 25 MB), stored in
S3-compatible storage. Validate the real file type from the bytes, enforce
size limits at the parser, and never let the client choose the storage path.
```

Four rules do most of the security work, and each one fails differently if skipped:

- **Detect the type from the bytes.** The `Content-Type` header and the filename both come from the client. `file-type` reads the leading bytes (JPEG `FF D8 FF`, PNG `89 50 4E 47`, PDF `%PDF`, WebP `RIFF....WEBP`) and returns the real MIME type. Check it against an allowlist, and store that detected type, not the header, as the object's `Content-Type`. Magic bytes prove the file starts like a PNG; they do not prove it is harmless, so also serve user files with `Content-Disposition: attachment` (or from a separate domain) and re-encode images in Step 2.
- **Set the limit in the parser.** In multer, `limits.fileSize` defaults to `Infinity`. Set it, plus `files` and `fields`, and map `LIMIT_FILE_SIZE` to a 413. A `Content-Length` check alone is not enough, because chunked requests do not send one. Also set the limit at the reverse proxy (nginx `client_max_body_size`).
- **Build the storage key from server-generated parts only.** A client filename like `../../etc/cron.d/x` or one with null bytes is a path traversal attempt against a local disk, and against object storage it is an overwrite or collision risk. Use `uploads/{userId}/{uuid}.{ext}` with the extension taken from the detected type; keep the original name only as display text in the database.
- **Keep the upload size within memory.** `multer.memoryStorage()` buffers the whole file in RAM, so it suits files up to tens of MB. Anything bigger takes the presigned path below.

```javascript
import { randomUUID } from 'node:crypto';
import express from 'express';
import multer from 'multer';
import { fileTypeFromBuffer } from 'file-type';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

const ALLOWED = {
  'image/jpeg': { ext: 'jpg', maxBytes: 10 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 10 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 10 * 1024 * 1024 },
  'application/pdf': { ext: 'pdf', maxBytes: 25 * 1024 * 1024 },
};

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT, // needed for S3-compatible providers
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1, fields: 5 },
});

const app = express();

// requireAuth is your auth middleware; it must set req.user before this handler runs.
app.post('/api/files/upload', requireAuth, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file field is required' });

    const detected = await fileTypeFromBuffer(req.file.buffer);
    const rule = detected && ALLOWED[detected.mime];
    if (!rule) return res.status(415).json({ error: 'unsupported file type' });
    if (req.file.size > rule.maxBytes) return res.status(413).json({ error: 'file too large' });

    const id = randomUUID();
    const key = `uploads/${req.user.id}/${id}.${rule.ext}`;

    await new Upload({
      client: s3,
      params: {
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: detected.mime,
        ContentDisposition: 'attachment',
      },
    }).done();

    // Insert the file row (status "uploaded") and enqueue processing here.
    // If the insert fails, delete the object so storage and database stay in step.
    res.status(201).json({ id, status: 'uploaded' });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code });
  }
  console.error(err);
  res.status(500).json({ error: 'upload failed' });
});
```

Run against this handler with the S3 call stubbed, a text file posted as `../../etc/photo.png` is rejected with 415, a 26 MB body with 413, and a real PNG passes the type check. Rate limit the route per user (for example 20 uploads per hour) and delete the object if the database write fails.

For videos (mp4, webm up to 500 MB) do not stream through the API server. Give the client presigned multipart URLs (every part except the last at least 5 MiB, at most 10,000 parts) so it uploads parts straight to storage, then have a `complete` endpoint call `CompleteMultipartUpload`. Presigned URLs should live only a few minutes, and the complete endpoint must re-check the object's size and sniff its first bytes before queuing it, because the browser, not your server, sent them.

### Step 2: Process images with Sharp

```text
When an image is uploaded, generate a 150x150 cover-cropped thumbnail and an
800px-wide variant, both WebP, plus a re-encoded original. Strip location
metadata. Run it asynchronously and update the file record with the variants.
```

Re-encoding through Sharp does two jobs at once: it produces the variants, and it throws away anything that was hiding in the original file. Sharp drops EXIF, ICC and other metadata from its output unless you call `withMetadata()`, so GPS coordinates do not survive. Call `.rotate()` with no arguments first, so the orientation flag is baked into the pixels before the flag is discarded; otherwise phone photos come out sideways.

```javascript
import sharp from 'sharp';

const input = sharp(originalBuffer, { limitInputPixels: 50_000_000 }).rotate();
const thumb = await input.clone().resize(150, 150, { fit: 'cover' }).webp({ quality: 80 }).toBuffer();
const medium = await input.clone().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
const original = await input.clone().webp({ quality: 85 }).toBuffer();
```

`limitInputPixels` stops a small file that decodes to a gigantic bitmap (a decompression bomb) from exhausting memory. Upload the three results under `files/{id}/thumb.webp`, `medium.webp` and `original.webp`, then set the record to `processed` with the variant keys.

### Step 3: Transcode video with FFmpeg

```text
For video uploads, probe the file, transcode to H.264/AAC MP4 capped at 720p,
and extract a thumbnail from the 2-second mark.
```

Probe first (`ffprobe -v error -show_entries format=duration:stream=codec_name,width,height -of json input`) and store the result so the UI can show duration and resolution immediately. Then transcode and extract the thumbnail:

```bash
ffmpeg -v error -i "$IN" \
  -vf "scale=-2:'min(720,ih)'" \
  -c:v libx264 -profile:v main -pix_fmt yuv420p -crf 23 -preset medium \
  -c:a aac -b:a 128k -movflags +faststart "$OUT"

ffmpeg -v error -ss 2 -i "$OUT" -frames:v 1 -vf scale=400:-2 "$THUMB"
```

Two flags matter more than they look. `-pix_fmt yuv420p` is required for the `main` profile and for playback in every browser: without it a 4:4:4 source makes the encode fail outright. `-movflags +faststart` moves the index to the front so playback starts before the download finishes. Always pass the input and output paths as separate arguments from your own generated paths (`execFile`, not a shell string), and never use the uploaded filename in them.

### Step 4: Run it on a queue

```text
Set up BullMQ with Redis for the processing jobs. Image jobs concurrency 5,
video jobs concurrency 2. Add retries with backoff, keep failed jobs
inspectable, and clean up temp files.
```

```javascript
import { Queue, Worker } from 'bullmq';

const connection = { host: '127.0.0.1', port: 6379 };

export const imageQueue = new Queue('image-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 7 * 24 * 3600 }, // seconds
    removeOnFail: false, // failed jobs stay in the failed set for inspection and retry
  },
});

new Worker('image-processing', async (job) => {
  const signal = AbortSignal.timeout(5 * 60 * 1000); // BullMQ has no per-job timeout option
  await processImage(job.data, signal);
}, { connection, concurrency: 5 });
```

Use a second queue with `concurrency: 2` for video. BullMQ has no dead-letter queue of its own: a job that has used all its attempts moves to the failed set, and with `removeOnFail: false` it stays there where an admin page or alert can list and retry it. Redis must be bound to a private interface and require a password in production. Workers run as separate processes from the API, so upload throughput and processing throughput scale separately. Delete temp files in a `finally` block so failures do not leak them.

The same bounded-concurrency pattern from batch-processor covers one-off work, such as re-processing every existing image after changing the thumbnail size: iterate the stored keys, run the transform with a fixed worker count, and record a result per file instead of stopping at the first error.

## Real-World Example

Marcus is building a learning platform where instructors upload course videos and slide decks, and students submit assignment PDFs. Everything is saved to local disk at `/uploads`, which broke when the app moved to a second server behind a load balancer: uploads landed on one server and downloads were routed to the other.

The load balancer is the visible problem. Underneath it, there is no validation (a student uploaded a `.exe` renamed to `.pdf` last week), course cover images are 8 MB phone photos served at full size, and videos play in some browsers but not others because instructors upload everything from MOV to AVI.

He gives the agent his stack (Next.js API routes, PostgreSQL, S3-compatible storage on Backblaze B2) and the three file types. The agent builds the endpoint with byte-level type detection first, which rejects the disguised executable on the spot, then Sharp processing that turns the 8 MB photos into small WebP variants, then FFmpeg transcoding to 720p H.264 for consistent playback. Large videos use presigned multipart upload, so a dropped connection costs one part rather than the whole file.

Marcus checks the storage bill before committing to a provider: at the time of writing Backblaze lists B2 at $6.95 per TB per month, with free egress up to three times the data stored and $0.01 per GB beyond that (and free egress through partner CDNs). Because B2 speaks the S3 API, switching providers later means changing the endpoint, region and credentials rather than the code.

## Related Skills

- [file-upload-processor](../skills/file-upload-processor/SKILL.md) -- upload endpoints, byte-level validation, storage keys, presigned multipart upload
- [batch-processor](../skills/batch-processor/SKILL.md) -- bounded-concurrency bulk processing with per-file error handling
