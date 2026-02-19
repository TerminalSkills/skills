---
name: ffmpeg
description: >-
  Transcode, convert, edit, and process audio and video with FFmpeg. Use when a
  user asks to convert video formats (webm to mp4, mkv to mp4), extract audio
  from video, compress video files, trim or cut clips, concatenate videos, add
  subtitles, create thumbnails, apply filters, change resolution or bitrate,
  re-encode media, create GIFs from video, add watermarks, normalize audio,
  stream media, or build automated media processing pipelines.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
    - ffmpeg
    - video
    - audio
    - transcode
    - convert
    - media
---

# FFmpeg

## Overview

FFmpeg is the Swiss Army knife of media processing. It handles virtually every audio and video format, codec, and container in existence. This skill covers format conversion, codec transcoding, trimming, concatenation, filtering, compression, thumbnail extraction, subtitle embedding, audio normalization, GIF creation, watermarking, and pipeline integration with tools like yt-dlp and gallery-dl.

## Instructions

### Step 1: Installation

```bash
# Ubuntu/Debian
sudo apt install -y ffmpeg

# macOS
brew install ffmpeg

# Verify
ffmpeg -version
ffprobe -version   # media info tool, bundled with ffmpeg
```

### Step 2: Format Conversion

The most common task — converting between container formats and codecs.

```bash
# WebM → MP4 (re-encode to H.264 + AAC for universal compatibility)
ffmpeg -i input.webm -c:v libx264 -c:a aac -movflags +faststart output.mp4

# WebM → MP4 (copy streams if already H.264/AAC — instant, no quality loss)
ffmpeg -i input.webm -c copy output.mp4

# MKV → MP4 (stream copy, no re-encoding)
ffmpeg -i input.mkv -c copy output.mp4

# AVI → MP4
ffmpeg -i input.avi -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4

# MOV → MP4 (Apple ProRes to H.264)
ffmpeg -i input.mov -c:v libx264 -crf 18 -preset slow -c:a aac output.mp4

# Any format → MP4 with web-optimized fast start
ffmpeg -i input.* -c:v libx264 -crf 23 -preset medium -c:a aac -movflags +faststart output.mp4
```

**CRF (Constant Rate Factor):** Controls quality. Lower = better quality, larger file.
- 18: Visually lossless
- 23: Default, good balance
- 28: Smaller file, some quality loss
- 51: Worst quality

### Step 3: Audio Operations

```bash
# Extract audio from video
ffmpeg -i video.mp4 -vn -c:a copy audio.aac          # Copy codec (fast)
ffmpeg -i video.mp4 -vn -c:a libmp3lame -q:a 2 audio.mp3  # Convert to MP3
ffmpeg -i video.mp4 -vn -c:a flac audio.flac          # Lossless FLAC

# Convert between audio formats
ffmpeg -i input.wav -c:a libmp3lame -b:a 320k output.mp3
ffmpeg -i input.mp3 -c:a libopus -b:a 128k output.opus
ffmpeg -i input.flac -c:a aac -b:a 256k output.m4a

# Normalize audio volume
ffmpeg -i input.mp3 -af loudnorm=I=-16:LRA=11:TP=-1.5 output.mp3

# Change sample rate
ffmpeg -i input.wav -ar 44100 output.wav

# Merge audio into video
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4
```

### Step 4: Trim, Cut, and Concatenate

```bash
# Trim from timestamp to duration
ffmpeg -i input.mp4 -ss 00:01:30 -t 00:00:45 -c copy clip.mp4    # 45s starting at 1:30

# Trim from start to end timestamp
ffmpeg -i input.mp4 -ss 00:05:00 -to 00:10:00 -c copy clip.mp4   # 5:00 to 10:00

# First 30 seconds
ffmpeg -i input.mp4 -t 30 -c copy first30.mp4

# Concatenate files (create file list first)
cat > filelist.txt << 'EOF'
file 'clip1.mp4'
file 'clip2.mp4'
file 'clip3.mp4'
EOF
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4

# Concatenate with re-encoding (when codecs differ)
ffmpeg -f concat -safe 0 -i filelist.txt -c:v libx264 -c:a aac output.mp4
```

### Step 5: Resolution and Compression

```bash
# Resize to 1080p (maintain aspect ratio)
ffmpeg -i input.mp4 -vf "scale=-2:1080" -c:v libx264 -crf 23 -c:a copy output.mp4

# Resize to 720p
ffmpeg -i input.mp4 -vf "scale=-2:720" -c:v libx264 -crf 23 -c:a copy output.mp4

# Resize to specific width (height auto)
ffmpeg -i input.mp4 -vf "scale=1280:-2" output.mp4

# Compress aggressively (smaller file)
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset faster -c:a aac -b:a 96k small.mp4

# Two-pass encoding for target file size
ffmpeg -i input.mp4 -c:v libx264 -b:v 1M -pass 1 -an -f null /dev/null
ffmpeg -i input.mp4 -c:v libx264 -b:v 1M -pass 2 -c:a aac -b:a 128k output.mp4

# Change framerate
ffmpeg -i input.mp4 -r 30 output.mp4
```

### Step 6: Thumbnails and Screenshots

```bash
# Single screenshot at timestamp
ffmpeg -i input.mp4 -ss 00:01:30 -frames:v 1 thumb.jpg

# Screenshot every 10 seconds
ffmpeg -i input.mp4 -vf "fps=1/10" thumbs/frame_%04d.jpg

# Thumbnail grid (4x4 contact sheet)
ffmpeg -i input.mp4 -vf "select='not(mod(n,300))',scale=320:-1,tile=4x4" -frames:v 1 grid.jpg

# Extract first frame
ffmpeg -i input.mp4 -frames:v 1 first_frame.png
```

