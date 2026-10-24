---
name: openai-realtime
description: >-
  Build voice agents with the OpenAI Realtime API, the speech-to-speech
  interface for low-latency spoken conversations. Use when a user asks to
  implement real-time voice chat, stream microphone audio over WebSocket or
  WebRTC, build a phone or browser voice assistant, handle interruptions and
  push-to-talk, add function calling to a voice agent, or migrate from the beta
  Realtime API and gpt-4o-realtime-preview.
license: Apache-2.0
compatibility: "Node.js 22+ or Python 3.10+, OPENAI_API_KEY"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/openai/openai-node
  tags: ["openai", "realtime", "voice", "websocket", "webrtc"]
---
# OpenAI Realtime API

## Overview

The Realtime API lets a model take audio in and speak audio back over one stateful connection, with server-side turn detection, interruption handling and tool calling. The current generation model is `gpt-realtime-2.1` (`gpt-realtime-2.1-mini` for lower cost). The beta interface is gone from the docs: do not send the `OpenAI-Beta: realtime=v1` header, and do not use `gpt-4o-realtime-preview`, `gpt-realtime` or `gpt-realtime-mini` snapshots (shutdown 2027-01-20 per https://developers.openai.com/api/docs/deprecations).

Pick the transport first:

- Browser or mobile client: **WebRTC**. The server mints an ephemeral key (`POST /v1/realtime/client_secrets`) or proxies the SDP offer (`POST /v1/realtime/calls`); the API key never reaches the client.
- Server to server (phone gateway, batch, tests): **WebSocket** at `wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1`. You send and play Base64 PCM audio yourself.
- Fastest start in a browser: the Agents SDK, `RealtimeAgent` and `RealtimeSession` from `@openai/agents/realtime`.

OpenAI also has a newer product, GPT-Live (`wss://api.openai.com/v1/live/sessions`, model `gpt-live-1`), with a different `session.start` protocol. This skill covers the Realtime API only.

## Instructions

### Step 1: Connect from a server with WebSocket

```bash
npm install ws          # Node.js 22+
export OPENAI_API_KEY="sk-proj-..."
```

```typescript
import WebSocket from "ws";

const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Safety-Identifier": "usr_8f3a9c",   // stable hashed end-user ID, recommended
  },
});

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      type: "realtime",                         // required in the GA interface
      output_modalities: ["audio"],
      instructions:
        "You are Ava, the receptionist at Lakeside Dental. Be warm, use short sentences, " +
        "and transfer medical-advice questions to the dentist.",
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },        // 16-bit mono PCM, 24 kHz
          transcription: { model: "gpt-transcribe" },        // optional, for logs
          turn_detection: { type: "semantic_vad" },          // or server_vad
        },
        output: {
          format: { type: "audio/pcm", rate: 24000 },
          voice: "marin",
        },
      },
      tools: [{
        type: "function",
        name: "check_availability",
        description: "List open appointment slots for a procedure on a date",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "YYYY-MM-DD" },
            procedure: { type: "string", enum: ["cleaning", "filling", "crown", "consultation"] },
          },
          required: ["date", "procedure"],
        },
      }],
      tool_choice: "auto",
    },
  }));
});
```

The voice cannot change after the model has produced audio once in a session. Built-in voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`, `marin`, `cedar`; the docs recommend `marin` or `cedar`. A session lasts at most 60 minutes.

### Step 2: Handle server events

GA event names use `output_audio`, not `audio`.

```typescript
ws.on("message", (data) => {
  const event = JSON.parse(data.toString());

  switch (event.type) {
    case "response.output_audio.delta":              // Base64 PCM chunk to play
      playPcm(Buffer.from(event.delta, "base64"));
      break;
    case "response.output_audio_transcript.delta":   // what the model is saying
      process.stdout.write(event.delta);
      break;
    case "conversation.item.input_audio_transcription.completed":
      console.log(`\nCaller: ${event.transcript}`);
      break;
    case "input_audio_buffer.speech_started":       // caller barged in
      stopPlayback();                                 // see truncation below
      break;
    case "response.done":                            // tool calls arrive in response.output
      for (const item of event.response.output) {
        if (item.type === "function_call") void runTool(item);
      }
      break;
    case "error":
      console.error(event.error);
      break;
  }
});

function sendMicChunk(pcm: Buffer) {                 // continuous when VAD is on
  ws.send(JSON.stringify({ type: "input_audio_buffer.append", audio: pcm.toString("base64") }));
}

async function runTool(item: { name: string; arguments: string; call_id: string }) {
  const args = JSON.parse(item.arguments);
  const result = item.name === "check_availability"
    ? await findSlots(args.date, args.procedure)     // your code
    : { error: `unknown tool ${item.name}` };
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) },
  }));
  ws.send(JSON.stringify({ type: "response.create" }));   // make the model speak the result
}
```

### Step 3: Python SDK

```bash
pip install "openai[realtime]"
```

```python
import asyncio
from openai import AsyncOpenAI

