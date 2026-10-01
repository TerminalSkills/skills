---
name: assemblyai
description: >-
  AssemblyAI is a hosted speech-to-text API that transcribes audio and video
  files or live streams and adds speaker labels, sentiment, entity detection,
  PII redaction and LLM analysis of the transcript. Use when a user asks to
  transcribe a recording, label who said what, analyze call sentiment, redact
  personal data, stream live transcription, or summarize and question a
  transcript with LLM Gateway (the replacement for LeMUR).
license: Apache-2.0
compatibility: "Python 3.8+ (pip install assemblyai, SDK 1.x) or Node.js 18+ (npm install assemblyai). Requires an AssemblyAI API key."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["assemblyai", "transcription", "speech-recognition", "audio-ai", "diarization"]
  use-cases:
    - "Transcribe a podcast episode with speaker labels and generate show notes"
    - "Run sentiment analysis on customer support call recordings"
    - "Extract key insights and action items from meeting recordings using LLM Gateway"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AssemblyAI

## Overview

AssemblyAI turns audio and video into text over a REST API and a streaming WebSocket, with official Python and Node.js SDKs. The pieces you combine:

- **Pre-recorded transcription**: submit a URL or file, the SDK polls until the job is `completed` or `error`. Models are chosen with `speech_models` (default `["universal-3-5-pro", "universal-2"]`, an ordered fallback list).
- **Speech Understanding and Guardrails**: options on the same request — speaker labels, sentiment, entities, key phrases, topics, content moderation, PII redaction.
- **LLM Gateway**: an OpenAI-style chat completions endpoint for summaries, chapters and questions about a transcript. It replaces LeMUR, which was shut down on 2026-03-31.
- **Real-time STT**: a WebSocket session (`/v3/ws`) that returns `Turn` events while audio is being spoken.

This skill targets Python SDK 1.x (1.6.1 at the time of writing). Version 1.0 removed every `aai.Lemur*` class and the microphone helper in `assemblyai.extras`; the old `aai.RealtimeTranscriber` (streaming v2) is gone as well.

## Instructions

### Step 1: Install and authenticate

```bash
pip install -U assemblyai
read -rs ASSEMBLYAI_API_KEY && export ASSEMBLYAI_API_KEY   # paste the key from the dashboard
```

```python
import os
import assemblyai as aai

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
# EU data residency: aai.settings.base_url = "https://api.eu.assemblyai.com"
```

### Step 2: Transcribe a file or URL

```python
config = aai.TranscriptionConfig(speech_models=["universal-3-5-pro", "universal-2"])
transcriber = aai.Transcriber(config=config)

# A public URL, a local path, a pathlib.Path, bytes or an open binary file all work.
transcript = transcriber.transcribe("https://assembly.ai/wildfires.mp3", poll_timeout=600)

if transcript.status == aai.TranscriptStatus.error:
    raise RuntimeError(f"Transcription failed: {transcript.error}")

print(transcript.id)
print(transcript.text[:300])
```

A failed job is **returned, not raised** — always check `status` before reading `text`. `poll_timeout` (seconds) raises `aai.TranscriptError` if the job is still running; fetch it later with `aai.Transcript.get_by_id(transcript_id)`. Use `transcriber.submit(...)` plus `webhook_url=` in the config to skip polling.

### Step 3: Speaker labels and Speech Understanding

```python
config = aai.TranscriptionConfig(
    speech_models=["universal-3-5-pro", "universal-2"],
    speaker_labels=True,        # who said what -> transcript.utterances
    sentiment_analysis=True,    # POSITIVE / NEUTRAL / NEGATIVE per sentence
    entity_detection=True,      # people, places, organizations
    auto_highlights=True,       # key phrases
    iab_categories=True,        # topics -> transcript.iab_categories.summary
    content_safety=True,        # content moderation
    language_detection=True,
)
t = aai.Transcriber().transcribe("https://assembly.ai/wildfires.mp3", config)
if t.status == aai.TranscriptStatus.error:
    raise RuntimeError(t.error)

for utt in t.utterances:
    print(f"[{utt.start // 1000:>5}s] Speaker {utt.speaker}: {utt.text}")

for s in t.sentiment_analysis[:5]:
    print(s.sentiment.value, s.speaker, s.text[:80])

for entity in t.entities:
    print(entity.entity_type.value, entity.text)

for phrase in t.auto_highlights.results[:10]:
    print(phrase.rank, phrase.count, phrase.text)

for result in t.content_safety.results:
    for label in result.labels:
        print(label.label.value, f"{label.confidence:.2f}", result.text[:60])
```

If you know the number of speakers, pass `speakers_expected=2`; otherwise leave it out. Timestamps (`start`, `end`) are milliseconds.

### Step 4: Redact personal data

