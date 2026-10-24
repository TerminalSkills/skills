---
title: "Transcribe Audio to Text with Whisper"
slug: transcribe-audio-to-text
description: "Convert speech to text from MP3, WAV, M4A files using OpenAI Whisper in the terminal."
skills: [whisper]
category: productivity
tags: [audio, transcription, whisper, speech-to-text, voice]
---

# Transcribe Audio to Text with Whisper

## The Problem

You have meeting recordings, voice memos, podcast episodes, or interview audio files that need to be converted to text. Typing them out by hand takes several times the length of the audio. Hosted transcription services raise privacy concerns for sensitive content like legal depositions, medical notes, or internal strategy discussions, and per-minute fees add up across a backlog of recordings.

You need a scriptable solution that works from the command line and, when the content is sensitive, keeps the audio on your own machine.

## The Solution

Use the **whisper** skill so your agent runs OpenAI's open-source Whisper model locally, either with the original `whisper` CLI or with `faster-whisper`, which is quicker on CPU. When the audio may leave your machine, the same skill covers the OpenAI transcription API. Any format FFmpeg can decode works as input, including video files, because FFmpeg extracts the audio track.

## Step-by-Step Walkthrough

### Step 1: Install a Runtime

Whisper needs `ffmpeg` on the PATH (`sudo apt install ffmpeg` on Debian or Ubuntu, `brew install ffmpeg` on macOS). Then pick one runtime in a virtual environment:

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -U openai-whisper          # the original CLI and Python package
# or the faster CTranslate2 port:
pip install faster-whisper "av<19"
```

The `"av<19"` pin matters today: `faster-whisper` 1.2.1 declares `av>=11`, and with PyAV 19 it fails on every file with `TypeError: open() got an unexpected keyword argument 'metadata_errors'`.

### Step 2: Transcribe One File

Ask the agent:

```text
Transcribe meeting-recording.mp3 locally and write meeting-recording.txt
```

With the original CLI, that is one command. The default model is `turbo`:

```bash
whisper meeting-recording.mp3 --model turbo --language English --output_format txt
```

With `faster-whisper`, the same job in Python, with voice-activity filtering to skip silence:

```python
from faster_whisper import WhisperModel

model = WhisperModel("small", device="cpu", compute_type="int8")
segments, info = model.transcribe("meeting-recording.mp3", vad_filter=True)

with open("meeting-recording.txt", "w") as out:
    for segment in segments:  # a generator: it can be consumed only once
        out.write(segment.text.strip() + "\n")
print(f"{info.language}, {info.duration:.0f} s of audio")
```

The first run downloads the model weights, so it needs network access once.

### Step 3: Choose Local or API

The decision comes down to one question: can this audio leave your machine?

- **Local Whisper** for internal meetings, legal recordings, and medical dictation. Nothing is uploaded. A GPU makes it much faster, but `faster-whisper` with `compute_type="int8"` is usable on CPU.
- **OpenAI API** when cloud processing is acceptable and you have no GPU. OpenAI's speech-to-text guide recommends `gpt-transcribe` for new work, accepts files up to 25 MB, and takes mp3, mp4, mpeg, mpga, m4a, wav and webm. Compress or split larger recordings first.

```python
from openai import OpenAI

client = OpenAI()  # reads OPENAI_API_KEY from the environment
with open("meeting-recording.mp3", "rb") as audio:
    result = client.audio.transcriptions.create(model="gpt-transcribe", file=audio)
print(result.text)
```

Note that `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, and the `/v1/audio/translations` endpoint are deprecated and shut down on February 26, 2027, so do not build new pipelines on them. For subtitles or translation to English, use local Whisper.

### Step 4: Subtitles and Translation

The `whisper` CLI writes subtitle files directly:

```bash
whisper episode-42.mp3 --model small --output_format srt   # episode-42.srt
whisper episode-42.mp3 --model small --output_format vtt   # episode-42.vtt
```

To translate non-English speech into English, use `medium` or `large`. The `turbo` model is not trained for translation and returns the original language:

```bash
whisper interview-de.wav --model medium --language German --task translate
```

Speaker labels are not part of Whisper's output. Who-said-what needs a separate diarization step such as `pyannote.audio`, which the whisper skill walks through.

### Step 5: Follow Up with Analysis

The transcript is plain text, so the agent can work on it directly:

```text
Summarize the meeting and extract action items from meeting-recording.txt
```

```text
Find all mentions of "Q3 budget" or "hiring plan" in the transcript
```

Read the summary against the transcript before you act on it. Whisper can mishear names and numbers, and it occasionally invents text over long stretches of silence or music, which is what `vad_filter=True` helps prevent.

## Real-World Example

Priya is a product manager who records weekly standups on Zoom. Each 30-minute call produced decisions and action items that she used to type up by hand afterwards. Now she hands the recording to her agent:

```text
Transcribe standup-2026-02-17.mp4 and extract action items
```

The transcription runs in the background while she works on something else. The agent returns the action items it found:

- **@john:** Fix login bug by Friday
- **@sarah:** Send design specs to engineering by Wednesday
- **@mike:** Schedule customer interview for next week

She spot-checks them against the transcript, pastes them into the team's tracker, and archives the full text in case anyone needs to see what was actually said.

A podcaster on her team generates `episode-42.srt` with the `--output_format srt` command above and uploads it to the episode page for accessibility. A journalist transcribes three interview files in one command (`whisper part1.wav part2.wav part3.wav`) and searches the text for "funding" instead of scrubbing through hours of audio.

## Whisper Model Options

Sizes and memory needs from the Whisper README. Speeds are relative to `large` on an A100, so real numbers vary with hardware and language:

| Model | Parameters | Required VRAM | Relative speed |
|-------|-----------|---------------|----------------|
| tiny | 39 M | ~1 GB | ~10x |
| base | 74 M | ~1 GB | ~7x |
| small | 244 M | ~2 GB | ~4x |
| medium | 769 M | ~5 GB | ~2x |
| large | 1550 M | ~10 GB | 1x |
| turbo | 809 M | ~6 GB | ~8x |

`turbo` is an optimized `large-v3`, near-`large` accuracy at much higher speed, and is the CLI default. Use `medium` or `large` for translation. English-only audio can use the `.en` variants of `tiny` through `medium`, which tend to do better at the small sizes.

## Tips for Best Results

1. **Clear audio matters most.** The model cannot transcribe what it cannot hear; a close microphone beats a conference-room speakerphone.
2. **Specify the language** (`--language` or `language=` in `faster-whisper`) if you know it; auto-detection looks only at the first 30 seconds and can guess wrong on short or mixed-language clips.
3. **Split very long recordings** with `ffmpeg -i in.mp3 -f segment -segment_time 1800 -c copy part%02d.mp3` if you need progress per chunk or are hitting an API size limit.
4. **Single-speaker audio** transcribes best; for meetings, add a diarization step.

## Related Skills

- [whisper](../skills/whisper/SKILL.md): local and API transcription, subtitles, translation, diarization
