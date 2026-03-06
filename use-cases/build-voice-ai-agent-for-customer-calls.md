---
title: Build a Voice AI Agent That Handles Customer Calls
slug: build-voice-ai-agent-for-customer-calls
description: Build a production voice AI agent that answers incoming phone calls, transcribes speech in real-time with Deepgram, generates intelligent responses with OpenAI, and speaks back with ElevenLabs — handling appointment booking, FAQ, and call routing for a dental clinic receiving 200+ calls daily.
skills: [deepgram, elevenlabs, livekit, openai-realtime]
category: AI & Machine Learning
tags: [voice-ai, conversational-ai, telephony, speech-to-text, text-to-speech, realtime]
---

# Build a Voice AI Agent That Handles Customer Calls

Raj runs a 12-person dental clinic that receives 230 phone calls per day. Three front desk staff spend 6 hours daily answering the same questions: "Do you accept my insurance?", "What are your hours?", "I need to reschedule." During peak hours, 40% of calls go to voicemail. Patients leave for competitors who pick up.

Raj wants a voice AI agent that answers calls instantly, handles routine questions, books appointments, and transfers complex cases to a human — in a natural, conversational voice that doesn't sound robotic.

## Architecture Overview

The system has four components working in real-time:

1. **Livekit** — WebRTC media server that handles the phone call audio stream
2. **Deepgram** — Converts patient speech to text in real-time (streaming STT)
3. **OpenAI GPT-4o** — Understands intent, generates responses, manages conversation state
4. **ElevenLabs** — Converts AI responses to natural speech (streaming TTS)

The entire loop — patient speaks → transcription → AI thinks → voice response — completes in under 800ms, which feels natural in conversation.

## Step 1: Real-Time Audio Pipeline with LiveKit

The voice agent runs as a LiveKit Agent that joins a room when a call comes in. LiveKit handles the WebRTC connection, echo cancellation, and audio routing.

```python
# voice_agent.py — LiveKit Agent entry point
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, openai, elevenlabs, silero

async def entrypoint(ctx: JobContext):
    """Main entry point for the voice agent.

    Called when a new phone call connects via LiveKit SIP trunk.
    Sets up the STT → LLM → TTS pipeline and starts the conversation.
    """
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Initialize the voice pipeline components
    assistant = VoiceAssistant(
        vad=silero.VAD.load(),                      # Voice activity detection — knows when patient stops talking
        stt=deepgram.STT(
            model="nova-2",                          # Deepgram's fastest model: ~300ms latency
            language="en",
            smart_format=True,                       # Auto-punctuation, number formatting
            endpointing_ms=500,                      # Wait 500ms of silence before finalizing (1)
        ),
        llm=openai.LLM(
            model="gpt-4o",
            temperature=0.7,
        ),
        tts=elevenlabs.TTS(
            voice_id="pNInz6obpgDQGcFmaJgB",       # "Rachel" — warm, professional female voice
            model_id="eleven_turbo_v2_5",            # Optimized for low latency (~200ms)
            stability=0.6,                            # Slight variation for natural feel
            similarity_boost=0.8,
        ),
        # System prompt defines the agent's personality and knowledge
        chat_ctx=build_chat_context(),
    )

    assistant.start(ctx.room)
    # Greet the caller immediately — don't wait for them to speak first
    await assistant.say(
        "Hi, thanks for calling Bright Smile Dental. I'm Ava, your virtual assistant. "
        "How can I help you today?",
        allow_interruptions=True,                    # Patient can interrupt the greeting
    )

# 1: 500ms endpointing prevents cutting off mid-sentence
#    while keeping the conversation responsive
```

## Step 2: Conversation Context and Tool Calling

The AI needs access to the clinic's schedule, insurance info, and the ability to actually book appointments. This is handled through OpenAI function calling — the LLM decides when to check availability or book a slot.