async def main() -> None:
    client = AsyncOpenAI()
    async with client.realtime.connect(model="gpt-realtime-2.1") as connection:
        await connection.session.update(session={
            "type": "realtime",
            "output_modalities": ["audio"],
            "instructions": "You are a concise support agent for Lakeside Dental.",
            "audio": {"output": {"voice": "marin"}},
        })
        await connection.conversation.item.create(item={
            "type": "message", "role": "user",
            "content": [{"type": "input_text", "text": "What are your opening hours?"}],
        })
        await connection.response.create()

        async for event in connection:
            if event.type == "response.output_audio_transcript.delta":
                print(event.delta, end="", flush=True)
            elif event.type == "response.done":
                break

asyncio.run(main())
```

Use `connection.input_audio_buffer.append(audio=base64_pcm)` to stream microphone audio.

### Step 4: Browser with WebRTC

Your server mints a short-lived key; the browser uses it (the Agents SDK does the peer-connection work for you).

```typescript
// server: GET /token
const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    session: { type: "realtime", model: "gpt-realtime-2.1", audio: { output: { voice: "marin" } } },
  }),
});
res.json(await r.json());   // contains the ephemeral key (starts with ek_)
```

```typescript
// browser: npm install @openai/agents
import { RealtimeAgent, RealtimeSession } from "@openai/agents/realtime";

const agent = new RealtimeAgent({ name: "Ava", instructions: "Answer calls for Lakeside Dental." });
const session = new RealtimeSession(agent, { model: "gpt-realtime-2.1" });
const { value } = await (await fetch("/token")).json();   // ephemeral key from the response
await session.connect({ apiKey: value });
```

The alternative "unified" flow posts the browser's SDP offer to your server, which forwards it with `sdp` and `session` form fields to `POST /v1/realtime/calls`.

### Step 5: Turn detection, interruptions, push-to-talk

- `turn_detection` lives at `session.audio.input.turn_detection`. `server_vad` takes `threshold`, `prefix_padding_ms`, `silence_duration_ms`; `semantic_vad` takes `eagerness` (`low`, `medium`, `high`, `auto`). Both accept `create_response` and `interrupt_response`.
- Push-to-talk: set `turn_detection: null`, then per turn send `input_audio_buffer.append`, `input_audio_buffer.commit`, `response.create`; send `input_audio_buffer.clear` before a new input and `response.cancel` to stop a running response.
- Over WebSocket you play the audio, so on `input_audio_buffer.speech_started` stop playback and send `conversation.item.truncate` with the `item_id` of the model's last item and `audio_end_ms` actually played. WebRTC and SIP truncate on the server.

## Examples

### Example 1: Phone receptionist for a dental clinic

**User prompt:** "Build a voice agent that answers our clinic line, checks open slots and books appointments."

The agent opens a server-side WebSocket (a SIP or telephony gateway supplies the audio), sends the Step 1 `session.update` with `check_availability` and `book_appointment` tools, converts the gateway's audio to 24 kHz PCM16 (or sets `audio/pcmu` for G.711 lines), and runs the Step 2 tool loop. Result: the caller says "Can I get a cleaning next Tuesday?", the console logs one `check_availability` call, and Ava reads out the open times.

### Example 2: Voice assistant in a web app

**User prompt:** "Add a talk-to-the-assistant button to our dashboard, no server audio handling."

The agent adds a `/token` route that calls `client_secrets`, a button that creates a `RealtimeSession` and connects with the ephemeral key, and tool functions attached to the `RealtimeAgent`. The browser captures the microphone and plays the reply; the long-lived API key stays on the server.

## Guidelines

- Never expose `OPENAI_API_KEY` in a browser or mobile app. Use ephemeral keys from `client_secrets`; they are short-lived.
- Always set `session.type: "realtime"` in `session.update`. Beta-era fields (`modalities`, `input_audio_format`, `input_audio_transcription` at top level, `turn_detection` at top level) and events (`response.audio.delta`, `response.audio_transcript.delta`) belong to the old interface.
- Audio is 16-bit mono PCM at 24 kHz unless you set `audio/pcmu` or `audio/pcma`. A wrong sample rate sounds like chipmunk or slow-motion speech.
- Input transcription is guidance, not what the model heard; do not use it as the legal record of a call.
- Keep instructions short; they are processed on every turn. Put long policies in tools or retrieval.
- Do not put secrets or customer data into instructions that a tool result or caller could talk the model into repeating.
- `whisper-1` and the `gpt-4o-*-transcribe` models are deprecated (2027-02-26); use `gpt-transcribe`, or `gpt-live-transcribe` for live transcription-only sessions.
- Send a safety identifier (`OpenAI-Safety-Identifier` header) when you serve individual end users.
- For recorded audio use file transcription, not a Realtime session; for text chat use the Responses API (the `openai-sdk` skill).