### Step 7: Subtitles

```bash
# Burn subtitles into video (hardcoded)
ffmpeg -i input.mp4 -vf "subtitles=subs.srt" output.mp4

# Burn ASS/SSA subtitles with styling
ffmpeg -i input.mp4 -vf "ass=subs.ass" output.mp4

# Add subtitle track (soft subs, user can toggle)
ffmpeg -i input.mp4 -i subs.srt -c copy -c:s mov_text output.mp4

# Extract subtitles from video
ffmpeg -i input.mkv -map 0:s:0 subs.srt
```

### Step 8: Filters and Effects

```bash
# Create GIF from video segment
ffmpeg -i input.mp4 -ss 5 -t 3 -vf "fps=15,scale=480:-1:flags=lanczos" output.gif

# High-quality GIF with palette
ffmpeg -i input.mp4 -ss 5 -t 3 -vf "fps=15,scale=480:-1:flags=lanczos,palettegen" palette.png
ffmpeg -i input.mp4 -i palette.png -ss 5 -t 3 -lavfi "fps=15,scale=480:-1:flags=lanczos[v];[v][1:v]paletteuse" output.gif

# Add watermark
ffmpeg -i input.mp4 -i watermark.png -filter_complex "overlay=W-w-10:H-h-10" output.mp4

# Speed up / slow down
ffmpeg -i input.mp4 -filter_complex "[0:v]setpts=0.5*PTS[v];[0:a]atempo=2.0[a]" -map "[v]" -map "[a]" fast.mp4
ffmpeg -i input.mp4 -filter_complex "[0:v]setpts=2.0*PTS[v];[0:a]atempo=0.5[a]" -map "[v]" -map "[a]" slow.mp4

# Rotate video
ffmpeg -i input.mp4 -vf "transpose=1" rotated.mp4    # 90° clockwise
ffmpeg -i input.mp4 -vf "transpose=2" rotated.mp4    # 90° counter-clockwise

# Crop video (width:height:x:y)
ffmpeg -i input.mp4 -vf "crop=1280:720:0:180" cropped.mp4

# Fade in/out
ffmpeg -i input.mp4 -vf "fade=in:0:30,fade=out:870:30" -af "afade=in:0:30,afade=out:870:30" output.mp4
```

### Step 9: Media Information

```bash
# Full media info
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4

# Duration only
ffprobe -v quiet -show_entries format=duration -of csv=p=0 input.mp4

# Resolution
ffprobe -v quiet -select_streams v:0 -show_entries stream=width,height -of csv=p=0 input.mp4

# Codec info
ffprobe -v quiet -select_streams v:0 -show_entries stream=codec_name -of csv=p=0 input.mp4
```

### Step 10: Batch Processing

```bash
# Convert all WebM files to MP4
for f in *.webm; do
  ffmpeg -i "$f" -c:v libx264 -crf 23 -c:a aac "${f%.webm}.mp4"
done

# Compress all MP4 files in directory
for f in *.mp4; do
  ffmpeg -i "$f" -c:v libx264 -crf 28 -preset fast -c:a aac "compressed_${f}"
done

# Extract audio from all videos
for f in *.mp4; do
  ffmpeg -i "$f" -vn -c:a libmp3lame -q:a 2 "${f%.mp4}.mp3"
done
```

## Examples

### Example 1: Convert yt-dlp downloads from WebM to MP4
**User prompt:** "I downloaded videos with yt-dlp but they're all .webm files. Convert them to MP4 so they play on my iPhone."

The agent will:
1. Check if the WebM files contain H.264+AAC (stream copy possible) or VP9+Opus (re-encode needed) using `ffprobe`.
2. For VP9/Opus files, run: `for f in *.webm; do ffmpeg -i "$f" -c:v libx264 -crf 23 -preset medium -c:a aac -movflags +faststart "${f%.webm}.mp4"; done`
3. The `-movflags +faststart` flag moves metadata to the beginning of the file, enabling instant playback on mobile devices and web browsers.
4. Report conversion results with file sizes before and after.

### Example 2: Create a highlight reel from multiple clips
**User prompt:** "I have 5 video clips from a conference. Trim the best parts and join them into one video with fade transitions."

The agent will:
1. Trim each clip to the specified timestamps using `-ss` and `-to` flags.
2. Re-encode all clips to matching codec/resolution: `ffmpeg -i clip.mp4 -c:v libx264 -crf 23 -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:-1:-1,fade=in:0:15,fade=out:st=DURATION:d=0.5" -c:a aac -ar 44100 segment_N.mp4`
3. Create a concat file list and merge: `ffmpeg -f concat -safe 0 -i filelist.txt -c copy highlight_reel.mp4`

## Guidelines

- When converting yt-dlp downloads (typically WebM/VP9+Opus), always re-encode to H.264+AAC for maximum device compatibility. Use `-c:v libx264 -crf 23 -c:a aac -movflags +faststart`.
- Use stream copy (`-c copy`) whenever possible to avoid re-encoding — it is instant and lossless. Only re-encode when changing codecs, applying filters, or when source and target containers are incompatible.
- Always add `-movflags +faststart` when creating MP4 files for web or mobile playback; it moves the moov atom to the beginning of the file for instant streaming.
- Use `ffprobe` before processing to understand the input format, avoiding unnecessary re-encoding.
- For batch operations, always test the command on a single file first before running on the entire directory.
- Prefer CRF mode over bitrate mode for single-pass encoding; it produces consistent quality across different content types.
