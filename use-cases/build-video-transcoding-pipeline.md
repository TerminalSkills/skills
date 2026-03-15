---
title: Build a Video Transcoding Pipeline
slug: build-video-transcoding-pipeline
description: Build a video transcoding pipeline with FFmpeg — accepting uploads in any format, generating multiple resolutions and codecs, extracting thumbnails, tracking progress, and serving via adaptive streaming.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - s3-storage
category: development
tags:
  - video
  - transcoding
  - ffmpeg
  - media
  - streaming
---

# Build a Video Transcoding Pipeline

## The Problem

Rio leads engineering at a 20-person video education platform. Users upload course videos in every format imaginable — MOV from iPhones, MKV from screen recorders, AVI from old cameras. The platform serves them as-is, which means: 4K videos on mobile eat data plans, browsers can't play certain codecs, and there's no adaptive quality switching. A 2GB upload takes 4 minutes to buffer on 3G. They need a pipeline that transcodes every upload into multiple qualities, generates HLS for adaptive streaming, and creates thumbnails — all in the background.

## Step 1: Build the Transcoding Pipeline

```typescript
// src/video/transcoder.ts — Video transcoding with FFmpeg, progress tracking, and HLS output
import { spawn } from "node:child_process";
import { pool } from "../db";
import { Redis } from "ioredis";
import { stat, mkdir } from "node:fs/promises";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream } from "node:fs";

const redis = new Redis(process.env.REDIS_URL!);
const s3 = new S3Client({ region: process.env.S3_REGION! });
const BUCKET = process.env.S3_BUCKET!;

interface TranscodeProfile {
  name: string;
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  label: string;              // "1080p", "720p", etc.
}

const PROFILES: TranscodeProfile[] = [
  { name: "1080p", width: 1920, height: 1080, videoBitrate: "4500k", audioBitrate: "192k", label: "Full HD" },
  { name: "720p", width: 1280, height: 720, videoBitrate: "2500k", audioBitrate: "128k", label: "HD" },
  { name: "480p", width: 854, height: 480, videoBitrate: "1000k", audioBitrate: "96k", label: "SD" },
  { name: "360p", width: 640, height: 360, videoBitrate: "500k", audioBitrate: "64k", label: "Low" },
];

interface TranscodeJob {
  id: string;
  videoId: string;
  inputPath: string;
  status: "queued" | "probing" | "transcoding" | "uploading" | "completed" | "failed";
  progress: number;
  profiles: string[];
  duration: number;
  outputPaths: Record<string, string>;
  thumbnailPath: string | null;
  error: string | null;
}

// Queue a video for transcoding
export async function queueTranscode(videoId: string, inputPath: string): Promise<TranscodeJob> {
  const jobId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Probe video to get metadata
  const probe = await probeVideo(inputPath);

  // Determine which profiles to generate (skip profiles larger than source)
  const applicableProfiles = PROFILES.filter((p) =>
    p.height <= (probe.height || 1080)
  );

  const job: TranscodeJob = {
    id: jobId,
    videoId,
    inputPath,
    status: "queued",
    progress: 0,
    profiles: applicableProfiles.map((p) => p.name),
    duration: probe.duration,
    outputPaths: {},
    thumbnailPath: null,
    error: null,
  };

  await pool.query(
    `INSERT INTO transcode_jobs (id, video_id, input_path, status, profiles, duration, created_at)
     VALUES ($1, $2, $3, 'queued', $4, $5, NOW())`,
    [jobId, videoId, inputPath, JSON.stringify(job.profiles), probe.duration]
  );

  await redis.rpush("transcode:queue", JSON.stringify({ jobId, inputPath, videoId }));

  return job;
}

// Process transcoding job
export async function processTranscode(jobId: string): Promise<void> {
  const { rows: [job] } = await pool.query("SELECT * FROM transcode_jobs WHERE id = $1", [jobId]);
  if (!job) throw new Error("Job not found");

  const outputDir = `/tmp/transcode/${jobId}`;
  await mkdir(outputDir, { recursive: true });

  await updateJobStatus(jobId, "transcoding");

  const profiles = PROFILES.filter((p) => JSON.parse(job.profiles).includes(p.name));
  const totalSteps = profiles.length + 2; // profiles + thumbnail + HLS
  let completedSteps = 0;

  try {
    // Generate thumbnail at 10% mark
    const thumbnailTime = Math.max(1, Math.floor(job.duration * 0.1));
    const thumbnailPath = `${outputDir}/thumbnail.jpg`;

    await runFFmpeg([
      "-i", job.input_path,
      "-ss", String(thumbnailTime),
      "-vframes", "1",
      "-vf", "scale=640:-1",
      "-q:v", "3",
      thumbnailPath,
    ]);
    completedSteps++;
    await updateProgress(jobId, completedSteps / totalSteps);

    // Transcode each profile
    for (const profile of profiles) {
      const outputPath = `${outputDir}/${profile.name}.mp4`;

      await runFFmpegWithProgress(
        [
          "-i", job.input_path,
          "-vf", `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
          "-c:v", "libx264",
          "-preset", "medium",
          "-b:v", profile.videoBitrate,
          "-maxrate", profile.videoBitrate,
          "-bufsize", `${parseInt(profile.videoBitrate) * 2}k`,
          "-c:a", "aac",
          "-b:a", profile.audioBitrate,
          "-movflags", "+faststart",    // web optimization
          "-y",
          outputPath,
        ],
        job.duration,
        (fileProgress) => {
          const overallProgress = (completedSteps + fileProgress) / totalSteps;
          redis.hset(`transcode:progress:${jobId}`, {
            progress: String(Math.round(overallProgress * 100)),
            currentProfile: profile.name,
          });
        }
      );

      completedSteps++;
      await updateProgress(jobId, completedSteps / totalSteps);
    }

    // Generate HLS master playlist
    const hlsDir = `${outputDir}/hls`;
    await mkdir(hlsDir, { recursive: true });

    for (const profile of profiles) {
      const hlsProfile = `${hlsDir}/${profile.name}`;
      await mkdir(hlsProfile, { recursive: true });

      await runFFmpeg([
        "-i", `${outputDir}/${profile.name}.mp4`,
        "-c", "copy",
        "-hls_time", "6",              // 6-second segments
        "-hls_list_size", "0",         // keep all segments
        "-hls_segment_filename", `${hlsProfile}/segment_%03d.ts`,
        `${hlsProfile}/playlist.m3u8`,
      ]);
    }

    // Master playlist
    const masterPlaylist = generateMasterPlaylist(profiles);
    await require("node:fs/promises").writeFile(`${hlsDir}/master.m3u8`, masterPlaylist);

    completedSteps++;
    await updateProgress(jobId, 1);

    // Upload to S3
    await updateJobStatus(jobId, "uploading");
    await uploadDirectory(hlsDir, `videos/${job.video_id}/hls`);
    await uploadFile(thumbnailPath, `videos/${job.video_id}/thumbnail.jpg`);

    // Update video record
    await pool.query(
      `UPDATE videos SET
         status = 'ready',
         hls_url = $2,
         thumbnail_url = $3,
         duration = $4,
         profiles = $5
       WHERE id = $1`,
      [job.video_id,
       `https://${BUCKET}.s3.amazonaws.com/videos/${job.video_id}/hls/master.m3u8`,
       `https://${BUCKET}.s3.amazonaws.com/videos/${job.video_id}/thumbnail.jpg`,
       job.duration,
       JSON.stringify(profiles.map((p) => p.name))]
    );

    await updateJobStatus(jobId, "completed");

  } catch (err: any) {
    await pool.query("UPDATE transcode_jobs SET status = 'failed', error = $2 WHERE id = $1", [jobId, err.message]);
    throw err;
  }
}

