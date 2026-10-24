---
title: Build an AI Video Dubbing Pipeline
description: "Build an automated video dubbing pipeline — extract audio, transcribe with timestamps, translate, generate dubbed audio in the target language with a consented voice clone, and sync it back to the video."
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

You publish YouTube videos in English, and part of your audience would rather watch in Spanish or Portuguese. A professional dubbing studio takes weeks and is priced per video. You want to automate it: give the pipeline a video and a target language, and get back a dubbed video where the speaker's own voice, cloned with their consent, speaks the translation.

## Consent comes first

Cloning a voice needs the speaker's explicit permission. Before you create or use any cloned voice:

- Get the speaker's written consent that names the purpose (dubbing these videos into these languages). If the speaker is not you, keep the record.
- Only upload recordings of that speaker to the clone endpoint, and clone only voices you are allowed to use under the ElevenLabs terms.
- If you have no consent, do not clone: use a stock voice from your ElevenLabs voice library instead (look it up with `voices.search`).
- Never dub a video of a person with a voice that listeners could take for theirs unless that person agreed, and say in the video description that the audio is AI-dubbed.

## Pipeline Overview

```
Input video
  ↓ FFmpeg — extract a mono 16 kHz audio track (and optionally the background stem)
  ↓ AssemblyAI — transcribe, get sentences with millisecond timestamps
  ↓ LLM — translate each sentence, keeping its time slot in mind
  ↓ ElevenLabs — speak each sentence with the consented voice
  ↓ FFmpeg — place the clips at their timestamps over the background, keep the video stream
  ↓ Output: dubbed video
```

## Prerequisites

```bash
npm install @elevenlabs/elevenlabs-js assemblyai openai
npm install -D typescript tsx @types/node
# ffmpeg and ffprobe must be on PATH: apt install ffmpeg / brew install ffmpeg
```

Set `"type": "module"` in `package.json` (the scripts use top-level `await`). The unscoped `elevenlabs` package is deprecated in favour of `@elevenlabs/elevenlabs-js`, and `fluent-ffmpeg` is no longer supported, so the code below calls the `ffmpeg` and `ffprobe` binaries directly.

```bash
# .env (keep it out of git; load it with: node --env-file=.env ...)
ASSEMBLYAI_API_KEY=...
OPENAI_API_KEY=...
TRANSLATE_MODEL=gpt-6.1-sol  # any chat model your account can use; ids are on https://developers.openai.com/api/docs/models (gpt-6-luna is the cheap one)
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...  # the consented clone (see Step 0) or a stock voice
```

## Step-by-Step Walkthrough

### Step 0: Create the voice clone (only with consent)

```typescript
// clone-voice.ts — run once per speaker, after you hold their consent
import fs from 'node:fs';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

const client = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });
const voice = await client.voices.ivc.create({
  name: 'Anna Keller (dubbing, consent on file 2026-10-12)',
  files: [fs.createReadStream('samples/anna-01.mp3'), fs.createReadStream('samples/anna-02.mp3')],
  removeBackgroundNoise: true,
});
console.log(voice.voiceId); // put this in ELEVENLABS_VOICE_ID
```

Use a few minutes of clean, single-speaker audio. Instant cloning (`voices.ivc`) is the quick option; professional cloning needs more audio and identity verification in the ElevenLabs dashboard.

### Step 1: Extract the audio

```typescript
// lib/ffmpeg.ts — thin wrappers over the ffmpeg and ffprobe binaries
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const ffmpeg = (args: string[]) => run('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

export async function durationMs(file: string): Promise<number> {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
  ]);
  return Math.round(parseFloat(stdout) * 1000);
}
```

```typescript
// lib/extract-audio.ts
import { ffmpeg } from './ffmpeg';

export async function extractAudio(video: string): Promise<string> {
  const out = video.replace(/\.[^.]+$/, '_audio.wav');
  // -vn drops video; 16 kHz mono 16-bit PCM is plenty for speech recognition
  await ffmpeg(['-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', out]);
  return out;
}
```

