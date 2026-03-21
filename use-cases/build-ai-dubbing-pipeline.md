---
title: Build an AI Video Dubbing Pipeline
description: "Build an automated video dubbing pipeline — extract audio, transcribe with timestamps, translate, generate dubbed audio in target language, and sync back to video."
skills:
  - assemblyai
  - elevenlabs
  - ffmpeg
difficulty: advanced
time_estimate: "12 hours"
tags: [dubbing, video, assemblyai, elevenlabs, ffmpeg, translation, content-localization, youtube]
---

# Build an AI Video Dubbing Pipeline

## The Problem

You create YouTube content in English. 60% of your potential audience speaks Spanish or Portuguese. Hiring professional dubbing studios costs $300–500 per video and takes weeks. You want to automate dubbing: upload a video, pick a target language, and get back a dubbed video in under 10 minutes — with the original speaker's voice cloned in the target language.

## Pipeline Overview

```
Input video
  ↓ FFmpeg — extract audio track
  ↓ AssemblyAI — transcribe with word-level timestamps
  ↓ GPT-4o — translate transcript (preserving timing marks)
  ↓ ElevenLabs — generate dubbed audio (voice clone of original speaker)
  ↓ FFmpeg — merge dubbed audio with video (preserving background sounds)
  ↓ Output: dubbed video
```

## Prerequisites

```bash
npm install fluent-ffmpeg assemblyai openai elevenlabs node-fetch
# Also requires ffmpeg installed: brew install ffmpeg / apt install ffmpeg
```

```bash
# .env
ASSEMBLYAI_API_KEY=...
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...  # Cloned or pre-built voice ID
```

## Step-by-Step Walkthrough

### Step 1: Extract Audio from Video

```typescript
// lib/extract-audio.ts — Use FFmpeg to extract the audio track

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';

export async function extractAudio(videoPath: string): Promise<string> {
  const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.wav');

  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .noVideo()
      .audioCodec('pcm_s16le')  // WAV PCM — best quality for transcription
      .audioFrequency(16000)    // 16kHz — optimal for speech recognition
      .audioChannels(1)         // Mono
      .save(audioPath)
      .on('end', () => {
        console.log(`Audio extracted: ${audioPath}`);
        resolve(audioPath);
      })
      .on('error', reject);
  });
}

/** Also extract background sounds (music, ambient) by removing speech.
 *  This allows mixing dubbed speech over the original background.
 */
export async function extractBackground(videoPath: string): Promise<string> {
  const bgPath = videoPath.replace(/\.[^.]+$/, '_background.wav');

  return new Promise((resolve, reject) => {
    // Use FFmpeg's afftdn (adaptive noise reduction) as a rough separation
    // For better separation, use Demucs (ML-based) via Python subprocess
    ffmpeg(videoPath)
      .noVideo()
      .audioFilters([
        'afftdn=nf=-25',        // Noise floor reduction
        'highpass=f=200',       // Remove low-frequency speech
        'volume=0.6',           // Slightly reduce background
      ])
      .save(bgPath)
      .on('end', () => resolve(bgPath))
      .on('error', reject);
  });
}
```

### Step 2: Transcribe with Word-Level Timestamps

```typescript
// lib/transcribe.ts — AssemblyAI transcription with word timestamps

import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

export interface TranscriptWord {
  text: string;
  start: number;  // milliseconds from start
  end: number;
  confidence: number;
}

export interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
  words: TranscriptWord[];
}

export async function transcribeWithTimestamps(audioPath: string, language = 'en'): Promise<TranscriptSegment[]> {
  console.log('Uploading audio to AssemblyAI...');

  const transcript = await client.transcripts.transcribe({
    audio: audioPath,
    language_code: language,
    word_boost: [],
    punctuate: true,
    format_text: true,
    // Get utterances (natural sentence-level segments) for better dubbing sync
    speaker_labels: false,
    utterances: true,
  });

  if (!transcript.utterances) {
    throw new Error('Transcription failed: no utterances returned');
  }

  const segments: TranscriptSegment[] = transcript.utterances.map(utt => ({
    text: utt.text,
    start: utt.start,
    end: utt.end,
    words: utt.words?.map(w => ({
      text: w.text,
      start: w.start,
      end: w.end,
      confidence: w.confidence || 1,
    })) || [],
  }));

  console.log(`Transcribed ${segments.length} segments`);
  return segments;
}
```

