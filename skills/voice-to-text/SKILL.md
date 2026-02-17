---
name: voice-to-text
description: >-
  Transcribe voice and audio to text using OpenAI Whisper. Use when the user
  wants to convert speech to text, transcribe audio files, record voice memos,
  dictate text, create meeting transcripts, or convert MP3/WAV/M4A recordings
  to written text. Supports both local Whisper and OpenAI API.
license: Apache-2.0
compatibility: >-
  Requires Python 3.8+ and ffmpeg. For local transcription: pip install
  openai-whisper (GPU recommended). For API: pip install openai (requires
  OPENAI_API_KEY). Recording requires sox or arecord.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: [voice, transcription, whisper, speech-to-text, audio]
---

# Voice to Text

Transcribe voice recordings and audio files to text using OpenAI Whisper.

## Overview

This skill converts speech to text using OpenAI's Whisper model. Supports recording from microphone, transcribing existing audio files, and both local processing (free, private) and cloud API (faster, no GPU needed). Output formats include plain text, SRT subtitles, and JSON with timestamps.

## Instructions

### 1. Install dependencies

**For local Whisper (free, private, GPU recommended):**
```bash
pip install openai-whisper
```

**For OpenAI API (fast, no GPU needed, paid):**
```bash
pip install openai
export OPENAI_API_KEY="your-api-key"
```

**For recording audio:**
```bash
# macOS (built-in)
# sox already available or: brew install sox

# Linux
sudo apt install sox alsa-utils

# Verify
sox --version
```

### 2. Record audio from microphone

**Using sox (cross-platform):**
```bash
# Record until Ctrl+C (WAV format, 16kHz mono - optimal for Whisper)
sox -d -r 16000 -c 1 recording.wav

# Record for specific duration (30 seconds)
sox -d -r 16000 -c 1 recording.wav trim 0 30

# Record with silence detection (stops after 2s silence)
sox -d -r 16000 -c 1 recording.wav silence 1 0.1 1% 1 2.0 1%
```

**Using arecord (Linux):**
```bash
# Record for 30 seconds
arecord -d 30 -f S16_LE -r 16000 -c 1 recording.wav

# Record until Ctrl+C
arecord -f S16_LE -r 16000 -c 1 recording.wav
```

**Using ffmpeg (from specific input device):**
```bash
# List audio devices
# macOS: ffmpeg -f avfoundation -list_devices true -i ""
# Linux: arecord -l

# Record from device
ffmpeg -f alsa -i default -ar 16000 -ac 1 recording.wav  # Linux
ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 recording.wav  # macOS
```

### 3. Transcribe with local Whisper

**CLI approach:**
```bash
# Basic transcription
whisper recording.wav --model medium

# Specify language (faster and more accurate)
whisper recording.wav --model medium --language en

# Output as subtitles
whisper recording.wav --model medium --output_format srt

# All formats
whisper recording.wav --model medium --output_format all --output_dir ./output
```

**Python approach:**
```python
import whisper

model = whisper.load_model("medium")  # tiny, base, small, medium, large
result = model.transcribe("recording.wav", language="en")

print(result["text"])  # Full transcript

# With timestamps
for segment in result["segments"]:
    print(f"[{segment['start']:.1f}s] {segment['text']}")
```

**Model selection:**
| Model | VRAM | Speed | Use Case |
|-------|------|-------|----------|
| tiny | ~1 GB | ~32x | Quick tests |
| base | ~1 GB | ~16x | Fast, basic accuracy |
| small | ~2 GB | ~6x | Good balance |
| medium | ~5 GB | ~2x | High accuracy |
| large | ~10 GB | 1x | Best accuracy |

### 4. Transcribe with OpenAI API

**Python approach:**
```python
from openai import OpenAI

client = OpenAI()  # Uses OPENAI_API_KEY env var

with open("recording.wav", "rb") as audio_file:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=audio_file,
        language="en"  # Optional, improves accuracy
    )

print(transcript.text)
```

**With timestamps (verbose JSON):**
```python
transcript = client.audio.transcriptions.create(
    model="whisper-1",
    file=audio_file,
    response_format="verbose_json",
    timestamp_granularities=["segment"]
)

for segment in transcript.segments:
    print(f"[{segment['start']:.1f}s] {segment['text']}")
```

**cURL approach:**
```bash
curl https://api.openai.com/v1/audio/transcriptions \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: multipart/form-data" \
  -F file="@recording.wav" \
  -F model="whisper-1" \
  -F language="en"
```

### 5. Convert audio formats

Whisper works best with WAV/MP3. Convert other formats:
```bash
# M4A to WAV
ffmpeg -i audio.m4a -ar 16000 -ac 1 audio.wav

# MP4 video to audio
ffmpeg -i video.mp4 -vn -ar 16000 -ac 1 audio.wav

# OGG to WAV
ffmpeg -i audio.ogg -ar 16000 -ac 1 audio.wav

# Reduce file size (compress to MP3)
ffmpeg -i recording.wav -b:a 64k recording.mp3
```

### 6. One-liner: Record and transcribe

```bash
# Record 30 seconds and transcribe locally
sox -d -r 16000 -c 1 rec.wav trim 0 30 && whisper rec.wav --model small --language en

# Record until Ctrl+C, then transcribe
sox -d -r 16000 -c 1 rec.wav; whisper rec.wav --model medium
```

**Python script for continuous dictation:**
```python
import whisper
import subprocess
import tempfile

model = whisper.load_model("small")

def record_and_transcribe(duration=10):
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        # Record
        subprocess.run([
            "sox", "-d", "-r", "16000", "-c", "1", f.name,
            "trim", "0", str(duration)
        ], check=True)

        # Transcribe
        result = model.transcribe(f.name, language="en")
        return result["text"]

text = record_and_transcribe(duration=15)
print(text)
```

## Examples

<example>
User: Transcribe this audio file to text
Steps:
1. whisper meeting.wav --model medium --language en --output_format txt
Output: meeting.txt with full transcript
</example>

<example>
User: Record my voice and convert to text
Steps:
1. sox -d -r 16000 -c 1 voice.wav trim 0 30
2. whisper voice.wav --model small --language en
Output: Transcribed text printed to console
</example>

<example>
User: Transcribe audio using OpenAI API
```python
from openai import OpenAI
client = OpenAI()
with open("audio.wav", "rb") as f:
    result = client.audio.transcriptions.create(model="whisper-1", file=f)
print(result.text)
```
</example>

<example>
User: Convert MP3 recording to text with timestamps
Steps:
1. ffmpeg -i recording.mp3 -ar 16000 -ac 1 recording.wav
2. whisper recording.wav --model medium --output_format srt
Output: recording.srt with timestamped subtitles
</example>

<example>
User: Transcribe a Spanish voice memo
Command: whisper memo.m4a --model medium --language es --output_format txt
</example>

## Guidelines

- Always specify `--language` when known for 2-3x faster and more accurate transcription
- Use 16kHz mono audio (Whisper's optimal format) to reduce file size and processing time
- For long recordings (>10 min), use `small` or `medium` model to balance speed and accuracy
- Local Whisper is free and private; API is faster but costs ~$0.006/minute
- GPU (CUDA) speeds up local transcription 5-10x compared to CPU
- Sox's silence detection (`silence 1 0.1 1% 1 2.0 1%`) auto-stops after 2s of silence
- Supported input formats: wav, mp3, m4a, flac, ogg, webm (ffmpeg converts others)
- For real-time transcription needs, consider `faster-whisper` package (4x faster)
- Clean up temporary audio files after transcription to save disk space
