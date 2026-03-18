---
name: elevenlabs-sdk
description: >-
  ElevenLabs SDK for AI voice synthesis — text-to-speech, voice cloning,
  dubbing, and sound effects. Use when generating natural speech from text,
  cloning a voice from audio samples, dubbing videos into other languages,
  or building real-time voice AI products.
license: Apache-2.0
compatibility: "Requires Python 3.9+. Install: pip install elevenlabs. API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-media
  tags: ["elevenlabs", "text-to-speech", "voice-cloning", "tts", "audio-ai"]
  use-cases:
    - "Generate natural-sounding voiceover narration for videos or podcasts"
    - "Clone a speaker's voice and synthesize new speech in their style"
    - "Dub a marketing video into Spanish, French, and German automatically"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# ElevenLabs SDK

## Overview

ElevenLabs produces the most natural AI voices available. The Python SDK (`elevenlabs`) wraps the REST API for TTS, voice cloning, dubbing, sound effects, and real-time streaming. Use it to add voice to any pipeline — narration, chatbots, video dubbing, or interactive apps.

## Setup

```bash
pip install elevenlabs python-dotenv
export ELEVENLABS_API_KEY="your_api_key_here"
```

## Core Concepts

- **Voice**: A voice model identified by `voice_id`. ElevenLabs provides pre-built voices; you can also clone or design custom ones.
- **Model**: Controls quality/speed. `eleven_multilingual_v2` for best multilingual quality; `eleven_turbo_v2_5` for low-latency.
- **TTS**: Synchronous (returns audio bytes) or streaming (returns chunks).
- **Voice Cloning**: Instant clone from 1 min of audio; professional clone from 30 min+.
- **Dubbing**: Upload a video/audio; ElevenLabs transcribes, translates, and re-synthesizes in the target language with timing preserved.

## Instructions

### Step 1: Initialize the client

```python
import os
from elevenlabs import ElevenLabs, play, save

client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
```

### Step 2: List available voices

```python
def list_voices():
    response = client.voices.get_all()
    for v in response.voices:
        print(f"{v.voice_id} | {v.name} | {v.labels}")

list_voices()
```

### Step 3: Text-to-speech (save to file)

```python
def tts_to_file(text: str, voice_id: str, output_path: str = "output.mp3",
                model: str = "eleven_multilingual_v2") -> str:
    audio = client.text_to_speech.convert(
        voice_id=voice_id,
        text=text,
        model_id=model,
        voice_settings={
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True
        }
    )
    save(audio, output_path)
    print(f"Saved: {output_path}")
    return output_path

tts_to_file(
    text="Welcome to our product demo. Today I'll show you how to save hours every week.",
    voice_id="21m00Tcm4TlvDq8ikWAM",  # Rachel - replace with desired voice
    output_path="narration.mp3"
)
```

### Step 4: Streaming TTS (for real-time playback)

```python
def tts_stream(text: str, voice_id: str, model: str = "eleven_turbo_v2_5"):
    """Stream audio and play it immediately."""
    audio_stream = client.text_to_speech.convert_as_stream(
        voice_id=voice_id,
        text=text,
        model_id=model
    )
    play(audio_stream)

tts_stream("Hello! This is streaming audio — you'll hear it as it generates.", voice_id="21m00Tcm4TlvDq8ikWAM")
```

### Step 5: Real-time TTS via WebSocket

For ultra-low latency (chatbots, voice agents):

```python
import asyncio
from elevenlabs.client import AsyncElevenLabs

async def tts_websocket(text: str, voice_id: str, output_path: str = "realtime.mp3"):
    async_client = AsyncElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])
    audio_chunks = []

    async for chunk in async_client.text_to_speech.convert_as_stream(
        voice_id=voice_id,
        text=text,
        model_id="eleven_turbo_v2_5"
    ):
        audio_chunks.append(chunk)

    with open(output_path, "wb") as f:
        for chunk in audio_chunks:
            f.write(chunk)
    print(f"Saved: {output_path}")

asyncio.run(tts_websocket("Low latency voice response for your chatbot.", voice_id="21m00Tcm4TlvDq8ikWAM"))
```

### Step 6: Voice cloning

