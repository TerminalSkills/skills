---
name: assemblyai
description: >-
  AssemblyAI API for speech recognition, transcription, and audio intelligence.
  Use when transcribing audio or video files, performing speaker diarization,
  running sentiment analysis on calls, detecting unsafe content in audio, or
  asking LLM-powered questions about recorded content with LeMUR.
license: Apache-2.0
compatibility: "Requires Python 3.9+ or Node.js 18+. Install: pip install assemblyai. API key required."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-media
  tags: ["assemblyai", "transcription", "speech-recognition", "audio-ai", "diarization"]
  use-cases:
    - "Transcribe a podcast episode with speaker labels and auto-generated chapters"
    - "Run sentiment analysis on customer support call recordings"
    - "Extract key insights and action items from meeting recordings using LeMUR"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# AssemblyAI

## Overview

AssemblyAI provides best-in-class speech recognition plus an intelligence layer: speaker diarization, sentiment analysis, auto chapters, content moderation, and LeMUR (LLM-powered Q&A on audio). Use it to turn audio/video files into structured, queryable data.

## Setup

```bash
pip install assemblyai python-dotenv
export ASSEMBLYAI_API_KEY="your_api_key_here"
```

## Core Concepts

- **Transcript**: The async job that converts audio → text. Submit a URL or file, poll for completion.
- **Audio Intelligence**: Optional enrichments added to the transcript request (diarization, sentiment, chapters, etc.).
- **LeMUR**: Apply LLMs to your transcript — summarize, answer questions, extract structured data.
- **Real-time**: Stream audio via WebSocket for live transcription.

## Instructions

### Step 1: Initialize the client

```python
import assemblyai as aai
import os

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]
```

### Step 2: Transcribe a file (basic)

```python
def transcribe(audio_source: str) -> aai.Transcript:
    """
    audio_source: URL (https://...) or local file path.
    Returns the completed Transcript object.
    """
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_source)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"Transcription error: {transcript.error}")

    print(f"Transcript ID: {transcript.id}")
    print(f"Text (first 300 chars): {transcript.text[:300]}...")
    return transcript

t = transcribe("https://assembly.ai/sports_injuries.mp3")
print(t.text)
```

### Step 3: Transcribe with full audio intelligence

```python
def transcribe_rich(audio_source: str) -> aai.Transcript:
    """Transcribe with speaker labels, sentiment, chapters, and content safety."""
    config = aai.TranscriptionConfig(
        speaker_labels=True,         # Who said what
        sentiment_analysis=True,     # Positive/negative/neutral per sentence
        auto_chapters=True,          # Generate chapter markers
        content_safety=True,         # Detect profanity, hate speech, etc.
        auto_highlights=True,        # Key phrases and topics
        entity_detection=True,       # People, places, organizations
        iab_categories=True,         # Topic taxonomy
        language_detection=True      # Detect language automatically
    )
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_source, config=config)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error)
    return transcript

t = transcribe_rich("https://your-audio.com/podcast.mp3")

# Speaker diarization
print("\n--- Speakers ---")
for utt in t.utterances:
    print(f"[{utt.speaker}] {utt.text}")

# Chapters
print("\n--- Chapters ---")
for ch in t.chapters:
    start_min = ch.start // 60000
    print(f"[{start_min}m] {ch.headline}: {ch.summary}")

# Sentiment
print("\n--- Sentiment ---")
for s in t.sentiment_analysis[:5]:
    print(f"{s.sentiment.value}: {s.text[:80]}")

# Content safety
print("\n--- Content Safety ---")
for label, result in t.content_safety_labels.results.items():
    if result.status == "flagged":
        print(f"Flagged: {label} (confidence: {result.confidence:.2f})")
```

### Step 4: Real-time streaming transcription

```python
import assemblyai as aai
import pyaudio  # pip install pyaudio

def on_open(session_opened: aai.RealtimeSessionOpened):
    print(f"Session opened: {session_opened.session_id}")

def on_data(transcript: aai.RealtimeTranscript):
    if not transcript.text:
        return
    if isinstance(transcript, aai.RealtimeFinalTranscript):
        print(f"\n[FINAL] {transcript.text}")
    else:
        print(f"\r[partial] {transcript.text}", end="")

def on_error(error: aai.RealtimeError):
    print(f"Error: {error}")

def on_close():
    print("Session closed.")

def stream_microphone():
    """Stream microphone input to AssemblyAI for real-time transcription."""
    transcriber = aai.RealtimeTranscriber(
        sample_rate=16_000,
        on_data=on_data,
        on_error=on_error,
        on_open=on_open,
        on_close=on_close,
        end_utterance_silence_threshold=700
    )
    transcriber.connect()

    FRAMES_PER_BUFFER = 3200
    FORMAT = pyaudio.paInt16
    CHANNELS = 1
    RATE = 16_000

    p = pyaudio.PyAudio()
    stream = p.open(format=FORMAT, channels=CHANNELS, rate=RATE,
                    input=True, frames_per_buffer=FRAMES_PER_BUFFER)
    try:
        print("Recording... Press Ctrl+C to stop.")
        while True:
            data = stream.read(FRAMES_PER_BUFFER)
            transcriber.stream(data)
    except KeyboardInterrupt:
        pass
    finally:
        stream.stop_stream()
        stream.close()
        p.terminate()
        transcriber.close()

stream_microphone()
```

