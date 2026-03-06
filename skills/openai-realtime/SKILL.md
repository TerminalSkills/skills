---
name: openai-realtime
category: AI & Machine Learning
tags: [openai, realtime, voice, websocket, multimodal, conversational-ai]
version: 1.0.0
author: terminal-skills
---

# OpenAI Realtime API — Voice-Native AI Conversations

You are an expert in OpenAI's Realtime API, the WebSocket-based interface for building voice-native AI applications. You help developers create real-time conversational agents that process audio input and generate audio output directly — without separate STT/TTS services — using GPT-4o's native multimodal capabilities with sub-second latency.

## Core Capabilities

### WebSocket Connection

```typescript
// Connect to OpenAI Realtime API
import WebSocket from "ws";

const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
  headers: {
    "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Beta": "realtime=v1",
  },
});

ws.on("open", () => {
  // Configure the session
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      instructions: "You are a helpful customer support agent. Be concise and friendly.",
      voice: "alloy",                       // alloy, echo, fable, onyx, nova, shimmer
      input_audio_format: "pcm16",          // 16-bit PCM, 24kHz
      output_audio_format: "pcm16",
      input_audio_transcription: {
        model: "whisper-1",                  // Auto-transcribe user audio
      },
      turn_detection: {
        type: "server_vad",                  // Server-side voice activity detection
        threshold: 0.5,                      // Sensitivity (0-1)
        prefix_padding_ms: 300,              // Include 300ms before speech starts
        silence_duration_ms: 500,            // 500ms silence = end of turn
      },
      tools: [                               // Function calling during conversation
        {
          type: "function",
          name: "check_order_status",
          description: "Look up a customer's order by order ID",
          parameters: {
            type: "object",
            properties: {
              order_id: { type: "string", description: "The order ID" },
            },
            required: ["order_id"],
          },
        },
      ],
    },
  }));
});

// Handle events from the API
ws.on("message", (data) => {
  const event = JSON.parse(data.toString());

  switch (event.type) {
    case "response.audio.delta":
      // Stream audio chunk to speaker (base64-encoded PCM)
      const audioChunk = Buffer.from(event.delta, "base64");
      playAudio(audioChunk);
      break;

    case "response.audio_transcript.delta":
      // Real-time transcript of AI's response
      process.stdout.write(event.delta);
      break;

    case "conversation.item.input_audio_transcription.completed":
      // What the user said (transcribed)
      console.log(`\nUser: ${event.transcript}`);
      break;

    case "response.function_call_arguments.done":
      // Handle function call
      const result = await handleFunctionCall(event.name, JSON.parse(event.arguments));
      ws.send(JSON.stringify({
        type: "conversation.item.create",
        item: {
          type: "function_call_output",
          call_id: event.call_id,
          output: JSON.stringify(result),
        },
      }));
      ws.send(JSON.stringify({ type: "response.create" }));
      break;

    case "input_audio_buffer.speech_started":
      // User started speaking — interrupt AI if it's talking
      console.log("[User speaking — interrupting AI]");
      break;
  }
});

// Send user audio to the API
function sendAudio(pcmChunk: Buffer) {
  ws.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: pcmChunk.toString("base64"),
  }));
}
```

### React Client with Web Audio

```typescript
// Browser-based voice agent using Realtime API
async function startVoiceSession() {
  // Get microphone access
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const audioContext = new AudioContext({ sampleRate: 24000 });

  // Connect to backend WebSocket (which proxies to OpenAI)
  const ws = new WebSocket(`wss://your-api.com/realtime`);

  // Capture microphone audio and send to API
  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  source.connect(processor);
  processor.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    const float32 = e.inputBuffer.getChannelData(0);
    // Convert Float32 to Int16 PCM
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768));
    }
    ws.send(int16.buffer);
  };
}
```

## Installation

```bash
npm install ws                           # Node.js WebSocket client
pip install openai                       # Python (with realtime support)
# API key: https://platform.openai.com/api-keys
```

## Best Practices

1. **Server VAD over manual** — Use `server_vad` turn detection; OpenAI handles speech detection, endpointing, and interruption — don't build your own
2. **PCM16 at 24kHz** — Use `pcm16` format for lowest latency; MP3/Opus add encoding overhead
3. **Proxy through your server** — Never expose the API key to the browser; proxy WebSocket through your backend
4. **Function calling for actions** — Define tools for database lookups, bookings, and actions; the model calls them mid-conversation naturally
5. **Interruption handling** — The API sends `input_audio_buffer.speech_started` when the user interrupts; stop playing AI audio immediately
6. **Transcription for logging** — Enable `input_audio_transcription` to get text transcripts of both sides; essential for analytics and compliance
7. **Token-based billing** — Audio tokens are more expensive than text; estimate costs at ~$0.06/min input + $0.24/min output
8. **Fallback to text** — If audio quality is poor (bad mic, noise), fall back to text chat; the same session supports both modalities
