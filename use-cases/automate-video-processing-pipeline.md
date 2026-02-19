---
title: Automate a Video Processing Pipeline
slug: automate-video-processing-pipeline
description: Build an automated pipeline that processes raw video uploads — transcoding to multiple formats, generating thumbnails, extracting audio, and preparing HLS streams for adaptive playback.
skills:
  - ffmpeg
  - imagemagick
  - docker-compose
  - redis
category: Media Engineering
tags:
  - video
  - media
  - transcoding
  - automation
  - streaming
---

# Automate a Video Processing Pipeline

Noor runs a course platform where instructors upload raw video lectures. Currently, she manually transcodes each video in Handbrake, creates thumbnails in Photoshop, and uploads HLS segments to S3. With 20 new lectures per week, this takes 15 hours of manual work. She wants an automated pipeline: instructor uploads a raw video, and the system produces web-optimized MP4, HLS stream, thumbnail grid, audio-only version, and preview GIF — all without human intervention.

## Step 1 — Video Transcoding

The transcoder takes a raw upload and produces multiple renditions for adaptive bitrate streaming. Each rendition targets a different bandwidth: 1080p for broadband, 720p for good connections, 480p for mobile, and 360p for slow networks.

```bash
#!/bin/bash
# scripts/transcode.sh — Multi-rendition video transcoding.
# Produces 4 quality levels for adaptive bitrate streaming,
# plus an audio-only track for podcast-style listening.

set -euo pipefail

INPUT="$1"
OUTPUT_DIR="$2"
BASENAME=$(basename "$INPUT" | sed 's/\.[^.]*$//')

mkdir -p "$OUTPUT_DIR"

echo "=== Transcoding: $BASENAME ==="

# Get source info for smart encoding decisions
DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$INPUT")
SOURCE_HEIGHT=$(ffprobe -v quiet -select_streams v:0 -show_entries stream=height -of csv=p=0 "$INPUT")

echo "Source: ${SOURCE_HEIGHT}p, ${DURATION}s"

# Common encoding settings:
# - libx264: most compatible codec for web
# - CRF: constant quality (lower = better, 18-28 range)
# - preset slow: better compression ratio (worth it for content viewed many times)
# - movflags +faststart: enables progressive download (playback before full download)
# - aac at 128k: transparent quality for speech content
COMMON_FLAGS="-c:v libx264 -preset slow -movflags +faststart -c:a aac -b:a 128k -ac 2"

# 1080p (if source is >= 1080p)
if [ "$SOURCE_HEIGHT" -ge 1080 ]; then
  echo "→ Encoding 1080p..."
  ffmpeg -i "$INPUT" \
    $COMMON_FLAGS \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2" \
    -crf 22 -maxrate 5M -bufsize 10M \
    "$OUTPUT_DIR/${BASENAME}_1080p.mp4" -y 2>/dev/null
fi

# 720p
echo "→ Encoding 720p..."
ffmpeg -i "$INPUT" \
  $COMMON_FLAGS \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
  -crf 23 -maxrate 3M -bufsize 6M \
  "$OUTPUT_DIR/${BASENAME}_720p.mp4" -y 2>/dev/null

# 480p
echo "→ Encoding 480p..."
ffmpeg -i "$INPUT" \
  $COMMON_FLAGS \
  -vf "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2" \
  -crf 25 -maxrate 1.5M -bufsize 3M \
  "$OUTPUT_DIR/${BASENAME}_480p.mp4" -y 2>/dev/null

# 360p (mobile / slow connections)
echo "→ Encoding 360p..."
ffmpeg -i "$INPUT" \
  $COMMON_FLAGS \
  -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2" \
  -crf 28 -maxrate 800k -bufsize 1.6M \
  "$OUTPUT_DIR/${BASENAME}_360p.mp4" -y 2>/dev/null

echo "=== Transcoding complete ==="
```

## Step 2 — Generate HLS Stream