```python
# clinic_tools.py — Tools the voice agent can use during calls
from livekit.agents import llm
from datetime import datetime, timedelta
import httpx

class ClinicTools(llm.FunctionContext):
    """Tools available to the voice agent during phone calls.

    Each method becomes a function the LLM can call.
    Decorated with @llm.ai_callable to register with OpenAI.
    """

    def __init__(self, api_base: str, api_key: str):
        super().__init__()
        self.client = httpx.AsyncClient(
            base_url=api_base,
            headers={"Authorization": f"Bearer {api_key}"},
        )

    @llm.ai_callable(description="Check available appointment slots for a specific date and procedure type")
    async def check_availability(
        self,
        date: str,          # ISO date like "2026-03-15"
        procedure: str,     # "cleaning", "filling", "consultation", "emergency"
    ) -> str:
        """Query the clinic's scheduling system for open slots.

        Args:
            date: The requested date in YYYY-MM-DD format
            procedure: Type of dental procedure (determines slot duration)
        """
        resp = await self.client.get(f"/api/slots", params={
            "date": date,
            "procedure": procedure,
        })
        slots = resp.json()

        if not slots:
            # Check next 3 days automatically so the agent can suggest alternatives
            alternatives = []
            for i in range(1, 4):
                next_date = (datetime.fromisoformat(date) + timedelta(days=i)).isoformat()[:10]
                alt_resp = await self.client.get(f"/api/slots", params={
                    "date": next_date, "procedure": procedure
                })
                alt_slots = alt_resp.json()
                if alt_slots:
                    alternatives.append({"date": next_date, "slots": alt_slots[:3]})

            return f"No slots on {date}. Alternatives: {alternatives}"

        return f"Available slots on {date}: {[s['time'] for s in slots]}"

    @llm.ai_callable(description="Book an appointment for a patient")
    async def book_appointment(
        self,
        patient_name: str,
        phone: str,
        date: str,
        time: str,
        procedure: str,
    ) -> str:
        """Create a confirmed appointment in the clinic's system.

        Args:
            patient_name: Full name of the patient
            phone: Patient's phone number for confirmation SMS
            date: Appointment date (YYYY-MM-DD)
            time: Appointment time (HH:MM)
            procedure: Type of procedure
        """
        resp = await self.client.post("/api/appointments", json={
            "patient_name": patient_name,
            "phone": phone,
            "date": date,
            "time": time,
            "procedure": procedure,
            "booked_by": "voice_agent",
        })

        if resp.status_code == 201:
            booking = resp.json()
            return f"Appointment confirmed: {booking['confirmation_code']}. SMS sent to {phone}."
        return f"Booking failed: {resp.json().get('error', 'Unknown error')}"

    @llm.ai_callable(description="Transfer the call to a human staff member")
    async def transfer_to_human(
        self,
        reason: str,         # Why the transfer is needed
        department: str,     # "front_desk", "billing", "dentist"
    ) -> str:
        """Transfer the active call to a human agent.

        Used when the AI can't handle the request (insurance disputes,
        medical questions, angry patients).

        Args:
            reason: Brief description of why transfer is needed
            department: Which department should receive the call
        """
        # In production, this triggers a SIP REFER to the clinic's phone system
        return f"Transferring to {department}. Reason: {reason}"
```

## Step 3: System Prompt with Clinic Knowledge

The system prompt contains everything the agent needs to answer common questions without calling any tools. Insurance plans, hours, locations, and procedures are baked in.

