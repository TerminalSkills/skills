---
title: Build a Voice AI Agent That Handles Customer Calls
slug: build-voice-ai-agent-for-customer-calls
description: >-
  Build a voice AI agent that answers phone calls, transcribes speech with Deepgram, responds with an OpenAI model, and speaks back via ElevenLabs for real-time customer support.
skills: [deepgram, elevenlabs, livekit, openai-realtime]
category: data-ai
tags: [voice-ai, conversational-ai, telephony, speech-to-text, text-to-speech]
---

# Build a Voice AI Agent That Handles Customer Calls

Raj runs a 12-person dental clinic that receives about 230 phone calls a day. Three front desk staff spend most of their day answering the same questions while a large share of peak-hour calls go to voicemail. Patients leave for competitors who pick up.

## The Problem

The clinic's phone volume overwhelms the front desk. Most calls are routine (insurance questions, hours, rescheduling), but each one takes minutes of a staff member's time. During lunch and morning rushes callers hold, and many hang up. Hiring more receptionists is expensive, and an IVR menu tree frustrates patients who want to talk, not press buttons.

Raj needs something that answers instantly, sounds natural, handles the routine calls, and transfers the complex ones to a human.

## The Solution

A LiveKit voice agent: callers reach it through a SIP trunk, Silero detects when they stop talking, Deepgram transcribes, an OpenAI model decides what to say and which tool to call, and ElevenLabs speaks the answer. The code targets the LiveKit Agents 1.x framework (checked against `livekit-agents` 1.8.9). The old `VoiceAssistant` class and `@llm.ai_callable` decorator from 0.x tutorials no longer exist.

```bash
terminal-skills install deepgram elevenlabs livekit openai-realtime
python -m venv .venv && . .venv/bin/activate
pip install livekit-agents livekit-plugins-deepgram livekit-plugins-elevenlabs \
  livekit-plugins-openai livekit-plugins-silero httpx
```

Set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `DEEPGRAM_API_KEY`, `ELEVEN_API_KEY`, `OPENAI_API_KEY`, `ELEVENLABS_VOICE_ID`, `CLINIC_API_URL` and `FRONT_DESK_NUMBER` (E.164 format) in the environment. Never hard-code them.

## Step-by-Step Walkthrough

### 1. The agent: pipeline, tools and transfer

An `Agent` holds the instructions and the tools; an `AgentSession` wires the pipeline. The system prompt carries the answers to the most common questions so they need no tool call, and states when to transfer. `agent_name` makes the agent dispatch explicitly, which the SIP dispatch rule in step 3 relies on.

```python
import os

import httpx
from livekit import api
from livekit.agents import (
    Agent, AgentSession, JobContext, JobProcess, RunContext, WorkerOptions, cli, function_tool, get_job_context,
)
from livekit.plugins import deepgram, elevenlabs, openai, silero

INSTRUCTIONS = """You are Ava, the phone receptionist at Bright Smile Dental.
Keep answers to one or two short sentences. Never give medical advice.
Hours: Mon-Fri 8am-6pm, Sat 9am-2pm. New patients need a 90-minute first visit.
Cancellations need 24 hours notice. Transfer to a human for billing disputes,
clinical questions, upset callers, or when the caller asks for a person."""


def prewarm(proc: JobProcess):
    proc.userdata["vad"] = silero.VAD.load()


class Receptionist(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=INSTRUCTIONS)
        self.client = httpx.AsyncClient(base_url=os.environ["CLINIC_API_URL"], timeout=5)

    @function_tool
    async def check_availability(self, context: RunContext, date: str, procedure: str) -> str:
        """Check open appointment slots.

        Args:
            date: ISO date, for example 2026-11-12
            procedure: cleaning, filling, crown or exam
        """
        resp = await self.client.get("/slots", params={"date": date, "procedure": procedure})
        resp.raise_for_status()
        slots = [s["time"] for s in resp.json()]
        return f"Open slots on {date}: {slots}" if slots else f"No slots on {date}."

    @function_tool
    async def book_appointment(self, context: RunContext, name: str, phone: str, date: str, time: str, procedure: str) -> str:
        """Book a slot after the caller has confirmed name, phone, date and time."""
        resp = await self.client.post("/appointments", json={
            "name": name, "phone": phone, "date": date, "time": time, "procedure": procedure})
        resp.raise_for_status()
        return "Booked. A confirmation text is on its way."

    @function_tool
    async def transfer_to_human(self, context: RunContext) -> str:
        """Hand the call to front-desk staff."""
        job = get_job_context()
        caller = next(iter(job.room.remote_participants.values()))
        await job.api.sip.transfer_sip_participant(api.TransferSIPParticipantRequest(
            room_name=job.room.name,
            participant_identity=caller.identity,
            transfer_to=f"tel:{os.environ['FRONT_DESK_NUMBER']}",
        ))
        return "Transferring."


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(model="nova-3", language="en-US", smart_format=True, endpointing_ms=300),
        llm=openai.LLM(model="gpt-5.4-mini", reasoning_effort="none"),
        tts=elevenlabs.TTS(voice_id=os.environ["ELEVENLABS_VOICE_ID"], model="eleven_flash_v2_5"),
    )
    await session.start(agent=Receptionist(), room=ctx.room)
    await session.say("Hi, thanks for calling Bright Smile Dental. I'm Ava. How can I help?", allow_interruptions=True)


if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint, prewarm_fnc=prewarm, agent_name="inbound-agent"))
```

