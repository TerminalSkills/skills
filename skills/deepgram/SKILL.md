---
name: deepgram
category: AI & Machine Learning
tags: [speech-to-text, transcription, realtime, voice, audio, streaming]
version: 1.0.0
author: terminal-skills
---

# Deepgram — Real-Time Speech-to-Text API

You are an expert in Deepgram, the speech-to-text platform optimized for real-time transcription. You help developers build live transcription systems, voice agents, call analytics, and meeting summarization using Deepgram's Nova-2 model with streaming WebSocket connections, speaker diarization, and smart formatting.

## Core Capabilities

### Streaming Transcription (Real-Time)

```typescript
// Real-time transcription via WebSocket
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function transcribeLive(audioStream: ReadableStream) {
  const connection = deepgram.listen.live({
    model: "nova-2",                    // Fastest, most accurate model
    language: "en",
    smart_format: true,                 // Auto-punctuation, casing, numbers
    interim_results: true,              // Get partial results as user speaks
    utterance_end_ms: 1000,             // 1s silence = end of utterance
    vad_events: true,                   // Voice activity detection
    diarize: true,                      // Speaker identification
    endpointing: 500,                   // 500ms endpointing for responsiveness
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel.alternatives[0];
    if (transcript.transcript) {
      if (data.is_final) {
        console.log(`[Final] Speaker ${data.channel.alternatives[0].words?.[0]?.speaker}: ${transcript.transcript}`);
        // Send to LLM for response generation
      } else {
        console.log(`[Interim] ${transcript.transcript}`);
        // Show real-time text as user speaks
      }
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    console.log("[Utterance complete — user stopped speaking]");
  });

  // Pipe audio to Deepgram (16kHz, 16-bit PCM or any supported format)
  for await (const chunk of audioStream) {
    connection.send(chunk);
  }
}
```

### Pre-Recorded Transcription

```python
# Batch transcription for recorded audio/video
from deepgram import DeepgramClient, PrerecordedOptions

dg = DeepgramClient(os.environ["DEEPGRAM_API_KEY"])

options = PrerecordedOptions(
    model="nova-2",
    smart_format=True,
    diarize=True,                       # Identify speakers
    summarize="v2",                     # Auto-generate summary
    topics=True,                        # Extract topics
    intents=True,                       # Detect intent (question, command, statement)
    sentiment=True,                     # Sentiment per utterance
    paragraphs=True,                    # Auto-paragraph formatting
    utterances=True,                    # Split by speaker turns
)

# From URL
response = dg.listen.rest.v("1").transcribe_url(
    {"url": "https://example.com/meeting.mp3"}, options
)

# From file
with open("recording.wav", "rb") as f:
    response = dg.listen.rest.v("1").transcribe_file(
        {"buffer": f.read(), "mimetype": "audio/wav"}, options
    )

# Access results
transcript = response.results.channels[0].alternatives[0]
print(f"Transcript: {transcript.transcript}")
print(f"Confidence: {transcript.confidence}")
print(f"Summary: {response.results.summary.short}")
for utterance in response.results.utterances:
    print(f"Speaker {utterance.speaker}: {utterance.transcript}")
```

### Text-to-Speech (Aura)

```python
# Deepgram Aura TTS — low-latency voice synthesis
response = dg.speak.rest.v("1").stream_raw(
    {"text": "Thanks for calling. How can I help you today?"},
    options={
        "model": "aura-asteria-en",     # Female, warm tone
        "encoding": "linear16",          # 16-bit PCM
        "sample_rate": 24000,
    },
)

# Stream audio chunks to speaker/WebRTC
for chunk in response.iter_bytes():
    audio_output.write(chunk)
```

## Installation

```bash
npm install @deepgram/sdk                # Node.js
pip install deepgram-sdk                  # Python
```

## Best Practices

1. **Nova-2 for everything** — Nova-2 is Deepgram's best model for accuracy and speed; use it unless you need a specific language model
2. **Streaming for real-time** — Use WebSocket connections for live audio; batch API for pre-recorded files
3. **Endpointing tuning** — Set `endpointing` to 300-500ms for voice agents (responsive) or 1000ms for transcription (accurate)
4. **Smart formatting** — Always enable `smart_format` for proper capitalization, punctuation, and number formatting
5. **Diarization for meetings** — Enable `diarize` when multiple speakers are present; Deepgram identifies up to 10 speakers
6. **Interim results for UX** — Enable `interim_results` for real-time text display; show partial transcripts as users speak
7. **Multichannel for calls** — Use `multichannel: true` for phone calls where each speaker is on a separate audio channel
8. **Callback for async** — Use `callback_url` for large file transcription; Deepgram POSTs results when done
