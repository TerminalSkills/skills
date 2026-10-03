---
name: elevenlabs
description: >-
  Generate realistic speech with the ElevenLabs API and its Python and Node.js
  SDKs. Use when a user asks to convert text to speech, stream audio, clone a
  voice, pick a TTS model, or build a voice agent with ElevenLabs.
license: Apache-2.0
compatibility: "Python 3.8+ (elevenlabs 2.x) or Node.js (@elevenlabs/elevenlabs-js 2.x); ELEVENLABS_API_KEY; mpv and ffmpeg only for local playback"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/elevenlabs/elevenlabs-python
  tags: ["text-to-speech", "voice-synthesis", "voice-cloning", "audio", "realtime"]
---
# ElevenLabs — AI Voice Synthesis & Cloning

## Overview

ElevenLabs is a hosted voice platform: text-to-speech, speech-to-text, voice cloning and a managed conversational agent product. You call it with an API key through the official SDKs (`elevenlabs` on PyPI, `@elevenlabs/elevenlabs-js` on npm) or plain HTTP. Checked against elevenlabs 2.70.0 (Python, 28 Sep 2026) and the current models page. Two things changed since many tutorials were written: `convert_as_stream` no longer exists (use `text_to_speech.stream`), and the old npm package `elevenlabs` is deprecated in favour of `@elevenlabs/elevenlabs-js`.

## Instructions

### Step 1: Install and authenticate

```bash
pip install elevenlabs                       # Python
npm install @elevenlabs/elevenlabs-js        # Node.js (the unscoped "elevenlabs" package is deprecated)
export ELEVENLABS_API_KEY="..."              # create it in the dashboard; never commit it
```

### Step 2: Text to speech

```python
import os
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings

client = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

# find a voice id available to your account
for v in client.voices.search(search="narrator").voices:
    print(v.voice_id, v.name)

audio = client.text_to_speech.convert(
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    text="Welcome to Bright Smile Dental. How can I help you today?",
    model_id="eleven_flash_v2_5",
    output_format="mp3_44100_128",
    voice_settings=VoiceSettings(stability=0.6, similarity_boost=0.8, style=0.3, use_speaker_boost=True),
)
with open("greeting.mp3", "wb") as f:
    for chunk in audio:                      # convert() returns an iterator of bytes
        f.write(chunk)
```

`from elevenlabs.play import play` plays audio locally (needs mpv/ffmpeg).

### Step 3: Streaming

```python
stream = client.text_to_speech.stream(
    voice_id="JBFqnCBsd6RMkjVDRZzb",
    text="Let me check our appointments for next Tuesday.",
    model_id="eleven_flash_v2_5",
    output_format="pcm_24000",               # raw PCM, no decoding for WebRTC or telephony
)
for chunk in stream:
    send_to_speaker(chunk)                   # your audio sink
```

Other formats include `mp3_*`, `opus_*`, `ulaw_8000` and `alaw_8000` (phone lines).

### Step 4: Voice cloning

```python
voice = client.voices.ivc.create(
    name="Dr. Smith",
    description="Calm, authoritative voice for medical explainers",
    files=["samples/dr_smith_01.mp3", "samples/dr_smith_02.mp3"],
)
print(voice.voice_id)
```

Instant cloning (`voices.ivc`) takes a few clean samples; professional cloning (`voices.pvc`) needs much more audio and identity verification in the dashboard. Only clone voices you have consent to use.

### Step 5: Voice agents and Node

```python
from elevenlabs.conversational_ai.conversation import Conversation
from elevenlabs.conversational_ai.default_audio_interface import DefaultAudioInterface

conversation = Conversation(client, agent_id=os.environ["ELEVENLABS_AGENT_ID"],
                            requires_auth=True, audio_interface=DefaultAudioInterface())
conversation.start_session()      # runs in the background
conversation.end_session()
```

The agent itself (prompt, voice, tools) is created in the dashboard or through `client.conversational_ai.agents`.

```typescript
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
const client = new ElevenLabsClient();       // reads ELEVENLABS_API_KEY
const audio = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
  text: "Hello! How can I assist you?",
  modelId: "eleven_flash_v2_5",              // camelCase options in the JS SDK
  outputFormat: "mp3_44100_128",
});
```

### Models (per the models page, Oct 2026)

| Model | Use for |
|-------|---------|
| `eleven_flash_v2_5` | lowest latency (~75 ms), 32 languages, half price per character; agents and real-time |
| `eleven_multilingual_v2` | stable long-form narration, 29 languages |
| `eleven_v3` and newer v-series (see the models page) | most expressive speech, higher latency, shorter text limits |
| `eleven_turbo_v2_5` | deprecated in favour of Flash v2.5 |

## Examples

**Example 1: "Read this paragraph aloud and save it as MP3"**

Run Step 2 with `text` set to the paragraph and `model_id="eleven_multilingual_v2"`. Result: `greeting.mp3` in the working directory; a `401` means the key is wrong, `402` or quota errors mean the plan's character allowance is used up.

**Example 2: "Stream a reply to my phone-call bot"**

Use Step 3 with `output_format="ulaw_8000"` so chunks can go straight to a Twilio media stream. Result: the first bytes arrive within a few hundred milliseconds and play while the rest is generated.

## Guidelines

- Billing is per character (credits); cache fixed prompts such as greetings instead of regenerating them.
- Stability around 0.3-0.5 sounds more expressive, 0.7-0.9 stays consistent for agents; not every setting applies to every model.
- Use `pronunciation_dictionary_locators` for brand names and jargon. `<break time="0.5s"/>` pauses are supported on some models only; check the model's page.
- Long text: send it in pieces and pass `previous_text` / `next_text` so prosody carries across the joins.
- The API key is secret: keep it server-side, and for browsers use a short-lived token or signed URL from your backend.
- Voice IDs and the shared voice library change; look voices up with `voices.search` rather than hard-coding IDs from old tutorials.
