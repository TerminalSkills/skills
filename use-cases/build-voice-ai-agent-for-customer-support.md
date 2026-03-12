---
title: Build a Voice AI Agent That Handles Customer Support Calls
slug: build-voice-ai-agent-for-customer-support
description: A SaaS company builds a voice AI agent that answers customer support calls in real-time — using Deepgram for speech-to-text, OpenAI for understanding and response generation, ElevenLabs for natural text-to-speech, and LiveKit for low-latency audio streaming — handling 70% of calls without human intervention.
skills: [deepgram, elevenlabs, livekit, openai-realtime, vercel-ai-sdk]
category: AI & Machine Learning
tags: [voice-ai, speech, realtime, customer-support, telephony, streaming]
---

# Build a Voice AI Agent That Handles Customer Support Calls

Kai runs a 40-person SaaS company with 3 support agents handling 200 calls/day. Hold times average 8 minutes during peak hours, and agents spend 60% of their time on repetitive questions (password resets, billing inquiries, feature explanations). Kai wants a voice AI that handles the routine calls instantly, escalates complex issues to humans, and sounds natural enough that callers don't immediately ask for a human.

## The Technical Challenge

Voice AI is fundamentally different from chat AI. The constraints are brutal:

- **Latency budget**: Humans perceive >500ms silence as unnatural. End-to-end (speech-in → speech-out) must be <800ms.
- **Interruption handling**: Callers interrupt mid-sentence. The agent must stop speaking immediately and listen.
- **Turn-taking**: Natural conversation has subtle cues for when to speak. Awkward pauses or talking over the caller kills trust.
- **Audio quality**: Background noise, accents, poor phone connections. The STT must handle real-world audio.

## Step 1: Real-Time Audio Pipeline with LiveKit

LiveKit handles the WebRTC audio transport — low-latency bidirectional audio streaming between the caller and the AI agent:

```typescript
// agent/voice-pipeline.ts — Real-time audio processing
import { RoomServiceClient, Room, TrackSource } from "livekit-server-sdk";
import { AudioResampler } from "./audio-utils";

const livekit = new RoomServiceClient(
  process.env.LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

async function handleIncomingCall(callerId: string) {
  // Create a room for this call
  const room = await livekit.createRoom({
    name: `support-${callerId}-${Date.now()}`,
    emptyTimeout: 300,                     // Close after 5 min silence
    maxParticipants: 2,                    // Caller + AI agent
  });

  // Create token for the AI agent participant
  const agentToken = new AccessToken(process.env.LIVEKIT_API_KEY!, process.env.LIVEKIT_API_SECRET!, {
    identity: "ai-agent",
    name: "Support Agent",
  });
  agentToken.addGrant({ room: room.name, roomJoin: true, canPublish: true, canSubscribe: true });

  // Connect agent to the room
  const agentRoom = new Room();
  await agentRoom.connect(process.env.LIVEKIT_URL!, agentToken.toJwt());

  // Process incoming audio from caller
  agentRoom.on("trackSubscribed", (track, publication, participant) => {
    if (track.kind === "audio" && participant.identity !== "ai-agent") {
      startVoicePipeline(track, agentRoom, callerId);
    }
  });

  return { roomName: room.name, token: agentToken.toJwt() };
}
```

## Step 2: Speech-to-Text with Deepgram

Deepgram's streaming API transcribes audio in real-time with <300ms latency. The key feature: endpointing — detecting when the caller has finished speaking, even with pauses.

```typescript
// agent/stt.ts — Real-time speech recognition
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

function createTranscriptionStream(onTranscript: (text: string, isFinal: boolean) => void) {
  const connection = deepgram.listen.live({
    model: "nova-2",                       // Best accuracy model
    language: "en-US",
    smart_format: true,                    // Auto-punctuation
    interim_results: true,                 // Stream partial results
    utterance_end_ms: 1000,                // Endpointing: 1s silence = utterance end
    vad_events: true,                      // Voice activity detection
    endpointing: 300,                      // Faster endpointing for natural conversation
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel.alternatives[0]?.transcript;
    if (!transcript) return;

    if (data.is_final) {
      onTranscript(transcript, true);      // Final transcript — utterance complete
    } else {
      onTranscript(transcript, false);     // Interim — still speaking
    }
  });

  connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
    // Caller stopped speaking — trigger AI response
    onTranscript("", true);                // Signal to process accumulated text
  });

  return {
    send: (audioBuffer: Buffer) => connection.send(audioBuffer),
    close: () => connection.finish(),
  };
}
```

## Step 3: AI Brain — Understanding and Response

The AI processes the transcript, decides what to do (answer, look up account, escalate), and generates a response:

```typescript
// agent/brain.ts — Conversation engine
import OpenAI from "openai";

const openai = new OpenAI();

interface ConversationState {
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  customerId: string | null;
  authenticated: boolean;
  callReason: string | null;
}

const SYSTEM_PROMPT = `You are a customer support agent for TechFlow, a project management SaaS.

RULES:
- Keep responses SHORT (1-3 sentences). This is a phone call, not a chat.
- If the caller needs account-specific help, ask for their email to verify identity.
- For password resets, billing changes, and cancellations: handle directly using tools.
- For technical bugs or feature requests: collect details and escalate to a human agent.
- If the caller is frustrated, acknowledge their frustration before solving the problem.
- Never say "I'm an AI" unless directly asked. Say "I'm here to help."
- Use natural fillers: "Sure thing", "Got it", "Let me check that for you"

