---
name: video-frames
description: >-
  Extract frames or clips from videos using ffmpeg. Use when a user asks to
  extract thumbnails from a video, capture specific frames, create video
  previews, split a video into clips, generate a contact sheet, or extract
  frames for analysis. Covers ffmpeg frame extraction, clip cutting, and
  thumbnail generation.
license: Apache-2.0
compatibility: "Requires ffmpeg and ffprobe installed on the system"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["video", "ffmpeg", "frames", "thumbnails", "extraction"]
  use-cases:
    - "Extract key frames from videos for thumbnails or previews"
    - "Split long videos into shorter clips"
    - "Generate contact sheets or frame sequences for analysis"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Video Frames

## Overview

Extract frames, clips, and thumbnails from video files using ffmpeg. Generate single frames at specific timestamps, extract frame sequences at intervals, create video previews, cut clips, and build contact sheets. Works with all major video formats (MP4, MKV, AVI, MOV, WebM).

## Instructions

When a user asks to extract frames or clips from video, determine the task:

### Task A: Extract a single frame at a specific timestamp

```bash
# Extract frame at 1 minute 30 seconds as a high-quality JPEG
ffmpeg -ss 00:01:30 -i input.mp4 -frames:v 1 -q:v 2 frame_90s.jpg

# Extract frame at 10 seconds as PNG (lossless)
ffmpeg -ss 00:00:10 -i input.mp4 -frames:v 1 frame_10s.png

# Extract from a specific frame number (frame 500)
ffmpeg -i input.mp4 -vf "select=eq(n\,500)" -frames:v 1 frame_500.png
```

Key flags:
- `-ss` before `-i` for fast seeking (input seeking)
- `-frames:v 1` to capture exactly one frame
- `-q:v 2` for high JPEG quality (2-5 scale, lower is better)

### Task B: Extract frames at regular intervals

```bash
# Extract one frame every 10 seconds
ffmpeg -i input.mp4 -vf "fps=1/10" -q:v 2 frames/frame_%04d.jpg

# Extract one frame per second
ffmpeg -i input.mp4 -vf "fps=1" -q:v 2 frames/frame_%04d.jpg

# Extract one frame every 5 minutes
ffmpeg -i input.mp4 -vf "fps=1/300" -q:v 2 frames/frame_%04d.jpg

# Extract only keyframes (I-frames) for fast extraction
ffmpeg -skip_frame nokey -i input.mp4 -vsync vfr -q:v 2 keyframes/kf_%04d.jpg
```

### Task C: Cut a clip from a video

```bash
# Extract clip from 1:00 to 2:30 (fast, no re-encoding)
ffmpeg -ss 00:01:00 -to 00:02:30 -i input.mp4 -c copy clip.mp4

# Extract clip with re-encoding (precise cuts)
ffmpeg -ss 00:01:00 -to 00:02:30 -i input.mp4 -c:v libx264 -c:a aac clip.mp4

# Extract the first 30 seconds
ffmpeg -i input.mp4 -t 30 -c copy first_30s.mp4

# Extract the last 60 seconds
ffmpeg -sseof -60 -i input.mp4 -c copy last_60s.mp4
```

Use `-c copy` for fast extraction without quality loss. Use re-encoding (`-c:v libx264`) when you need frame-accurate cuts.

### Task D: Generate a contact sheet (thumbnail grid)

```bash
# Create a 4x4 contact sheet from evenly spaced frames
ffmpeg -i input.mp4 -vf "fps=1/30,scale=320:180,tile=4x4" -frames:v 1 contact_sheet.jpg

# Create a 5x3 contact sheet with timestamps
ffmpeg -i input.mp4 \
  -vf "fps=1/60,scale=384:216,\
drawtext=text='%{pts\:hms}':x=5:y=5:fontsize=14:fontcolor=white:box=1:boxcolor=black@0.5,\
tile=5x3" \
  -frames:v 1 -q:v 2 contact_sheet.jpg
```

### Task E: Batch frame extraction with a script

