---
title: Build a Podcast Production Pipeline
slug: build-podcast-production-pipeline
description: "Automate podcast post-production — audio cleanup, loudness normalization, intro/outro mixing, transcription with Whisper, waveform generation, and multi-format export — from a single command."
skills: [ffmpeg]
category: content
tags: [ffmpeg, sox, whisper, audiowaveform, yt-dlp, podcast, automation]
---

# Build a Podcast Production Pipeline

## The Problem

Lena runs a weekly tech podcast with two hosts and occasional guests. Every episode follows the same post-production ritual: record on Zoom, spend 2-3 hours manually editing silence, normalizing volume, splicing in the intro and outro music, generating a transcript, creating waveform images for the website, and exporting to multiple formats. She also pulls guest interview clips from YouTube.

The work is entirely mechanical. The same sox commands, the same ffmpeg flags, the same Whisper invocation, every single week. But one wrong flag and the audio clips or the loudness is off. She wants to drop in a raw recording and get back a production-ready episode with transcript, subtitles, waveform, and social media assets -- from a single command.

## The Solution

Use the **ffmpeg** skill along with sox, Whisper, and audiowaveform to build an end-to-end pipeline. A shell script orchestrates the audio tools, a Python script handles transcription and chapter detection. One command produces a fully packaged episode.

## Step-by-Step Walkthrough

### Step 1: Define the Requirements

```text
I run a weekly podcast and want to automate post-production. Here's my current manual workflow that I want to turn into a single script:

1. Source audio: Raw recording from Zoom (WAV, stereo, often 1-2 hours). Sometimes I also pull guest interviews from YouTube that I need to download as audio.
2. Audio cleanup: Remove silence at start/end, apply high-pass filter (remove rumble below 80Hz), noise reduction, normalize to podcast standard (-16 LUFS), compress dynamic range.
3. Intro/outro: Prepend a 15-second intro jingle with 2-second crossfade. Append a 10-second outro with 2-second crossfade. Music ducks to 20% where it overlaps with speech.
4. Transcript: Generate a full text transcript and SRT subtitle file using Whisper. Detect language automatically.
5. Waveform: Generate a waveform PNG for the website player and a social media preview image. Also generate JSON peaks data for the web audio player.
6. Chapters: Parse the transcript for topic changes and generate podcast chapter markers.
7. Export: Final audio as both MP3 (192kbps, with embedded artwork and metadata) and FLAC (archival).

Build a single shell script + Python script that does all of this.
```

### Step 2: Set Up the Project Structure

The pipeline lives in a self-contained directory. Raw recordings go in, finished episodes come out:

```
podcast-pipeline/
  produce.sh              # Main orchestration script
  transcribe.py           # Whisper transcription + chapter detection
  assets/
    intro.wav             # 15s intro jingle
    outro.wav             # 10s outro jingle
    artwork.jpg           # Podcast artwork (3000x3000)
  output/                 # Generated per episode
```

Prerequisites -- all open-source, no paid services:

```bash
apt install -y sox libsox-fmt-all ffmpeg audiowaveform
pip install faster-whisper
```

### Step 3: Build the Main Pipeline Script

The shell script chains every processing step. Each stage reads from the temp workspace and writes back to it, so a failure at any point leaves previous work intact.

