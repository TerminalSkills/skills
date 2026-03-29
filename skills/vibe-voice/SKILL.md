---
name: vibe-voice
description: >-
  Build voice AI applications using Microsoft's VibeVoice — open-source frontier voice
  synthesis, recognition, and real-time conversation. Use when: building voice assistants,
  adding TTS/STT to applications, creating real-time voice chat, voice cloning.
license: MIT
compatibility: "Python 3.10+"
metadata:
  author: terminal-skills
  version: 1.0.0
  category: ai-media
  tags:
    - voice
    - tts
    - stt
    - microsoft
    - speech
    - real-time
    - voice-ai
    - vibe-voice
  use-cases:
    - "Build a real-time voice assistant with natural-sounding speech"
    - "Add voice interaction to any application with VibeVoice"
    - "Create a voice cloning pipeline for personalized TTS"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# VibeVoice

Open-source frontier voice AI from Microsoft. Family of models for text-to-speech (TTS), automatic speech recognition (ASR), and real-time streaming synthesis.

GitHub: [microsoft/VibeVoice](https://github.com/microsoft/VibeVoice)

## Models Overview

| Model | Size | Capability | Best For |
|-------|------|------------|----------|
| VibeVoice-ASR-7B | 7B | Speech → Text | Long-form transcription (up to 60 min), speaker diarization |
| VibeVoice-TTS-1.5B | 1.5B | Text → Speech | Long-form multi-speaker audio (up to 90 min), podcasts |
| VibeVoice-Realtime-0.5B | 0.5B | Streaming TTS | Real-time voice assistants, low-latency responses |

## Installation

```bash
pip install vibevoice
# Or clone for development
git clone https://github.com/microsoft/VibeVoice.git
cd VibeVoice
pip install -e .
```

### Hardware Requirements

- **ASR (7B)**: ~16GB VRAM (GPU recommended)
- **TTS (1.5B)**: ~6GB VRAM
- **Realtime (0.5B)**: ~2GB VRAM (runs on consumer GPUs)

## Text-to-Speech (TTS)

### Basic TTS — Generate Speech from Text

```python
from vibevoice import VibeVoiceTTS

model = VibeVoiceTTS.from_pretrained("microsoft/VibeVoice-1.5B")

# Single speaker
audio = model.synthesize(
    text="Hello, welcome to the future of voice AI.",
    speaker="default"
)
audio.save("output.wav")
```

### Multi-Speaker Conversation

Generate podcast-style audio with up to 4 distinct speakers:

```python
conversation = [
    {"speaker": "host", "text": "Welcome to the show! Today we're discussing AI."},
    {"speaker": "guest1", "text": "Thanks for having me. I'm excited to dive in."},
    {"speaker": "host", "text": "Let's start with the biggest trends you're seeing."},
    {"speaker": "guest2", "text": "I think voice AI is the most underrated development."},
]

audio = model.synthesize_conversation(conversation)
audio.save("podcast.wav")  # Up to 90 minutes in a single pass
```

### Real-Time Streaming TTS

Ultra-low latency for voice assistants:

```python
from vibevoice import VibeVoiceRealtime

model = VibeVoiceRealtime.from_pretrained("microsoft/VibeVoice-Realtime-0.5B")

# Stream text → stream audio chunks
for audio_chunk in model.stream("This is being generated in real time."):
    play_audio(audio_chunk)  # Play each chunk as it arrives
```

### Multilingual Voices

Supports 9+ languages with experimental speakers:

```python
# German voice
audio = model.synthesize(
    text="Willkommen bei VibeVoice.",
    speaker="de_female_01"
)

# Japanese voice
audio = model.synthesize(
    text="VibeVoiceへようこそ。",
    speaker="ja_male_01"
)
```

## Automatic Speech Recognition (ASR)

### Basic Transcription

```python
from vibevoice import VibeVoiceASR

model = VibeVoiceASR.from_pretrained("microsoft/VibeVoice-ASR")

# Transcribe audio file
result = model.transcribe("meeting_recording.wav")
print(result.text)
```

### Rich Transcription — Who, When, What

Single-pass processing for up to 60 minutes of audio with speaker diarization and timestamps:

```python
result = model.transcribe(
    "meeting.wav",
    diarize=True,
    timestamps=True
)

for segment in result.segments:
    print(f"[{segment.start:.1f}s - {segment.end:.1f}s] "
          f"Speaker {segment.speaker}: {segment.text}")
```

Output:

```
[0.0s - 3.2s] Speaker 1: Let's review the Q3 numbers.
[3.5s - 8.1s] Speaker 2: Revenue is up 15% from last quarter.
[8.4s - 12.0s] Speaker 1: That's great. What about customer acquisition?
```

### Custom Hotwords

Improve accuracy for domain-specific terms:

```python
result = model.transcribe(
    "medical_consultation.wav",
    hotwords=["Lisinopril", "Metformin", "HbA1c", "systolic"]
)
```

### Hugging Face Transformers Integration

```python
from transformers import AutoModelForSpeechSeq2Seq, AutoProcessor

model = AutoModelForSpeechSeq2Seq.from_pretrained("microsoft/VibeVoice-ASR")
processor = AutoProcessor.from_pretrained("microsoft/VibeVoice-ASR")

inputs = processor(audio_array, return_tensors="pt")
outputs = model.generate(**inputs)
transcription = processor.batch_decode(outputs, skip_special_tokens=True)
```

### vLLM for Fast Inference

```python
# See docs/vibevoice-vllm-asr.md for full setup
from vllm import LLM

model = LLM(model="microsoft/VibeVoice-ASR")
output = model.generate(audio_input)
```

## Key Technical Details

- **7.5 Hz frame rate** — ultra-low for efficient long-sequence processing
- **Continuous speech tokenizers** — acoustic + semantic, preserving fidelity
- **Next-token diffusion** — LLM for context understanding + diffusion head for audio quality
- **50+ languages** supported in ASR

## Resources

- [Project Page](https://microsoft.github.io/VibeVoice)
- [HuggingFace Collection](https://huggingface.co/collections/microsoft/vibevoice-68a2ef24a875c44be47b034f)
- [TTS Paper](https://arxiv.org/pdf/2508.19205)
- [ASR Paper](https://arxiv.org/pdf/2601.18184)
- [Colab: Streaming TTS](https://colab.research.google.com/github/microsoft/VibeVoice/blob/main/demo/VibeVoice_colab.ipynb)
- [ASR Playground](https://aka.ms/vibevoice-asr)
- [Finetuning Guide](https://github.com/microsoft/VibeVoice/tree/main/finetuning-asr)