### Step 3: Translate Transcript with Timing Context

```typescript
// lib/translate.ts — GPT-4o translation preserving timing context

import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface TranslatedSegment {
  original: string;
  translated: string;
  start: number;
  end: number;
  durationMs: number;
}

export async function translateSegments(
  segments: TranscriptSegment[],
  targetLanguage: string,
): Promise<TranslatedSegment[]> {
  // Batch translate all segments in one API call for efficiency
  const segmentList = segments.map((s, i) => `[${i}] (${s.durationMs}ms) ${s.text}`).join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a professional video dubbing translator.
Translate each segment to ${targetLanguage}.
Rules:
- Keep the same emotional tone and speaking pace as the original
- Each translated segment should be roughly the same length to fit in the same time slot (shown in ms)
- Preserve proper nouns, brand names, and technical terms
- Return JSON array: [{"index": 0, "translated": "..."}]`,
      },
      { role: 'user', content: segmentList },
    ],
    response_format: { type: 'json_object' },
  });

  const parsed = JSON.parse(response.choices[0].message.content!);
  const translations: Array<{ index: number; translated: string }> = parsed.translations || parsed;

  return translations.map(t => ({
    original: segments[t.index].text,
    translated: t.translated,
    start: segments[t.index].start,
    end: segments[t.index].end,
    durationMs: segments[t.index].end - segments[t.index].start,
  }));
}
```

### Step 4: Generate Dubbed Audio with ElevenLabs

```typescript
// lib/generate-dub.ts — ElevenLabs TTS for each translated segment

import { ElevenLabsClient } from 'elevenlabs';
import fs from 'fs';
import path from 'path';

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY! });

export async function generateDubbedSegments(
  translations: TranslatedSegment[],
  outputDir: string,
  voiceId: string,
): Promise<Array<{ path: string; start: number; durationMs: number }>> {
  fs.mkdirSync(outputDir, { recursive: true });
  const results = [];

  for (let i = 0; i < translations.length; i++) {
    const seg = translations[i];
    const outputPath = path.join(outputDir, `segment_${i}.mp3`);

    console.log(`Generating segment ${i + 1}/${translations.length}: "${seg.translated.slice(0, 50)}..."`);

    const audio = await elevenlabs.generate({
      voice: voiceId,
      text: seg.translated,
      model_id: 'eleven_multilingual_v2',  // Supports 29 languages
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.85,    // High similarity to original voice
        style: 0.3,
        use_speaker_boost: true,
      },
    });

    // Write audio stream to file
    const chunks: Uint8Array[] = [];
    for await (const chunk of audio) chunks.push(chunk);
    fs.writeFileSync(outputPath, Buffer.concat(chunks));

    // Check actual audio duration vs. target
    const actualDuration = await getAudioDuration(outputPath);
    const targetDuration = seg.durationMs / 1000;

    // If dubbed audio is much longer than target, speed it up slightly (max 20%)
    if (actualDuration > targetDuration * 1.15) {
      const speedFactor = Math.min(actualDuration / targetDuration, 1.2);
      await adjustAudioSpeed(outputPath, speedFactor);
    }

    results.push({ path: outputPath, start: seg.start, durationMs: seg.durationMs });
  }

  return results;
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(audioPath, (err, metadata) => {
      if (err) reject(err);
      else resolve(metadata.format.duration || 0);
    });
  });
}

async function adjustAudioSpeed(audioPath: string, speedFactor: number): Promise<void> {
  const tmpPath = audioPath + '.tmp.mp3';
  await new Promise((resolve, reject) => {
    ffmpeg(audioPath)
      .audioFilters(`atempo=${speedFactor}`)
      .save(tmpPath)
      .on('end', resolve)
      .on('error', reject);
  });
  fs.renameSync(tmpPath, audioPath);
}
```

### Step 5: Merge Dubbed Audio Back into Video

```typescript
// lib/merge-video.ts — Combine video + background + dubbed segments

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';

