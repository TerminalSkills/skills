---
name: whisper
description: >-
  Transcribe audio to text with OpenAI Whisper. Use when a user asks to
  transcribe audio files, generate subtitles (SRT/VTT), transcribe podcasts,
  convert speech to text, translate audio to English, build transcription
  pipelines, do speaker diarization, transcribe meetings, process voice
  memos, create searchable audio archives, or integrate speech-to-text
  into applications. Covers OpenAI Whisper (local), Whisper API, faster-whisper,
  whisper.cpp, and production deployment patterns.
license: Apache-2.0
compatibility: "Python 3.9+ (whisper/faster-whisper), C++ (whisper.cpp), or OpenAI API"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: audio
  tags: ["whisper", "transcription", "speech-to-text", "subtitles", "srt", "podcast"]
---

# Whisper

## Overview

Transcribe audio with OpenAI's Whisper — the state-of-the-art speech recognition model. This skill covers local Whisper (Python), faster-whisper (CTranslate2, 4x faster), whisper.cpp (CPU-optimized C++), and the OpenAI Whisper API. Includes subtitle generation (SRT/VTT/JSON), multi-language transcription, translation to English, speaker diarization, word-level timestamps, and production pipeline patterns for podcasts, meetings, and video subtitles.

## Instructions

### Step 1: Choose Your Runtime

**Option A — OpenAI Whisper (original Python):**
```bash
pip install openai-whisper
# Models: tiny (39M), base (74M), small (244M), medium (769M), large-v3 (1.5G)
```

**Option B — faster-whisper (recommended for local, 4x faster):**
```bash
pip install faster-whisper
# Uses CTranslate2 — INT8 quantization, runs well on CPU
```

**Option C — whisper.cpp (best for CPU, minimal dependencies):**
```bash
git clone https://github.com/ggerganov/whisper.cpp
cd whisper.cpp && make
# Download model
bash models/download-ggml-model.sh base.en
```

**Option D — OpenAI API (no local GPU needed):**
```bash
pip install openai
export OPENAI_API_KEY="sk-..."
```

### Step 2: Basic Transcription

**faster-whisper (recommended):**
```python
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
# GPU: model = WhisperModel("large-v3", device="cuda", compute_type="float16")

segments, info = model.transcribe("episode.mp3", beam_size=5)
print(f"Language: {info.language} (prob: {info.language_probability:.2f})")

for segment in segments:
    print(f"[{segment.start:.2f}s → {segment.end:.2f}s] {segment.text}")
```

**OpenAI Whisper (original):**
```python
import whisper

model = whisper.load_model("base")  # tiny, base, small, medium, large-v3
result = model.transcribe("episode.mp3")

print(result["text"])
for segment in result["segments"]:
    print(f"[{segment['start']:.1f}s - {segment['end']:.1f}s] {segment['text']}")
```

**whisper.cpp (CLI):**
```bash
./main -m models/ggml-base.en.bin -f episode.wav -otxt -osrt -ovtt
# Outputs: episode.txt, episode.srt, episode.vtt
```

**OpenAI API:**
```python
from openai import OpenAI
client = OpenAI()

with open("episode.mp3", "rb") as f:
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=f,
        response_format="verbose_json",
        timestamp_granularities=["segment", "word"],
    )

print(transcript.text)
for segment in transcript.segments:
    print(f"[{segment.start:.1f}s] {segment.text}")
```

### Step 3: Subtitle Generation (SRT/VTT)

**Generate SRT with faster-whisper:**
```python
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("episode.mp3", beam_size=5)

def format_timestamp(seconds):
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

with open("episode.srt", "w") as f:
    for i, seg in enumerate(segments, 1):
        f.write(f"{i}\n")
        f.write(f"{format_timestamp(seg.start)} --> {format_timestamp(seg.end)}\n")
        f.write(f"{seg.text.strip()}\n\n")

print("Generated episode.srt")
```

**Generate VTT (for HTML5 video):**
```python
with open("episode.vtt", "w") as f:
    f.write("WEBVTT\n\n")
    for i, seg in enumerate(segments, 1):
        start = format_timestamp(seg.start).replace(",", ".")
        end = format_timestamp(seg.end).replace(",", ".")
        f.write(f"{start} --> {end}\n")
        f.write(f"{seg.text.strip()}\n\n")
```

**Word-level timestamps (for karaoke-style subtitles):**
```python
segments, info = model.transcribe("episode.mp3", word_timestamps=True)

for segment in segments:
    for word in segment.words:
        print(f"  [{word.start:.2f}s → {word.end:.2f}s] {word.word}")
```

### Step 4: Language Detection & Translation

```python
# Auto-detect language
segments, info = model.transcribe("foreign_audio.mp3")
print(f"Detected: {info.language} ({info.language_probability:.0%})")

# Force specific language
segments, info = model.transcribe("german.mp3", language="de")

# Translate to English (any language → English)
segments, info = model.transcribe("german.mp3", task="translate")
for seg in segments:
    print(seg.text)  # English translation
```