```python
# context.py — Build the conversation context
from livekit.agents import llm

def build_chat_context() -> llm.ChatContext:
    """Build the initial chat context with clinic knowledge.

    Everything the agent needs to answer the top 20 most common
    questions is included here — no tool call needed.
    """
    ctx = llm.ChatContext()
    ctx.append(
        role="system",
        text="""You are Ava, the virtual receptionist at Bright Smile Dental.

PERSONALITY:
- Warm, professional, patient. Like a friendly receptionist who's been there 10 years.
- Use short sentences. Phone conversations need to be concise.
- Confirm important details by repeating them back.
- If you're not sure about something medical, say "Let me transfer you to our team."

CLINIC INFO:
- Hours: Mon-Fri 8am-6pm, Sat 9am-2pm, closed Sunday
- Address: 1425 Oak Avenue, Suite 200, Portland OR 97201
- Emergency line: Available 24/7, say "I can connect you with our emergency dentist"

INSURANCE:
- Accepted: Delta Dental, Cigna, Aetna, MetLife, Guardian, United Healthcare
- NOT accepted: Medicaid, Medicare (refer to Portland Community Dental)
- For insurance verification, collect: insurance company, member ID, date of birth

COMMON PROCEDURES & DURATION:
- Cleaning: 45 min, $150 without insurance
- Filling: 60 min, $200-400 depending on size
- Crown: 90 min over 2 visits, $800-1500
- Whitening: 60 min, $350 (not covered by insurance)
- Emergency/pain: Same-day slots usually available

BOOKING RULES:
- New patients need a 90-minute first visit (exam + cleaning + x-rays)
- Cancellations need 24-hour notice
- Collect: full name, phone number, email (optional), insurance info (if applicable)

TRANSFER RULES — transfer to human when:
- Patient is upset or arguing about billing
- Medical questions beyond basic procedure info
- Insurance dispute or complex billing question
- Patient explicitly asks for a human
- You're unsure about anything clinical""",
    )
    return ctx
```

## Step 4: Call Analytics and Quality Monitoring

Every call is logged with transcripts, intent classification, and resolution status. This data feeds a dashboard that shows Raj which questions come up most, average handle time, and transfer rate.

```python
# analytics.py — Post-call analytics
from dataclasses import dataclass, field
from datetime import datetime
import httpx

@dataclass
class CallRecord:
    """Structured record of a completed voice agent call.

    Stored in PostgreSQL for analytics dashboard and quality review.
    """
    call_id: str
    started_at: datetime
    ended_at: datetime
    duration_seconds: float
    caller_phone: str
    transcript: list[dict]           # Full conversation transcript
    intent: str                       # "booking", "inquiry", "cancellation", "transfer"
    resolved: bool                    # Did the agent handle it without transfer?
    appointment_booked: bool
    transferred_to_human: bool
    transfer_reason: str | None
    sentiment: str                    # "positive", "neutral", "negative"
    topics: list[str] = field(default_factory=list)  # ["insurance", "hours", "emergency"]

async def log_call(record: CallRecord):
    """Log completed call to analytics backend.

    Triggers alerts if:
    - Sentiment is negative (potential review risk)
    - Transfer rate exceeds 30% in last hour (staffing issue)
    - Same caller phones 3+ times in a week (unresolved issue)
    """
    async with httpx.AsyncClient() as client:
        await client.post("https://api.clinic.internal/calls", json={
            "call_id": record.call_id,
            "duration": record.duration_seconds,
            "intent": record.intent,
            "resolved": record.resolved,
            "sentiment": record.sentiment,
            "transferred": record.transferred_to_human,
            "topics": record.topics,
            "transcript": record.transcript,
        })
```

## Results After 30 Days

The voice agent handles 180 of the 230 daily calls without human intervention. Average response time dropped from 45 seconds (hold time) to instant. The three front desk staff now spend their time on in-person patient care instead of answering phones.

Key metrics from the analytics dashboard:
- **78% resolution rate** — calls handled fully by AI without transfer
- **22% transfer rate** — billing disputes (9%), medical questions (8%), patient preference (5%)
- **Average call duration**: 2 minutes 15 seconds (down from 4 minutes with humans)
- **Patient satisfaction**: 4.6/5 from post-call surveys (text message)
- **Cost**: $0.08 per call (Deepgram STT + OpenAI + ElevenLabs TTS) vs $2.30 per call with human staff
- **Zero missed calls** — every call answered on first ring, 24/7