export async function buildDubbedVideo(
  originalVideo: string,
  backgroundAudio: string,
  segments: Array<{ path: string; start: number }>,
  outputPath: string,
): Promise<string> {
  // Build FFmpeg complex filter to position each audio segment at the right timestamp
  const inputs: string[] = [originalVideo, backgroundAudio];
  const filterParts: string[] = [
    `[1:a]volume=0.3[bg]`,  // Background at 30% volume
  ];

  let currentMix = '[bg]';

  segments.forEach((seg, i) => {
    inputs.push(seg.path);
    const inputIdx = i + 2;
    const delayMs = seg.start;

    // Delay dubbed segment to match original timing
    filterParts.push(`[${inputIdx}:a]adelay=${delayMs}|${delayMs}[dub${i}]`);
    filterParts.push(`${currentMix}[dub${i}]amix=inputs=2:normalize=0[mix${i}]`);
    currentMix = `[mix${i}]`;
  });

  filterParts.push(`${currentMix}volume=2.0[out]`);

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg();
    inputs.forEach(input => cmd.input(input));

    cmd
      .complexFilter(filterParts.join(';'))
      .map('[0:v]')  // Original video track
      .map('[out]')  // Dubbed audio mix
      .videoCodec('copy')  // Don't re-encode video — much faster
      .audioCodec('aac')
      .audioBitrate('192k')
      .save(outputPath)
      .on('progress', (progress) => {
        console.log(`Processing: ${progress.percent?.toFixed(1)}%`);
      })
      .on('end', () => {
        console.log(`Dubbed video saved: ${outputPath}`);
        resolve(outputPath);
      })
      .on('error', reject);
  });
}
```

### Step 6: Full Pipeline Orchestrator

```typescript
// dub-video.ts — Run the full dubbing pipeline

import path from 'path';
import { extractAudio, extractBackground } from './lib/extract-audio';
import { transcribeWithTimestamps } from './lib/transcribe';
import { translateSegments } from './lib/translate';
import { generateDubbedSegments } from './lib/generate-dub';
import { buildDubbedVideo } from './lib/merge-video';

async function dubVideo(inputPath: string, targetLanguage: string) {
  const baseName = path.basename(inputPath, path.extname(inputPath));
  const workDir = `./tmp/${baseName}`;
  const outputPath = `./output/${baseName}_${targetLanguage}.mp4`;

  console.log(`\n🎬 Dubbing "${baseName}" → ${targetLanguage}`);
  console.time('Total pipeline time');

  // Step 1: Extract audio
  console.log('\n1/5 Extracting audio...');
  const [audioPath, bgAudioPath] = await Promise.all([
    extractAudio(inputPath),
    extractBackground(inputPath),
  ]);

  // Step 2: Transcribe
  console.log('\n2/5 Transcribing with AssemblyAI...');
  const segments = await transcribeWithTimestamps(audioPath);

  // Step 3: Translate
  console.log(`\n3/5 Translating ${segments.length} segments to ${targetLanguage}...`);
  const translations = await translateSegments(segments, targetLanguage);

  // Step 4: Generate dubbed audio
  console.log('\n4/5 Generating dubbed audio with ElevenLabs...');
  const dubbedSegments = await generateDubbedSegments(
    translations,
    `${workDir}/segments`,
    process.env.ELEVENLABS_VOICE_ID!,
  );

  // Step 5: Merge
  console.log('\n5/5 Merging video with dubbed audio...');
  await buildDubbedVideo(inputPath, bgAudioPath, dubbedSegments, outputPath);

  console.timeEnd('Total pipeline time');
  console.log(`\n✅ Done! Output: ${outputPath}`);
  return outputPath;
}

// Run
dubVideo('./input/my-video.mp4', 'Spanish')
  .then(output => console.log(`Dubbed video: ${output}`))
  .catch(console.error);
```

## Typical Timing (10-minute video)

| Step | Time |
|------|------|
| Audio extraction | 5 sec |
| AssemblyAI transcription | 90 sec |
| GPT-4o translation | 15 sec |
| ElevenLabs TTS (batch) | 3-5 min |
| FFmpeg merge | 30 sec |
| **Total** | **~7 minutes** |

## Cost per 10-Minute Video

- AssemblyAI: ~$0.37 (at $0.37/hour)
- GPT-4o translation: ~$0.08
- ElevenLabs: ~$0.30 (at $0.30/1K chars, ~1000 chars)
- **Total: ~$0.75 per video** vs. $300+ professional dubbing

## Related Skills

- [assemblyai](../skills/assemblyai/) — Transcription, word timestamps, speaker diarization
- [elevenlabs](../skills/elevenlabs/) — Multilingual TTS, voice cloning, audio generation
- [ffmpeg](../skills/ffmpeg/) — Audio extraction, video merging, timing adjustments