**Supported languages:** 99 languages including en, zh, de, es, ru, ko, fr, ja, pt, tr, pl, ca, nl, ar, sv, it, id, hi, fi, vi, he, uk, el, ms, cs, ro, da, hu, ta, no, th, ur, hr, bg, lt, la, mi, ml, cy, sk, te, fa, lv, bn, sr, az, sl, kn, et, mk, br, eu, is, hy, ne, mn, bs, kk, sq, sw, gl, mr, pa, si, km, sn, yo, so, af, oc, ka, be, tg, sd, gu, am, yi, lo, uz, fo, ht, ps, tk, nn, mt, sa, lb, my, bo, tl, mg, as, tt, haw, ln, ha, ba, jw, su.

### Step 5: Speaker Diarization

Combine Whisper with pyannote-audio for "who said what":

```python
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline
import torch

# Transcribe
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("meeting.wav", beam_size=5)
whisper_segments = list(segments)

# Diarize (requires HuggingFace token with pyannote access)
diarization = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-3.1",
    use_auth_token="hf_YOUR_TOKEN"
)
diarization_result = diarization("meeting.wav")

# Merge: assign speaker to each whisper segment
def get_speaker(start, end, diarization_result):
    """Find the dominant speaker during a time range."""
    speakers = {}
    for turn, _, speaker in diarization_result.itertracks(yield_label=True):
        overlap_start = max(start, turn.start)
        overlap_end = min(end, turn.end)
        if overlap_start < overlap_end:
            duration = overlap_end - overlap_start
            speakers[speaker] = speakers.get(speaker, 0) + duration
    return max(speakers, key=speakers.get) if speakers else "Unknown"

for seg in whisper_segments:
    speaker = get_speaker(seg.start, seg.end, diarization_result)
    print(f"[{speaker}] [{seg.start:.1f}s → {seg.end:.1f}s] {seg.text}")
```

### Step 6: Batch Processing & Pipelines

**Transcribe all episodes in a directory:**
```python
import os
from pathlib import Path
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
episodes_dir = Path("episodes")
output_dir = Path("transcripts")
output_dir.mkdir(exist_ok=True)

for audio_file in sorted(episodes_dir.glob("*.mp3")):
    print(f"Transcribing: {audio_file.name}")
    segments, info = model.transcribe(str(audio_file), beam_size=5)
    
    # Plain text
    txt_path = output_dir / f"{audio_file.stem}.txt"
    with open(txt_path, "w") as f:
        for seg in segments:
            f.write(seg.text.strip() + "\n")
    
    # SRT
    srt_path = output_dir / f"{audio_file.stem}.srt"
    segments2, _ = model.transcribe(str(audio_file), beam_size=5)  # Re-iterate
    with open(srt_path, "w") as f:
        for i, seg in enumerate(segments2, 1):
            h, m = divmod(int(seg.start), 3600)
            m, s = divmod(m, 60)
            ms = int((seg.start % 1) * 1000)
            start_ts = f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
            h2, m2 = divmod(int(seg.end), 3600)
            m2, s2 = divmod(m2, 60)
            ms2 = int((seg.end % 1) * 1000)
            end_ts = f"{h2:02d}:{m2:02d}:{s2:02d},{ms2:03d}"
            f.write(f"{i}\n{start_ts} --> {end_ts}\n{seg.text.strip()}\n\n")
    
    print(f"  → {txt_path}, {srt_path}")
```

**REST API for transcription service:**
```python
from fastapi import FastAPI, UploadFile
from faster_whisper import WhisperModel
import tempfile, os

app = FastAPI()
model = WhisperModel("small", device="cpu", compute_type="int8")

@app.post("/transcribe")
async def transcribe(file: UploadFile, language: str = None, task: str = "transcribe"):
    with tempfile.NamedTemporaryFile(suffix=os.path.splitext(file.filename)[1], delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        segments, info = model.transcribe(
            tmp_path, beam_size=5, language=language, task=task
        )
        result = []
        full_text = []
        for seg in segments:
            result.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
            full_text.append(seg.text.strip())
        
        return {
            "language": info.language,
            "language_probability": info.language_probability,
            "text": " ".join(full_text),
            "segments": result,
        }
    finally:
        os.unlink(tmp_path)
```

### Step 7: Model Selection Guide

| Model | Size | VRAM | Speed (CPU) | Accuracy | Best For |
|-------|------|------|-------------|----------|----------|
| tiny | 39M | ~1GB | Very fast | Low | Quick drafts, real-time |
| base | 74M | ~1GB | Fast | Medium | Good balance for CPU |
| small | 244M | ~2GB | Moderate | Good | Podcasts, clear audio |
| medium | 769M | ~5GB | Slow | Very good | Noisy audio, accents |
| large-v3 | 1.5G | ~10GB | Very slow | Best | Production quality |

**Recommendations:**
- CPU-only, speed matters: `tiny` or `base` with faster-whisper
- CPU-only, accuracy matters: `small` with faster-whisper
- GPU available: `large-v3` with faster-whisper (`float16`)
- No local compute: OpenAI API (`whisper-1`)
