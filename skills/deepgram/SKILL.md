---
name: deepgram
description: >-
  Transcribes and analyzes speech with the Deepgram API: pre-recorded audio, real-time streaming, text-to-speech and voice agents. Use when a user asks to convert speech to text, implement real-time transcription, add speaker labels or summaries to a recording, detect languages, build a voice agent with turn detection, or integrate Deepgram SDKs (JavaScript or Python).
license: Apache-2.0
compatibility: "Deepgram API key (DEEPGRAM_API_KEY); @deepgram/sdk 5.x needs Node.js 18+, deepgram-sdk 7.x needs Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["speech-to-text", "transcription", "realtime", "voice", "audio"]
---
# Deepgram — Speech-to-Text and Voice API

## Overview

Deepgram is a hosted speech platform with four parts: speech-to-text (REST for recorded audio, WebSocket for live audio), text-to-speech (Aura-2), text intelligence (sentiment, topics, summaries, intents) and a Voice Agent API that chains listen, think and speak. It needs an API key from the Deepgram console; there is no offline mode in the SDKs.

Choose the speech-to-text model by the job:

| Model | Use it for |
| --- | --- |
| `nova-3` | General transcription of recordings or live audio: meetings, captions, noisy or multilingual audio. Highest accuracy, no turn detection. Variants: `nova-3-medical`, `nova-3-pharma`. |
| `flux-general-en`, `flux-general-multi` | Voice agents and live conversation: the model itself detects end of turn. Streaming only, on the `/v2/listen` endpoint. `multi` covers English, Spanish, French, German, Hindi, Russian, Portuguese, Japanese, Italian, Dutch. |
| `nova-2` | Languages Nova-3 does not support yet, and filler-word detection. Older, kept for compatibility. |

All models default to `language=en`; pass `language` explicitly (`fr`, `es`, ...), `detect_language=true` for one unknown language, or `language=multi` for code-switching audio on Nova-3.

The SDKs were rewritten: JavaScript `@deepgram/sdk` 5.x (class `DeepgramClient`; the old `createClient` and `LiveTranscriptionEvents` are gone) and Python `deepgram-sdk` 7.x (the old `PrerecordedOptions` and `dg.listen.rest.v("1")` are gone).

## Instructions

### Install and authenticate

```bash
npm install @deepgram/sdk        # Node.js 18+
pip install deepgram-sdk         # Python 3.10+
export DEEPGRAM_API_KEY=...      # read automatically by DeepgramClient()
```

For browsers, never ship the API key: mint a short-lived token on your server (`client.auth.v1.tokens.grant()`) and give the browser that. REST calls from a browser are blocked by CORS; stream over WebSocket directly or proxy REST calls through your server.

### Pre-recorded transcription (Python)

```python
from deepgram import DeepgramClient

client = DeepgramClient()   # uses DEEPGRAM_API_KEY

# From a URL
response = client.listen.v1.media.transcribe_url(
    url="https://cdn.northwind-support.io/calls/2026-09-30-renewal.mp3",
    model="nova-3",
    language="en",
    smart_format=True,    # punctuation, casing, numbers, dates
    diarize=True,         # speaker label per word
    utterances=True,      # speaker turns
    summarize="v2",       # short summary (English only)
)

# From a local file
with open("meeting.wav", "rb") as f:
    response = client.listen.v1.media.transcribe_file(request=f.read(), model="nova-3", smart_format=True)

alt = response.results.channels[0].alternatives[0]
print(alt.transcript, alt.confidence)
for u in response.results.utterances or []:
    print(f"Speaker {u.speaker}: {u.transcript}")
print(response.results.summary.short)
```

The keyword arguments mirror the API's query parameters (`topics`, `intents`, `sentiment`, `paragraphs`, `multichannel`, `keyterm`, `redact`, `callback`, ...). Sentiment, topics, intents and summaries work for English only. For large files pass `callback="https://hooks.northwind-support.io/deepgram"` and Deepgram POSTs the result when it is done instead of holding the request open.

### Pre-recorded transcription (JavaScript)

```typescript
import { createReadStream } from "node:fs";
import { DeepgramClient } from "@deepgram/sdk";

const client = new DeepgramClient();
const response = await client.listen.v1.media.transcribeFile(createReadStream("meeting.wav"), {
  model: "nova-3",
  smart_format: true,
  diarize: true,
});
if ("results" in response) {
  console.log(response.results.channels?.[0]?.alternatives?.[0]?.transcript);
}
```

`transcribeUrl({ url, model: "nova-3" })` transcribes a hosted file. A callback request returns an acknowledgement without `results`, hence the `in` check.

### Live streaming transcription (JavaScript, Nova-3)

