---
name: whisper
description: >-
  Transcribe audio to text with OpenAI Whisper, an open-source speech recognition model that runs locally or through hosted APIs. Use when a user asks to
  transcribe audio files, generate subtitles (SRT/VTT), transcribe podcasts,
  convert speech to text, translate audio to English, build transcription
  pipelines, do speaker diarization, transcribe meetings, process voice memos,
  create searchable audio archives, or integrate speech-to-text into
  applications. Covers OpenAI Whisper (local), Whisper API, faster-whisper,
  whisper.cpp, and production deployment patterns.
license: Apache-2.0
compatibility: 'Python 3.9+ (openai-whisper, faster-whisper), 3.10+ for pyannote.audio 4; C++ toolchain and CMake (whisper.cpp); ffmpeg; or the OpenAI API'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/openai/whisper
  category: content
  tags:
    - whisper
    - transcription
    - speech-to-text
    - subtitles
    - srt
---

# Whisper

## Overview

Transcribe audio with OpenAI's Whisper, an open-source multilingual speech recognition model. This skill covers local Whisper (`openai-whisper` 20250625), faster-whisper 1.2.1 (CTranslate2, up to 4x faster), whisper.cpp (C++, CPU-friendly) and the OpenAI API, where `whisper-1` is the Whisper model and newer `gpt-transcribe` models are the default recommendation for plain transcripts. Includes subtitle generation (SRT/VTT/JSON), multi-language transcription, translation to English, speaker diarization, word-level timestamps, and production pipeline patterns for podcasts, meetings, and video subtitles.

## Instructions

### Step 1: Choose Your Runtime

**Option A — OpenAI Whisper (original Python):**
```bash
pip install openai-whisper
# Models: tiny (39M), base (74M), small (244M), medium (769M), large-v3 (1.5G), turbo (809M)
# CLI: whisper episode.mp3 --model turbo --output_format srt
```
Needs `ffmpeg` on the PATH. The default `turbo` model is not trained for translation: use `medium` or `large` for `--task translate`.

**Option B — faster-whisper (recommended for local, 4x faster):**
```bash
pip install faster-whisper
# Uses CTranslate2 — INT8 quantization, runs well on CPU
```

**Option C — whisper.cpp (best for CPU, minimal dependencies):**
```bash
git clone https://github.com/ggml-org/whisper.cpp
cd whisper.cpp
sh ./models/download-ggml-model.sh base.en
cmake -B build && cmake --build build -j --config Release
```
The CLI is `./build/bin/whisper-cli` (the old `./main` and `make` flow are gone) and reads 16-bit WAV only.

**Option D — OpenAI API (no local GPU needed):**
```bash
pip install openai
export OPENAI_API_KEY="..."   # from your OpenAI dashboard
```

### Step 2: Basic Transcription

**faster-whisper (recommended):**
```python
from faster_whisper import WhisperModel

model = WhisperModel("base", device="cpu", compute_type="int8")
# GPU: model = WhisperModel("large-v3", device="cuda", compute_type="float16")

segments, info = model.transcribe("episode.mp3", beam_size=5, vad_filter=True)  # vad_filter skips silence
# GPU alternatives: "turbo", "distil-large-v3"; transcribe() returns a generator, consume it once
print(f"Language: {info.language} (prob: {info.language_probability:.2f})")

for segment in segments:
    print(f"[{segment.start:.2f}s → {segment.end:.2f}s] {segment.text}")
```

**OpenAI Whisper (original):**
```python
import whisper

model = whisper.load_model("base")  # tiny, base, small, medium, large-v3, turbo
result = model.transcribe("episode.mp3")

print(result["text"])
for segment in result["segments"]:
    print(f"[{segment['start']:.1f}s - {segment['end']:.1f}s] {segment['text']}")
```

**whisper.cpp (CLI):**
```bash
ffmpeg -i episode.mp3 -ar 16000 -ac 1 -c:a pcm_s16le episode.wav
./build/bin/whisper-cli -m models/ggml-base.en.bin -f episode.wav -otxt -osrt -ovtt
# Outputs: episode.txt, episode.srt, episode.vtt
```

**OpenAI API:**
Per OpenAI's docs, use `gpt-transcribe` for ordinary transcripts and keep `whisper-1` for word timestamps, SRT/VTT output and translation to English. Files are limited to 25 MB.
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
# response_format="srt" or "vtt" returns subtitle text directly
```

### Step 3: Subtitle Generation (SRT/VTT)

**Generate SRT with faster-whisper:**
```python
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("episode.mp3", beam_size=5)
segments = list(segments)  # generator: materialize so the VTT block below can reuse it

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

**Supported languages:** about 100 languages including en, zh, de, es, ru, ko, fr, ja, pt, tr, pl, nl, ar, sv, it, hi, and many more.

### Step 5: Speaker Diarization

Combine Whisper with pyannote-audio for "who said what":