```bash
#!/bin/bash
# extract_frames.sh - Extract frames from multiple videos
INPUT_DIR="${1:-.}"
OUTPUT_DIR="${2:-./frames}"
INTERVAL="${3:-10}"  # seconds between frames

mkdir -p "$OUTPUT_DIR"

for video in "$INPUT_DIR"/*.{mp4,mkv,avi,mov,webm}; do
  [ -f "$video" ] || continue
  name=$(basename "${video%.*}")
  mkdir -p "$OUTPUT_DIR/$name"

  echo "Processing: $name"
  ffmpeg -i "$video" -vf "fps=1/$INTERVAL" -q:v 2 \
    "$OUTPUT_DIR/$name/frame_%04d.jpg" -loglevel warning

  count=$(ls "$OUTPUT_DIR/$name" | wc -l)
  echo "  Extracted $count frames"
done
```

### Task F: Extract frames with Python for analysis

```python
import subprocess
import json

def get_video_info(video_path: str) -> dict:
    """Get video duration, resolution, and frame count."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_format", "-show_streams", video_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return json.loads(result.stdout)

def extract_frames(video_path: str, output_dir: str, interval_sec: int = 10):
    """Extract frames at regular intervals."""
    subprocess.run([
        "ffmpeg", "-i", video_path,
        "-vf", f"fps=1/{interval_sec}",
        "-q:v", "2",
        f"{output_dir}/frame_%04d.jpg",
        "-loglevel", "warning"
    ], check=True)

def extract_frame_at(video_path: str, timestamp: str, output_path: str):
    """Extract a single frame at a specific timestamp (HH:MM:SS)."""
    subprocess.run([
        "ffmpeg", "-ss", timestamp,
        "-i", video_path,
        "-frames:v", "1", "-q:v", "2",
        output_path,
        "-loglevel", "warning"
    ], check=True)
```

## Examples

### Example 1: Generate thumbnails for a video library

**User request:** "Create a thumbnail for each video in my library"

```bash
for video in ./videos/*.mp4; do
  name=$(basename "${video%.*}")
  # Extract frame at 25% of video duration for a representative thumbnail
  duration=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 "$video")
  offset=$(echo "$duration * 0.25" | bc)
  ffmpeg -ss "$offset" -i "$video" -frames:v 1 -q:v 2 \
    "./thumbnails/${name}_thumb.jpg" -loglevel warning
  echo "Thumbnail: ${name}"
done
```

### Example 2: Create a video preview (1 second every 30 seconds)

**User request:** "Make a short preview that shows 1-second clips from throughout the video"

```bash
# Get duration
DUR=$(ffprobe -v quiet -show_entries format=duration -of csv=p=0 input.mp4)

# Generate a 1-second clip every 30 seconds, then concatenate
rm -f segments.txt
for t in $(seq 0 30 ${DUR%.*}); do
  ffmpeg -ss "$t" -i input.mp4 -t 1 -c:v libx264 -c:a aac \
    "seg_${t}.mp4" -y -loglevel warning
  echo "file 'seg_${t}.mp4'" >> segments.txt
done

ffmpeg -f concat -safe 0 -i segments.txt -c copy preview.mp4
rm -f seg_*.mp4 segments.txt
echo "Preview created: preview.mp4"
```

### Example 3: Extract every scene change as a frame

**User request:** "Detect scene changes and save a frame from each scene"

```bash
mkdir -p scenes
ffmpeg -i input.mp4 \
  -vf "select='gt(scene,0.3)',showinfo" \
  -vsync vfr -q:v 2 scenes/scene_%04d.jpg \
  2>&1 | grep "pts_time" | awk -F'pts_time:' '{print $2}' | cut -d' ' -f1
echo "Scene frames saved to scenes/"
```

## Guidelines

- Always check that ffmpeg is installed: `ffmpeg -version`. Recommend installing via package manager if missing.
- Use `-ss` before `-i` (input seeking) for fast seeking on large files.
- Use `-c copy` when possible to avoid re-encoding; use re-encoding only for frame-accurate cuts.
- For JPEG output, `-q:v 2` gives high quality; for PNG output, no quality flag is needed (lossless).
- Create output directories before running extraction commands.
- Use `ffprobe` to inspect video properties before processing.
- For very large videos, extract keyframes only (`-skip_frame nokey`) for fast initial passes.
- Frame numbering starts at 1 with `%04d` pattern; ensure sufficient digits for long videos.
