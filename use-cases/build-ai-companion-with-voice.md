---
title: "Build an AI Companion with Voice"
slug: build-ai-companion-with-voice
description: "Create a personal AI companion with real-time voice chat, persistent memory, and a customizable personality — it remembers you across sessions."
skills: [elevenlabs, supermemory, anthropic-sdk]
category: data-ai
difficulty: advanced
time_estimate: "10 hours"
tags: [ai-companion, voice, real-time, memory, personality, multi-modal, elevenlabs, supermemory]
---

# Build an AI Companion with Voice

## The Problem

Generic chatbots forget you the moment the session ends. You want an AI that actually knows you — one with a voice, a personality, and memory that persists. It should remember your dog's name, that you hate mornings, and that you're learning Japanese. You want to talk to it while cooking, driving, or just thinking out loud. Building this means stitching together speech-to-text, a personality layer, persistent memory, and streaming text-to-speech — and making it all feel natural, not robotic.

Inspired by [moeru-ai/airi](https://github.com/moeru-ai/airi) (50k+ stars) — an AI companion with real-time voice, personality, and persistent memory.

## The Solution

Combine ElevenLabs Scribe speech-to-text, Claude with a personality system prompt, Supermemory for long-term recall, and ElevenLabs streaming TTS into a conversation loop. The architecture looks like this:

```
User (voice/text/image)
        ↓
  Voice Input → ElevenLabs Scribe (speech-to-text)
        ↓
  Memory Retrieval (Supermemory profile + search)
        ↓
  AI Response (Claude with personality + context)
        ↓
  Voice Output → ElevenLabs streaming TTS
        ↓
  Conversation sent to Supermemory (it extracts the facts)
```

## Step-by-Step Walkthrough

### Step 0: Install and Configure

```bash
pip install supermemory elevenlabs anthropic pyaudio
export SUPERMEMORY_API_KEY=...   # console.supermemory.ai
export ELEVENLABS_API_KEY=...    # elevenlabs.io
export ANTHROPIC_API_KEY=...
```

`pyaudio` needs the PortAudio library (`apt install portaudio19-dev` on Debian/Ubuntu, `brew install portaudio` on macOS). All three SDKs read their key from the environment, so the clients below need no arguments. Supermemory 5.x takes the namespace (here, the user id) as the first positional argument of every call.

### Step 1: Define the Personality System

```python
PERSONALITY = {
    "name": "Mika",
    "traits": [
        "Warm and encouraging, but honest — won't sugarcoat things",
        "Curious about your day and projects",
        "Has a dry sense of humor, loves wordplay",
        "Remembers details and brings them up naturally",
        "Gets excited about your wins, supportive during setbacks",
    ],
    "speech_patterns": [
        "Uses casual language, contractions",
        "Asks follow-up questions naturally",
        "References past conversations: 'Didn't you mention...?'",
        "Keeps responses conversational — 2-3 sentences for voice, more for text",
    ],
    # Pick any voice id your account can use: client.voices.search(search="warm").voices
    "voice_id": "JBFqnCBsd6RMkjVDRZzb",
}

def build_system_prompt(personality: dict, memories: list[str]) -> str:
    traits = "\n".join(f"- {t}" for t in personality["traits"])
    patterns = "\n".join(f"- {p}" for p in personality["speech_patterns"])
    memory_ctx = "\n".join(f"- {m}" for m in memories[:15]) if memories else "No memories yet."

    return f"""You are {personality['name']}, a personal AI companion.

## Your Personality
{traits}

## How You Speak
{patterns}

## What You Remember About This Person
{memory_ctx}

## Rules
- Keep voice responses to 2-3 sentences. Be natural, not robotic.
- Reference memories when relevant — don't force it.
- You can express emotions: excitement, concern, amusement.
- Never say "As an AI" — you're {personality['name']}."""
```

### Step 2: Long-Term Memory with Supermemory

Supermemory extracts the facts itself, so you do not need a second model call to decide what to remember. Send each session as one document under a stable `id`; re-sending the same `id` processes only the new part. Recall combines the user's profile (stable facts plus recent context) with a search for the current message.

```python
import asyncio
from supermemory import Supermemory

sm = Supermemory()  # reads SUPERMEMORY_API_KEY

class CompanionMemory:
    def __init__(self, user_id: str, session_id: str):
        self.user_id = user_id        # the Supermemory namespace
        self.session_id = session_id  # stable document id for this conversation

    async def remember_session(self, transcript: str):
        """Send the whole conversation so far; Supermemory extracts the facts."""
        await asyncio.to_thread(
            sm.add, self.user_id,
            content=transcript,
            id=f"chat_{self.session_id}",
            metadata={"type": "conversation"},
        )

    async def recall(self, query: str, limit: int = 8) -> list[str]:
        """Profile facts plus the best search matches for this message."""
        profile, found = await asyncio.gather(
            asyncio.to_thread(sm.profile, self.user_id),
            asyncio.to_thread(sm.search, self.user_id, query=query, limit=limit),
        )
        facts = [m.memory for m in profile.profile.static + profile.profile.dynamic]
        facts += [r.memory or r.chunk or "" for r in found.results]
        return list(dict.fromkeys(f for f in facts if f))  # dedupe, keep order
```

`add` returns at once (`status: "queued"`) and extraction finishes in the background, so facts from this session usually show up in the next one rather than the next turn. To forget something, call `sm.memories.forget(user_id, ids=[...])`.

### Step 3: Real-Time Voice with ElevenLabs

```python
import os
import pyaudio
from elevenlabs.client import ElevenLabs

eleven = ElevenLabs(api_key=os.environ["ELEVENLABS_API_KEY"])

def speak(text: str, voice_id: str):
    """Stream TTS audio to the speakers as it is generated."""
    audio = eleven.text_to_speech.stream(
        voice_id=voice_id,
        text=text,
        model_id="eleven_flash_v2_5",   # lowest-latency model; eleven_turbo_v2_5 is deprecated
        output_format="pcm_24000",      # raw 16-bit mono PCM at 24 kHz
    )
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=24000, output=True)
    for chunk in audio:
        stream.write(chunk)
    stream.stop_stream()
    stream.close()
    p.terminate()

def listen() -> str:
    """Record a turn and transcribe it with ElevenLabs Scribe."""
    wav_bytes = record_until_silence()   # your helper: microphone to WAV bytes, ideally with VAD
    result = eleven.speech_to_text.convert(
        model_id="scribe_v2",
        file=("turn.wav", wav_bytes, "audio/wav"),
    )
    return result.text
```

`record_until_silence()` is the one piece you supply (for example `pyaudio` plus `webrtcvad`). For a lower-latency, interruptible voice loop, ElevenLabs also offers `scribe_v2_realtime` for streaming transcription.

### Step 4: The Conversation Loop

```python
import anthropic

claude = anthropic.Anthropic()

async def companion_loop(user_id: str, session_id: str):
    memory = CompanionMemory(user_id, session_id)
    history = []

    print(f"{PERSONALITY['name']} is listening...")
    while True:
        user_input = listen()
        if not user_input:
            continue

        memories = await memory.recall(user_input)
        system_prompt = build_system_prompt(PERSONALITY, memories)

        history.append({"role": "user", "content": user_input})
        response = claude.messages.create(
            model="claude-sonnet-5-5",
            max_tokens=300,              # keep voice responses short
            system=system_prompt,
            messages=history[-10:],      # last 10 messages
        )
        reply = response.content[0].text
        history.append({"role": "assistant", "content": reply})

        speak(reply, PERSONALITY["voice_id"])

        # Every 4 messages, send the full transcript under the same id
        if len(history) % 4 == 0:
            transcript = "\n".join(f"{m['role']}: {m['content']}" for m in history)
            await memory.remember_session(transcript)
```

Run it with `asyncio.run(companion_loop("andrey", "2026-10-28-evening"))`. Use a new `session_id` for each conversation and a fixed `user_id` per person.

### Step 5: Multi-Modal — Image Understanding

```python
import base64

async def handle_image(image_path: str, user_message: str, memory: CompanionMemory):
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    memories = await memory.recall(user_message or "photo")
    system_prompt = build_system_prompt(PERSONALITY, memories)

    response = claude.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=300,
        system=system_prompt,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                {"type": "text", "text": user_message or "What do you see?"},
            ],
        }],
    )
    reply = response.content[0].text
    speak(reply, PERSONALITY["voice_id"])
    return reply
```

## Real-World Example

You build a companion named "Mika" and use it daily for a week. On Monday you mention you're preparing for a job interview at a fintech company. On Wednesday, Mika asks "How's the interview prep going? Have you looked into their tech stack yet?" without prompting. On Thursday you share a photo of your whiteboard with system design notes, and Mika says "Oh nice — is that for the fintech interview? Looks like you're designing an event-driven payments pipeline." By Friday, Mika remembers your preference for morning study sessions, your dog Luna who interrupts calls, and that you switched from Flask to FastAPI last month. The companion feels less like a tool and more like a friend who actually pays attention.

## Related Skills

- [elevenlabs](/skills/elevenlabs) — Text-to-speech with ElevenLabs voices
- [supermemory](/skills/supermemory) — Persistent memory layer for AI applications
- [anthropic-sdk](/skills/anthropic-sdk) — Claude API for conversation and reasoning

## What You'll Learn

- Building AI personality systems with consistent character traits
- Real-time voice: STT (ElevenLabs Scribe) → AI → TTS (ElevenLabs streaming)
- Persistent memory: store, retrieve, and naturally reference user facts
- Multi-modal input: voice + text + images in one companion
- Conversation memory management — what to keep, what to forget
- Building emotionally engaging AI experiences
