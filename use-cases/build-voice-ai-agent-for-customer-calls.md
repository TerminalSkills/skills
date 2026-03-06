---
title: Build a Voice AI Agent That Handles Customer Calls
slug: build-voice-ai-agent-for-customer-calls
description: >-
  Build a voice AI agent that answers phone calls, transcribes speech with Deepgram, responds with OpenAI, and speaks back via ElevenLabs for real-time customer support.
skills: [deepgram, elevenlabs, livekit, openai-realtime]
category: data-ai
tags: [voice-ai, conversational-ai, telephony, speech-to-text, text-to-speech]
---

# Build a Voice AI Agent That Handles Customer Calls

Raj runs a 12-person dental clinic that receives 230 phone calls per day. Three front desk staff spend 6 hours daily answering the same questions while 40% of peak-hour calls go to voicemail. Patients leave for competitors who pick up.

## The Problem

The clinic's phone volume overwhelms the front desk. Most calls are routine — insurance questions, hours, rescheduling — but each one takes 4 minutes of a staff member's time. During lunch and morning rushes, the hold time hits 45 seconds and many callers hang up. Hiring more receptionists is expensive, and an IVR menu tree frustrates patients who want to talk, not press buttons.

Raj needs something that answers instantly, sounds natural, handles the routine 80%, and seamlessly transfers the complex 20% to a human.

## The Solution

A real-time voice AI pipeline using LiveKit for audio, Deepgram for speech-to-text, OpenAI for conversation, and ElevenLabs for natural text-to-speech. The full loop completes in under 800ms.

```bash
terminal-skills install deepgram elevenlabs livekit openai-realtime
```

## Step-by-Step Walkthrough

### 1. Real-Time Audio Pipeline with LiveKit

The voice agent runs as a LiveKit Agent that joins a WebRTC room when a call arrives. It wires together four components: Silero for voice activity detection (knowing when the patient stops talking), Deepgram Nova-2 for streaming transcription at ~300ms latency, GPT-4o for understanding intent and generating responses, and ElevenLabs Turbo v2.5 for natural speech output at ~200ms latency.

```python
assistant = VoiceAssistant(
    vad=silero.VAD.load(),
    stt=deepgram.STT(model="nova-2", language="en", smart_format=True, endpointing_ms=500),
    llm=openai.LLM(model="gpt-4o", temperature=0.7),
    tts=elevenlabs.TTS(voice_id="pNInz6obpgDQGcFmaJgB", model_id="eleven_turbo_v2_5"),
    chat_ctx=build_chat_context(),
)
assistant.start(ctx.room)
await assistant.say("Hi, thanks for calling Bright Smile Dental. I'm Ava. How can I help you today?",
                    allow_interruptions=True)
```

### 2. Tool Calling for Appointments and Transfers

The agent uses OpenAI function calling to interact with the clinic's scheduling system. Three tools are registered: `check_availability` queries open slots (and automatically suggests alternatives from the next 3 days if the requested date is full), `book_appointment` creates a confirmed booking and sends an SMS confirmation, and `transfer_to_human` hands the call to staff for billing disputes, medical questions, or when the patient asks.

```python
@llm.ai_callable(description="Check available appointment slots")
async def check_availability(self, date: str, procedure: str) -> str:
    resp = await self.client.get("/api/slots", params={"date": date, "procedure": procedure})
    slots = resp.json()
    if not slots:
        # Auto-check next 3 days for alternatives
        alternatives = await self._find_alternatives(date, procedure)
        return f"No slots on {date}. Alternatives: {alternatives}"
    return f"Available slots on {date}: {[s['time'] for s in slots]}"
```

### 3. Clinic Knowledge and Conversation Design

The system prompt contains everything the agent needs to answer the top 20 most common questions without tool calls: hours (Mon-Fri 8am-6pm, Sat 9am-2pm), accepted insurance (Delta Dental, Cigna, Aetna, MetLife, Guardian, United Healthcare), procedure pricing (cleaning $150, filling $200-400, crown $800-1500), and booking rules (new patients need 90-minute first visit, 24-hour cancellation notice). Transfer rules are explicit — escalate for billing disputes, clinical questions, upset patients, or when the caller asks for a human.

## Real-World Example

Raj deploys the voice agent on a Monday. Here is how a typical call plays out on Wednesday at 10:15am:

1. A patient calls and Ava answers on the first ring: "Hi, thanks for calling Bright Smile Dental. I'm Ava. How can I help you today?"
2. The patient says: "I need a cleaning. Do you take Delta Dental?" Ava responds: "Yes, we accept Delta Dental. I can check availability for you. What day works best?"
3. The patient requests next Thursday. Ava calls `check_availability("2026-03-12", "cleaning")` and finds slots at 9am, 11:30am, and 2pm. She reads them back.
4. The patient picks 11:30am. Ava collects their name (Sarah Chen) and phone number, calls `book_appointment`, and confirms: "You're all set, Sarah. Thursday March 12th at 11:30am for a cleaning. You'll get a confirmation text shortly."
5. Total call duration: 1 minute 40 seconds. No hold time. No human staff involved.
6. After 30 days, the agent handles 180 of 230 daily calls without transfer. Resolution rate: 78%. Average call duration drops from 4 minutes to 2:15. Patient satisfaction: 4.6/5. Cost per call: $0.08 vs $2.30 with human staff. Zero missed calls — every call answered on the first ring, 24/7.

## Related Skills

- [deepgram](../skills/deepgram/) — Real-time speech-to-text transcription
- [elevenlabs](../skills/elevenlabs/) — Natural text-to-speech voice synthesis
- [livekit](../skills/livekit/) — WebRTC media server for audio streaming
- [openai-realtime](../skills/openai-realtime/) — GPT-4o for conversation and function calling