```python
from faster_whisper import WhisperModel
from pyannote.audio import Pipeline

# Transcribe
model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("meeting.wav", beam_size=5)
whisper_segments = list(segments)

# Diarize (requires HuggingFace token with pyannote access)
import os
pipeline = Pipeline.from_pretrained(
    "pyannote/speaker-diarization-community-1",   # pyannote.audio 4.x; 3.1 is the legacy pipeline
    token=os.environ["HF_TOKEN"],
)
output = pipeline("meeting.wav")
diarization_result = output.speaker_diarization

# Merge: assign speaker to each whisper segment
def get_speaker(start, end, diarization_result):
    """Find the dominant speaker during a time range."""
    speakers = {}
    for turn, speaker in diarization_result:
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

**Transcribe all episodes in a directory (text and SRT in one pass):**
```python
from pathlib import Path
from faster_whisper import WhisperModel

def ts(t):
    h, rem = divmod(int(t), 3600)
    m, sec = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{sec:02d},{int((t % 1) * 1000):03d}"

model = WhisperModel("small", device="cpu", compute_type="int8")
output_dir = Path("transcripts")
output_dir.mkdir(exist_ok=True)

for audio_file in sorted(Path("episodes").glob("*.mp3")):
    segments, info = model.transcribe(str(audio_file), beam_size=5)
    segments = list(segments)          # generator: materialize before reusing
    (output_dir / f"{audio_file.stem}.txt").write_text(
        "\n".join(s.text.strip() for s in segments) + "\n")
    with open(output_dir / f"{audio_file.stem}.srt", "w") as f:
        for i, seg in enumerate(segments, 1):
            f.write(f"{i}\n{ts(seg.start)} --> {ts(seg.end)}\n{seg.text.strip()}\n\n")
    print(f"{audio_file.name}: {info.language}, {len(segments)} segments")
```

### Step 7: Model Selection Guide

| Model | Size | VRAM | Speed (CPU) | Accuracy | Best For |
|-------|------|------|-------------|----------|----------|
| tiny | 39M | ~1GB | Very fast | Low | Quick drafts, real-time |
| base | 74M | ~1GB | Fast | Medium | Good balance for CPU |
| small | 244M | ~2GB | Moderate | Good | Podcasts, clear audio |
| medium | 769M | ~5GB | Slow | Very good | Noisy audio, accents |
| large-v3 | 1.5G | ~10GB | Very slow | Best | Production quality |
| turbo | 809M | ~6GB | Fast (~8x large) | Near large-v3 | Transcription only, not translation |

**Recommendations:**
- CPU-only, speed matters: `tiny` or `base` with faster-whisper
- CPU-only, accuracy matters: `small` with faster-whisper
- GPU available: `large-v3` with faster-whisper (`float16`)
- No local compute: OpenAI API (`gpt-transcribe`, or `whisper-1` for SRT/VTT and word timestamps); `gpt-4o-transcribe-diarize` returns speaker labels directly

## Examples

### Example 1: Transcribe a podcast season and generate SRT subtitles
**User prompt:** "Transcribe all 20 MP3 episodes in ./episodes/ and generate both plain text transcripts and SRT subtitle files. I have a GPU with 10GB VRAM."

The agent will:
1. Install faster-whisper via `pip install faster-whisper`.
2. Load the `large-v3` model with `device="cuda"` and `compute_type="float16"` to leverage the GPU.
3. Create a `./transcripts/` output directory.
4. Loop over all `.mp3` files in `./episodes/`, transcribing each with `beam_size=5`.
5. Write both a `.txt` file (plain text) and a `.srt` file (with properly formatted timestamps) for each episode.
6. Report the detected language and total processing time per episode.

### Example 2: Translate a German interview to English with speaker labels
**User prompt:** "I have a 45-minute German interview recording at meeting.wav with two speakers. Transcribe it in English and label who said what."

The agent will:
1. Install faster-whisper and pyannote-audio (`pip install faster-whisper pyannote.audio`; version 4 needs Python 3.10+).
2. Transcribe `meeting.wav` with `task="translate"` to get English text from the German audio.
3. Run pyannote speaker diarization to identify speaker segments (requires a HuggingFace token with pyannote model access).
4. Merge Whisper segments with diarization results by matching time ranges to assign speaker labels.
5. Output a formatted transcript with `[Speaker 1]` and `[Speaker 2]` labels before each segment.

## Guidelines

- Use faster-whisper over the original OpenAI Whisper for local transcription; it is 4x faster and uses less memory through INT8 quantization via CTranslate2.
- Select model size based on your hardware: `tiny`/`base` for CPU speed, `small` for CPU accuracy, `large-v3` for GPU production quality.
- Install ffmpeg for MP3/M4A inputs with Whisper; whisper.cpp's CLI only reads 16 kHz 16-bit WAV, so convert first.
- GPU faster-whisper needs CUDA 12 with cuBLAS and cuDNN 9; older stacks need an older `ctranslate2`.
- `transcribe()` in faster-whisper is lazy: nothing runs until you iterate, and a second pass needs `list(segments)`.
- For speaker diarization, the pyannote pipeline requires a HuggingFace access token with accepted model terms; set this up before attempting multi-speaker transcription.
- When generating SRT files, use `beam_size=5` for more accurate segment boundaries; the default greedy decoding can produce poorly timed subtitle breaks.