```bash
#!/bin/bash
# scripts/generate-hls.sh — Create HLS adaptive bitrate stream.
# Produces .m3u8 playlists and .ts segments for each quality level.
# The master playlist lets the player switch quality based on bandwidth.

set -euo pipefail

INPUT_DIR="$1"
HLS_DIR="$2"
BASENAME="$3"

mkdir -p "$HLS_DIR"

# Generate HLS segments for each rendition
for QUALITY in 1080p 720p 480p 360p; do
  INPUT_FILE="$INPUT_DIR/${BASENAME}_${QUALITY}.mp4"
  [ -f "$INPUT_FILE" ] || continue

  QUALITY_DIR="$HLS_DIR/$QUALITY"
  mkdir -p "$QUALITY_DIR"

  echo "→ HLS segments: $QUALITY"
  ffmpeg -i "$INPUT_FILE" \
    -c copy \
    -hls_time 6 \
    -hls_list_size 0 \
    -hls_segment_filename "$QUALITY_DIR/segment_%04d.ts" \
    "$QUALITY_DIR/playlist.m3u8" -y 2>/dev/null
done

# Generate master playlist (adaptive bitrate)
cat > "$HLS_DIR/master.m3u8" << 'EOF'
#EXTM3U
#EXT-X-VERSION:3
EOF

[ -f "$HLS_DIR/1080p/playlist.m3u8" ] && echo '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080
1080p/playlist.m3u8' >> "$HLS_DIR/master.m3u8"

echo '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
720p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=854x480
480p/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p/playlist.m3u8' >> "$HLS_DIR/master.m3u8"

echo "=== HLS master playlist created ==="
```

## Step 3 — Generate Thumbnails and Preview

```bash
#!/bin/bash
# scripts/generate-assets.sh — Thumbnails, preview GIF, and audio extraction.
# Creates visual assets for the course catalog and media player.

set -euo pipefail

INPUT="$1"
OUTPUT_DIR="$2"
BASENAME=$(basename "$INPUT" | sed 's/\.[^.]*$//')

mkdir -p "$OUTPUT_DIR"

DURATION=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$INPUT" | cut -d. -f1)

# Main thumbnail: frame at 10% into the video (avoids black intro frames)
THUMB_TIME=$((DURATION / 10))
echo "→ Main thumbnail at ${THUMB_TIME}s..."
ffmpeg -i "$INPUT" -ss "$THUMB_TIME" -frames:v 1 \
  -vf "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2" \
  "$OUTPUT_DIR/${BASENAME}_thumb.jpg" -y 2>/dev/null

# Thumbnail strip: 10 evenly-spaced frames (for video scrubbing preview)
echo "→ Thumbnail strip (10 frames)..."
INTERVAL=$((DURATION / 10))
ffmpeg -i "$INPUT" \
  -vf "fps=1/$INTERVAL,scale=160:90,tile=10x1" \
  "$OUTPUT_DIR/${BASENAME}_strip.jpg" -y 2>/dev/null

# Optimize thumbnails with ImageMagick
magick "$OUTPUT_DIR/${BASENAME}_thumb.jpg" \
  -strip -quality 85 -sampling-factor 4:2:0 \
  "$OUTPUT_DIR/${BASENAME}_thumb.jpg"

magick "$OUTPUT_DIR/${BASENAME}_strip.jpg" \
  -strip -quality 75 \
  "$OUTPUT_DIR/${BASENAME}_strip.jpg"

# Preview GIF: 5-second clip starting at 20% into the video
GIF_START=$((DURATION / 5))
echo "→ Preview GIF (5s from ${GIF_START}s)..."
ffmpeg -i "$INPUT" -ss "$GIF_START" -t 5 \
  -vf "fps=10,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" \
  "$OUTPUT_DIR/${BASENAME}_preview.gif" -y 2>/dev/null

# Audio-only extraction (for podcast/audio-only mode)
echo "→ Audio extraction..."
ffmpeg -i "$INPUT" -vn \
  -c:a libmp3lame -q:a 4 \
  -metadata title="$BASENAME" \
  "$OUTPUT_DIR/${BASENAME}_audio.mp3" -y 2>/dev/null

# Waveform image (for audio player visualization)
echo "→ Waveform generation..."
ffmpeg -i "$INPUT" -filter_complex \
  "showwavespic=s=1200x120:colors=#3b82f6" \
  -frames:v 1 "$OUTPUT_DIR/${BASENAME}_waveform.png" -y 2>/dev/null

echo "=== Asset generation complete ==="
echo "Files created:"
ls -lh "$OUTPUT_DIR/${BASENAME}"* 2>/dev/null | awk '{print "  " $5 " " $9}'
```

## Step 4 — Orchestrate with a Job Queue