AVAILABLE ACTIONS:
- Look up customer by email
- Reset password (sends reset link)
- Check subscription status
- Process refund (< $100 auto-approved)
- Escalate to human agent`;

async function generateResponse(state: ConversationState, callerText: string): Promise<{
  text: string;
  action?: string;
  shouldEscalate: boolean;
}> {
  state.messages.push({ role: "user", content: callerText });

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      ...state.messages,
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "lookup_customer",
          description: "Find customer by email address",
          parameters: { type: "object", properties: { email: { type: "string" } }, required: ["email"] },
        },
      },
      {
        type: "function",
        function: {
          name: "reset_password",
          description: "Send password reset email to customer",
          parameters: { type: "object", properties: { customerId: { type: "string" } }, required: ["customerId"] },
        },
      },
      {
        type: "function",
        function: {
          name: "escalate_to_human",
          description: "Transfer call to a human agent",
          parameters: { type: "object", properties: { reason: { type: "string" }, priority: { type: "string", enum: ["low", "medium", "high"] } } },
        },
      },
    ],
    temperature: 0.7,
    max_tokens: 150,                       // Keep responses short for voice
  });

  const message = response.choices[0].message;

  // Handle tool calls
  if (message.tool_calls) {
    for (const tc of message.tool_calls) {
      const args = JSON.parse(tc.function.arguments);
      if (tc.function.name === "escalate_to_human") {
        return { text: "Let me connect you with a specialist who can help with that. One moment please.", shouldEscalate: true };
      }
      if (tc.function.name === "lookup_customer") {
        const customer = await db.customers.findByEmail(args.email);
        state.customerId = customer?.id || null;
        state.authenticated = !!customer;
      }
      if (tc.function.name === "reset_password" && state.authenticated) {
        await sendPasswordResetEmail(state.customerId!);
        return { text: "Done! I've sent a password reset link to your email. It'll arrive in the next minute or so. Is there anything else I can help with?", shouldEscalate: false };
      }
    }
  }

  const text = message.content || "I'm sorry, could you say that again?";
  state.messages.push({ role: "assistant", content: text });

  return { text, shouldEscalate: false };
}
```

## Step 4: Text-to-Speech with ElevenLabs

The response needs to sound natural, not robotic. ElevenLabs provides low-latency streaming TTS:

```typescript
// agent/tts.ts — Natural speech synthesis
import { ElevenLabsClient } from "elevenlabs";

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

async function* textToSpeechStream(text: string): AsyncGenerator<Buffer> {
  const audioStream = await elevenlabs.textToSpeech.convertAsStream(
    process.env.VOICE_ID!,                 // Pre-selected warm, professional voice
    {
      text,
      model_id: "eleven_turbo_v2_5",      // Lowest latency model
      output_format: "pcm_16000",         // 16kHz PCM for LiveKit
      voice_settings: {
        stability: 0.5,                    // Balance between stability and expressiveness
        similarity_boost: 0.75,
        style: 0.3,                        // Slight style for natural sound
      },
      optimize_streaming_latency: 4,       // Maximum optimization
    },
  );

  for await (const chunk of audioStream) {
    yield Buffer.from(chunk);
  }
}
```

## Step 5: Orchestrating the Full Pipeline

The complete flow ties everything together with interruption handling:

```typescript
// agent/orchestrator.ts — Full voice pipeline
async function startVoicePipeline(callerAudioTrack: Track, agentRoom: Room, callerId: string) {
  const state: ConversationState = { messages: [], customerId: null, authenticated: false, callReason: null };
  let isAgentSpeaking = false;
  let accumulatedTranscript = "";
  let interruptController: AbortController | null = null;

  const stt = createTranscriptionStream(async (text, isFinal) => {
    if (!text && !isFinal) return;

    // Interruption: caller started speaking while agent is talking
    if (isAgentSpeaking && text.length > 3) {
      interruptController?.abort();        // Stop TTS immediately
      isAgentSpeaking = false;
    }

    accumulatedTranscript += " " + text;

    if (isFinal && accumulatedTranscript.trim()) {
      const callerText = accumulatedTranscript.trim();
      accumulatedTranscript = "";

      // Generate AI response
      const response = await generateResponse(state, callerText);

      if (response.shouldEscalate) {
        await transferToHuman(agentRoom, callerId, state);
        return;
      }

      // Stream TTS response
      isAgentSpeaking = true;
      interruptController = new AbortController();

      try {
        for await (const audioChunk of textToSpeechStream(response.text)) {
          if (interruptController.signal.aborted) break;
          await publishAudioToRoom(agentRoom, audioChunk);
        }
      } finally {
        isAgentSpeaking = false;
      }
    }
  });

  // Feed caller audio to STT
  callerAudioTrack.on("data", (buffer: Buffer) => {
    stt.send(buffer);
  });
}
```

## Results

After 3 months in production, handling 200 calls/day:

- **Automation rate**: 70% of calls resolved without human intervention (password resets, billing questions, feature explanations)
- **Response latency**: 650ms average end-to-end (speech-in to speech-out start); callers perceive it as natural
- **Customer satisfaction**: CSAT 4.2/5 for AI-handled calls (vs 4.4/5 for human agents); callers often don't realize it's AI
- **Hold time**: Eliminated for routine calls (was 8 minutes); complex calls still reach humans within 2 minutes
- **Cost per call**: $0.12 for AI-handled calls (Deepgram STT + OpenAI + ElevenLabs TTS) vs $4.50 for human-handled
- **Agent efficiency**: Human agents handle 40% fewer calls but focus on complex issues; resolution quality improved 25%
- **Escalation accuracy**: 95% of escalations to humans were genuinely complex; only 5% were unnecessary transfers
- **Peak handling**: AI agent handles unlimited concurrent calls; no more "all agents are busy" during peak hours
