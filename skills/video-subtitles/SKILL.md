---
name: video-subtitles
description: >-
  Generate and burn subtitles into videos. Use when a user asks to add
  subtitles to a video, generate captions, transcribe audio to SRT or VTT,
  auto-transcribe with Whisper, burn in subtitles, create closed captions,
  or translate subtitles. Supports SRT, VTT, and ASS subtitle formats.
license: Apache-2.0
compatibility: "Requires ffmpeg and Python 3.8+ with openai-whisper for transcription"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: ["subtitles", "captions", "whisper", "video", "transcription"]
  use-cases:
    - "Auto-transcribe video audio to SRT subtitles using Whisper"
    - "Burn hardcoded subtitles into video files"
    - "Convert between subtitle formats (SRT, VTT, ASS)"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Video Subtitles

## Overview

Generate, edit, and burn subtitles into video files. Auto-transcribe audio to timed subtitle files using OpenAI Whisper, convert between SRT/VTT/ASS formats, style and position subtitles, and hardcode them into video. Supports batch processing for multiple videos.

## Instructions

When a user asks for subtitle help, determine the task:

### Task A: Auto-transcribe audio to subtitles with Whisper

1. Install Whisper:

```bash
pip install openai-whisper
# or for faster inference with GPU
pip install faster-whisper
```

2. Generate subtitles from a video:

```bash
# Basic transcription to SRT
whisper input.mp4 --model medium --output_format srt --output_dir ./subs/

# Specify language for better accuracy
whisper input.mp4 --model medium --language en --output_format srt

# Generate multiple formats at once
whisper input.mp4 --model medium --output_format all

# Use faster-whisper for speed (same accuracy)
# pip install faster-whisper
```

3. Python API for more control:

```python
import whisper

model = whisper.load_model("medium")  # tiny, base, small, medium, large
result = model.transcribe("input.mp4", language="en")

# Write SRT file
def write_srt(segments: list, output_path: str):
    with open(output_path, "w", encoding="utf-8") as f:
        for i, seg in enumerate(segments, 1):
            start = format_timestamp(seg["start"])
            end = format_timestamp(seg["end"])
            f.write(f"{i}\n{start} --> {end}\n{seg['text'].strip()}\n\n")

def format_timestamp(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

write_srt(result["segments"], "output.srt")
```

### Task B: Burn subtitles into a video with ffmpeg

```bash
# Burn SRT subtitles (soft-styled)
ffmpeg -i input.mp4 -vf "subtitles=subs.srt" -c:a copy output.mp4

# Burn with custom styling
ffmpeg -i input.mp4 -vf "subtitles=subs.srt:force_style='\
FontSize=24,FontName=Arial,PrimaryColour=&H00FFFFFF,\
OutlineColour=&H00000000,Outline=2,Shadow=1,\
MarginV=30'" -c:a copy output.mp4

# Burn ASS subtitles (preserves advanced styling)
ffmpeg -i input.mp4 -vf "ass=subs.ass" -c:a copy output.mp4

# Burn subtitles with hardware acceleration
ffmpeg -i input.mp4 -vf "subtitles=subs.srt" \
  -c:v libx264 -preset fast -crf 18 -c:a copy output.mp4
```

### Task C: Create and edit SRT files manually

SRT format:
```
1
00:00:01,000 --> 00:00:04,000
Welcome to this tutorial.

2
00:00:04,500 --> 00:00:08,200
Today we will learn about
video subtitle creation.

3
00:00:09,000 --> 00:00:12,500
Let's get started!
```

VTT format:
```
WEBVTT

00:00:01.000 --> 00:00:04.000
Welcome to this tutorial.

00:00:04.500 --> 00:00:08.200
Today we will learn about
video subtitle creation.
```

### Task D: Convert between subtitle formats

