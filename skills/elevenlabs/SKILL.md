---
name: elevenlabs
description: >-
  Generate realistic speech with the ElevenLabs API. Use when a user asks to convert text to speech, clone voices, build voice-enabled apps, stream audio, or integrate ElevenLabs voice synthesis into applications.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["text-to-speech", "voice-synthesis", "voice-cloning", "audio", "realtime"]
---
# ElevenLabs — AI Voice Synthesis & Cloning

## Overview

You are an expert in ElevenLabs, the AI voice platform for high-quality text-to-speech, voice cloning, and conversational AI. You help developers build voice-enabled applications with natural-sounding speech, custom voice creation, multilingual support, and real-time streaming TTS for voice agents, audiobooks, podcasts, and accessibility features.

## Instructions

### Text-to-Speech

```python
# Basic TTS — generate audio from text
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

# Generate and save audio
audio = client.text_to_speech.convert(
    voice_id="pNInz6obpgDQGcFmaJgB",    # "Rachel" — warm, professional
    text="Welcome to Bright Smile Dental. How can I help you today?",
    model_id="eleven_turbo_v2_5",         # Optimized for low latency (~200ms)
    voice_settings={
        "stability": 0.6,                 # Lower = more expressive, higher = more consistent
        "similarity_boost": 0.8,           # How closely to match the original voice
        "style": 0.3,                      # Style exaggeration (0-1)
        "use_speaker_boost": True,         # Enhance clarity
    },
)

# Save to file
with open("greeting.mp3", "wb") as f:
    for chunk in audio:
        f.write(chunk)

# Streaming TTS — for real-time applications
audio_stream = client.text_to_speech.convert_as_stream(
    voice_id="pNInz6obpgDQGcFmaJgB",
    text="Let me check our available appointments for next Tuesday.",
    model_id="eleven_turbo_v2_5",
    output_format="pcm_24000",            # Raw PCM for WebRTC/LiveKit
)

for chunk in audio_stream:
    send_to_audio_output(chunk)            # Stream directly to speaker
```

### Voice Cloning

```python
# Instant voice clone — from a single audio sample
voice = client.voices.add(
    name="Dr. Smith",
    files=[open("dr_smith_sample.mp3", "rb")],
    description="Calm, authoritative male voice for medical context",
    labels={"use_case": "voice_agent", "language": "en"},
)
print(f"Cloned voice ID: {voice.voice_id}")

# Professional voice clone (higher quality, requires consent)
# Needs 30+ minutes of clean audio for best results
```

### Conversational AI Agent

```python
# ElevenLabs Conversational AI — fully managed voice agent
from elevenlabs import ConversationalAI

agent = ConversationalAI(
    api_key=os.environ["ELEVENLABS_API_KEY"],
    agent_id="your-agent-id",             # Created in ElevenLabs dashboard
)

# WebSocket connection for real-time conversation
async def handle_call(websocket):
    async for audio_chunk in websocket:
        # Send caller audio to ElevenLabs
        response = await agent.process_audio(audio_chunk)
        # Send AI response audio back to caller
        await websocket.send(response.audio)
```

### JavaScript / React

```typescript
// Browser-based TTS
import { ElevenLabsClient } from "elevenlabs";

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_KEY });

// Stream audio in browser
const response = await client.textToSpeech.convertAsStream(voiceId, {
  text: "Hello! How can I assist you?",
  model_id: "eleven_turbo_v2_5",
  output_format: "mp3_44100_128",
});

// Play audio using Web Audio API
const audioContext = new AudioContext();
const reader = response.getReader();
// ... decode and play chunks
```

## Available Models

| Model | Latency | Quality | Best For |
|-------|---------|---------|----------|
| `eleven_turbo_v2_5` | ~200ms | High | Voice agents, real-time apps |
| `eleven_multilingual_v2` | ~400ms | Highest | Multilingual, audiobooks |
| `eleven_english_v1` | ~300ms | Good | English-only, cost-sensitive |

## Installation

```bash
pip install elevenlabs                    # Python
npm install elevenlabs                    # Node.js
```

## Examples

**Example 1: User asks to set up elevenlabs**

User: "Help me set up elevenlabs for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure elevenlabs
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with elevenlabs**

User: "Create a dashboard using elevenlabs"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Turbo model for voice agents** — Use `eleven_turbo_v2_5` for real-time conversations; 200ms latency feels instant
2. **Streaming for real-time** — Use `convert_as_stream` instead of `convert` for voice agents; first audio chunk arrives in ~200ms
3. **Voice settings tuning** — Lower stability (0.3-0.5) for expressive narration; higher (0.7-0.9) for consistent voice agents
4. **PCM output for WebRTC** — Use `pcm_24000` or `pcm_16000` output format when feeding into WebRTC/LiveKit; no decoding overhead
5. **Voice library** — Browse ElevenLabs' voice library (1000+ voices) before cloning; many professional voices are already available
6. **Pronunciation dictionary** — Upload custom pronunciation rules for medical terms, brand names, and technical jargon
7. **Character count billing** — ElevenLabs bills per character; cache common phrases and greetings to reduce costs
8. **SSML-like control** — Use `<break time="0.5s"/>` in text for natural pauses; helps with phone menu options