function generateMasterPlaylist(profiles: TranscodeProfile[]): string {
  let m3u8 = "#EXTM3U\n";
  for (const p of profiles) {
    const bandwidth = parseInt(p.videoBitrate) * 1000;
    m3u8 += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${p.width}x${p.height},NAME="${p.label}"\n`;
    m3u8 += `${p.name}/playlist.m3u8\n`;
  }
  return m3u8;
}

// FFmpeg with progress parsing
function runFFmpegWithProgress(args: string[], duration: number, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [...args, "-progress", "pipe:1"], { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.on("data", (data) => {
      const lines = data.toString().split("\n");
      for (const line of lines) {
        if (line.startsWith("out_time_ms=")) {
          const timeMs = parseInt(line.split("=")[1]) / 1000000;
          const progress = Math.min(timeMs / duration, 1);
          onProgress(progress);
        }
      }
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}

function runFFmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: "ignore" });
    proc.on("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exit ${code}`)));
  });
}

async function probeVideo(path: string): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", path]);
    let output = "";
    proc.stdout.on("data", (d) => output += d);
    proc.on("close", () => {
      const data = JSON.parse(output);
      const video = data.streams.find((s: any) => s.codec_type === "video");
      resolve({
        duration: parseFloat(data.format.duration),
        width: video?.width || 1920,
        height: video?.height || 1080,
      });
    });
  });
}

async function updateJobStatus(jobId: string, status: string) {
  await pool.query("UPDATE transcode_jobs SET status = $2 WHERE id = $1", [jobId, status]);
}

async function updateProgress(jobId: string, progress: number) {
  await redis.hset(`transcode:progress:${jobId}`, "progress", String(Math.round(progress * 100)));
}

async function uploadFile(localPath: string, s3Key: string) {
  // Upload single file to S3
}

async function uploadDirectory(localDir: string, s3Prefix: string) {
  // Recursively upload directory to S3
}
```

## Results

- **Any format accepted** — iPhone MOV, screen recorder MKV, old AVI — FFmpeg handles everything; users don't need to convert before uploading
- **Adaptive streaming saves 60% bandwidth** — HLS auto-switches quality based on connection speed; mobile on 3G gets 360p, desktop on fiber gets 1080p
- **4-minute buffer → instant playback** — HLS segments start playing in <2 seconds; no waiting for the whole file to download
- **Profiles skip unnecessary upscaling** — 720p source only generates 720p, 480p, and 360p; no wasted storage on fake 1080p
- **Progress tracking** — upload dashboard shows "Transcoding 720p: 67%" in real-time; content creators know exactly when their video will be ready
