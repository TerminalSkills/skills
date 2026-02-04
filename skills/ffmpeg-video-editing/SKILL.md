---
name: ffmpeg-video-editing
description: >-
  Edit, convert, trim, merge, and process video files using ffmpeg. Use when
  the user wants to cut video clips, change format, resize, add watermarks,
  create GIFs, extract audio, adjust speed, concatenate videos, or compress
  video files from the command line.
license: Apache-2.0
compatibility: >-
  Requires ffmpeg installed. macOS: brew install ffmpeg. Ubuntu/Debian:
  sudo apt install ffmpeg. Windows: download from ffmpeg.org.
metadata:
  author: Terminal Skills
  version: "1.0.0"
  category: content
  tags: [video, audio, ffmpeg, multimedia, conversion]
---

# FFmpeg Video Editing

Edit, convert, and process video/audio files using ffmpeg command-line tools.

## Overview

FFmpeg is a cross-platform tool for video/audio transcoding, filtering, and streaming. This skill covers common editing operations: trimming, scaling, format conversion, concatenation, watermarks, GIFs, and compression.

## Instructions

### 1. Inspect the source file

```bash
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
```

Get specific properties:
```bash
# Duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 input.mp4

# Resolution
ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 input.mp4
```

### 2. Choose the operation

**Format conversion:**
```bash
ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4
ffmpeg -i input.mkv -c copy output.mp4  # No re-encoding (fast)
```

**Trim/cut:**
```bash
ffmpeg -ss 00:01:30 -to 00:02:45 -i input.mp4 -c copy output.mp4
```
Place `-ss` before `-i` for fast seek, after `-i` for frame-accurate cuts (requires re-encoding).

**Scale/resize:**
```bash
ffmpeg -i input.mp4 -vf "scale=1280:720" output.mp4
ffmpeg -i input.mp4 -vf "scale=1280:-1" output.mp4  # Maintain aspect ratio
```

**Crop:**
```bash
ffmpeg -i input.mp4 -vf "crop=640:480:100:50" output.mp4  # width:height:x:y
ffmpeg -i input.mp4 -vf "crop=ih*16/9:ih" output.mp4      # 16:9 aspect
```

**Speed change:**
```bash
ffmpeg -i input.mp4 -vf "setpts=0.5*PTS" -af "atempo=2.0" output.mp4  # 2x
ffmpeg -i input.mp4 -vf "setpts=2.0*PTS" -af "atempo=0.5" output.mp4  # 0.5x
```
Note: `atempo` accepts 0.5-2.0. Chain for greater changes: `atempo=2.0,atempo=2.0` for 4x.

**Watermark/overlay:**
```bash
ffmpeg -i video.mp4 -i logo.png -filter_complex "overlay=W-w-10:H-h-10" output.mp4
```

**Text overlay:**
```bash
ffmpeg -i input.mp4 -vf "drawtext=text='Hello':fontsize=48:fontcolor=white:x=50:y=50" output.mp4
```

**Fade in/out:**
```bash
ffmpeg -i input.mp4 -vf "fade=t=in:st=0:d=2,fade=t=out:st=58:d=2" output.mp4
```

**Concatenate videos:** Create `filelist.txt`:
```
file 'video1.mp4'
file 'video2.mp4'
```
Then:
```bash
ffmpeg -f concat -safe 0 -i filelist.txt -c copy output.mp4
```

**Extract/replace audio:**
```bash
ffmpeg -i input.mp4 -vn -c:a copy output.aac           # Extract
ffmpeg -i input.mp4 -an -c:v copy output.mp4           # Remove
ffmpeg -i video.mp4 -i audio.mp3 -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 output.mp4  # Replace
```

**Create GIF:**
```bash
ffmpeg -ss 5 -t 3 -i input.mp4 -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
```

**Extract frames:**
```bash
ffmpeg -ss 00:00:10 -i input.mp4 -frames:v 1 frame.png
ffmpeg -i input.mp4 -vf "fps=1" frames/frame_%04d.png
```

**Compress:**
```bash
ffmpeg -i input.mp4 -c:v libx264 -crf 23 -preset medium -c:a aac -b:a 128k output.mp4
```
CRF: 0-51, lower=better quality. Presets: ultrafast, fast, medium, slow, veryslow.

**Rotate:**
```bash
ffmpeg -i input.mp4 -vf "transpose=1" output.mp4  # 90° clockwise
ffmpeg -i input.mp4 -vf "transpose=2" output.mp4  # 90° counter-clockwise
ffmpeg -i input.mp4 -vf "hflip" output.mp4        # Horizontal flip
```

### 3. Common options reference

| Option | Description |
|--------|-------------|
| `-c:v libx264` | H.264 video codec |
| `-c:a aac` | AAC audio codec |
| `-c copy` | Copy without re-encoding |
| `-crf 23` | Quality (0-51, lower=better) |
| `-ss` / `-to` / `-t` | Start / end / duration |
| `-vf` / `-af` | Video / audio filter |
| `-vn` / `-an` | Disable video / audio |
| `-y` | Overwrite without asking |

## Examples

<example>
User: Trim video from 1:30 to 2:45
Command: ffmpeg -ss 00:01:30 -to 00:02:45 -i input.mp4 -c copy trimmed.mp4
</example>

<example>
User: Convert to 720p and compress
Command: ffmpeg -i input.mp4 -vf "scale=-1:720" -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4
</example>

<example>
User: Create GIF from seconds 5-8
Command: ffmpeg -ss 5 -t 3 -i input.mp4 -vf "fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" output.gif
</example>

<example>
User: Add watermark to bottom-right
Command: ffmpeg -i video.mp4 -i logo.png -filter_complex "overlay=W-w-10:H-h-10" output.mp4
</example>

<example>
User: Merge two videos
Steps:
1. Create filelist.txt: file 'video1.mp4'\nfile 'video2.mp4'
2. ffmpeg -f concat -safe 0 -i filelist.txt -c copy merged.mp4
</example>

## Guidelines

- Always run `ffprobe` first to understand source format, resolution, and duration
- Use `-c copy` when possible for speed; re-encode only when applying filters or changing format
- Place `-ss` before `-i` for fast seeking; after `-i` for frame-accurate cuts
- Add `-pix_fmt yuv420p` for maximum player compatibility
- For precise file size, use two-pass encoding with `-b:v` bitrate
- Chain `atempo` filters for speed changes beyond 2x (e.g., `atempo=2.0,atempo=2.0` for 4x)
- Common errors: "codec not supported" → change container; green frames → add `-pix_fmt yuv420p`