```python
from elevenlabs.types import VoiceSettings

def clone_voice(name: str, sample_files: list[str], description: str = "") -> str:
    """
    Instant voice clone from audio files.
    sample_files: list of paths to .mp3 or .wav files (min 1 min total audio).
    Returns voice_id of the cloned voice.
    """
    files = [open(f, "rb") for f in sample_files]
    try:
        voice = client.clone(
            name=name,
            description=description,
            files=files
        )
        print(f"Cloned voice: {voice.voice_id}")
        return voice.voice_id
    finally:
        for f in files:
            f.close()

cloned_id = clone_voice(
    name="CEO Voice Clone",
    sample_files=["ceo_interview_clip1.mp3", "ceo_interview_clip2.mp3"],
    description="Executive voice for corporate narration"
)
```

### Step 7: Voice design (create synthetic voice)

```python
def design_voice(
    text: str,
    gender: str = "female",
    age: str = "middle-aged",
    accent: str = "american",
    accent_strength: float = 1.0
) -> str:
    """Generate a new synthetic voice; returns voice_id."""
    previews = client.text_to_voice.create_previews(
        voice_description=f"{age} {gender} with {accent} accent",
        text=text
    )
    # Pick the first preview and save it as a voice
    generated_voice_id = previews.previews[0].generated_voice_id
    voice = client.text_to_voice.create_voice_from_preview(
        voice_name="My Custom Voice",
        voice_description=f"{age} {gender} with {accent} accent",
        generated_voice_id=generated_voice_id
    )
    return voice.voice_id
```

### Step 8: Dubbing API

```python
import time

def dub_video(file_path: str, target_language: str = "es", source_language: str = "en") -> str:
    """
    Dub a video file into target_language.
    target_language: ISO 639-1 code (e.g. 'es', 'fr', 'de', 'ja', 'pt', 'zh')
    Returns dubbed audio/video content as bytes.
    """
    with open(file_path, "rb") as f:
        dubbing = client.dubbing.dub_a_video_or_an_audio_file(
            file=(file_path.split("/")[-1], f, "video/mp4"),
            target_lang=target_language,
            source_lang=source_language,
            num_speakers=1
        )

    dub_id = dubbing.dubbing_id
    print(f"Dubbing job: {dub_id}")

    # Poll for completion
    while True:
        metadata = client.dubbing.get_dubbing_project_metadata(dub_id)
        if metadata.status == "dubbed":
            break
        elif metadata.status == "failed":
            raise RuntimeError("Dubbing failed")
        print(f"Status: {metadata.status}...")
        time.sleep(10)

    # Download the dubbed audio
    audio_stream = client.dubbing.get_dubbed_file(dub_id, target_language)
    output_path = f"dubbed_{target_language}.mp4"
    with open(output_path, "wb") as out:
        for chunk in audio_stream:
            out.write(chunk)
    print(f"Dubbed video saved: {output_path}")
    return output_path

dub_video("marketing_video_en.mp4", target_language="es")
```

### Step 9: Sound effects generation

```python
def generate_sfx(description: str, duration: float = 3.0, output_path: str = "sfx.mp3") -> str:
    result = client.text_to_sound_effects.convert(
        text=description,
        duration_seconds=duration,
        prompt_influence=0.3
    )
    save(result, output_path)
    print(f"SFX saved: {output_path}")
    return output_path

generate_sfx("thunderstorm with heavy rain and distant lightning", duration=5.0, output_path="thunder.mp3")
generate_sfx("notification chime, soft and pleasant", duration=1.5, output_path="notify.mp3")
```

## Models reference

| Model ID | Best For |
|----------|----------|
| `eleven_multilingual_v2` | Highest quality, 29 languages |
| `eleven_turbo_v2_5` | Low latency, real-time apps |
| `eleven_turbo_v2` | Low latency, English only |
| `eleven_monolingual_v1` | English, legacy |

## Guidelines

- Use `eleven_multilingual_v2` for production narration; `eleven_turbo_v2_5` for chatbots where latency matters.
- Voice cloning requires user consent for the voice being cloned — always verify rights.
- Keep `stability` between 0.3–0.7; higher = more consistent, lower = more expressive.
- ElevenLabs bills per character. Estimate costs before bulk generation.
- For dubbing, provide clean source audio (minimal background noise) for best results.
- Store API keys in environment variables — never hardcode them.