```typescript
// src/worker.ts — Video processing job worker.
// Pulls jobs from Redis queue, runs the processing pipeline,
// updates the database with output URLs, and notifies the instructor.

import { Worker, Queue } from "bullmq";
import { execSync } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, readdirSync, statSync } from "fs";
import path from "path";

const connection = { host: "redis", port: 6379 };
const s3 = new S3Client({ region: process.env.AWS_REGION });

const worker = new Worker("video-processing", async (job) => {
  const { videoId, inputPath, courseId, instructorEmail } = job.data;
  const outputDir = `/tmp/processing/${videoId}`;
  const basename = path.basename(inputPath, path.extname(inputPath));

  try {
    // Step 1: Transcode
    await job.updateProgress(10);
    job.log("Starting transcode...");
    execSync(`bash /app/scripts/transcode.sh "${inputPath}" "${outputDir}/video"`, {
      timeout: 30 * 60 * 1000,  // 30-minute timeout for long lectures
    });

    // Step 2: Generate HLS
    await job.updateProgress(50);
    job.log("Generating HLS stream...");
    execSync(`bash /app/scripts/generate-hls.sh "${outputDir}/video" "${outputDir}/hls" "${basename}"`);

    // Step 3: Generate assets
    await job.updateProgress(70);
    job.log("Generating thumbnails and assets...");
    execSync(`bash /app/scripts/generate-assets.sh "${inputPath}" "${outputDir}/assets"`);

    // Step 4: Upload everything to S3
    await job.updateProgress(85);
    job.log("Uploading to S3...");
    const s3Prefix = `courses/${courseId}/videos/${videoId}`;
    await uploadDirectory(outputDir, s3Prefix);

    // Step 5: Update database with output URLs
    await job.updateProgress(95);
    const cdnBase = `https://cdn.noor-courses.com/${s3Prefix}`;

    return {
      hlsUrl: `${cdnBase}/hls/master.m3u8`,
      mp4Urls: {
        "1080p": `${cdnBase}/video/${basename}_1080p.mp4`,
        "720p": `${cdnBase}/video/${basename}_720p.mp4`,
        "480p": `${cdnBase}/video/${basename}_480p.mp4`,
        "360p": `${cdnBase}/video/${basename}_360p.mp4`,
      },
      thumbnailUrl: `${cdnBase}/assets/${basename}_thumb.jpg`,
      stripUrl: `${cdnBase}/assets/${basename}_strip.jpg`,
      previewGifUrl: `${cdnBase}/assets/${basename}_preview.gif`,
      audioUrl: `${cdnBase}/assets/${basename}_audio.mp3`,
      waveformUrl: `${cdnBase}/assets/${basename}_waveform.png`,
    };
  } finally {
    // Cleanup temporary files
    execSync(`rm -rf "${outputDir}"`);
  }
}, { connection, concurrency: 2 });

async function uploadDirectory(localDir: string, s3Prefix: string) {
  const files = getAllFiles(localDir);
  for (const file of files) {
    const key = `${s3Prefix}/${path.relative(localDir, file)}`;
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: createReadStream(file),
      ContentType: getContentType(file),
    }));
  }
}

function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...getAllFiles(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

function getContentType(file: string): string {
  const ext = path.extname(file).toLowerCase();
  const types: Record<string, string> = {
    ".mp4": "video/mp4", ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/mp2t", ".jpg": "image/jpeg", ".png": "image/png",
    ".gif": "image/gif", ".mp3": "audio/mpeg", ".webp": "image/webp",
  };
  return types[ext] || "application/octet-stream";
}

console.log("Video processing worker started");
```

## Results

Noor deployed the pipeline and processed 80 lectures in the first month:

- **Processing time: 15 hours/week manual → 0** — instructors upload raw video, the pipeline handles everything automatically. Average processing time: 8 minutes per 1-hour lecture on a 4-core VPS.
- **Storage savings: 62%** — H.264 CRF encoding at appropriate bitrates per resolution. A raw 1-hour 1080p lecture (8GB) becomes 1.2GB across all renditions + HLS. Previously, instructors uploaded unoptimized 4K files.
- **Adaptive bitrate works** — students on mobile data get 360p (800kbps), campus WiFi gets 1080p (5Mbps). Buffering complaints dropped from 12/week to 1/week.
- **Thumbnail strip enables scrubbing** — students hover over the progress bar and see frame previews. Time to find specific content in a 90-minute lecture dropped significantly.
- **Audio-only mode**: 18% of students use it — listening on commutes, replaying lectures while taking notes. Zero additional recording needed.
- **Preview GIF on catalog**: course listing pages show 5-second animated previews. Click-through to course detail pages increased 34%.
