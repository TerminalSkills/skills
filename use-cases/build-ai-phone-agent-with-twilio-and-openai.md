---
title: Build an AI Phone Agent with Twilio and OpenAI
description: "Build an AI phone agent that handles inbound calls — greet callers, understand intent, answer questions, look up orders, and transfer to a human when needed."
skills:
  - twilio
  - openai
difficulty: advanced
time_estimate: "16 hours"
tags: [ai-agent, phone, twilio, openai, voice, realtime-api, customer-support, twiml]
---

# Build an AI Phone Agent with Twilio and OpenAI

## The Problem

Your startup gets 50 support calls a day. 80% of them are the same: "Where's my order?", "How do I cancel?", "What are your hours?". Each call takes 5 minutes and costs $3 in staff time. You want an AI agent to handle those 80% automatically and only transfer complex cases to a human.

The agent needs to sound natural, handle pauses, look up live order data, and know when it's out of its depth and needs to escalate.

## Architecture

```
Inbound call → Twilio Voice → Webhook → Express server
  → OpenAI Realtime API (speech-to-speech)
  → Tool calls: lookup order, check status, book appointment
  → Transfer to human if needed
  → Recording + transcript stored in DB
```

Two approaches:
1. **OpenAI Realtime API** — speech-in, speech-out, lowest latency (~300ms), best for natural conversation
2. **Whisper + GPT-4o + TTS** — more control, slightly higher latency (~1s), easier to debug

This walkthrough uses the Realtime API approach for the best caller experience.

## Step-by-Step Walkthrough

### Step 1: Configure Twilio Phone Number

```typescript
// server.ts — Express app that Twilio calls when a customer dials your number

import express from 'express';
import { twiml } from 'twilio';
import { WebSocketServer } from 'ws';

const app = express();
app.use(express.urlencoded({ extended: false }));

/** Twilio calls this URL when an inbound call arrives. */
app.post('/incoming-call', (req, res) => {
  const response = new twiml.VoiceResponse();
  const connect = response.connect();

  // Connect the call to a WebSocket stream (for OpenAI Realtime)
  connect.stream({
    url: `wss://${req.headers.host}/media-stream`,
    track: 'both_tracks',  // Capture both caller and agent audio
  });

  res.type('text/xml');
  res.send(response.toString());
});

app.listen(3001, () => console.log('Listening on :3001'));
```

Configure in Twilio Console:
- Phone Number → Voice → Webhook URL: `https://your-server.com/incoming-call`
- Method: HTTP POST

### Step 2: Connect to OpenAI Realtime API

```typescript
// lib/realtime-agent.ts — Bridge Twilio audio stream ↔ OpenAI Realtime API

import WebSocket from 'ws';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

const SYSTEM_PROMPT = `You are a helpful customer support agent for Acme Store.
Your job is to:
1. Greet the customer warmly
2. Understand their issue
3. Look up their order if needed (use the lookup_order tool)
4. Answer common questions about shipping, returns, and products
5. Transfer to a human agent if the issue is complex (use transfer_to_human tool)

Keep responses concise — this is a phone call. Speak naturally.
If you don't know something, say so and offer to transfer them.`;

export function createRealtimeSession(twilioWs: WebSocket) {
  const openaiWs = new WebSocket(OPENAI_REALTIME_URL, {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });

  openaiWs.on('open', () => {
    // Initialize the session with system prompt and tools
    openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: SYSTEM_PROMPT,
        voice: 'alloy',
        input_audio_format: 'g711_ulaw',   // Twilio's audio format
        output_audio_format: 'g711_ulaw',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: [
          {
            type: 'function',
            name: 'lookup_order',
            description: 'Look up a customer order by order ID or email address',
            parameters: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Order ID (e.g. ORD-12345) or customer email' },
              },
              required: ['query'],
            },
          },
          {
            type: 'function',
            name: 'book_appointment',
            description: 'Book a callback appointment for the customer',
            parameters: {
              type: 'object',
              properties: {
                phone: { type: 'string' },
                preferred_time: { type: 'string', description: 'e.g. "tomorrow 2pm"' },
              },
              required: ['phone', 'preferred_time'],
            },
          },
          {
            type: 'function',
            name: 'transfer_to_human',
            description: 'Transfer this call to a human agent. Use when the customer is frustrated, has a complex issue, or explicitly asks for a human.',
            parameters: {
              type: 'object',
              properties: {
                reason: { type: 'string', description: 'Brief reason for transfer' },
              },
              required: ['reason'],
            },
          },
        ],
      },
    }));
  });

  // Route OpenAI audio output → Twilio caller
  openaiWs.on('message', async (data) => {
    const event = JSON.parse(data.toString());

    if (event.type === 'response.audio.delta') {
      // Forward AI audio to caller
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.send(JSON.stringify({
          event: 'media',
          streamSid: twilioWs['streamSid'],
          media: { payload: event.delta },
        }));
      }
    }

    if (event.type === 'response.function_call_arguments.done') {
      await handleToolCall(event, openaiWs, twilioWs);
    }
  });

  return openaiWs;
}
```

### Step 3: Handle Tool Calls

```typescript
// lib/tool-handlers.ts — Execute tool calls from the AI

