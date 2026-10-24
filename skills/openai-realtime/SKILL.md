---
name: openai-realtime
description: >-
  Build voice agents with the OpenAI Realtime API, a speech-to-speech interface that takes audio in and streams spoken answers back over WebRTC, WebSocket or SIP. Use when a user asks to build a voice assistant, stream microphone audio to gpt-realtime-2.1, handle interruptions and function calls in a phone-style conversation, answer SIP calls, mint ephemeral browser keys, or migrate off the removed beta (gpt-4o-realtime-preview, OpenAI-Beta header).
license: Apache-2.0
compatibility: "OPENAI_API_KEY with Realtime access; Node.js 20+ with ws, or Python 3.10+ with openai[realtime]"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["openai", "realtime", "voice", "websocket", "webrtc"]
---
# OpenAI Realtime API — Voice-Native AI Conversations

## Overview

The Realtime API is OpenAI's speech-to-speech interface: the model hears audio directly, keeps conversation state, calls tools and answers in audio, with barge-in and low first-audio latency. Current models are `gpt-realtime-2.1` (reasoning, tool use) and the cheaper `gpt-realtime-2.1-mini`. Transports: WebRTC (browsers, mobile), WebSocket (servers) and SIP (phone calls).

The beta interface is gone. OpenAI removed the Realtime beta on 2026-05-12 and shut down the `gpt-4o-realtime-preview` models on 2026-05-07. The `OpenAI-Beta: realtime=v1` header, `modalities`, flat `voice` / `input_audio_format` fields and `response.audio.*` events belong to that beta and no longer work. The older `gpt-realtime` and `gpt-realtime-mini` families are scheduled for removal on 2027-01-20, so start new work on `gpt-realtime-2.1`.

OpenAI also offers GPT-Live (`wss://api.openai.com/v1/live/sessions`) for full-duplex conversations with a delegated backend. It is a separate API with its own events (`session.start`, `session.input_audio.append`); this skill covers the Realtime API only.

## Instructions

### Choose the transport

- Browser or mobile: WebRTC. Your server holds the API key and either proxies the SDP offer to `POST /v1/realtime/calls` (unified interface) or mints an ephemeral key with `POST /v1/realtime/client_secrets`. WebRTC handles media, playback buffering and truncation for you.
- Server to server: WebSocket at `wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1` with `Authorization: Bearer $OPENAI_API_KEY`. You send base64 PCM yourself and manage playback.
- Phone: SIP trunk to `sip:$PROJECT_ID@sip.api.openai.com;transport=tls` (EU: `sip-eu.api.openai.com`).

If your app knows the end user, send a stable hashed ID in the `OpenAI-Safety-Identifier` header on the server-side request that creates the session or client secret.

### Server WebSocket session (Node.js)

```typescript
import WebSocket from "ws";

const ws = new WebSocket("wss://api.openai.com/v1/realtime?model=gpt-realtime-2.1", {
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "OpenAI-Safety-Identifier": "clinic-caller-7f3a91",
  },
});
const send = (event: object) => ws.send(JSON.stringify(event));

ws.on("open", () => {
  send({
    type: "session.update",
    session: {
      type: "realtime",                       // required in the GA shape
      model: "gpt-realtime-2.1",
      output_modalities: ["audio"],           // or ["text"]
      instructions: "You are Ava, the receptionist at Maple Street Dental. Keep answers to one or two short sentences. Offer to transfer to the dentist for medical questions.",
      reasoning: { effort: "low" },           // minimal | low | medium | high | xhigh
      audio: {
        input: {
          format: { type: "audio/pcm", rate: 24000 },      // mono 16-bit PCM
          transcription: { model: "gpt-transcribe" },       // optional, for logs
          turn_detection: { type: "semantic_vad", eagerness: "auto" },
        },
        output: { format: { type: "audio/pcm", rate: 24000 }, voice: "marin" },
      },
      tools: [{
        type: "function",
        name: "check_availability",
        description: "List open appointment slots for a procedure on a date.",
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
  });
});

ws.on("message", async (raw) => {
  const event = JSON.parse(raw.toString());
  switch (event.type) {
    case "response.output_audio.delta":                    // base64 PCM chunk
      playToSpeaker(Buffer.from(event.delta, "base64"));
      break;
    case "response.output_audio_transcript.delta":
      process.stdout.write(event.delta);
      break;
    case "conversation.item.input_audio_transcription.completed":
      console.log(`\nCaller: ${event.transcript}`);
      break;
    case "input_audio_buffer.speech_started":              // barge-in
      stopPlayback();
      break;
    case "response.done": {
      // Function calls arrive as output items of the finished response.
      for (const item of event.response.output) {
        if (item.type !== "function_call") continue;
        const slots = await checkClinicSlots(JSON.parse(item.arguments));
        send({ type: "conversation.item.create",
               item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(slots) } });
        send({ type: "response.create" });                 // let the model speak the result
      }
      break;
    }
    case "error":
      console.error(event.error);
      break;
  }
});

// Microphone: 24 kHz mono PCM16 chunks
export function sendAudio(pcm: Buffer) {
  send({ type: "input_audio_buffer.append", audio: pcm.toString("base64") });
}
```

`playToSpeaker`, `stopPlayback` and `checkClinicSlots` are your own functions. Over WebSocket you also own truncation: on `speech_started`, stop playback, then send `conversation.item.truncate` with the `item_id`, `content_index` and `audio_end_ms` that was actually played, so the model forgets what the caller never heard. WebRTC and SIP do this server-side.