```python
def srt_to_vtt(srt_path: str, vtt_path: str):
    """Convert SRT to WebVTT format."""
    with open(srt_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace comma with dot in timestamps
    import re
    content = re.sub(r"(\d{2}:\d{2}:\d{2}),(\d{3})", r"\1.\2", content)

    # Remove sequence numbers
    lines = content.strip().split("\n")
    vtt_lines = ["WEBVTT", ""]
    for line in lines:
        if line.strip().isdigit():
            continue
        vtt_lines.append(line)

    with open(vtt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(vtt_lines))

def vtt_to_srt(vtt_path: str, srt_path: str):
    """Convert WebVTT to SRT format."""
    with open(vtt_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove WEBVTT header
    content = content.replace("WEBVTT", "").strip()

    # Replace dot with comma in timestamps
    import re
    content = re.sub(r"(\d{2}:\d{2}:\d{2})\.(\d{3})", r"\1,\2", content)

    # Add sequence numbers
    blocks = content.strip().split("\n\n")
    srt_blocks = []
    for i, block in enumerate(blocks, 1):
        if block.strip():
            srt_blocks.append(f"{i}\n{block.strip()}")

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n\n".join(srt_blocks) + "\n")
```

### Task E: Shift subtitle timing

```bash
# Delay all subtitles by 2.5 seconds using ffmpeg
ffmpeg -itsoffset 2.5 -i subs.srt -c copy subs_shifted.srt

# Python: shift all timestamps
def shift_srt(input_path: str, output_path: str, offset_sec: float):
    """Shift all SRT timestamps by offset_sec (positive = delay)."""
    import re
    with open(input_path, "r", encoding="utf-8") as f:
        content = f.read()

    def shift_ts(match):
        parts = match.group().split(":")
        total = int(parts[0]) * 3600 + int(parts[1]) * 60
        sec_ms = parts[2].split(",")
        total += int(sec_ms[0]) + int(sec_ms[1]) / 1000
        total += offset_sec
        total = max(0, total)
        h = int(total // 3600)
        m = int((total % 3600) // 60)
        s = int(total % 60)
        ms = int((total % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

    result = re.sub(r"\d{2}:\d{2}:\d{2},\d{3}", shift_ts, content)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(result)

shift_srt("subs.srt", "subs_delayed.srt", offset_sec=2.5)
```

## Examples

### Example 1: Auto-subtitle a lecture recording

**User request:** "Transcribe my 1-hour lecture and burn subtitles into the video"

```bash
# Step 1: Transcribe with Whisper (medium model for good accuracy)
whisper lecture.mp4 --model medium --language en --output_format srt --output_dir ./

# Step 2: Review and fix the generated SRT file if needed

# Step 3: Burn subtitles into the video
ffmpeg -i lecture.mp4 -vf "subtitles=lecture.srt:force_style='\
FontSize=22,FontName=Arial,MarginV=25'" -c:a copy lecture_subtitled.mp4
```

### Example 2: Generate subtitles in multiple languages

**User request:** "Create English and Spanish subtitles for my video"

```bash
# English transcription
whisper video.mp4 --model medium --language en --output_format srt \
  --output_dir ./ && mv video.srt video_en.srt

# Spanish transcription (Whisper handles translation)
whisper video.mp4 --model medium --task translate --language es \
  --output_format srt --output_dir ./ && mv video.srt video_es.srt
```

### Example 3: Batch subtitle generation for a video series

**User request:** "Generate subtitles for all episodes in this folder"

```bash
for video in ./episodes/*.mp4; do
  name=$(basename "${video%.*}")
  echo "Transcribing: $name"
  whisper "$video" --model medium --language en \
    --output_format srt --output_dir ./subs/
  echo "  Done: ./subs/${name}.srt"
done
echo "All episodes transcribed"
```

## Guidelines

- Use the `medium` Whisper model as a default; it balances accuracy and speed well. Use `large` only for difficult audio.
- Always review auto-generated subtitles before burning them in; Whisper can make errors with technical terms and proper nouns.
- Burn subtitles with `-c:a copy` to avoid re-encoding audio unnecessarily.
- For web delivery, use VTT format (browsers support it natively); for video files, use SRT.
- Keep subtitle lines under 42 characters and display no more than 2 lines at a time for readability.
- Each subtitle should be visible for at least 1 second and no more than 7 seconds.
- Use UTF-8 encoding for all subtitle files to support international characters.
- Test subtitle positioning on different screen sizes before final rendering.
