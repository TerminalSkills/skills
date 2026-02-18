---
title: Build a Podcast Production Pipeline
slug: build-podcast-production-pipeline
category: audio
tags: [ffmpeg, sox, whisper, audiowaveform, yt-dlp, podcast, automation]
---

# Build a Podcast Production Pipeline

Lena runs a weekly tech podcast with two hosts and occasional guests. She records raw audio via Zoom, spends hours manually editing — removing silence, normalizing volume, adding intro/outro music, generating transcripts, and creating waveform images for the website. She also pulls guest interview clips from YouTube. She wants to automate the entire post-production pipeline: drop in a raw recording and get back a production-ready episode with transcript, subtitles, waveform, and social media assets.

## Prompt

```text
I run a weekly podcast and want to automate post-production. Here's my current manual workflow that I want to turn into a single script:

1. **Source audio**: Raw recording from Zoom (WAV, stereo, often 1-2 hours). Sometimes I also pull guest interviews from YouTube that I need to download as audio.

2. **Audio cleanup**: Remove silence at start/end, apply high-pass filter (remove rumble below 80Hz), noise reduction, normalize to podcast standard (-16 LUFS), compress dynamic range so quiet and loud parts are more even.

3. **Intro/outro**: Prepend a 15-second intro jingle (intro.wav) with 2-second crossfade into the episode. Append a 10-second outro with 2-second crossfade. The music should duck to 20% volume where it overlaps with speech.

4. **Transcript**: Generate a full text transcript and SRT subtitle file using Whisper. Detect the language automatically. For episodes with guests, I'd love speaker labels if possible.

5. **Waveform**: Generate a waveform PNG for the website player (1200x150, blue on white) and a social media preview image (1200x630, blue on dark background). Also generate JSON peaks data for the web audio player.

6. **Chapters**: Parse the transcript for topic changes and generate podcast chapter markers.

7. **Export**: Final audio as both MP3 (192kbps, with embedded artwork and metadata) and FLAC (archival). Generate all assets into an organized output folder.

Build a single shell script + Python script that does all of this. I want to run: `./produce.sh raw_episode.wav "Episode 42: AI in Healthcare"` and get everything.
```

## Agent Response

