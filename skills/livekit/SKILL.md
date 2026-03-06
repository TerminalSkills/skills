---
name: livekit
description: >-
  Build real-time audio and video applications with LiveKit. Use when a user asks to implement WebRTC rooms, video conferencing, live streaming, screen sharing, or real-time communication using the LiveKit SDK.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["webrtc", "realtime", "voice", "video", "streaming"]
---
# LiveKit — Real-Time Voice & Video Infrastructure

## Overview

You are an expert in LiveKit, the open-source WebRTC platform for building real-time voice and video applications. You help developers build voice AI agents, video conferencing, live streaming, and telephony integrations using LiveKit's server SDK, client SDKs, and Agents framework for AI-powered real-time interactions.

## Instructions

### Voice Agent with LiveKit Agents Framework

```python
# agent.py — AI voice agent using LiveKit Agents
from livekit.agents import AutoSubscribe, JobContext, WorkerOptions, cli, JobProcess
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, openai, elevenlabs, silero

def prewarm(proc: JobProcess):
    """Pre-load models at worker startup for faster first response."""
    proc.userdata["vad"] = silero.VAD.load()

async def entrypoint(ctx: JobContext):
    """Handle an incoming voice interaction.

    Called when a participant joins a LiveKit room.
    Sets up the full STT → LLM → TTS pipeline.
    """
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    # Wait for a participant (the caller) to join
    participant = await ctx.wait_for_participant()

    assistant = VoiceAssistant(
        vad=ctx.proc.userdata["vad"],
        stt=deepgram.STT(model="nova-2"),
        llm=openai.LLM(model="gpt-4o"),
        tts=elevenlabs.TTS(
            voice_id="pNInz6obpgDQGcFmaJgB",
            model_id="eleven_turbo_v2_5",
        ),
        # Function calling — agent can book appointments, check schedules
        fnc_ctx=MyFunctions(),
    )

    assistant.start(ctx.room, participant)
    await assistant.say("Hello! How can I help you today?")

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
        ),
    )
```

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

// Generate access token on server
import { AccessToken } from "livekit-server-sdk";

function createToken(roomName: string, participantName: string): string {
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
  return token.toJwt();
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

**Example 1: User asks to set up livekit**

User: "Help me set up livekit for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure livekit
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with livekit**

User: "Create a dashboard using livekit"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Agents framework for voice AI** — Use `livekit-agents` with VoiceAssistant for the complete STT→LLM→TTS pipeline; handles interruptions, turn-taking, and audio routing
2. **SIP for telephony** — Connect phone numbers via SIP trunks (Twilio, Telnyx); LiveKit handles the WebRTC↔SIP bridge
3. **Silero VAD** — Always include voice activity detection; prevents the agent from responding to background noise
4. **Prewarm models** — Load VAD and other models in `prewarm_fnc`; eliminates cold-start latency on first call
5. **Room-per-call** — Create a unique room for each phone call/interaction; clean isolation and easy cleanup
6. **Cloud for production** — Use LiveKit Cloud instead of self-hosting; handles scaling, TURN servers, and global edge nodes
7. **Function calling** — Give your agent tools via `fnc_ctx`; the LLM decides when to call APIs during conversation
8. **Interruption handling** — LiveKit agents handle barge-in natively; the caller can interrupt the AI mid-sentence
