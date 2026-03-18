---
name: openai-realtime-api
description: >-
  Build real-time voice and audio AI applications using OpenAI Realtime API. Use when: building
  voice AI agents, real-time speech-to-speech apps, voice assistants with WebSocket or WebRTC.
license: Apache-2.0
compatibility: "Node.js 18+ or browser (WebRTC)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [openai, realtime, voice, audio, websocket, webrtc, speech]
  use-cases:
    - "Build a real-time voice assistant for customer support"
    - "Create speech-to-speech AI with live tool calling"
    - "Add voice interface to an existing chatbot"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenAI Realtime API

## Overview

Low-latency multi-modal conversations with GPT-4o — audio in/out, text, tool calling over a single persistent WebSocket or WebRTC connection.

## Transport Options

- **WebSocket** — server-side Node.js, full control
- **WebRTC** — browser-native, peer-to-peer, lower latency

## WebSocket Setup

Install: `npm install ws`

```typescript
const ws = new WebSocket(
  "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview",
  {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "OpenAI-Beta": "realtime=v1",
    },
  }
);

ws.on("open", () => {
  ws.send(JSON.stringify({
    type: "session.update",
    session: {
      modalities: ["text", "audio"],
      voice: "alloy",
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      turn_detection: { type: "server_vad", silence_duration_ms: 800 },
    },
  }));
});
```

## Key Events

```typescript
ws.on("message", (data) => {
  const event = JSON.parse(data.toString());
  switch (event.type) {
    case "response.audio.delta":
      playAudioChunk(Buffer.from(event.delta, "base64"));
      break;
    case "response.audio_transcript.delta":
      process.stdout.write(event.delta);
      break;
    case "response.function_call_arguments.done":
      handleToolCall(event.name, JSON.parse(event.arguments));
      break;
  }
});
```

## Send Audio

```typescript
// Audio must be PCM16, 24kHz mono
ws.send(JSON.stringify({
  type: "input_audio_buffer.append",
  audio: audioBuffer.toString("base64"),
}));
ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
ws.send(JSON.stringify({ type: "response.create" }));
```

## Tool Calling

```typescript
// In session.update
tools: [{
  type: "function",
  name: "get_order",
  description: "Look up order status",
  parameters: {
    type: "object",
    properties: { order_id: { type: "string" } },
    required: ["order_id"],
  },
}]

// Return result
ws.send(JSON.stringify({
  type: "conversation.item.create",
  item: {
    type: "function_call_output",
    call_id: event.call_id,
    output: JSON.stringify({ status: "shipped" }),
  },
}));
ws.send(JSON.stringify({ type: "response.create" }));
```

## WebRTC (Browser)

```typescript
const pc = new RTCPeerConnection();
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
stream.getTracks().forEach(t => pc.addTrack(t, stream));

const audioEl = document.createElement("audio");
audioEl.autoplay = true;
pc.ontrack = (e) => { audioEl.srcObject = e.streams[0]; };

const dc = pc.createDataChannel("oai-events");

const offer = await pc.createOffer();
await pc.setLocalDescription(offer);

// Use ephemeral token from your backend
const res = await fetch("https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview", {
  method: "POST",
  headers: { Authorization: `Bearer ${ephemeralToken}`, "Content-Type": "application/sdp" },
  body: offer.sdp,
});
await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
```

## Voices

`alloy` (neutral) · `echo` (warm) · `shimmer` (soft)

## Pricing

Audio input ~$0.06/min · Output ~$0.24/min. Use server VAD to avoid billing silence.
