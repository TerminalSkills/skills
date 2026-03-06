---
name: openai-realtime
category: AI & Machine Learning
tags: [openai, realtime, voice, websocket, multimodal, conversational-ai]
version: 1.0.0
author: terminal-skills
---

# OpenAI Realtime API — Voice-Native AI Conversations

You are an expert in the OpenAI Realtime API, the WebSocket-based interface for building voice-native AI applications. You help developers build conversational voice agents that process audio input directly (no separate STT step), generate spoken responses with natural intonation, handle interruptions, and use function calling — all in a single streaming connection with sub-second latency.

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
      voice: "alloy",                      // alloy, echo, fable, onyx, nova, shimmer
      instructions: `You are a helpful dental clinic receptionist named Ava.
        Be warm, professional, and concise. Use short sentences appropriate for phone calls.
        If asked about medical advice, say you'll transfer to the dentist.`,
      input_audio_format: "pcm16",         // 16-bit PCM, 24kHz
      output_audio_format: "pcm16",
      input_audio_transcription: {
        model: "whisper-1",                 // Also transcribe for logging
      },
      turn_detection: {
        type: "server_vad",                 // Server-side voice activity detection
        threshold: 0.5,                     // Sensitivity (0-1)
        prefix_padding_ms: 300,             // Include 300ms before speech start
        silence_duration_ms: 500,           // 500ms silence = end of turn
      },
      tools: [                              // Function calling tools
        {
          type: "function",
          name: "check_availability",
          description: "Check available appointment slots",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date in YYYY-MM-DD format" },
              procedure: { type: "string", enum: ["cleaning", "filling", "crown", "consultation"] },
            },
            required: ["date", "procedure"],
          },
        },
        {
          type: "function",
          name: "book_appointment",
          description: "Book an appointment for a patient",
          parameters: {
            type: "object",
            properties: {
              patient_name: { type: "string" },
              phone: { type: "string" },
              date: { type: "string" },
              time: { type: "string" },
              procedure: { type: "string" },
            },
            required: ["patient_name", "date", "time", "procedure"],
          },
        },
      ],
    },
  }));
});

// Handle events from OpenAI
ws.on("message", (data) => {
  const event = JSON.parse(data.toString());

  switch (event.type) {
    case "response.audio.delta":
      // Stream audio chunks to speaker/WebRTC
      const audioChunk = Buffer.from(event.delta, "base64");
      sendToSpeaker(audioChunk);
      break;

    case "response.audio_transcript.delta":
      // Real-time transcript of AI's response
      process.stdout.write(event.delta);
      break;

    case "conversation.item.input_audio_transcription.completed":
      // User's speech transcribed
      console.log(`\nUser said: ${event.transcript}`);
      break;

    case "response.function_call_arguments.done":
      // AI wants to call a function
      handleFunctionCall(event.name, JSON.parse(event.arguments));
      break;

    case "input_audio_buffer.speech_started":
      // User started speaking — interrupt AI if it's talking
      console.log("[User interruption detected]");
      break;
  }
});

// Send microphone audio
function sendAudio(pcmBuffer: Buffer) {
  ws.send(JSON.stringify({
    type: "input_audio_buffer.append",
    audio: pcmBuffer.toString("base64"),
  }));
}

// Handle function calls
async function handleFunctionCall(name: string, args: any) {
  let result: string;

  if (name === "check_availability") {
    const slots = await checkClinicSlots(args.date, args.procedure);
    result = JSON.stringify(slots);
  } else if (name === "book_appointment") {
    const booking = await createAppointment(args);
    result = JSON.stringify(booking);
  }

  // Send function result back — AI will speak the response
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: event.call_id,
      output: result,
    },
  }));

  // Trigger AI to respond with the function result
  ws.send(JSON.stringify({ type: "response.create" }));
}
```

### Python SDK

```python
# Using OpenAI Python SDK
from openai import AsyncOpenAI

client = AsyncOpenAI()

async def run_voice_agent():
    async with client.beta.realtime.connect(
        model="gpt-4o-realtime-preview"
    ) as connection:
        await connection.session.update(session={
            "modalities": ["text", "audio"],
            "voice": "nova",
            "instructions": "You are a helpful assistant.",
            "turn_detection": {"type": "server_vad"},
        })

        # Send audio from microphone
        await connection.input_audio_buffer.append(audio=base64_audio)

        # Process events
        async for event in connection:
            if event.type == "response.audio.delta":
                play_audio(event.delta)
            elif event.type == "response.done":
                print("AI finished speaking")
```

## Key Concepts

- **Audio-native** — The model processes audio directly, understanding tone, emotion, and emphasis (not just text transcription)
- **Server VAD** — OpenAI's server detects when the user starts/stops speaking; no client-side VAD needed
- **Interruptions** — When the user speaks while AI is talking, the response is automatically interrupted
- **Function calling** — Same as Chat Completions function calling, but in real-time during voice conversation

## Best Practices

1. **Server VAD for simplicity** — Use `server_vad` turn detection; OpenAI handles speech detection, silence, and interruptions
2. **PCM16 format** — Use 16-bit PCM at 24kHz for both input and output; minimal encoding overhead
3. **Short instructions** — Keep system instructions concise; the model processes them with every turn
4. **Function calls for actions** — Use tools for bookings, lookups, and transfers; the model speaks the result naturally
5. **Input transcription** — Enable `input_audio_transcription` for logging and analytics; small additional cost
6. **Silence threshold tuning** — 500ms silence_duration for responsive agents; 1000ms for dictation (avoids mid-sentence cuts)
7. **Voice selection** — `nova` for friendly female, `onyx` for authoritative male, `alloy` for neutral; test with your use case
8. **Cost awareness** — Realtime API costs ~$0.06/min input + $0.24/min output audio; use for high-value interactions (sales, support), not bulk processing
