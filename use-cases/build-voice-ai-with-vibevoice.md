---
title: "Build a Voice AI Healthcare Assistant with VibeVoice"
slug: build-voice-ai-with-vibevoice
description: "Build a voice-first healthcare assistant for elderly patients using VibeVoice speech recognition, Claude for intent processing, and persistent conversation memory."
skills:
  - vibe-voice
  - anthropic-sdk
  - supermemory
category: data-ai
tags:
  - voice-ai
  - healthcare
  - speech
  - assistants
  - accessibility
---

# Build a Voice AI Healthcare Assistant with VibeVoice

## The Situation

MedCare, a healthcare startup, serves 2,000+ elderly patients who struggle with smartphone apps. Many can't type well, have poor eyesight, and forget login passwords. They need to:

- Schedule and manage appointments
- Check and refill medications
- Get daily health reminders
- Ask simple health questions

The solution: a voice-first interface powered by VibeVoice. Patients call a phone number or open a simple app — they just talk, and the system handles everything.

## Skills Used

- [vibe-voice](/skills/vibe-voice) — Speech recognition and synthesis
- [anthropic-sdk](/skills/anthropic-sdk) — Intent processing with Claude
- [supermemory](/skills/supermemory) — Patient conversation memory

## Architecture

```
Patient speaks → VibeVoice ASR → Claude (intent + logic) → VibeVoice TTS → Patient hears response
                                       ↕
                              Patient DB + Memory
```

## Step 1: Speech-to-Text with VibeVoice ASR

Patient calls in and says: *"I need to refill my blood pressure medication."*

```python
from vibevoice import VibeVoiceASR

asr = VibeVoiceASR.from_pretrained("microsoft/VibeVoice-ASR")

# Real-time transcription from audio stream
result = asr.transcribe(
    audio_stream,
    hotwords=["Lisinopril", "Metformin", "Amlodipine", "Atorvastatin",
              "appointment", "refill", "prescription", "Dr. Patel"]
)

transcript = result.text
# "I need to refill my blood pressure medication"
```

### Why VibeVoice for Healthcare

- **Custom hotwords** — medical terms, drug names, doctor names transcribed accurately
- **60-minute single-pass** — handles long patient conversations without chunking
- **Speaker diarization** — distinguishes patient from caregiver in shared calls
- **50+ languages** — serves diverse patient populations

## Step 2: Intent Processing with Claude

The transcript goes to Claude for understanding and action:

```python
import anthropic

client = anthropic.Anthropic()

# Patient context from memory
patient_context = memory.get_context(patient_id="P-1234")

response = client.messages.create(
    model="claude-sonnet-4-20250514",
    system="""You are a healthcare voice assistant. Be warm, clear, and concise.
    Speak in short sentences — this will be read aloud to elderly patients.
    Always confirm actions before executing them.

    Patient context:
    - Name: Margaret Johnson, 78 years old
    - Medications: Lisinopril 10mg (BP), Metformin 500mg (diabetes)
    - Doctor: Dr. Patel, next appointment April 5
    - Pharmacy: Walgreens on Oak Street
    - Preferences: prefers morning appointments, speaks slowly
    """,
    messages=[
        {"role": "user", "content": f"Patient said: {transcript}"}
    ],
    tools=[
        {
            "name": "check_medications",
            "description": "Look up patient's current medications and refill status",
            "input_schema": {"type": "object", "properties": {"patient_id": {"type": "string"}}}
        },
        {
            "name": "create_refill_request",
            "description": "Submit a medication refill request to the pharmacy",
            "input_schema": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "medication": {"type": "string"},
                    "pharmacy_id": {"type": "string"}
                }
            }
        },
        {
            "name": "schedule_appointment",
            "description": "Schedule an appointment with the patient's doctor",
            "input_schema": {
                "type": "object",
                "properties": {
                    "patient_id": {"type": "string"},
                    "doctor_id": {"type": "string"},
                    "preferred_time": {"type": "string"}
                }
            }
        }
    ]
)
```

Claude identifies the intent (medication refill), checks the medication database, and creates a refill request.

## Step 3: Execute the Action