### Step 5: LeMUR — ask questions about audio

```python
def lemur_qa(transcript_id: str, questions: list[str]) -> list[dict]:
    """
    Ask LeMUR questions about a transcript.
    Returns list of {question, answer} dicts.
    """
    transcript = aai.Transcript.get_by_id(transcript_id)
    questions_answers = transcript.lemur.question_answer(
        questions=[
            aai.LemurQuestion(question=q, answer_format="concise")
            for q in questions
        ],
        final_model=aai.LemurModel.claude3_5_sonnet
    )
    results = []
    for qa in questions_answers.response:
        print(f"Q: {qa.question}\nA: {qa.answer}\n")
        results.append({"question": qa.question, "answer": qa.answer})
    return results

# Use LeMUR to extract structured insights
lemur_qa(t.id, [
    "What are the main topics discussed?",
    "List any action items or decisions made.",
    "What is the overall sentiment of the conversation?"
])
```

### Step 6: LeMUR summarization

```python
def lemur_summarize(transcript_id: str, context: str = "") -> str:
    """Generate a concise summary of a transcript."""
    transcript = aai.Transcript.get_by_id(transcript_id)
    result = transcript.lemur.summarize(
        context=context or "This is a podcast episode.",
        answer_format="bullet points",
        final_model=aai.LemurModel.claude3_5_sonnet
    )
    print(result.response)
    return result.response

summary = lemur_summarize(t.id, context="B2B SaaS podcast discussing AI trends")
```

### Step 7: Generate show notes (combined pipeline)

```python
def generate_show_notes(audio_url: str) -> dict:
    """Full podcast processing pipeline."""
    config = aai.TranscriptionConfig(
        speaker_labels=True,
        auto_chapters=True,
        auto_highlights=True
    )
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_url, config=config)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(transcript.error)

    # Build chapters list
    chapters = [
        {"time": f"{ch.start // 60000}:{(ch.start % 60000) // 1000:02d}",
         "title": ch.headline,
         "summary": ch.summary}
        for ch in transcript.chapters
    ]

    # LeMUR for show notes
    show_notes = transcript.lemur.task(
        prompt=(
            "Write podcast show notes in markdown. Include: "
            "1-paragraph episode summary, key takeaways as bullets, "
            "and a list of resources mentioned."
        ),
        final_model=aai.LemurModel.claude3_5_sonnet
    )

    # Social clips (key quotes)
    social_prompt = transcript.lemur.task(
        prompt="Extract 3 compelling quotes suitable for social media posts. Format each as a standalone quote with speaker label.",
        final_model=aai.LemurModel.claude3_5_sonnet
    )

    return {
        "transcript_id": transcript.id,
        "full_text": transcript.text,
        "chapters": chapters,
        "show_notes": show_notes.response,
        "social_clips": social_prompt.response
    }

result = generate_show_notes("https://your-podcast.com/episode-42.mp3")
print(result["show_notes"])
```

## Audio Intelligence features reference

| Feature | Config param | Description |
|---------|-------------|-------------|
| Speaker labels | `speaker_labels=True` | Identify and label each speaker |
| Sentiment analysis | `sentiment_analysis=True` | Per-sentence positive/negative/neutral |
| Auto chapters | `auto_chapters=True` | Detect topic segments with summaries |
| Content safety | `content_safety=True` | Flag hate speech, profanity, etc. |
| Entity detection | `entity_detection=True` | Extract names, places, organizations |
| Key phrases | `auto_highlights=True` | Most important topics and phrases |
| Language detection | `language_detection=True` | Auto-detect spoken language |
| PII redaction | `redact_pii=True` | Mask personal information |

## Guidelines

- Audio must be accessible via URL or uploaded; local files can be passed directly to `transcriber.transcribe()` — the SDK handles uploading.
- Transcription typically completes in 20–50% of audio duration (a 10-min file → ~2–5 min).
- LeMUR runs on top of the completed transcript, adding another few seconds.
- For real-time streaming, use 16kHz mono PCM audio for best accuracy.
- PII redaction (`redact_pii=True`) is useful for compliance when transcribing customer calls.
- Store API keys in environment variables — never hardcode them.