```bash
#!/bin/bash
set -euo pipefail

# --- Configuration ---
RAW_FILE="$1"                                        # Input: WAV file or YouTube URL
TITLE="${2:-Untitled Episode}"                        # Episode title for metadata
EPISODE_NUM="${3:-000}"                               # Episode number
ASSETS_DIR="$(dirname "$0")/assets"
OUTPUT_DIR="$(dirname "$0")/output/ep${EPISODE_NUM}"
WORK_DIR=$(mktemp -d)

trap "rm -rf $WORK_DIR" EXIT
mkdir -p "$OUTPUT_DIR"

# ---- STEP 1: Download from YouTube (if URL provided) ----
if [[ "$RAW_FILE" == http* ]]; then
    yt-dlp -x --audio-format wav -o "$WORK_DIR/downloaded.%(ext)s" "$RAW_FILE"
    RAW_FILE="$WORK_DIR/downloaded.wav"
fi

# ---- STEP 2: Audio Cleanup ----
# Convert to mono 44.1kHz for consistent processing
sox "$RAW_FILE" -r 44100 -c 1 "$WORK_DIR/mono.wav"

# Trim leading/trailing silence (threshold: 0.1% amplitude, min 0.3s)
sox "$WORK_DIR/mono.wav" "$WORK_DIR/trimmed.wav" \
    silence 1 0.3 0.1% reverse silence 1 0.3 0.1% reverse

# Capture noise profile from first 0.5s (assumed room tone)
sox "$WORK_DIR/trimmed.wav" -n noiseprof "$WORK_DIR/noise.prof" trim 0 0.5

# Full cleanup chain in one pass:
#   noisered  — reduce background noise using captured profile
#   highpass  — remove rumble below 80Hz
#   compand   — compress dynamic range (quiet/loud parts more even)
#   equalizer — boost voice presence at 3kHz by 2dB
#   norm      — normalize peak to -1dB
sox "$WORK_DIR/trimmed.wav" "$WORK_DIR/clean.wav" \
    noisered "$WORK_DIR/noise.prof" 0.2 \
    highpass 80 \
    compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 \
    equalizer 3000 1.5q +2dB \
    norm -1

# ---- STEP 3: Loudness Normalization (-16 LUFS) ----
CURRENT_LUFS=$(ffmpeg -i "$WORK_DIR/clean.wav" -af loudnorm=print_format=json -f null - 2>&1 | \
    grep -A1 '"input_i"' | tail -1 | tr -d ' ",' | cut -d: -f2)

TARGET_LUFS=-16
GAIN=$(echo "$TARGET_LUFS - $CURRENT_LUFS" | bc)
sox "$WORK_DIR/clean.wav" "$WORK_DIR/normalized.wav" gain ${GAIN}

# ---- STEP 4: Intro/Outro with Crossfade ----
INTRO="$ASSETS_DIR/intro.wav"
OUTRO="$ASSETS_DIR/outro.wav"
EPISODE="$WORK_DIR/normalized.wav"
CROSSFADE=2  # seconds of overlap

# Split intro: main part + tail at 20% volume for ducking
INTRO_DUR=$(soxi -D "$INTRO")
INTRO_MAIN_DUR=$(echo "$INTRO_DUR - $CROSSFADE" | bc)
sox "$INTRO" "$WORK_DIR/intro_main.wav" trim 0 $INTRO_MAIN_DUR
sox "$INTRO" "$WORK_DIR/intro_tail.wav" trim $INTRO_MAIN_DUR vol 0.2
sox "$EPISODE" "$WORK_DIR/ep_head.wav" trim 0 $CROSSFADE
sox -m "$WORK_DIR/intro_tail.wav" "$WORK_DIR/ep_head.wav" "$WORK_DIR/crossfade_in.wav"

# Split episode body, crossfade into outro
sox "$EPISODE" "$WORK_DIR/ep_body.wav" trim $CROSSFADE
EP_BODY_DUR=$(soxi -D "$WORK_DIR/ep_body.wav")
EP_TRIM_DUR=$(echo "$EP_BODY_DUR - $CROSSFADE" | bc)
sox "$WORK_DIR/ep_body.wav" "$WORK_DIR/ep_main.wav" trim 0 $EP_TRIM_DUR
sox "$WORK_DIR/ep_body.wav" "$WORK_DIR/ep_tail.wav" trim $EP_TRIM_DUR fade t 0 0 $CROSSFADE
sox "$OUTRO" "$WORK_DIR/outro_ducked.wav" vol 0.2 fade t $CROSSFADE 0 0
sox -m "$WORK_DIR/ep_tail.wav" "$WORK_DIR/outro_ducked.wav" "$WORK_DIR/crossfade_out.wav"
sox "$OUTRO" "$WORK_DIR/outro_main.wav" trim $CROSSFADE

# Concatenate: intro -> crossfade -> episode -> crossfade -> outro
sox "$WORK_DIR/intro_main.wav" \
    "$WORK_DIR/crossfade_in.wav" \
    "$WORK_DIR/ep_main.wav" \
    "$WORK_DIR/crossfade_out.wav" \
    "$WORK_DIR/outro_main.wav" \
    "$WORK_DIR/final.wav"

# ---- STEP 5: Transcription (via Python + Whisper) ----
python3 "$(dirname "$0")/transcribe.py" "$WORK_DIR/final.wav" "$OUTPUT_DIR" "$TITLE"

# ---- STEP 6: Waveform Generation ----
# Website player (1200x150, blue on white)
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/waveform.png" \
    --width 1200 --height 150 \
    --background-color ffffff --waveform-color 3b82f6

# Social media preview (1200x630, light blue on dark)
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/social-preview.png" \
    --width 1200 --height 630 \
    --background-color 0f172a --waveform-color 38bdf8 --no-axis-labels

# JSON peaks for interactive web player (20 peaks/sec, 8-bit)
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/peaks.json" \
    --pixels-per-second 20 --bits 8

# ---- STEP 7: Export MP3 + FLAC ----
SAFE_TITLE=$(echo "$TITLE" | tr -cd '[:alnum:] ._-' | tr ' ' '_')

# MP3 with ID3 metadata and embedded artwork
ffmpeg -y -i "$WORK_DIR/final.wav" -i "$ASSETS_DIR/artwork.jpg" \
    -map 0:a -map 1:v \
    -codec:a libmp3lame -b:a 192k -codec:v copy \
    -id3v2_version 3 \
    -metadata title="$TITLE" -metadata artist="My Podcast" \
    -metadata album="My Podcast" -metadata track="$EPISODE_NUM" \
    -metadata genre="Podcast" -metadata date="$(date +%Y)" \
    -disposition:v attached_pic \
    "$OUTPUT_DIR/${SAFE_TITLE}.mp3" 2>/dev/null

# FLAC for archival (lossless)
ffmpeg -y -i "$WORK_DIR/final.wav" -codec:a flac \
    -metadata title="$TITLE" -metadata artist="My Podcast" \
    "$OUTPUT_DIR/${SAFE_TITLE}.flac" 2>/dev/null

echo "Production complete: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/"
```