```python
# Claude calls check_medications → finds Lisinopril 10mg
# Claude calls create_refill_request → submits to Walgreens

refill_result = pharmacy_api.create_refill(
    patient_id="P-1234",
    medication="Lisinopril 10mg",
    pharmacy_id="walgreens-oak-st"
)
# Returns: {"status": "submitted", "ready_by": "2026-03-30T10:00:00Z"}
```

## Step 4: Text-to-Speech Response

Claude generates a patient-friendly response, and VibeVoice speaks it:

```python
from vibevoice import VibeVoiceRealtime

tts = VibeVoiceRealtime.from_pretrained("microsoft/VibeVoice-Realtime-0.5B")

response_text = (
    "Margaret, I've submitted your refill for Lisinopril. "
    "Your Walgreens on Oak Street will have it ready by tomorrow morning. "
    "Would you like me to do anything else?"
)

# Stream audio back to patient in real-time
for audio_chunk in tts.stream(response_text, speaker="warm_female_01"):
    send_to_patient(audio_chunk)
```

### Voice Selection for Patients

```python
# Warm, clear voice for elderly patients
PATIENT_VOICE = "warm_female_01"

# Slower speech rate for better comprehension
tts_config = {
    "speaker": PATIENT_VOICE,
    "speed": 0.85,  # Slightly slower than normal
    "clarity": "high"
}
```

## Step 5: Conversation Memory

Every interaction is stored so the system remembers patient preferences:

```python
from supermemory import Memory

memory = Memory(api_key="your_key")

# Store this interaction
memory.add(
    content=f"Patient requested Lisinopril refill. Submitted to Walgreens Oak St. Ready by tomorrow.",
    metadata={
        "patient_id": "P-1234",
        "type": "medication_refill",
        "medication": "Lisinopril",
        "timestamp": "2026-03-29T14:30:00Z"
    }
)

# Future sessions can retrieve:
# "When was Margaret's last Lisinopril refill?"
# "Has she mentioned any side effects?"
```

## Step 6: Daily Health Reminders (Outbound Calls)

The system proactively calls patients for reminders:

```python
import schedule

def morning_reminder(patient_id: str):
    patient = get_patient(patient_id)
    context = memory.get_context(patient_id)

    reminder_text = generate_reminder(patient, context)
    # "Good morning, Margaret. Don't forget to take your Lisinopril
    #  and Metformin with breakfast. Your appointment with Dr. Patel
    #  is next Saturday at 10 AM."

    # Call patient and play audio
    call = telephony.call(patient.phone)
    for chunk in tts.stream(reminder_text, speaker=PATIENT_VOICE):
        call.play(chunk)

    # Listen for response
    response = asr.transcribe(call.audio_stream, timeout=30)
    if response.text:
        # Process any follow-up ("Can you reschedule that appointment?")
        handle_followup(patient_id, response.text)

# Schedule daily reminders
for patient in get_active_patients():
    schedule.every().day.at(patient.preferred_reminder_time).do(
        morning_reminder, patient.id
    )
```

## Results

After 3 months of deployment:

| Metric | Before | After |
|--------|--------|-------|
| Patient calls handled by staff | 100% | 30% |
| Avg. call wait time | 8 min | 0 (instant) |
| Medication refill compliance | 62% | 89% |
| Missed appointments | 23% | 8% |
| Patient satisfaction (65+) | 3.2/5 | 4.6/5 |
| Staff hours on routine calls | 120h/week | 36h/week |

### Why It Works

1. **Zero learning curve** — patients just talk, no apps or passwords
2. **Accurate medical terms** — VibeVoice hotwords handle drug names correctly
3. **Natural voice** — patients report it "sounds like a real person"
4. **Memory** — the system remembers preferences, no repeating information
5. **Proactive** — outbound reminders improve medication compliance
6. **Scalable** — handles 2,000 patients with no additional staff

### Cost Breakdown

| Component | Monthly Cost |
|-----------|-------------|
| VibeVoice ASR (self-hosted, 1x A100) | ~$2,000 |
| VibeVoice TTS Realtime (self-hosted) | ~$800 |
| Claude API (intent processing) | ~$400 |
| Telephony (Twilio) | ~$600 |
| **Total** | **~$3,800** |

vs. 3 FTE call center staff at ~$12,000/month — **68% cost reduction** while improving patient outcomes.
