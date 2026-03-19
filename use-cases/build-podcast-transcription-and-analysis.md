---
title: "Build a Podcast Transcription and Analysis Pipeline"
slug: build-podcast-transcription-and-analysis
description: "Automate podcast post-production with AssemblyAI for transcription, speaker diarization, chapter detection, show notes, and social clips."
skills: [assemblyai]
category: content
tags: [podcast, transcription, audio, automation, assemblyai]
---

# Build a Podcast Transcription and Analysis Pipeline

**Persona:** Podcast producer automating post-production  
**Stack:** AssemblyAI Python SDK, Python  
**Outcome:** Full transcription with speaker labels, chapters, show notes, and social clips — generated automatically after each episode upload

---

## Problem

Post-production is the most time-consuming part of podcasting: editing timestamps, writing show notes, pulling quotes for social media. A 60-minute episode can take 3–4 hours of manual work.

**Solution:** Automate the entire post-production pipeline with AssemblyAI — transcribe with speaker diarization, generate chapters, extract key insights with LeMUR, and produce ready-to-publish show notes and social clips.

---

## Architecture Overview

```
Episode audio file (.mp3/.wav)
    │
    ▼
AssemblyAI Upload + Transcribe
(speaker_labels, auto_chapters, auto_highlights)
    │
    ▼
LeMUR (Claude-powered):
  ├── Episode summary
  ├── Key takeaways
  ├── Show notes (markdown)
  └── 3 social media quotes
    │
    ▼
Output files:
  ├── transcript_EPISODE.txt     (full transcript with speakers)
  ├── show_notes_EPISODE.md      (ready to publish)
  ├── social_clips_EPISODE.txt   (3 shareable quotes)
  └── chapters_EPISODE.json      (timestamps + summaries)
```

---

## Step 1: Install and configure

```bash
pip install assemblyai python-dotenv
export ASSEMBLYAI_API_KEY="your_api_key_here"
```

---

## Step 2: Transcribe the episode

```python
import assemblyai as aai
import os
import json
from pathlib import Path

aai.settings.api_key = os.environ["ASSEMBLYAI_API_KEY"]

def transcribe_episode(audio_path: str, episode_name: str) -> aai.Transcript:
    """
    Transcribe a podcast episode with full audio intelligence.
    audio_path: local file path or URL to the audio file.
    """
    print(f"Submitting: {audio_path}")

    config = aai.TranscriptionConfig(
        speaker_labels=True,        # Identify each speaker (Host, Guest 1, etc.)
        auto_chapters=True,         # Detect topic segments automatically
        auto_highlights=True,       # Extract key phrases and topics
        entity_detection=True,      # Find people, companies, products mentioned
        sentiment_analysis=False,   # Skip for podcasts (adds cost, less useful)
        language_detection=True     # Auto-detect language
    )

    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_path, config=config)

    if transcript.status == aai.TranscriptStatus.error:
        raise RuntimeError(f"Transcription failed: {transcript.error}")

    print(f"✓ Transcript ID: {transcript.id}")
    print(f"  Duration: {transcript.audio_duration:.0f}s")
    print(f"  Words: {len(transcript.words)}")
    print(f"  Chapters: {len(transcript.chapters)}")

    return transcript
```

---

## Step 3: Save the full transcript with speaker labels

```python
def save_speaker_transcript(transcript: aai.Transcript, episode_name: str) -> str:
    """Save transcript formatted with speaker labels and timestamps."""
    lines = []
    current_speaker = None

    for utterance in transcript.utterances:
        speaker = f"Speaker {utterance.speaker}"
        start_min = utterance.start // 60000
        start_sec = (utterance.start % 60000) // 1000

        if speaker != current_speaker:
            lines.append(f"\n[{start_min}:{start_sec:02d}] **{speaker}**")
            current_speaker = speaker

        lines.append(utterance.text)

    output_path = f"transcript_{episode_name}.txt"
    Path(output_path).write_text("\n".join(lines), encoding="utf-8")
    print(f"✓ Transcript saved: {output_path}")
    return output_path
```

---

## Step 4: Save chapter markers

```python
def save_chapters(transcript: aai.Transcript, episode_name: str) -> str:
    """Save chapter markers as JSON and human-readable format."""
    chapters = []
    for ch in transcript.chapters:
        start_min = ch.start // 60000
        start_sec = (ch.start % 60000) // 1000
        end_min = ch.end // 60000
        end_sec = (ch.end % 60000) // 1000

        chapters.append({
            "timestamp": f"{start_min}:{start_sec:02d}",
            "end_timestamp": f"{end_min}:{end_sec:02d}",
            "headline": ch.headline,
            "summary": ch.summary,
            "gist": ch.gist
        })
        print(f"  [{start_min}:{start_sec:02d}] {ch.headline}")

    output_path = f"chapters_{episode_name}.json"
    Path(output_path).write_text(json.dumps(chapters, indent=2), encoding="utf-8")
    print(f"✓ Chapters saved: {output_path}")
    return output_path
```

---

## Step 5: Generate show notes with LeMUR