Try it without a phone first: `python agent.py console` talks to the agent from your terminal, and `python agent.py dev` connects to a LiveKit room. Docstrings become the tool descriptions the model sees, so describe each argument.

### 2. Optional: one speech-to-speech model instead of three services

The `openai-realtime` skill covers OpenAI's Realtime API, where one model hears the audio and speaks the reply. In LiveKit that is a one-line change that replaces `stt`, `llm` and `tts`; tools keep working. Pin `model="gpt-realtime-2.1"`: the plugin default, `gpt-realtime`, is scheduled for shutdown on 20 January 2027. The trade-off is less control over the voice (ElevenLabs voices and Deepgram keyterms are not used).

```python
session = AgentSession(llm=openai.realtime.RealtimeModel(model="gpt-realtime-2.1", voice="marin"))
```

### 3. Connect a phone number

Buy a number from a SIP provider (Twilio, Telnyx or another one LiveKit documents), create an inbound trunk for it, then a dispatch rule that puts every caller in their own room and dispatches the agent named in the code. Use the `lk` CLI or the Python API; the rule body is:

```json
{
  "dispatch_rule": {
    "rule": { "dispatch_rule_individual": { "room_prefix": "call-" } },
    "name": "clinic-inbound",
    "room_config": { "agents": [{ "agent_name": "inbound-agent" }] }
  }
}
```

Room names contain the caller's phone number, so treat logs as personal data. For `transfer_to_human` to work, enable call transfers (SIP REFER) on the provider trunk; with Twilio that is the trunk's transfer setting, and a transfer closes the caller's LiveKit session.

### 4. Test before going live

Run `python agent.py dev`, call the number, and check three things: the greeting plays on pickup, a request for a slot reaches your scheduling API, and "let me talk to a person" rings the front desk. Handle `resp.raise_for_status()` failures from your own API deliberately: the agent should say it could not check and offer a transfer, not guess a time.

## Real-World Example

Raj deploys the agent on a Monday. A typical call on Wednesday at 10:15am:

1. A patient calls and Ava answers on the first ring: "Hi, thanks for calling Bright Smile Dental. I'm Ava. How can I help?"
2. The patient says: "I need a cleaning. Do you take Delta Dental?" Ava answers from the prompt and asks which day works.
3. The patient requests next Thursday. Ava calls `check_availability` for that date and reads back 9am, 11:30am and 2pm.
4. The patient picks 11:30am. Ava confirms name and phone number, calls `book_appointment`, and repeats the booking back.
5. The call takes under two minutes with no hold time and no staff involved. Calls about billing disputes or clinical questions go to `transfer_to_human`.

Raj reviews the call transcripts during the first weeks and adds the questions the agent got wrong to the system prompt. How many calls the agent resolves on its own, and what each call costs, depend on the models and the provider rates, so he measures them from his own call logs instead of assuming them.

## Related Skills

- [deepgram](../skills/deepgram/) — Speech-to-text; models and when to choose them
- [elevenlabs](../skills/elevenlabs/) — Text-to-speech voices and the current low-latency Flash models
- [livekit](../skills/livekit/) — Agents framework, rooms and SIP telephony
- [openai-realtime](../skills/openai-realtime/) — OpenAI Realtime speech-to-speech as an alternative to the three-service chain
