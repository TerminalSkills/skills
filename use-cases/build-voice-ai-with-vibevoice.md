---
title: "Build a Voice AI Healthcare Assistant with VibeVoice"
slug: build-voice-ai-with-vibevoice
description: "Build a voice-first healthcare assistant for elderly patients using VibeVoice speech recognition, Claude for intent processing, and persistent conversation memory."
skills:
  - vibe-voice
  - anthropic-sdk
  - supermemory
category: data-ai
tags:
  - voice-ai
  - healthcare
  - speech
  - assistants
  - accessibility
---

# Build a Voice AI Healthcare Assistant with VibeVoice

## The Situation

MedCare, a healthcare startup, serves 2,000+ elderly patients who struggle with smartphone apps. Many can't type well, have poor eyesight, and forget login passwords. They need to:

- Schedule and manage appointments
- Check and refill medications
- Get daily health reminders

The idea: a voice-first interface. Patients call a phone number or open a simple page and just talk. This page builds the pipeline as a prototype with Microsoft's open-source VibeVoice models, and is honest about what that means: Microsoft states the models are for research and development and does not recommend commercial or real-world use without further testing. Treat this as something to evaluate with consent and supervision, not a medical device, and check your privacy obligations (HIPAA or local equivalent) before real patient data touches any service in the chain, including the hosted ones.

## Skills Used

- [vibe-voice](/skills/vibe-voice) — speech recognition with speaker labels and hotwords, and a real-time text-to-speech model
- [anthropic-sdk](/skills/anthropic-sdk) — intent processing with Claude
- [supermemory](/skills/supermemory) — patient conversation memory

## What VibeVoice Offers Today

The repository `microsoft/VibeVoice` is MIT-licensed and active (checked October 2026). Weights on Hugging Face are also MIT. What it ships:

| Model | Use | Notes |
|---|---|---|
| VibeVoice-ASR (7B) | speech to text | 60 minutes in one pass, speaker labels and timestamps, custom hotwords, 50+ languages |
| VibeVoice-ASR-Streaming (7B) | live captions | text arrives chunk by chunk, hotwords, 10 languages |
| VibeVoice-ASR-BitNet | CPU-only ASR | about 1.6 GB, runs through the separate `microsoft/VibeASR.cpp` engine |
| VibeVoice-Realtime-0.5B | text to speech | one speaker, English supported, about 10 minutes per generation, streaming output |

Not available: Microsoft removed the VibeVoice-TTS (multi-speaker, 1.5B) inference code in September 2025 after misuse, so the repository cannot run it. There is no `pip install vibevoice` from Microsoft and no `VibeVoiceASR` or `VibeVoiceRealtime` Python class; older tutorials that use them do not work.

## Architecture

```
Patient speaks -> VibeVoice ASR -> Claude (intent + tools) -> VibeVoice Realtime TTS -> Patient hears reply
                                          |
                                  Patient records + memory
```

## Step 1: Speech-to-Text with VibeVoice ASR

Patient audio arrives as a file or recording: *"I need to refill my blood pressure medication."* ASR is in Hugging Face Transformers 5.3 and later (the VibeVoice repository itself pins `transformers<5`, so use a separate virtual environment):

```bash
python -m venv .venv-asr && source .venv-asr/bin/activate
pip install "transformers>=5.3.0" accelerate librosa
```

```python
from transformers import AutoProcessor, VibeVoiceAsrForConditionalGeneration

model_id = "microsoft/VibeVoice-ASR-HF"
processor = AutoProcessor.from_pretrained(model_id)
model = VibeVoiceAsrForConditionalGeneration.from_pretrained(model_id, device_map="auto")

def transcribe(path: str) -> str:
    inputs = processor.apply_transcription_request(
        audio=path,
        prompt="Terms: Lisinopril, Metformin, Amlodipine, Atorvastatin, refill, Dr. Patel",  # hotwords
    ).to(model.device, model.dtype)
    output_ids = model.generate(**inputs)
    generated = output_ids[:, inputs["input_ids"].shape[1]:]
    return processor.decode(generated, return_format="transcription_only")[0]
```

`return_format="parsed"` instead returns segments with `Start`, `End`, `Speaker` and `Content`, which tells a patient from a caregiver on a shared call (speaker ids are numbers; you map them to roles). The `prompt` argument is where hotwords and background context go; it noticeably helps with drug and doctor names. The 7B model needs a large GPU (the repository publishes no minimum; plan for 16 GB or more). For live captions use the streaming checkpoint `microsoft/VibeVoice-ASR-Streaming-7B` with `demo/vibevoice_asr_streaming_fastapi_demo.py` from a clone of the repository.

## Step 2: Intent Processing with Claude

The transcript goes to Claude, which decides whether to call one of your tools. The three tools are your own backend; the schemas are what Claude sees:

```python
import anthropic

claude = anthropic.Anthropic()

TOOLS = [
    {"name": "check_medications",
     "description": "Look up the patient's current medications and refill status",
     "input_schema": {"type": "object", "properties": {"patient_id": {"type": "string"}},
                      "required": ["patient_id"]}},
    {"name": "create_refill_request",
     "description": "Submit a refill request to the patient's pharmacy after the patient confirmed it",
     "input_schema": {"type": "object",
                      "properties": {"patient_id": {"type": "string"}, "medication": {"type": "string"}},
                      "required": ["patient_id", "medication"]}},
    {"name": "schedule_appointment",
     "description": "Request an appointment with the patient's doctor",
     "input_schema": {"type": "object",
                      "properties": {"patient_id": {"type": "string"}, "preferred_time": {"type": "string"}},
                      "required": ["patient_id"]}},
]

def handle_turn(patient_id: str, transcript: str, profile_facts: list[str], messages: list[dict]) -> str:
    system = (
        "You are a healthcare voice assistant. Be warm, clear and concise; short sentences, "
        "because the reply is read aloud to an elderly patient. Always confirm an action with the "
        "patient before you execute it. Never give medical advice; for symptoms, tell the patient "
        "to call the clinic or emergency services.\n\nKnown about this patient:\n"
        + "\n".join(f"- {f}" for f in profile_facts)
    )
    messages.append({"role": "user", "content": transcript})
    while True:
        res = claude.messages.create(model="claude-sonnet-5-5", max_tokens=400,
                                     system=system, tools=TOOLS, messages=messages)
        messages.append({"role": "assistant", "content": res.content})
        if res.stop_reason != "tool_use":
            return "".join(b.text for b in res.content if b.type == "text")
        results = []
        for block in res.content:
            if block.type == "tool_use":
                out = run_tool(block.name, block.input)   # your backend; returns a string
                results.append({"type": "tool_result", "tool_use_id": block.id, "content": out})
        messages.append({"role": "user", "content": results})
```

`run_tool` dispatches to your patient database and pharmacy API. Enforce authorization there: the `patient_id` must come from the authenticated call, never from what the model or the caller says.

## Step 3: Text-to-Speech with VibeVoice Realtime

The 0.5B model is served by the demo web app from a clone of the repository. The bundled launcher binds to all interfaces, so start the app with uvicorn directly on loopback instead:

```bash
git clone https://github.com/microsoft/VibeVoice.git && cd VibeVoice
pip install -e .[streamingtts]
cd demo
MODEL_PATH=microsoft/VibeVoice-Realtime-0.5B MODEL_DEVICE=cuda \
  uvicorn web.app:app --host 127.0.0.1 --port 3000
```

The app (`demo/web/app.py`) exposes a WebSocket at `/stream?text=...&voice=...` and answers with raw 16-bit mono PCM chunks at 24 kHz (it serves one request at a time and returns "busy" to a second client). Voice names are the file stems in `demo/voices/streaming_model`, such as `en-Emma_woman` or `en-Carter_man`. Download more with `bash demo/download_experimental_voices.sh`. A client:

```python
import asyncio
from urllib.parse import quote
import websockets

async def synthesize(text: str, voice: str = "en-Emma_woman"):
    url = f"ws://127.0.0.1:3000/stream?text={quote(text)}&voice={voice}"
    async with websockets.connect(url, max_size=None) as ws:
        async for message in ws:
            if isinstance(message, bytes):
                yield message          # PCM16, 24 kHz, mono; send to the patient's audio stream
```

Server log messages arrive as text frames and are skipped here. The model is English-focused and single-speaker, becomes unstable for inputs of three words or fewer, and cannot read code or unusual symbols, so keep replies in plain sentences and normalize drug doses ("ten milligrams") before synthesis. There is no speed or "clarity" setting; the voice is whatever the preset gives. For a slower pace, write shorter sentences. The voices are synthetic: tell patients they are talking to an AI.

## Step 4: Conversation Memory

Store each call under a stable `id` in a per-patient namespace so the next call starts informed (Supermemory SDK v5: namespace first):

```python
from supermemory import Supermemory

memory = Supermemory()  # reads SUPERMEMORY_API_KEY

memory.add(
    "patient_P-1234",
    content="Patient asked for a Lisinopril refill. Request submitted. Prefers morning appointments.",
    id="call_2026-10-28_1430",
    date="2026-10-28T14:30:00Z",
    metadata={"type": "call"},
)

profile = memory.profile("patient_P-1234").profile
facts = [m.memory for m in profile.static + profile.dynamic]   # feed to handle_turn
```

Supermemory is a hosted third-party service. For health data, either confirm in writing that it meets your compliance needs or keep memory in your own database; the skill notes a local mode (`npx supermemory local`) for development.

## Step 5: Daily Reminders

For outbound reminders, a scheduler builds the text from the patient's records and your telephony provider plays the synthesized audio. The reminder text can be generated by Claude with the same `facts` list. Keep reminders factual ("Your appointment with Dr. Patel is on Saturday at 10 AM") and let the patient reply by voice through Steps 1 and 2.

## What to Measure Before Trusting It

Run a supervised pilot with a handful of consenting patients and track: word error rate on drug names with and without hotwords, share of calls that needed a human, refill requests that were wrong, and what patients say about the voice. The pipeline's cost is mostly GPU time (a 7B ASR model plus the 0.5B TTS model) plus the Claude API and telephony; measure it on your own traffic rather than trusting a table.

## Related Skills

- [vibe-voice](/skills/vibe-voice) — VibeVoice ASR, streaming ASR and Realtime TTS
- [anthropic-sdk](/skills/anthropic-sdk) — Claude API with tool use
- [supermemory](/skills/supermemory) — long-term memory per patient