```python
def generate_show_notes(transcript: aai.Transcript, episode_name: str,
                         episode_title: str = "", guest_name: str = "") -> str:
    """Use LeMUR to write professional show notes."""
    context = f"This is a podcast episode"
    if episode_title:
        context += f" titled '{episode_title}'"
    if guest_name:
        context += f" featuring guest {guest_name}"
    context += "."

    print("Generating show notes with LeMUR...")

    result = transcript.lemur.task(
        prompt="""Write professional podcast show notes in markdown format. Include:

1. **Episode Summary** (2-3 sentences overview)
2. **Key Takeaways** (5-7 bullet points, the most valuable insights)
3. **Episode Highlights** with timestamps from the transcript
4. **Resources & Links Mentioned** (any tools, books, websites mentioned)
5. **About the Guest** (inferred from the conversation)
6. **Connect** (placeholder section for social links)

Write in an engaging, professional tone. Use the actual content from the transcript.""",
        context=context,
        final_model=aai.LemurModel.claude3_5_sonnet
    )

    output_path = f"show_notes_{episode_name}.md"
    Path(output_path).write_text(result.response, encoding="utf-8")
    print(f"✓ Show notes saved: {output_path}")
    return result.response
```

---

## Step 6: Extract social media clips

```python
def extract_social_clips(transcript: aai.Transcript, episode_name: str) -> str:
    """Use LeMUR to find the best quotes for social media."""
    print("Extracting social clips with LeMUR...")

    result = transcript.lemur.task(
        prompt="""Find the 3 most compelling, shareable quotes from this podcast transcript.
For each quote:
- It should be self-contained and impactful (can stand alone without context)
- Ideal length: 1-3 sentences, max 280 characters for Twitter
- Include the speaker label (Host or Guest)
- Add a brief 1-line hook/caption for LinkedIn

Format each as:
---
QUOTE: "[exact quote]"
SPEAKER: [Host/Guest]
CAPTION: [LinkedIn caption hook]
---""",
        final_model=aai.LemurModel.claude3_5_sonnet
    )

    output_path = f"social_clips_{episode_name}.txt"
    Path(output_path).write_text(result.response, encoding="utf-8")
    print(f"✓ Social clips saved: {output_path}")
    return result.response
```

---

## Step 7: Ask custom questions with LeMUR Q&A

```python
def episode_qa(transcript: aai.Transcript, questions: list[str]) -> list[dict]:
    """Answer specific questions about the episode content."""
    print("Running LeMUR Q&A...")

    answers = transcript.lemur.question_answer(
        questions=[
            aai.LemurQuestion(question=q, answer_format="concise, 1-2 sentences")
            for q in questions
        ],
        final_model=aai.LemurModel.claude3_5_sonnet
    )

    results = []
    for qa in answers.response:
        print(f"Q: {qa.question}\nA: {qa.answer}\n")
        results.append({"question": qa.question, "answer": qa.answer})
    return results

# Useful questions for any podcast
qa_results = episode_qa(transcript, [
    "What is the main thesis or central argument of this episode?",
    "What actionable advice did the guest give listeners?",
    "Were any specific statistics or data points mentioned?",
    "What controversial or surprising statements were made?",
    "What is the single most important takeaway for the audience?"
])
```

---

## Step 8: Full pipeline — run everything

```python
def process_episode(
    audio_path: str,
    episode_name: str,
    episode_title: str = "",
    guest_name: str = ""
) -> dict:
    """Complete podcast post-production pipeline."""
    print(f"\n{'='*60}")
    print(f"Processing: {episode_title or episode_name}")
    print(f"{'='*60}\n")

    # 1. Transcribe
    transcript = transcribe_episode(audio_path, episode_name)

    # 2. Save speaker transcript
    transcript_path = save_speaker_transcript(transcript, episode_name)

    # 3. Save chapters
    chapters_path = save_chapters(transcript, episode_name)

    # 4. Generate show notes
    show_notes = generate_show_notes(transcript, episode_name, episode_title, guest_name)

    # 5. Extract social clips
    social_clips = extract_social_clips(transcript, episode_name)

    # 6. Key questions
    qa = episode_qa(transcript, [
        "What is the main topic of this episode?",
        "What are the top 3 actionable takeaways?",
        "What resources or tools were mentioned?"
    ])

    # 7. Print summary
    print(f"\n{'='*60}")
    print("POST-PRODUCTION COMPLETE")
    print(f"{'='*60}")
    print(f"Transcript:   {transcript_path}")
    print(f"Chapters:     {chapters_path}")
    print(f"Show notes:   show_notes_{episode_name}.md")
    print(f"Social clips: social_clips_{episode_name}.txt")

    return {
        "transcript_id": transcript.id,
        "transcript_path": transcript_path,
        "chapters_path": chapters_path,
        "show_notes": show_notes,
        "social_clips": social_clips,
        "qa": qa
    }

# Run the full pipeline
result = process_episode(
    audio_path="episode_42.mp3",
    episode_name="ep42",
    episode_title="The Future of AI in B2B Sales",
    guest_name="Jane Smith, VP Sales at TechCorp"
)
```

---

## Expected Output

For a 60-minute episode:

| Step | Time |
|------|------|
| Upload + transcription | ~5–8 minutes |
| LeMUR show notes | ~15 seconds |
| LeMUR social clips | ~10 seconds |
| LeMUR Q&A | ~10 seconds |
| **Total pipeline** | **~10 minutes** |

**vs. manual post-production:** 3–4 hours

---

## Tips

- Pass the audio file path directly — the SDK handles uploading to AssemblyAI automatically.
- For multi-guest episodes, `speaker_labels=True` separates all speakers. Label them manually after (`Speaker A → Host`, `Speaker B → Jane`).
- Chapters are most accurate for episodes with clear topic transitions — interview-style podcasts work best.
- LeMUR context improves quality — always pass `episode_title` and `guest_name` if available.
- Store `transcript.id` in your database — you can re-run LeMUR queries on past episodes without re-transcribing.
- Transcription costs ~$0.65/hour of audio. LeMUR tasks add ~$0.03–$0.10 each.