### Step 4: Build the Transcription Script

The Python script handles everything Whisper-related: transcription, subtitle generation in two formats, and automatic chapter detection based on silence gaps.

```python
#!/usr/bin/env python3
"""Transcribe audio with faster-whisper and generate chapters."""

import sys, json
from pathlib import Path
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
output_dir = Path(sys.argv[2])
title = sys.argv[3] if len(sys.argv) > 3 else "Episode"

# "small" model — good speed/accuracy balance. Use "large-v3" for production.
model = WhisperModel("small", device="cpu", compute_type="int8")
segments_iter, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
segments = list(segments_iter)

print(f"   Language: {info.language} ({info.language_probability:.0%})")

# --- Full transcript ---
transcript = " ".join(seg.text.strip() for seg in segments)
(output_dir / "transcript.txt").write_text(transcript)

# --- SRT + VTT subtitles ---
def ts(seconds):
    h, m = int(seconds // 3600), int((seconds % 3600) // 60)
    s, ms = int(seconds % 60), int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

with open(output_dir / "subtitles.srt", "w") as f:
    for i, seg in enumerate(segments, 1):
        f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")

with open(output_dir / "subtitles.vtt", "w") as f:
    f.write("WEBVTT\n\n")
    for seg in segments:
        f.write(f"{ts(seg.start).replace(',','.')} --> {ts(seg.end).replace(',','.')}\n{seg.text.strip()}\n\n")

# --- Chapter detection ---
# Heuristic: long pauses (>3s) between segments = topic boundary.
# Minimum 5 minutes per chapter to avoid overly granular splits.
chapters, chapter_start, chapter_texts = [], 0, []

for i, seg in enumerate(segments):
    chapter_texts.append(seg.text.strip())
    if i < len(segments) - 1:
        gap = segments[i + 1].start - seg.end
        elapsed = seg.end - chapter_start
        if gap > 3.0 and elapsed > 300:
            summary = " ".join(" ".join(chapter_texts).split()[:10]) + "..."
            chapters.append({"start": chapter_start, "start_formatted": ts(chapter_start).replace(",", "."), "title": summary})
            chapter_start = segments[i + 1].start
            chapter_texts = []

if chapter_texts:
    summary = " ".join(" ".join(chapter_texts).split()[:10]) + "..."
    chapters.append({"start": chapter_start, "start_formatted": ts(chapter_start).replace(",", "."), "title": summary})

with open(output_dir / "chapters.json", "w") as f:
    json.dump({"title": title, "chapters": chapters}, f, indent=2)

with open(output_dir / "chapters.txt", "w") as f:
    for ch in chapters:
        f.write(f"{ch['start_formatted']} {ch['title']}\n")

# --- Segments JSON (for interactive web player with synced text) ---
with open(output_dir / "segments.json", "w") as f:
    json.dump({"language": info.language, "segments": [
        {"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments
    ]}, f, indent=2)

print(f"   Segments: {len(segments)}, Chapters: {len(chapters)}")
```

### Step 5: Run the Pipeline

```bash
chmod +x produce.sh

# From a local recording:
./produce.sh raw_recording.wav "Episode 42: AI in Healthcare" 042

# From a YouTube interview:
./produce.sh "https://youtube.com/watch?v=VIDEO_ID" "Episode 43: Guest Interview" 043
```

One command, full production. The output directory contains everything needed to publish:

| File | Purpose |
|---|---|
| `Episode_42_AI_in_Healthcare.mp3` | Final MP3 (192kbps, embedded artwork + metadata) |
| `Episode_42_AI_in_Healthcare.flac` | Archival lossless copy |
| `transcript.txt` | Full text transcript |
| `subtitles.srt` | SRT subtitles (video editors, media players) |
| `subtitles.vtt` | WebVTT subtitles (web `<track>` elements) |
| `segments.json` | Timestamped segments (interactive web player) |
| `chapters.json` | Auto-detected chapter markers |
| `chapters.txt` | Human-readable chapter list (show notes) |
| `waveform.png` | Website player waveform (1200x150) |
| `social-preview.png` | Social media image (1200x630) |
| `peaks.json` | Web player peaks data |

## Real-World Example

Lena runs the pipeline on a Friday night after recording Episode 42. The raw 67-minute Zoom WAV goes in. Three minutes later, the output directory has everything: a cleaned, normalized MP3 with intro/outro crossfades, a full transcript, SRT and VTT subtitles, auto-detected chapter markers, a waveform for the website, and a social media preview image.

The following week, she pastes a YouTube URL for a guest interview. The pipeline downloads the audio, runs the same processing chain, and produces an identical package. What used to take 2-3 hours of manual editing now takes the time it takes to type one command and wait for Whisper to finish.
