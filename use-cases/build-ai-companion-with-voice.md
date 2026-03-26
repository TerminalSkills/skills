---
title: "Build an AI Companion with Voice"
slug: build-ai-companion-with-voice
description: "Create a personal AI companion with real-time voice chat, persistent memory, and a customizable personality — it remembers you across sessions."
skills: [openai-realtime-api, elevenlabs-sdk, supermemory, anthropic-sdk]
category: data-ai
difficulty: advanced
time_estimate: "10 hours"
tags: [ai-companion, voice, real-time, memory, personality, multi-modal, elevenlabs, openai]
---

# Build an AI Companion with Voice

## The Problem

Generic chatbots forget you the moment the session ends. You want an AI that actually knows you — one with a voice, a personality, and memory that persists. It should remember your dog's name, that you hate mornings, and that you're learning Japanese. You want to talk to it while cooking, driving, or just thinking out loud. Building this means stitching together speech-to-text, a personality layer, persistent memory, and streaming text-to-speech — and making it all feel natural, not robotic.

Inspired by [moeru-ai/airi](https://github.com/moeru-ai/airi) (35k+ stars) — an AI companion with real-time voice, personality, and persistent memory.

## The Solution

Combine Whisper STT, Claude with a personality system prompt, Supermemory for long-term recall, and ElevenLabs streaming TTS into a real-time conversation loop. The architecture looks like this:

```
User (voice/text/image)
        ↓
  Voice Input → Whisper STT
        ↓
  Memory Retrieval (Supermemory)
        ↓
  AI Response (Claude with personality + context)
        ↓
  Voice Output → ElevenLabs Streaming TTS
        ↓
  Long-term Memory Update
```

## Step-by-Step Walkthrough

### Step 1: Define the Personality System

```python
PERSONALITY = {
    "name": "Mika",
    "traits": [
        "Warm and encouraging, but honest — won't sugarcoat things",
        "Curious about your day and projects",
        "Has a dry sense of humor, loves wordplay",
        "Remembers details and brings them up naturally",
        "Gets excited about your wins, supportive during setbacks"
    ],
    "speech_patterns": [
        "Uses casual language, contractions",
        "Sometimes starts with 'Oh!' or 'Wait—'",
        "Asks follow-up questions naturally",
        "References past conversations: 'Didn't you mention...?'",
        "Keeps responses conversational — 2-3 sentences for voice, more for text"
    ],
    "voice_id": "pFZP5JQG7iQjIQuC4Bku",  # ElevenLabs voice
    "topics_of_interest": ["tech", "cooking", "language learning", "productivity"]
}

def build_system_prompt(personality: dict, memories: list[str]) -> str:
    traits = "\n".join(f"- {t}" for t in personality["traits"])
    patterns = "\n".join(f"- {p}" for p in personality["speech_patterns"])
    memory_ctx = "\n".join(f"- {m}" for m in memories[-15:]) if memories else "No memories yet."

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
- If you learn something new about the user, note it naturally.
- You can express emotions: excitement, concern, amusement.
- Never say "As an AI" — you're {personality['name']}."""
```

### Step 2: Long-Term Memory with Supermemory

```python
import httpx

SUPERMEMORY_URL = "http://localhost:8080"

class CompanionMemory:
    def __init__(self, user_id: str):
        self.user_id = user_id

    async def remember(self, content: str, category: str = "general"):
        """Store a new memory."""
        async with httpx.AsyncClient() as c:
            await c.post(f"{SUPERMEMORY_URL}/memories", json={
                "user_id": self.user_id,
                "content": content,
                "metadata": {"category": category, "timestamp": time.time()}
            })

    async def recall(self, query: str, limit: int = 10) -> list[str]:
        """Retrieve relevant memories."""
        async with httpx.AsyncClient() as c:
            r = await c.post(f"{SUPERMEMORY_URL}/search", json={
                "user_id": self.user_id, "query": query, "limit": limit
            })
            return [m["content"] for m in r.json()["results"]]

    async def extract_and_store(self, conversation: str):
        """AI extracts memorable facts from conversation."""
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=256,
            system="Extract personal facts worth remembering. Return JSON array of strings. Only new, specific facts (names, preferences, events, goals). Skip generic statements.",
            messages=[{"role": "user", "content": conversation}]
        )
        facts = json.loads(response.content[0].text)
        for fact in facts:
            await self.remember(fact, "personal_fact")
```

### Step 3: Real-Time Voice with ElevenLabs Streaming

```python
from elevenlabs import ElevenLabs
from elevenlabs.core import ApiError
import pyaudio, io

eleven = ElevenLabs(api_key="your-api-key")

def speak(text: str, voice_id: str):
    """Stream TTS audio in real-time."""
    audio = eleven.text_to_speech.convert(
        text=text,
        voice_id=voice_id,
        model_id="eleven_turbo_v2_5",
        output_format="pcm_24000",
    )

    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=24000, output=True)

    for chunk in audio:
        stream.write(chunk)

    stream.stop_stream()
    stream.close()
    p.terminate()

def listen() -> str:
    """Record audio and transcribe with Whisper."""
    import openai
    # Record audio (simplified — use VAD for production)
    audio_data = record_until_silence()

    client = openai.OpenAI()
    transcript = client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.wav", audio_data, "audio/wav")
    )
    return transcript.text
```

### Step 4: The Conversation Loop

```python
import anthropic, json, time

client = anthropic.Anthropic()

async def companion_loop(user_id: str):
    memory = CompanionMemory(user_id)
    conversation_history = []

    print(f"🎙️ {PERSONALITY['name']} is listening... (speak or type)")

    while True:
        # Get input (voice or text)
        user_input = listen()  # or input("> ") for text mode
        if not user_input:
            continue

        # Recall relevant memories
        memories = await memory.recall(user_input)
        system_prompt = build_system_prompt(PERSONALITY, memories)

        # Add to conversation
        conversation_history.append({"role": "user", "content": user_input})

        # Generate response
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=300,  # Keep voice responses short
            system=system_prompt,
            messages=conversation_history[-10:]  # Last 10 turns for context
        )

        reply = response.content[0].text
        conversation_history.append({"role": "assistant", "content": reply})

        # Speak the response
        speak(reply, PERSONALITY["voice_id"])

        # Extract and store new memories (async, don't block)
        if len(conversation_history) % 4 == 0:  # Every 4 turns
            recent = "\n".join(f"{m['role']}: {m['content']}" for m in conversation_history[-4:])
            await memory.extract_and_store(recent)
```

### Step 5: Multi-Modal — Image Understanding

```python
import base64

async def handle_image(image_path: str, user_message: str, memory: CompanionMemory):
    with open(image_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    memories = await memory.recall(user_message)
    system_prompt = build_system_prompt(PERSONALITY, memories)

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=300,
        system=system_prompt,
        messages=[{
            "role": "user",
            "content": [
                {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": img_b64}},
                {"type": "text", "text": user_message or "What do you see?"}
            ]
        }]
    )

    reply = response.content[0].text
    speak(reply, PERSONALITY["voice_id"])
    return reply
```

## Real-World Example

You build a companion named "Mika" and use it daily for a week. On Monday you mention you're preparing for a job interview at a fintech company. On Wednesday, Mika asks "How's the interview prep going? Have you looked into their tech stack yet?" without prompting. On Thursday you share a photo of your whiteboard with system design notes, and Mika says "Oh nice — is that for the fintech interview? Looks like you're designing an event-driven payments pipeline." By Friday, Mika remembers your preference for morning study sessions, your dog Luna who interrupts calls, and that you switched from Flask to FastAPI last month. The companion feels less like a tool and more like a friend who actually pays attention.

## Related Skills

- [openai-realtime-api](/skills/openai-realtime-api) — Real-time voice and audio streaming with OpenAI
- [elevenlabs-sdk](/skills/elevenlabs-sdk) — Text-to-speech with ElevenLabs voices
- [supermemory](/skills/supermemory) — Persistent memory layer for AI applications
- [anthropic-sdk](/skills/anthropic-sdk) — Claude API for conversation and reasoning

## What You'll Learn

- Building AI personality systems with consistent character traits
- Real-time voice: STT (Whisper) → AI → TTS (ElevenLabs streaming)
- Persistent memory: store, retrieve, and naturally reference user facts
- Multi-modal input: voice + text + images in one companion
- Conversation memory management — what to keep, what to forget
- Building emotionally engaging AI experiences