FFmpeg filters cannot remove a voice from a mix. If the video has music or ambience you want to keep, separate it with [Demucs](https://github.com/adefossez/demucs) (`pip install -U demucs`):

```bash
demucs --two-stems=vocals -o stems my-video_audio.wav
# background without speech: stems/htdemucs/my-video_audio/no_vocals.wav
```

Skip this and Step 5 lowers the original track under the dub instead, which leaves the original voice faintly audible.

### Step 2: Transcribe into timed sentences

```typescript
// lib/transcribe.ts
import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

export interface Segment { text: string; start: number; end: number } // milliseconds

export async function transcribe(audioPath: string, language = 'en'): Promise<Segment[]> {
  const transcript = await client.transcripts.transcribe({
    audio: audioPath,
    language_code: language,
  });
  // A failed job is returned, not thrown
  if (transcript.status === 'error') throw new Error(`Transcription failed: ${transcript.error}`);

  const { sentences } = await client.transcripts.sentences(transcript.id);
  return sentences.map(s => ({ text: s.text, start: s.start, end: s.end }));
}
```

Omitting `speech_models` uses the current default model list. Sentences are a good dubbing unit.

### Step 3: Translate with the time slot in mind

```typescript
// lib/translate.ts
import OpenAI from 'openai';
import type { Segment } from './transcribe';

const openai = new OpenAI(); // reads OPENAI_API_KEY

export interface Translated extends Segment { translated: string }

export async function translate(segments: Segment[], language: string): Promise<Translated[]> {
  const list = segments.map((s, i) => `[${i}] (${s.end - s.start} ms) ${s.text}`).join('\n');

  const res = await openai.chat.completions.create({
    model: process.env.TRANSLATE_MODEL!,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a professional dubbing translator. Translate every numbered segment into ${language}.
- Keep the tone and pace; the translation must be speakable in about the same time as the original (ms shown).
- Keep product names and technical terms unchanged.
- Reply with JSON only: {"translations":[{"index":0,"translated":"..."}]}`,
      },
      { role: 'user', content: list },
    ],
  });

  const parsed = JSON.parse(res.choices[0].message.content ?? '{}');
  const items: { index: number; translated: string }[] = parsed.translations ?? [];
  if (items.length !== segments.length) throw new Error('Translation count mismatch; retry');
  return items.map(t => ({ ...segments[t.index], translated: t.translated }));
}
```

For a long video, translate in batches of about 50 segments.

### Step 4: Speak each sentence with ElevenLabs

```typescript
// lib/generate-dub.ts
import fs from 'node:fs';
import path from 'node:path';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { ffmpeg, durationMs } from './ffmpeg';
import type { Translated } from './translate';

const elevenlabs = new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY });

export interface Clip { path: string; start: number }

export async function generateDub(items: Translated[], dir: string, voiceId: string): Promise<Clip[]> {
  fs.mkdirSync(dir, { recursive: true });
  const clips: Clip[] = [];

  for (const [i, seg] of items.entries()) {
    const file = path.join(dir, `segment_${i}.mp3`);
    const audio = await elevenlabs.textToSpeech.convert(voiceId, {
      text: seg.translated,
      modelId: 'eleven_multilingual_v2', // stable long-form narration, 29 languages
      outputFormat: 'mp3_44100_128',
      voiceSettings: { stability: 0.5, similarityBoost: 0.85, style: 0.3, useSpeakerBoost: true },
      // Neighbouring text keeps the intonation continuous between clips
      previousText: items[i - 1]?.translated,
      nextText: items[i + 1]?.translated,
    });
    // convert() returns a web ReadableStream of bytes
    fs.writeFileSync(file, Buffer.from(await new Response(audio).arrayBuffer()));

    // If the clip overruns its slot, speed it up by at most 20 % (atempo accepts 0.5-2.0)
    const slot = seg.end - seg.start;
    const actual = await durationMs(file);
    if (actual > slot * 1.15) {
      const fast = file.replace('.mp3', '_fast.mp3');
      await ffmpeg(['-i', file, '-filter:a', `atempo=${Math.min(actual / slot, 1.2)}`, fast]);
      fs.renameSync(fast, file);
    }
    clips.push({ path: file, start: seg.start });
  }
  return clips;
}
```

`eleven_multilingual_v2` is the stable long-form model; check the ElevenLabs models page for newer ones before you commit to a model. Clips that still overrun can run into the next sentence, so for those shorten the translation and regenerate.

### Step 5: Merge the dub back into the video

```typescript
// lib/merge-video.ts
import { ffmpeg } from './ffmpeg';
import type { Clip } from './generate-dub';