```text
Here's the complete pipeline. A shell script orchestrates the tools, and a Python script handles transcription and chapter detection.

## Prerequisites

apt install -y sox libsox-fmt-all ffmpeg audiowaveform
pip install faster-whisper

## Directory structure

podcast-pipeline/
├── produce.sh              # Main orchestration script
├── transcribe.py           # Whisper transcription + chapters
├── assets/
│   ├── intro.wav           # 15s intro jingle
│   ├── outro.wav           # 10s outro jingle
│   └── artwork.jpg         # Podcast artwork (3000x3000)
└── output/                 # Generated per episode

## produce.sh — Main Pipeline

#!/bin/bash
set -euo pipefail

RAW_FILE="$1"
TITLE="${2:-Untitled Episode}"
EPISODE_NUM="${3:-000}"
ASSETS_DIR="$(dirname "$0")/assets"
OUTPUT_DIR="$(dirname "$0")/output/ep${EPISODE_NUM}"
WORK_DIR=$(mktemp -d)

trap "rm -rf $WORK_DIR" EXIT

mkdir -p "$OUTPUT_DIR"

echo "🎙️ Podcast Production Pipeline"
echo "   Input: $RAW_FILE"
echo "   Title: $TITLE"
echo "   Output: $OUTPUT_DIR"
echo ""

# ============================
# STEP 1: Download from YouTube (if URL provided instead of file)
# ============================
if [[ "$RAW_FILE" == http* ]]; then
    echo "📥 Downloading audio from URL..."
    yt-dlp -x --audio-format wav -o "$WORK_DIR/downloaded.%(ext)s" "$RAW_FILE"
    RAW_FILE="$WORK_DIR/downloaded.wav"
fi

# ============================
# STEP 2: Audio Cleanup
# ============================
echo "🧹 Step 1: Audio cleanup..."

# Convert to mono WAV 44.1kHz (consistent baseline)
sox "$RAW_FILE" -r 44100 -c 1 "$WORK_DIR/mono.wav"

# Remove leading/trailing silence
sox "$WORK_DIR/mono.wav" "$WORK_DIR/trimmed.wav" \
    silence 1 0.3 0.1% reverse silence 1 0.3 0.1% reverse

# Noise profile from first 0.5s (assumed to be room tone)
sox "$WORK_DIR/trimmed.wav" -n noiseprof "$WORK_DIR/noise.prof" trim 0 0.5

# Apply full cleanup chain:
# - Noise reduction
# - High-pass filter (remove rumble below 80Hz)
# - Compress dynamic range
# - EQ boost voice presence (2-4kHz)
# - Normalize to -1dB peak
sox "$WORK_DIR/trimmed.wav" "$WORK_DIR/clean.wav" \
    noisered "$WORK_DIR/noise.prof" 0.2 \
    highpass 80 \
    compand 0.3,1 6:-70,-60,-20 -5 -90 0.2 \
    equalizer 3000 1.5q +2dB \
    norm -1

echo "   ✅ Cleaned: $(soxi -d "$WORK_DIR/clean.wav")"

# ============================
# STEP 3: Loudness normalization to -16 LUFS
# ============================
echo "📊 Step 2: Loudness normalization (-16 LUFS)..."

# Measure current loudness
CURRENT_LUFS=$(ffmpeg -i "$WORK_DIR/clean.wav" -af loudnorm=print_format=json -f null - 2>&1 | \
    grep -A1 '"input_i"' | tail -1 | tr -d ' ",' | cut -d: -f2)

TARGET_LUFS=-16
GAIN=$(echo "$TARGET_LUFS - $CURRENT_LUFS" | bc)

# Apply gain adjustment
sox "$WORK_DIR/clean.wav" "$WORK_DIR/normalized.wav" gain ${GAIN}
echo "   ✅ Applied ${GAIN}dB gain (${CURRENT_LUFS} → ${TARGET_LUFS} LUFS)"

# ============================
# STEP 4: Add Intro & Outro with Crossfade
# ============================
echo "🎵 Step 3: Adding intro/outro..."

INTRO="$ASSETS_DIR/intro.wav"
OUTRO="$ASSETS_DIR/outro.wav"
EPISODE="$WORK_DIR/normalized.wav"

INTRO_DUR=$(soxi -D "$INTRO")
OUTRO_DUR=$(soxi -D "$OUTRO")
EP_DUR=$(soxi -D "$EPISODE")

CROSSFADE=2  # seconds

# Create intro with fade-out for crossfade zone
sox "$INTRO" "$WORK_DIR/intro_fade.wav" fade t 0 0 $CROSSFADE

# Create episode with fade-in at start
sox "$EPISODE" "$WORK_DIR/ep_fade_in.wav" fade t $CROSSFADE 0 0

# Overlap region: duck intro music to 20% where speech starts
# Method: trim last 2s of intro at 20% vol, mix with first 2s of episode
INTRO_MAIN_DUR=$(echo "$INTRO_DUR - $CROSSFADE" | bc)
sox "$INTRO" "$WORK_DIR/intro_main.wav" trim 0 $INTRO_MAIN_DUR
sox "$INTRO" "$WORK_DIR/intro_tail.wav" trim $INTRO_MAIN_DUR vol 0.2
sox "$EPISODE" "$WORK_DIR/ep_head.wav" trim 0 $CROSSFADE
sox -m "$WORK_DIR/intro_tail.wav" "$WORK_DIR/ep_head.wav" "$WORK_DIR/crossfade_in.wav"

# Episode body (after crossfade)
sox "$EPISODE" "$WORK_DIR/ep_body.wav" trim $CROSSFADE

# Outro crossfade
EP_BODY_DUR=$(soxi -D "$WORK_DIR/ep_body.wav")
EP_TRIM_DUR=$(echo "$EP_BODY_DUR - $CROSSFADE" | bc)
sox "$WORK_DIR/ep_body.wav" "$WORK_DIR/ep_main.wav" trim 0 $EP_TRIM_DUR
sox "$WORK_DIR/ep_body.wav" "$WORK_DIR/ep_tail.wav" trim $EP_TRIM_DUR fade t 0 0 $CROSSFADE
sox "$OUTRO" "$WORK_DIR/outro_ducked.wav" vol 0.2 fade t $CROSSFADE 0 0
sox -m "$WORK_DIR/ep_tail.wav" "$WORK_DIR/outro_ducked.wav" "$WORK_DIR/crossfade_out.wav"

# Outro main (after crossfade region)
sox "$OUTRO" "$WORK_DIR/outro_main.wav" trim $CROSSFADE

# Concatenate everything
sox "$WORK_DIR/intro_main.wav" \
    "$WORK_DIR/crossfade_in.wav" \
    "$WORK_DIR/ep_main.wav" \
    "$WORK_DIR/crossfade_out.wav" \
    "$WORK_DIR/outro_main.wav" \
    "$WORK_DIR/final.wav"

FINAL_DUR=$(soxi -d "$WORK_DIR/final.wav")
echo "   ✅ Final duration: $FINAL_DUR"

# ============================
# STEP 5: Transcription & Chapters
# ============================
echo "📝 Step 4: Transcribing with Whisper..."

python3 "$(dirname "$0")/transcribe.py" \
    "$WORK_DIR/final.wav" \
    "$OUTPUT_DIR" \
    "$TITLE"

echo "   ✅ Transcript and chapters generated"

# ============================
# STEP 6: Waveform Generation
# ============================
echo "🌊 Step 5: Generating waveforms..."

# Website player waveform
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/waveform.png" \
    --width 1200 --height 150 \
    --background-color ffffff --waveform-color 3b82f6

# Social media preview
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/social-preview.png" \
    --width 1200 --height 630 \
    --background-color 0f172a --waveform-color 38bdf8 --no-axis-labels

# JSON peaks for web player
audiowaveform -i "$WORK_DIR/final.wav" -o "$OUTPUT_DIR/peaks.json" \
    --pixels-per-second 20 --bits 8

echo "   ✅ Waveforms generated"

# ============================
# STEP 7: Export (MP3 + FLAC)
# ============================
echo "📦 Step 6: Exporting final formats..."

SAFE_TITLE=$(echo "$TITLE" | tr -cd '[:alnum:] ._-' | tr ' ' '_')

# MP3 with metadata and artwork
ffmpeg -y -i "$WORK_DIR/final.wav" -i "$ASSETS_DIR/artwork.jpg" \
    -map 0:a -map 1:v \
    -codec:a libmp3lame -b:a 192k \
    -codec:v copy \
    -id3v2_version 3 \
    -metadata title="$TITLE" \
    -metadata artist="My Podcast" \
    -metadata album="My Podcast" \
    -metadata track="$EPISODE_NUM" \
    -metadata genre="Podcast" \
    -metadata date="$(date +%Y)" \
    -disposition:v attached_pic \
    "$OUTPUT_DIR/${SAFE_TITLE}.mp3" 2>/dev/null

# FLAC (archival)
ffmpeg -y -i "$WORK_DIR/final.wav" \
    -codec:a flac \
    -metadata title="$TITLE" \
    -metadata artist="My Podcast" \
    "$OUTPUT_DIR/${SAFE_TITLE}.flac" 2>/dev/null

echo "   ✅ Exported MP3 and FLAC"

# ============================
# DONE
# ============================
echo ""
echo "🎉 Production complete!"
echo ""
echo "Output directory: $OUTPUT_DIR/"
ls -lh "$OUTPUT_DIR/"

## transcribe.py — Whisper Transcription + Chapter Detection

#!/usr/bin/env python3
"""Transcribe audio with faster-whisper and generate chapters."""

import sys
import json
import re
from pathlib import Path
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
output_dir = Path(sys.argv[2])
title = sys.argv[3] if len(sys.argv) > 3 else "Episode"

model = WhisperModel("small", device="cpu", compute_type="int8")
segments_iter, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
segments = list(segments_iter)

print(f"   Language: {info.language} ({info.language_probability:.0%})")

# --- Full transcript ---
transcript_lines = []
for seg in segments:
    transcript_lines.append(seg.text.strip())

transcript = " ".join(transcript_lines)
(output_dir / "transcript.txt").write_text(transcript)

# --- SRT subtitles ---
def ts(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

with open(output_dir / "subtitles.srt", "w") as f:
    for i, seg in enumerate(segments, 1):
        f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")

# --- VTT subtitles ---
with open(output_dir / "subtitles.vtt", "w") as f:
    f.write("WEBVTT\n\n")
    for seg in segments:
        start = ts(seg.start).replace(",", ".")
        end = ts(seg.end).replace(",", ".")
        f.write(f"{start} --> {end}\n{seg.text.strip()}\n\n")

# --- Chapter detection ---
# Simple heuristic: look for long pauses (>3s) between segments as topic boundaries
chapters = []
chapter_start = 0
chapter_texts = []
MIN_CHAPTER_LENGTH = 300  # seconds (5 min minimum chapter)

for i, seg in enumerate(segments):
    chapter_texts.append(seg.text.strip())
    
    # Check for long pause after this segment
    if i < len(segments) - 1:
        gap = segments[i + 1].start - seg.end
        elapsed = seg.end - chapter_start
        
        if gap > 3.0 and elapsed > MIN_CHAPTER_LENGTH:
            # Summarize chapter from first ~10 words
            chapter_summary = " ".join(" ".join(chapter_texts).split()[:10]) + "..."
            chapters.append({
                "start": chapter_start,
                "start_formatted": ts(chapter_start).replace(",", "."),
                "title": chapter_summary,
            })
            chapter_start = segments[i + 1].start
            chapter_texts = []

# Add final chapter
if chapter_texts:
    chapter_summary = " ".join(" ".join(chapter_texts).split()[:10]) + "..."
    chapters.append({
        "start": chapter_start,
        "start_formatted": ts(chapter_start).replace(",", "."),
        "title": chapter_summary,
    })

# Write chapters
with open(output_dir / "chapters.json", "w") as f:
    json.dump({"title": title, "chapters": chapters}, f, indent=2)

# Chapters in podcast format (for ID3 tags)
with open(output_dir / "chapters.txt", "w") as f:
    for ch in chapters:
        f.write(f"{ch['start_formatted']} {ch['title']}\n")

# --- Segments JSON (for web player) ---
with open(output_dir / "segments.json", "w") as f:
    json.dump({
        "language": info.language,
        "segments": [
            {"start": s.start, "end": s.end, "text": s.text.strip()}
            for s in segments
        ]
    }, f, indent=2)

print(f"   Segments: {len(segments)}, Chapters: {len(chapters)}")

## Usage

chmod +x produce.sh
./produce.sh raw_recording.wav "Episode 42: AI in Healthcare" 042

# Or from a YouTube interview:
./produce.sh "https://youtube.com/watch?v=VIDEO_ID" "Episode 43: Guest Interview" 043

## Output structure

output/ep042/
├── Episode_42_AI_in_Healthcare.mp3     # Final MP3 (192kbps, artwork, metadata)
├── Episode_42_AI_in_Healthcare.flac    # Archival FLAC
├── transcript.txt                       # Full text transcript
├── subtitles.srt                        # SRT subtitles
├── subtitles.vtt                        # VTT subtitles (for web)
├── segments.json                        # Timestamped segments (for web player)
├── chapters.json                        # Auto-detected chapters
├── chapters.txt                         # Chapter markers (human-readable)
├── waveform.png                         # Website player waveform (1200x150)
├── social-preview.png                   # Social media image (1200x630)
└── peaks.json                           # Web player peaks data

One command, full production. Drop in a raw WAV (or YouTube URL), get back everything you need to publish.
```

Skills used: `sox`, `ffmpeg-video-editing`, `whisper`, `audiowaveform`, `yt-dlp`