async function handleToolCall(event: any, openaiWs: WebSocket, twilioWs: WebSocket) {
  const { name, arguments: argsJson, call_id } = event;
  const args = JSON.parse(argsJson);
  let result: string;

  switch (name) {
    case 'lookup_order': {
      const order = await db.orders.findByIdOrEmail(args.query);
      result = order
        ? `Order ${order.id}: ${order.status}. Estimated delivery: ${order.estimatedDelivery}. Items: ${order.items.map((i: any) => i.name).join(', ')}.`
        : `No order found for "${args.query}". Please verify the order number.`;
      break;
    }

    case 'book_appointment': {
      const appointment = await db.appointments.create({
        phone: args.phone,
        preferredTime: args.preferred_time,
        createdAt: new Date(),
      });
      result = `Appointment booked. Reference: APT-${appointment.id}. You'll receive a callback at the requested time.`;
      break;
    }

    case 'transfer_to_human': {
      result = 'Transferring now...';

      // Send result first, then trigger transfer
      openaiWs.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id,
          output: result,
        },
      }));

      // Use Twilio to transfer the call
      await transferCallToHuman(twilioWs['callSid'], args.reason);
      return;  // Don't send result twice
    }

    default:
      result = 'Tool not found.';
  }

  // Send tool result back to OpenAI
  openaiWs.send(JSON.stringify({
    type: 'conversation.item.create',
    item: { type: 'function_call_output', call_id, output: result },
  }));
  openaiWs.send(JSON.stringify({ type: 'response.create' }));
}

async function transferCallToHuman(callSid: string, reason: string) {
  const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  await client.calls(callSid).update({
    twiml: `<Response>
      <Say>Please hold while I connect you with a team member.</Say>
      <Dial>
        <Number>${process.env.HUMAN_AGENT_PHONE}</Number>
      </Dial>
    </Response>`,
  });

  // Log reason for transfer
  await db.callLogs.update({ where: { callSid }, data: { transferReason: reason, transferredAt: new Date() } });
}
```

### Step 4: Record Calls and Store Transcripts

```typescript
// lib/call-recorder.ts — Capture and store call recordings + transcripts

import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/** Start recording when the call connects. */
export async function startRecording(callSid: string) {
  await client.calls(callSid).recordings.create({
    recordingStatusCallback: `${process.env.BASE_URL}/call-recording-complete`,
  });
}

/** Called by Twilio when recording is ready. Transcribe with Whisper. */
app.post('/call-recording-complete', async (req, res) => {
  const { RecordingSid, RecordingUrl, CallSid } = req.body;

  // Download recording
  const audioBuffer = await fetch(`${RecordingUrl}.mp3`, {
    headers: { Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}` },
  }).then(r => r.arrayBuffer());

  // Transcribe with Whisper
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const transcript = await openai.audio.transcriptions.create({
    file: new File([audioBuffer], 'call.mp3', { type: 'audio/mpeg' }),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });

  // Store in DB
  await db.callLogs.update({
    where: { callSid: CallSid },
    data: {
      recordingSid: RecordingSid,
      transcript: transcript.text,
      duration: transcript.duration,
      words: transcript.words,
    },
  });

  res.sendStatus(200);
});
```

### Step 5: WebSocket Server — Bridging Twilio ↔ OpenAI

```typescript
// server.ts (continued) — WebSocket server for media streams

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let openaiWs: WebSocket | null = null;
  let streamSid: string;
  let callSid: string;

  ws.on('message', async (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.event) {
      case 'start':
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        ws['streamSid'] = streamSid;
        ws['callSid'] = callSid;

        openaiWs = createRealtimeSession(ws);
        await startRecording(callSid);

        // Log call start
        await db.callLogs.create({
          data: { callSid, streamSid, startedAt: new Date() },
        });
        break;

      case 'media':
        // Forward caller audio to OpenAI
        if (openaiWs?.readyState === WebSocket.OPEN) {
          openaiWs.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: msg.media.payload,  // base64 G.711 µ-law audio
          }));
        }
        break;

      case 'stop':
        openaiWs?.close();
        await db.callLogs.update({
          where: { callSid },
          data: { endedAt: new Date() },
        });
        break;
    }
  });
});
```

## What It Costs

- **Twilio Voice:** ~$0.014/minute for incoming calls
- **OpenAI Realtime API:** ~$0.06/minute (input audio) + $0.24/minute (output audio)
- **Total per call:** ~$0.30/minute

For a 3-minute call: ~$0.90 vs. $3.00+ in staff time. Break-even at 2 minutes per call.

## Handling Edge Cases

- **Silence:** VAD (voice activity detection) handles pauses naturally
- **Background noise:** Twilio's noise cancellation, OpenAI VAD threshold tuning
- **"I want a human":** Transfer tool triggers immediately on detection
- **Angry callers:** System prompt instructs escalation when frustration is detected
- **Non-English speakers:** Set `language` in Whisper transcription, use GPT-4o multilingually

## Related Skills

- [twilio](../skills/twilio/) — Voice, TwiML, call control, recording
- [openai](../skills/openai/) — Realtime API, Whisper, function calling
