---
name: livekit
description: >-
  Build real-time audio and video applications with LiveKit. Use when a user asks to implement WebRTC rooms, video conferencing, live streaming, screen sharing, or real-time communication using the LiveKit SDK.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/livekit/livekit
  tags: ["webrtc", "realtime", "voice", "video", "streaming"]
---
# LiveKit — Real-Time Voice & Video Infrastructure

## Overview

LiveKit is an open-source WebRTC platform for real-time voice and video: a self-hostable SFU server, client SDKs for web/mobile, server SDKs for room and token management, SIP telephony bridging, and the Agents framework for building voice AI. Checked against `livekit-agents` 1.8.4, `livekit-server-sdk` (Node) 2.19.1 and `livekit-client` 2.22.3 (October 2026).

**Breaking change since the 1.0 Agents release:** `livekit.agents.voice_assistant.VoiceAssistant` and `fnc_ctx` are gone. Voice agents are now built from an `Agent` (instructions + tools) run inside an `AgentSession` (STT/LLM/TTS/VAD pipeline), started with `session.start(...)`.

## Instructions

### Voice Agent with LiveKit Agents Framework

```python
# agent.py — AI voice agent using LiveKit Agents 1.x
from livekit.agents import Agent, AgentSession, JobContext, JobProcess, WorkerOptions, cli, function_tool
from livekit.plugins import deepgram, openai, elevenlabs, silero

def prewarm(proc: JobProcess):
    """Pre-load models at worker startup for faster first response."""
    proc.userdata["vad"] = silero.VAD.load()

class ClinicAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="You are a friendly scheduling assistant for a dental clinic. "
                         "Confirm the patient's name and desired date before booking.",
        )

    @function_tool
    async def book_appointment(self, patient_name: str, date_iso: str) -> str:
        """Book an appointment for the patient on the given ISO date."""
        return f"Booked {patient_name} for {date_iso}."

async def entrypoint(ctx: JobContext):
    """Called when a participant joins a LiveKit room."""
    await ctx.connect()

    session = AgentSession(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(model="nova-3"),
        llm=openai.LLM(model="gpt-4o"),
        tts=elevenlabs.TTS(
            voice_id="pNInz6obpgDQGcFmaJgB",
            model="eleven_turbo_v2_5",
        ),
    )

    await session.start(agent=ClinicAssistant(), room=ctx.room)
    await session.generate_reply(instructions="Greet the caller and ask how you can help.")

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
```

Run it locally with `python agent.py console` (talk to it in the terminal, no LiveKit room needed) or `python agent.py dev` (connects to a real room, hot-reloads on save).

### SIP Telephony Integration

```yaml
# livekit-sip.yaml — Connect phone calls to LiveKit rooms
# Incoming calls from a SIP trunk (Twilio, Telnyx) route to AI agent
apiVersion: livekit.io/v1
kind: SIPTrunk
metadata:
  name: clinic-inbound
spec:
  inbound:
    numbers: ["+15551234567"]
    allowed_addresses: ["*.pstn.twilio.com"]
    auth_username: "livekit"
    auth_password: "${SIP_PASSWORD}"
  rules:
    - rule: ".*"
      room_name: "clinic-agent-room"
      participant_identity: "caller-${phone}"
```

```python
# Create SIP trunk and dispatch rules via API
from livekit import api

lk = api.LiveKitAPI(
    url=os.environ["LIVEKIT_URL"],
    api_key=os.environ["LIVEKIT_API_KEY"],
    api_secret=os.environ["LIVEKIT_API_SECRET"],
)

# Create SIP trunk for inbound calls
trunk = await lk.sip.create_sip_inbound_trunk(
    api.CreateSIPInboundTrunkRequest(
        trunk=api.SIPInboundTrunkInfo(
            name="clinic",
            numbers=["+15551234567"],
        )
    )
)

# Create dispatch rule — route calls to agent
await lk.sip.create_sip_dispatch_rule(
    api.CreateSIPDispatchRuleRequest(
        rule=api.SIPDispatchRule(
            dispatch_rule_individual=api.SIPDispatchRuleIndividual(
                room_prefix="call-",      # Each call gets its own room
                pin="",                    # No PIN required
            ),
        ),
        trunk_ids=[trunk.sip_trunk_id],
    )
)
```

### Video Room (Web Client)

```typescript
// React component for video conferencing
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from "@livekit/components-react";
import "@livekit/components-styles";

function MeetingRoom({ token, serverUrl }: { token: string; serverUrl: string }) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={true}
    >
      <VideoConference />
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}

// Generate access token on server — AccessToken.toJwt() is async as of livekit-server-sdk v2
import { AccessToken } from "livekit-server-sdk";

async function createToken(roomName: string, participantName: string): Promise<string> {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: participantName }
  );
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });
  return await token.toJwt();
}
```

## Installation

```bash
# Server
docker run -d --name livekit -p 7880:7880 -p 7881:7881 \
  livekit/livekit-server --dev

# Python agent framework
pip install livekit-agents livekit-plugins-deepgram livekit-plugins-openai livekit-plugins-elevenlabs livekit-plugins-silero

# JavaScript client
npm install livekit-client @livekit/components-react

# LiveKit Cloud: https://cloud.livekit.io (managed hosting)
```

## Examples

### Example 1: "Build a voice agent that books dental appointments over the phone"

Write `agent.py` with the `ClinicAssistant` from the Instructions section (an `Agent` with a `book_appointment` tool), run `python agent.py console` to talk to it from the terminal first, then wire the SIP trunk and dispatch rule from the SIP Telephony section so inbound calls to the clinic's number land in a fresh room per caller and dispatch to this agent.

### Example 2: "Add a video call screen to our React app"

Request a token from the server (the `createToken` function in the Video Room section — call it from an API route, not the browser, since it needs `LIVEKIT_API_SECRET`), then render `<LiveKitRoom token={token} serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}><VideoConference /><RoomAudioRenderer /></LiveKitRoom>` in the call page.

## Guidelines

1. **Agents framework for voice AI** — Build an `Agent` (instructions + `@function_tool` methods) and run it in an `AgentSession` (stt/llm/tts/vad); the session handles interruptions, turn-taking, and audio routing. `VoiceAssistant` and `fnc_ctx` were removed in the 1.0 Agents framework — don't use them in new code.
2. **SIP for telephony** — Connect phone numbers via SIP trunks (Twilio, Telnyx); LiveKit handles the WebRTC↔SIP bridge.
3. **Silero VAD** — Include voice activity detection (`silero.VAD.load()`); prevents the agent from responding to background noise.
4. **Prewarm models** — Load VAD and other models in `prewarm_fnc`; eliminates cold-start latency on first call.
5. **Room-per-call** — Create a unique room for each phone call or interaction for clean isolation and easy cleanup.
6. **Cloud for production** — LiveKit Cloud (cloud.livekit.io) handles scaling, TURN servers and global edge nodes; self-host only if you need that control.
7. **`toJwt()` is async** in `livekit-server-sdk` v2 — `await` it; a missed `await` silently returns a Promise object as the "token" and auth will fail.
8. **Interruption handling** — Agents handle barge-in natively; the caller can interrupt the AI mid-sentence.
9. **Never hardcode `LIVEKIT_API_SECRET`** or generate tokens in client-side code — issue them from a server endpoint per participant.