### Python SDK

```python
import asyncio, base64
from openai import AsyncOpenAI

client = AsyncOpenAI()  # reads OPENAI_API_KEY

async def main():
    async with client.realtime.connect(model="gpt-realtime-2.1") as conn:
        await conn.session.update(session={
            "type": "realtime",
            "instructions": "You are a concise voice assistant.",
            "output_modalities": ["audio"],
            "audio": {"output": {"voice": "marin"},
                      "input": {"turn_detection": {"type": "semantic_vad"}}},
        })
        await conn.input_audio_buffer.append(audio=base64.b64encode(pcm_chunk).decode())
        async for event in conn:
            if event.type == "response.output_audio.delta":
                play_audio(base64.b64decode(event.delta))
            elif event.type == "response.done":
                break

asyncio.run(main())
```

`pcm_chunk`, `play_audio` are placeholders for your audio I/O. The SDK needs the extra: `pip install "openai[realtime]"`. Use `client.realtime`, not `client.beta.realtime`.

### Browser: ephemeral key, then WebRTC

Never ship the API key to the browser. Your server mints a short-lived secret:

```typescript
const r = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ session: { type: "realtime", model: "gpt-realtime-2.1", audio: { output: { voice: "marin" } } } }),
});
const { value } = await r.json();   // starts with "ek_"; hand it to the browser
```

The browser creates an `RTCPeerConnection`, adds the microphone track, opens a data channel for events (`session.update`, `response.create`), and posts its SDP offer to `https://api.openai.com/v1/realtime/calls` with `Authorization: Bearer ek_...` (the minted value). Alternatively use the Agents SDK: `new RealtimeSession(new RealtimeAgent({ name, instructions }), { model: "gpt-realtime-2.1" })` then `session.connect({ apiKey: value })` from `@openai/agents/realtime`.

### Turn detection

`session.audio.input.turn_detection` accepts `server_vad` (the default: `threshold`, `prefix_padding_ms`, `silence_duration_ms`) or `semantic_vad` (`eagerness`: `low`, `medium`, `high`, `auto`). Both take `create_response` and `interrupt_response`. Set it to `null` to take over: append audio, send `input_audio_buffer.commit`, then `response.create`.

### Phone calls (SIP)

Create a project webhook, point the trunk at the SIP URI above, and OpenAI posts `realtime.call.incoming` with a `call_id`. Verify the webhook signature, then `POST /v1/realtime/calls/{call_id}/accept` with the same body as a client secret (`type`, `model`, `instructions`, `tools`), or `/reject` with `{"status_code": 486}`. Afterwards open `wss://api.openai.com/v1/realtime?call_id={call_id}` (no `model`; the accept body already set it) to watch events or send commands; `/refer` transfers and `/hangup` ends the call.

## Examples

**Example 1: "Give me a Node script that talks to gpt-realtime over a WebSocket and prints the transcript."**
The agent uses the server session above with `output_modalities: ["audio"]`, logs `response.output_audio_transcript.delta`, and feeds 24 kHz mono PCM16 from a file or microphone through `input_audio_buffer.append`. Expected output: a `session.created` event, then streamed transcript text such as "Hi, Maple Street Dental, this is Ava. How can I help?" and audio deltas.

**Example 2: "My app still sends `OpenAI-Beta: realtime=v1` and uses gpt-4o-realtime-preview. Fix it."**
The agent removes the header, switches the URL model to `gpt-realtime-2.1`, rewrites `session.update` into the GA shape (`type: "realtime"`, `output_modalities`, `audio.input` / `audio.output` with `format`, `voice`, `turn_detection`, `transcription`) and renames events: `response.audio.delta` to `response.output_audio.delta`, `response.audio_transcript.delta` to `response.output_audio_transcript.delta`, `response.text.delta` to `response.output_text.delta`. It replaces `whisper-1` transcription with `gpt-transcribe` (WebSocket sessions) and moves browser clients to `/v1/realtime/client_secrets`.

## Guidelines

1. Always set `session.type: "realtime"` in `session.update`; a beta-shaped payload is rejected.
2. Use `marin` or `cedar` for best quality. Other voices: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`. A voice cannot change after the model has produced audio in a session.
3. Start `reasoning.effort` at `low`; raise it only for multi-step tool work, since it adds latency and output tokens. `gpt-realtime-2.1-mini` is the cheaper, faster choice for simple flows.
4. Keep instructions short and put confirmation rules before write actions (booking, payment). Tools run in your code; send the result as `function_call_output` and then `response.create`. Remote MCP tools (`type: "mcp"` with `server_url`) are executed by the API itself.
5. Resample to the configured rate. PCM chunks must hold whole 16-bit samples. For telephony use `audio/pcmu` or `audio/pcma` at 8 kHz.
6. Billing is per token, not per minute: audio input is $32 and audio output $64 per 1M tokens for `gpt-realtime-2.1` (cached input $0.40), with text at $4 / $24. Check the pricing page before quoting costs, and keep sessions short.
7. `whisper-1`, `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` are deprecated (removal 2027-02-26); use `gpt-transcribe` for input transcription of committed turns in a WebSocket conversation session (OpenAI documents it for WebSocket only, not WebRTC), or `gpt-live-transcribe` for transcription-only sessions: connect to `wss://api.openai.com/v1/realtime?intent=transcription` with no `model`, send `session.update` with `session.type: "transcription"`, and omit turn detection or set it `null`.
8. Do not use the Realtime API for batch or non-interactive audio; use file transcription or text-to-speech endpoints instead.
