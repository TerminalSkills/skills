---
name: media-transcoder
description: >-
  When the user needs to process, resize, convert, or transcode images and videos
  programmatically. Use when the user mentions "image resize," "thumbnail generation,"
  "video transcode," "image optimization," "video compression," "format conversion,"
  "strip EXIF," "webp conversion," "FFmpeg," or "Sharp." Generates processing
  pipelines for images (Sharp) and videos (FFmpeg) with variant generation. For
  upload handling, see file-upload-processor. For manual video editing, see
  ffmpeg-video-editing.
license: Apache-2.0
compatibility: "Node.js 18+ with Sharp, FFmpeg 5+ for video"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["image-processing", "video-transcoding", "ffmpeg", "sharp", "media"]
---

# Media Transcoder

## Overview

Builds automated image and video processing pipelines for web applications. Handles image resizing, format conversion, EXIF stripping, thumbnail generation, video transcoding, and variant creation. Produces code using Sharp (images) and FFmpeg (video) with proper error handling, memory management, and progress tracking.

## Instructions

### Image Processing with Sharp

#### Standard Variant Pipeline

For most applications, generate three variants per image:

```typescript
import sharp from 'sharp';

async function processImage(inputBuffer: Buffer): Promise<ImageVariants> {
  const pipeline = sharp(inputBuffer).rotate(); // Auto-rotate from EXIF

  const thumbnail = await pipeline.clone()
    .resize(150, 150, { fit: 'cover', position: 'attention' })
    .webp({ quality: 80 })
    .toBuffer();

  const medium = await pipeline.clone()
    .resize(800, null, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const original = await pipeline.clone()
    .withMetadata({ orientation: undefined }) // Keep color profile, strip GPS
    .webp({ quality: 90 })
    .toBuffer();

  return { thumbnail, medium, original };
}
```

Key Sharp settings:
- `fit: 'cover'` for thumbnails (fills dimensions, crops excess)
- `fit: 'inside'` for display sizes (fits within bounds, preserves ratio)
- `withoutEnlargement: true` — never upscale
- `position: 'attention'` — smart crop focusing on interesting regions
- Always `.rotate()` first to apply EXIF orientation

#### EXIF Privacy

Strip location data but preserve useful metadata:

```typescript
// Remove GPS, keep orientation and color profile
const cleaned = await sharp(input)
  .rotate() // Apply orientation
  .withMetadata({ orientation: undefined }) // Drop EXIF orientation (already applied)
  .toBuffer();
// GPS data is stripped because we didn't pass exifIfd: original.exif
```

### Video Processing with FFmpeg

#### Standard Transcode

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v main -preset medium -crf 23 \
  -vf "scale='min(1280,iw)':'min(720,ih)':force_original_aspect_ratio=decrease" \
  -c:a aac -b:a 128k \
  -movflags +faststart \
  output.mp4
```

Key settings:
- `crf 23` — good quality/size balance (18=high quality, 28=small file)
- `preset medium` — balance encode speed vs compression (use `fast` for real-time)
- `-movflags +faststart` — moves metadata to start for web streaming
- Scale filter preserves aspect ratio, caps at 720p

#### Thumbnail Extraction

```bash
ffmpeg -i input.mp4 -ss 00:00:02 -vframes 1 -vf "scale=400:-1" thumbnail.png
```

#### Progress Tracking

```typescript
const ffmpeg = spawn('ffmpeg', ['-i', input, '-progress', 'pipe:1', ...args, output]);

ffmpeg.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  const timeMatch = lines.find(l => l.startsWith('out_time_ms='));
  if (timeMatch) {
    const currentMs = parseInt(timeMatch.split('=')[1]);
    const progress = Math.round((currentMs / totalDurationMs) * 100);
    updateJobProgress(jobId, progress);
  }
});
```

### Error Handling

Common failures and how to handle them:

- **Corrupt image**: Sharp throws — catch and mark file as `failed` with error message
- **Unsupported codec**: FFprobe the file first, reject before attempting transcode
- **Out of memory**: Set Sharp's `limitInputPixels` and FFmpeg's `-threads` flag
- **Timeout**: Set max processing time per file (images: 30s, videos: file duration × 3)

## Examples

### Example 1: Profile Avatar Processing

**Prompt**: "Process user avatar uploads: square crop, three sizes (32, 128, 256px), webp format"

**Output**: Sharp pipeline that detects face region for smart cropping, generates three sizes, converts to webp. Includes fallback to center crop if face detection unavailable.

### Example 2: Video Course Transcoding

**Prompt**: "Transcode uploaded course videos to 720p and 480p variants for adaptive streaming"

**Output**: FFmpeg pipeline generating two quality levels, HLS segments for adaptive bitrate streaming, thumbnail at 10% duration mark, and a manifest file. Includes progress webhook notifications.

## Guidelines

- **Process asynchronously** — never block the request thread for media processing
- **Validate before processing** — probe files with Sharp metadata / ffprobe before processing
- **Set memory limits** — Sharp: `limitInputPixels`, FFmpeg: `-threads 2` on shared servers
- **Clean up temp files** — use try/finally to ensure temp files are deleted on success or failure
- **Use webp for images** — 25-35% smaller than JPEG at equivalent quality
- **Use H.264 main profile** — widest playback compatibility across browsers and devices
- **Never upscale** — if input is 480p, don't "transcode to 720p"
- **Log processing metrics** — input size, output size, duration, for capacity planning
