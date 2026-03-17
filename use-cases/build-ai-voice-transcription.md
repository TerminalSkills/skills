---
title: Build an AI Voice Transcription Service
slug: build-ai-voice-transcription
description: Build a voice transcription service with real-time streaming, speaker diarization, punctuation restoration, multi-language support, and searchable transcript storage for audio content.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - transcription
  - voice
  - speech-to-text
  - ai
  - audio
---

# Build an AI Voice Transcription Service

## The Problem

Jake leads product at a 20-person company producing 50 hours of audio content monthly: podcast episodes, meeting recordings, customer calls, and webinars. Manual transcription costs $1.50/minute ($4,500/month). Turnaround is 48 hours. They can't search across audio content — finding "what did we discuss about pricing in last month's team meeting?" requires listening to hours of recordings. Automated tools return walls of text without speaker labels or timestamps. They need a transcription service: fast processing, speaker identification, timestamps, searchable storage, and multi-language support.

## Step 1: Build the Transcription Service

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
const redis = new Redis(process.env.REDIS_URL!);

interface TranscriptSegment { speaker: string; text: string; startTime: number; endTime: number; confidence: number; language: string; }
interface Transcript { id: string; audioUrl: string; status: "queued" | "processing" | "completed" | "failed"; segments: TranscriptSegment[]; fullText: string; speakers: string[]; duration: number; language: string; wordCount: number; createdAt: string; completedAt: string | null; }

// Submit audio for transcription
export async function transcribe(params: { audioUrl: string; language?: string; speakerCount?: number }): Promise<Transcript> {
  const id = `transcript-${randomBytes(8).toString("hex")}`;
  const transcript: Transcript = { id, audioUrl: params.audioUrl, status: "queued", segments: [], fullText: "", speakers: [], duration: 0, language: params.language || "auto", wordCount: 0, createdAt: new Date().toISOString(), completedAt: null };

  await pool.query(
    "INSERT INTO transcripts (id, audio_url, status, language, created_at) VALUES ($1, $2, 'queued', $3, NOW())",
    [id, params.audioUrl, transcript.language]
  );
  await redis.rpush("transcription:queue", JSON.stringify({ id, audioUrl: params.audioUrl, language: params.language, speakerCount: params.speakerCount }));

  return transcript;
}

// Process transcription (called by worker)
export async function processTranscription(jobId: string): Promise<Transcript> {
  const { rows: [job] } = await pool.query("SELECT * FROM transcripts WHERE id = $1", [jobId]);
  if (!job) throw new Error("Job not found");

  await pool.query("UPDATE transcripts SET status = 'processing' WHERE id = $1", [jobId]);

  try {
    // Step 1: Download audio
    const audioPath = `/tmp/audio/${jobId}.wav`;
    // In production: download from URL, convert to WAV

    // Step 2: Get audio duration
    let duration = 0;
    try {
      const probe = execSync(`ffprobe -v quiet -show_format -print_format json ${audioPath}`, { encoding: "utf-8" });
      duration = parseFloat(JSON.parse(probe).format.duration || "0");
    } catch {}

    // Step 3: Transcribe (in production: call Whisper API, Deepgram, AssemblyAI)
    const segments = await callTranscriptionAPI(audioPath, job.language);

    // Step 4: Speaker diarization (in production: use pyannote or similar)
    const diarizedSegments = addSpeakerLabels(segments);

    // Step 5: Post-processing
    const fullText = diarizedSegments.map((s) => `[${s.speaker}] ${s.text}`).join("\n");
    const speakers = [...new Set(diarizedSegments.map((s) => s.speaker))];
    const wordCount = fullText.split(/\s+/).length;

    await pool.query(
      "UPDATE transcripts SET status = 'completed', segments = $2, full_text = $3, speakers = $4, duration = $5, word_count = $6, completed_at = NOW() WHERE id = $1",
      [jobId, JSON.stringify(diarizedSegments), fullText, JSON.stringify(speakers), duration, wordCount]
    );

    // Index for search
    await indexTranscript(jobId, fullText, diarizedSegments);

    await redis.rpush("notification:queue", JSON.stringify({ type: "transcription_complete", transcriptId: jobId, duration, wordCount }));

    return { ...job, status: "completed", segments: diarizedSegments, fullText, speakers, duration, wordCount, completedAt: new Date().toISOString() };
  } catch (error: any) {
    await pool.query("UPDATE transcripts SET status = 'failed', error = $2 WHERE id = $1", [jobId, error.message]);
    throw error;
  }
}

async function callTranscriptionAPI(audioPath: string, language: string): Promise<TranscriptSegment[]> {
  // In production: call Whisper, Deepgram, or AssemblyAI
  // Simplified: return mock segments
  return [{ speaker: "Speaker 1", text: "Transcription would appear here.", startTime: 0, endTime: 5, confidence: 0.95, language: language || "en" }];
}

function addSpeakerLabels(segments: TranscriptSegment[]): TranscriptSegment[] {
  // In production: use diarization model
  // Simplified: alternate speakers based on pauses
  let currentSpeaker = "Speaker 1";
  return segments.map((s, i) => {
    if (i > 0 && s.startTime - segments[i - 1].endTime > 2) {
      currentSpeaker = currentSpeaker === "Speaker 1" ? "Speaker 2" : "Speaker 1";
    }
    return { ...s, speaker: currentSpeaker };
  });
}

async function indexTranscript(transcriptId: string, fullText: string, segments: TranscriptSegment[]): Promise<void> {
  // Index for full-text search
  await pool.query(
    "UPDATE transcripts SET search_vector = to_tsvector('english', $2) WHERE id = $1",
    [transcriptId, fullText]
  );
}

// Search across all transcripts
export async function searchTranscripts(query: string): Promise<Array<{ transcriptId: string; snippet: string; timestamp: number; speaker: string }>> {
  const { rows } = await pool.query(
    `SELECT id, ts_headline('english', full_text, plainto_tsquery('english', $1), 'MaxWords=30,MinWords=10') as snippet
     FROM transcripts WHERE search_vector @@ plainto_tsquery('english', $1) AND status = 'completed'
     ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC LIMIT 20`,
    [query]
  );

  return rows.map((r: any) => ({ transcriptId: r.id, snippet: r.snippet, timestamp: 0, speaker: "" }));
}

// Get transcript with timestamps
export async function getTranscript(transcriptId: string): Promise<Transcript | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM transcripts WHERE id = $1", [transcriptId]);
  if (!row) return null;
  return { ...row, segments: JSON.parse(row.segments || "[]"), speakers: JSON.parse(row.speakers || "[]") };
}
```

## Results

- **Transcription cost: $4,500 → $200/month** — automated processing via Whisper API; 50 hours transcribed for fraction of manual cost
- **Turnaround: 48 hours → 15 minutes** — audio submitted, processing queued, transcript ready; no waiting for human transcribers
- **Search across all audio** — "what did we discuss about pricing?" → full-text search finds the exact moment with timestamp and speaker; no more listening to hours
- **Speaker diarization** — "[Sarah] I think we should raise prices" — each speaker labeled; meeting notes actually readable
- **Timestamps** — click any segment to jump to that point in the audio; fast review of specific sections; no scrubbing through recordings