Boolean and numeric options are passed as strings for `listen.v1.connect` (as in the SDK's own examples). Raw audio needs `encoding` and `sample_rate`; omit both for containerized audio such as WAV or Ogg.

```typescript
import { DeepgramClient } from "@deepgram/sdk";

const client = new DeepgramClient();

export async function transcribeLive(audio: AsyncIterable<Buffer>) {
  const connection = await client.listen.v1.connect({
    model: "nova-3",
    language: "en",
    encoding: "linear16",       // raw 16-bit PCM
    sample_rate: 16000,
    smart_format: "true",
    interim_results: "true",    // partial transcripts while the user speaks
    utterance_end_ms: "1000",   // UtteranceEnd after 1 s of silence (needs interim_results)
    vad_events: "true",
    endpointing: 300,           // ms of silence before a result is finalized
  });

  connection.on("message", (msg) => {
    if (msg.type === "Results") {
      const text = msg.channel.alternatives[0].transcript;
      if (text) console.log(msg.is_final ? "[final]" : "[interim]", text);
    } else if (msg.type === "UtteranceEnd") {
      console.log("speaker stopped");
    }
  });

  connection.connect();
  await connection.waitForOpen();
  for await (const chunk of audio) connection.sendMedia(chunk);
  connection.sendCloseStream({ type: "CloseStream" });
}
```

During silence send `{ "type": "KeepAlive" }` as a **text** frame every 3 to 5 seconds; with no audio or KeepAlive for 10 seconds Deepgram closes the socket with error `NET-0001`.

### Conversational turn detection with Flux (Python)

```python
from deepgram import DeepgramClient
from deepgram.core.events import EventType

client = DeepgramClient()
with client.listen.v2.connect(
    model="flux-general-en",
    encoding="linear16",
    sample_rate=16000,
    eot_threshold=0.7,            # confidence needed for EndOfTurn (0.5-1.0)
    eager_eot_threshold=0.5,      # optional: EagerEndOfTurn for early LLM drafts
) as connection:
    connection.on(EventType.MESSAGE, lambda m: print(m.type, getattr(m, "transcript", "")))
    connection.start_listening()
```

Flux only works on `/v2/listen` (the SDK's `listen.v2` does this). Send audio in about 80 ms chunks. Do not pass `language`; pick `flux-general-multi` and `language_hint` for other languages. `eager_eot_threshold` speeds up replies but can raise LLM calls by 50 to 70 percent because drafts are cancelled when the user keeps talking (`TurnResumed`).

### Text-to-speech (Aura-2)

```python
response = client.speak.v1.audio.generate(
    text="Thanks for calling Northwind. How can I help you today?",
    model="aura-2-thalia-en",
    encoding="linear16",
    container="wav",
)
with open("greeting.wav", "wb") as out:
    for chunk in response:
        out.write(chunk)
```

Voices are named `aura-2-<name>-<language>` (for example `aura-2-asteria-en`, `aura-2-javier-es`, `aura-2-agathe-fr`); the first-generation `aura-<name>-en` voices still work. In JavaScript the same call is `client.speak.v1.audio.generate({ text, model, encoding, container })`.

## Examples

### Example 1: Transcribe a support call with speaker labels

User request: "Transcribe call.mp3 and tell me who said what."

```python
from deepgram import DeepgramClient

client = DeepgramClient()
with open("call.mp3", "rb") as f:
    r = client.listen.v1.media.transcribe_file(request=f.read(), model="nova-3", smart_format=True, diarize=True, utterances=True)
for u in r.results.utterances or []:
    print(f"[{u.start:6.1f}s] Speaker {u.speaker}: {u.transcript}")
```

Result: one line per speaker turn, for example `[   0.4s] Speaker 0: Thanks for calling Northwind, this is Dana.` and `[   3.1s] Speaker 1: Hi, I want to renew my plan.` If each speaker is on a separate stereo channel (typical phone recordings), use `multichannel=True` instead of `diarize`; it is more accurate.

### Example 2: Live captions from a microphone stream

User request: "Show live captions while I speak into the mic, and tell me when I stop."

Use the JavaScript streaming example above with `interim_results: "true"` and `utterance_end_ms: "1000"`. Feed it 16 kHz mono 16-bit PCM from your capture library.

Result: lines like `[interim] book a table for` update as you speak, then `[final] Book a table for four at 7 p.m.` when a pause is detected, and `speaker stopped` about a second after the last word.

## Guidelines

- Use `nova-3` for transcription and Flux when you are building a voice agent that must know when the user finished; do not use Flux for recordings.
- Match audio settings: wrong `encoding` or `sample_rate` for raw audio returns garbage or an error. Prefer 16 kHz mono PCM for speech.
- Keep the API key in an environment variable or secret store; never in front-end code, a repository or a URL. Use scoped temporary tokens for browsers.
- Streaming needs interim results for `utterance_end_ms`. `endpointing` defaults to 10 ms, which finalizes very eagerly; use 300 to 500 ms for agents and about 1000 ms for dictation.
- Use `diarize` for single-channel audio with several speakers and `multichannel` when speakers are on separate channels; combining them on one file is rarely needed.
- Pre-recorded requests are limited in size and processing time; use `callback` for long files and handle HTTP 429 with backoff.
- Audio and transcripts can contain personal data: use `redact` for card numbers or PII where required and check retention settings (`mip_opt_out` controls use of your data for model improvement).
- Do not pick Deepgram when audio must never leave your machine unless you run Deepgram's self-hosted option; for offline use consider a local Whisper model instead.