```python
config = aai.TranscriptionConfig(speaker_labels=True).set_redact_pii(
    policies=[
        aai.PIIRedactionPolicy.person_name,
        aai.PIIRedactionPolicy.phone_number,
        aai.PIIRedactionPolicy.email_address,
        aai.PIIRedactionPolicy.credit_card_number,
    ],
    substitution=aai.PIISubstitutionPolicy.entity_name,   # "[PERSON_NAME]" instead of "####"
    redact_audio=True,                                    # also produce a beeped audio file
)
t = aai.Transcriber().transcribe("./calls/support-2026-09-14.mp3", config)
print(t.text)
print(t.get_redacted_audio_url())    # link is valid for 24 hours
```

### Step 5: Summaries, chapters and questions with LLM Gateway

The transcript parameters `auto_chapters`, `summarization`, `summary_model` and `summary_type` are deprecated. Send the transcript to LLM Gateway instead. The literal tag `{{ transcript }}` is replaced server-side with the text of `transcript_id`:

```python
gateway = aai.LLMGateway()

completion = gateway.chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{
        "role": "user",
        "content": "List the decisions and action items from this meeting, "
                   "one bullet each, with the owner's name.\n\n{{ transcript }}",
    }],
    transcript_id=transcript.id,
    max_tokens=1000,
)
print(completion.choices[0].message.content)

for model in gateway.models.list().data:    # exact, current model ids
    print(model.id)
```

Model ids are exact strings (`claude-sonnet-4-6`, `gpt-5-mini`, `gemini-2.5-flash`); list them rather than guessing. Without the SDK, POST the same JSON to `https://llm-gateway.assemblyai.com/v1/chat/completions` with the header `Authorization: $ASSEMBLYAI_API_KEY` (no `Bearer`). Errors raise `aai.LLMGatewayError` with `.status_code` and `.request_id`.

### Step 6: Real-time transcription

The SDK no longer captures the microphone; read 16-bit mono PCM yourself and pass the chunks to `stream()`. This example uses `pip install pyaudio`, which compiles against PortAudio on Linux and macOS: install `portaudio19-dev` (Debian/Ubuntu) or `brew install portaudio` first.

```python
import os
import pyaudio
from assemblyai.streaming.v3 import (
    RealTimeError, RealTimeEvents, RealTimeParameters, RealTimeTranscriber,
    TerminationEvent, TurnEvent,
)

RATE, FRAMES = 16_000, 1_600      # 100 ms chunks; the API accepts 50-1000 ms

def microphone():
    audio = pyaudio.PyAudio()
    mic = audio.open(format=pyaudio.paInt16, channels=1, rate=RATE,
                     input=True, frames_per_buffer=FRAMES)
    try:
        while True:
            yield mic.read(FRAMES, exception_on_overflow=False)
    finally:
        mic.stop_stream(); mic.close(); audio.terminate()

def on_turn(client, event: TurnEvent):
    if event.end_of_turn:
        print(f"[final] {event.transcript}")
    else:
        print(f"\r{event.transcript}", end="")

def on_terminated(client, event: TerminationEvent):
    print(f"\nSession closed after {event.audio_duration_seconds}s of audio")

def on_error(client, error: RealTimeError):
    print(f"Streaming error {error.code}: {error}")

client = RealTimeTranscriber(api_key=os.environ["ASSEMBLYAI_API_KEY"])
client.on(RealTimeEvents.Turn, on_turn)
client.on(RealTimeEvents.Termination, on_terminated)
client.on(RealTimeEvents.Error, on_error)
client.connect(RealTimeParameters(sample_rate=RATE, speech_model="universal-3-6-pro"))
try:
    client.stream(microphone())   # Ctrl+C to stop
except KeyboardInterrupt:
    pass
finally:
    client.disconnect(terminate=True)
```

Streaming models: `universal-3-6-pro` (default), `universal-3-5-pro`, `universal-streaming-english`, `universal-streaming-multilingual`. The former `StreamingClient`/`StreamingParameters`/`StreamingEvents` names still import as aliases of the `RealTime*` classes.

### Feature reference

| Feature | Config | Read the result from |
|---------|--------|----------------------|
| Speaker labels | `speaker_labels=True` | `transcript.utterances` |
| Sentiment analysis | `sentiment_analysis=True` | `transcript.sentiment_analysis` |
| Entity detection | `entity_detection=True` | `transcript.entities` |
| Key phrases | `auto_highlights=True` | `transcript.auto_highlights.results` |
| Topic detection | `iab_categories=True` | `transcript.iab_categories` |
| Content moderation | `content_safety=True` | `transcript.content_safety` |
| Language detection | `language_detection=True` | `transcript.language_code` |
| PII redaction | `.set_redact_pii(policies=[...])` | `transcript.text`, `get_redacted_audio_url()` |
| Domain vocabulary | `keyterms_prompt=["Kubernetes", "Grafana"]` | better spelling in `text` |
| Subtitles | — | `transcript.export_subtitles_srt()`, `export_subtitles_vtt()` |
| Chapters, summaries, Q&A | LLM Gateway (Step 5) | `completion.choices[0].message.content` |