export async function buildDubbedVideo(
  video: string,
  clips: Clip[],
  out: string,
  backgroundStem?: string, // e.g. Demucs no_vocals.wav; omit to lower the original audio instead
): Promise<string> {
  const args = ['-i', video];
  if (backgroundStem) args.push('-i', backgroundStem);
  const first = backgroundStem ? 2 : 1; // input index of the first clip
  clips.forEach(c => args.push('-i', c.path));

  const bgInput = backgroundStem ? '1:a' : '0:a';
  const filters = [`[${bgInput}]volume=${backgroundStem ? 0.8 : 0.15}[bg]`];
  clips.forEach((c, i) => filters.push(`[${first + i}:a]adelay=${c.start}:all=1[d${i}]`));
  const labels = ['[bg]', ...clips.map((_, i) => `[d${i}]`)].join('');
  // normalize=0 keeps every input at its own level (amix otherwise divides by the input count)
  filters.push(`${labels}amix=inputs=${clips.length + 1}:normalize=0:duration=first[out]`);

  await ffmpeg([
    ...args,
    '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', '[out]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    out,
  ]);
  return out;
}
```

### Step 6: The orchestrator

```typescript
// dub-video.ts — run with: node --env-file=.env --import tsx dub-video.ts input/my-video.mp4 Spanish
import fs from 'node:fs';
import path from 'node:path';
import { extractAudio } from './lib/extract-audio';
import { transcribe } from './lib/transcribe';
import { translate } from './lib/translate';
import { generateDub } from './lib/generate-dub';
import { buildDubbedVideo } from './lib/merge-video';

const [input, language = 'Spanish', stem] = process.argv.slice(2);
const name = path.basename(input, path.extname(input));
fs.mkdirSync('output', { recursive: true });

const audio = await extractAudio(input);
const segments = await transcribe(audio);
const translated = await translate(segments, language);
const clips = await generateDub(translated, `tmp/${name}`, process.env.ELEVENLABS_VOICE_ID!);
const out = await buildDubbedVideo(input, clips, `output/${name}_${language}.mp4`, stem);
console.log(`Dubbed video: ${out}`);
```

Before you publish, listen to the whole result with a native speaker: automatic translation and timing both slip on idioms and fast speech.

## Real-World Example

Anna runs a 40-video English tutorial channel. After she signs a one-page consent note for the dubbing project, she clones her voice from two clean recordings, runs the pipeline on her three most-watched videos for Spanish, and has a Spanish-speaking friend check the scripts. She uploads the results as extra audio tracks and states in each description that the Spanish audio is AI-dubbed with her permission. Segments that overrun their slot get a shorter translation rather than a faster voice.

## Related Skills

- [assemblyai](../skills/assemblyai/) — Transcription, sentence and word timestamps, speaker labels
- [elevenlabs](../skills/elevenlabs/) — Multilingual speech, voice cloning (with consent), audio generation
- [ffmpeg](../skills/ffmpeg/) — Audio extraction, mixing, timing adjustments
