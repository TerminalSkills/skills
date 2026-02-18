---
title: "Transcribe Audio to Text with Whisper"
slug: transcribe-audio-to-text
description: "Convert speech to text from MP3, WAV, M4A files using OpenAI Whisper in the terminal."
skill: voice-to-text
category: productivity
tags: [audio, transcription, whisper, speech-to-text, voice]
---

# Transcribe Audio to Text with Whisper

## The Problem

You have meeting recordings, voice memos, podcast episodes, or interview audio files that need to be converted to text. Manual transcription takes 4-6x the audio duration. Online services raise privacy concerns for sensitive content. You need a fast, scriptable, self-hosted solution that works from the command line.

## The Solution

Use the **voice-to-text** skill to transcribe any audio file using OpenAI Whisper. Works with local Whisper (free, offline) or the OpenAI API (fast, cloud-based). Supports MP3, WAV, M4A, FLAC, and 50+ other formats.

Install the skill:

## Step-by-Step Walkthrough

### 1. Point the agent at your audio file

Tell your AI agent what you need:

```text
Transcribe meeting-recording.mp3 to text
```

### 2. The agent selects the right approach

Based on file size, your system resources, and whether you have an OpenAI API key, the agent chooses:
- **Local Whisper** for privacy-sensitive or offline use
- **OpenAI API** for speed when cloud is acceptable

### 3. Audio is processed

The agent handles format conversion (via FFmpeg), selects the appropriate model size, and runs transcription. Progress is shown for long files.

### 4. You get clean text output

```text
Transcription complete!
- Duration: 45:32
- Words: 6,847
- Output: meeting-recording.txt

Preview:
"Welcome everyone to the Q4 planning meeting. Today we'll cover
three main topics: budget allocation, hiring targets, and..."
```

### 5. Follow up with analysis

Ask the agent to summarize, extract action items, or search for specific topics in the transcript.

## Real-World Examples

### Meeting Transcription

A product manager records weekly standups on Zoom. After each meeting:

```text
Transcribe standup-2024-01-15.mp4 and extract action items
```

Output:
```text
ACTION ITEMS:
- @john: Fix login bug by Friday
- @sarah: Send design specs to engineering
- @mike: Schedule customer interview for next week
```

### Podcast Subtitles

A podcaster needs SRT subtitles for accessibility:

```text
Create subtitles for episode-42.mp3 in SRT format
```

The agent generates `episode-42.srt` with timestamps for each line.

### Voice Memo to Notes

You record ideas on your phone while commuting:

```text
Transcribe all files in ~/Voice-Memos/ and combine into notes.md
```

The agent batch-processes all M4A files and produces organized notes.

### Interview Research

A journalist has 3 hours of interview recordings:

```text
Transcribe interview-part1.wav interview-part2.wav interview-part3.wav
Then find all mentions of "budget" or "funding"
```

## Whisper Model Options

| Model | Speed | Accuracy | RAM Required |
|-------|-------|----------|--------------|
| tiny | ~32x realtime | Good | 1GB |
| base | ~16x realtime | Better | 1GB |
| small | ~6x realtime | Great | 2GB |
| medium | ~2x realtime | Excellent | 5GB |
| large | ~1x realtime | Best | 10GB |

**Recommendation:** Start with `small` for best speed/accuracy balance.

## Supported Formats

- **Audio:** MP3, WAV, M4A, FLAC, OGG, WMA, AAC
- **Video:** MP4, MOV, AVI, MKV, WEBM (audio track extracted)
- **Other:** Any format FFmpeg can decode

## Tips for Best Results

1. **Clear audio** — minimize background noise when recording
2. **Single speaker** — multi-speaker requires post-processing to separate
3. **Specify language** — faster than auto-detection if you know the language
4. **Split long files** — files over 2 hours may benefit from chunking