## Examples

### Example 1: Podcast episode to speaker-labeled transcript and show notes

**User prompt:** "Transcribe episode 42 of our podcast with speaker labels and write show notes with the key takeaways."

```python
import os
import assemblyai as aai

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

config = aai.TranscriptionConfig(speaker_labels=True, speakers_expected=2)
episode = aai.Transcriber().transcribe("./episodes/ep42-observability.mp3", config, poll_timeout=1800)
if episode.status == aai.TranscriptStatus.error:
    raise RuntimeError(episode.error)

with open("ep42-transcript.txt", "w") as out:
    for utt in episode.utterances:
        out.write(f"Speaker {utt.speaker}: {utt.text}\n\n")
with open("ep42.srt", "w") as out:
    out.write(episode.export_subtitles_srt())

notes = aai.LLMGateway().chat.completions.create(
    model="claude-sonnet-4-6",
    messages=[{"role": "user", "content":
        "Write podcast show notes in Markdown: a one-paragraph summary, five key "
        "takeaways as bullets, and the tools mentioned.\n\n{{ transcript }}"}],
    transcript_id=episode.id,
    max_tokens=1500,
)
print(notes.choices[0].message.content)
```

Result: `ep42-transcript.txt` with turns labeled `Speaker A:` and `Speaker B:`, an `ep42.srt` subtitle file, and Markdown show notes printed to the terminal.

### Example 2: Sentiment report for a support call with personal data removed

**User prompt:** "Analyze yesterday's support call: who was negative and when? Customer names and card numbers must not appear in the output."

```python
import os
from collections import Counter
import assemblyai as aai

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

config = aai.TranscriptionConfig(
    speaker_labels=True, speakers_expected=2, sentiment_analysis=True,
).set_redact_pii(
    policies=[aai.PIIRedactionPolicy.person_name, aai.PIIRedactionPolicy.credit_card_number],
    substitution=aai.PIISubstitutionPolicy.entity_name,
)
call = aai.Transcriber().transcribe("./calls/support-2026-09-30-1412.wav", config)
if call.status == aai.TranscriptStatus.error:
    raise RuntimeError(call.error)

totals = Counter((s.speaker, s.sentiment.value) for s in call.sentiment_analysis)
for (speaker, sentiment), count in sorted(totals.items()):
    print(f"Speaker {speaker}: {sentiment} x{count}")

for s in call.sentiment_analysis:
    if s.sentiment == aai.SentimentType.negative:
        print(f"{s.start // 60000:02d}:{s.start // 1000 % 60:02d} Speaker {s.speaker}: {s.text}")
```

Result: a per-speaker count such as `Speaker B: NEGATIVE x7`, followed by each negative sentence with its timestamp, where every name reads `[PERSON_NAME]` and card numbers are replaced the same way.

## Guidelines

- **Do not write LeMUR code.** The LeMUR API was shut down on 2026-03-31 and SDK 1.0 removed `transcript.lemur.*`, `aai.Lemur` and `aai.LemurModel`. Use LLM Gateway.
- **Do not use `aai.RealtimeTranscriber`** or `wss://api.assemblyai.com/v2/realtime/ws`; that is streaming v2. Use `assemblyai.streaming.v3`.
- **Streaming is billed for the time the session is open**, not for audio sent. Always call `disconnect(terminate=True)`; an abandoned session runs until the 3-hour cap.
- **Keep the API key on the server.** For browsers and mobile apps, mint a short-lived token with `RealTimeTranscriber(api_key=...).create_temporary_token(expires_in_seconds=60)` and send only the token.
- **REST authentication is the raw key** in the `Authorization` header, without a `Bearer` prefix.
- **Limits:** up to 5 GB and 10 hours per file (2.2 GB for a local upload); redacted audio needs a source file under 1 GB. Free accounts run 5 transcription jobs in parallel, paid accounts 200 or more; extra jobs are queued, not rejected.
- **Cost:** new accounts get $50 of free credit for transcription features; LLM Gateway usage is not covered by it and is billed per token.
- **Audio leaves your machine.** For recordings that may not be sent to a third party, use a local model instead, and use `set_redact_pii` when transcripts are stored or shared.
- **Parameters change between models.** Check a flag against https://www.assemblyai.com/docs/llms.txt before relying on it — for example `prompt` and `keyterms_prompt` behave differently on Universal-3.5 Pro and Universal-2.
