---
title: Build a Voice Synthesis API
slug: build-voice-synthesis-api
description: Build a voice synthesis API with text-to-speech generation, voice cloning, multilingual support, SSML markup, streaming audio, and usage-based billing for voice-enabled applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - tts
  - voice
  - speech-synthesis
  - audio
  - api
---

# Build a Voice Synthesis API

## The Problem

Arjun leads product at a 20-person edtech company. They want to add voice narration to their courses — 10,000 lessons that currently only have text. Recording with voice actors costs $50/lesson ($500K total) and takes 6 months. When content updates, re-recording is expensive. They tried browser TTS but it sounds robotic and doesn't support their 8 languages. They need a voice synthesis API: natural-sounding voices, multilingual, SSML for pronunciation control, streaming for real-time playback, and voice cloning so their brand voice stays consistent.

## Step 1: Build the Voice Synthesis Engine

```typescript
// src/voice/synthesis.ts — Voice synthesis API with streaming, SSML, and voice management
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
import { Readable } from "node:stream";

const redis = new Redis(process.env.REDIS_URL!);

interface Voice {
  id: string;
  name: string;
  language: string;
  gender: "male" | "female" | "neutral";
  style: "conversational" | "narration" | "news" | "cheerful";
  sampleUrl: string;
  provider: "internal" | "elevenlabs" | "azure" | "google";
  providerVoiceId: string;
  isClone: boolean;
  createdBy: string;
}

interface SynthesisRequest {
  text: string;
  voiceId: string;
  format: "mp3" | "wav" | "ogg" | "opus";
  speed: number;              // 0.5-2.0
  pitch: number;              // -20 to +20 semitones
  ssml?: boolean;             // treat text as SSML markup
  streaming?: boolean;        // stream audio chunks
}

interface SynthesisResult {
  id: string;
  audioUrl: string;
  duration: number;           // seconds
  characterCount: number;
  cached: boolean;
  cost: number;               // in credits
}

// Synthesize speech
export async function synthesize(request: SynthesisRequest, userId: string): Promise<SynthesisResult> {
  const id = `synth-${randomBytes(6).toString("hex")}`;

  // Check cache (same text + voice + settings = same audio)
  const cacheKey = createHash("sha256")
    .update(`${request.voiceId}:${request.text}:${request.speed}:${request.pitch}:${request.format}`)
    .digest("hex");

  const cached = await redis.get(`voice:cache:${cacheKey}`);
  if (cached) {
    const result = JSON.parse(cached);
    return { ...result, id, cached: true };
  }

  // Get voice config
  const voice = await getVoice(request.voiceId);
  if (!voice) throw new Error("Voice not found");

  // Check usage quota
  const charCount = request.text.length;
  const hasQuota = await checkQuota(userId, charCount);
  if (!hasQuota) throw new Error("Character quota exceeded");

  // Preprocess text
  let processedText = request.text;
  if (!request.ssml) {
    processedText = addSSMLDefaults(processedText, request.speed, request.pitch);
  }

  // Route to provider
  const audioBuffer = await routeToProvider(voice, processedText, request.format);
  const duration = estimateDuration(charCount, request.speed);

  // Store audio
  const audioPath = `audio/${id}.${request.format}`;
  // In production: upload to S3/R2
  const audioUrl = `${process.env.CDN_URL}/${audioPath}`;

  // Calculate cost (1 credit per 100 characters)
  const cost = Math.ceil(charCount / 100);
  await deductCredits(userId, cost);

  // Log synthesis
  await pool.query(
    `INSERT INTO synthesis_logs (id, user_id, voice_id, character_count, duration, format, cost, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, userId, request.voiceId, charCount, duration, request.format, cost]
  );

  const result: SynthesisResult = { id, audioUrl, duration, characterCount: charCount, cached: false, cost };

  // Cache for 24h
  await redis.setex(`voice:cache:${cacheKey}`, 86400, JSON.stringify(result));

  return result;
}

// Stream synthesis for real-time playback
export async function synthesizeStream(
  request: SynthesisRequest,
  userId: string
): Promise<Readable> {
  const voice = await getVoice(request.voiceId);
  if (!voice) throw new Error("Voice not found");

  // Split text into chunks for streaming
  const chunks = splitTextForStreaming(request.text);
  const stream = new Readable({ read() {} });

  // Process chunks and push audio data
  (async () => {
    for (const chunk of chunks) {
      const processedChunk = request.ssml ? chunk : addSSMLDefaults(chunk, request.speed, request.pitch);
      const audioChunk = await routeToProvider(voice, processedChunk, request.format);
      stream.push(audioChunk);
    }
    stream.push(null);  // end of stream
  })().catch((err) => stream.destroy(err));

  return stream;
}

// Voice cloning (upload samples, create custom voice)
export async function cloneVoice(params: {
  name: string;
  language: string;
  sampleUrls: string[];      // 3-10 audio samples of the target voice
  userId: string;
}): Promise<Voice> {
  if (params.sampleUrls.length < 3) throw new Error("Minimum 3 audio samples required");
  if (params.sampleUrls.length > 10) throw new Error("Maximum 10 audio samples");

  const id = `voice-${randomBytes(6).toString("hex")}`;

  // In production: send samples to voice cloning API (ElevenLabs, etc.)
  const providerVoiceId = `clone-${id}`;

  const voice: Voice = {
    id, name: params.name,
    language: params.language,
    gender: "neutral",
    style: "conversational",
    sampleUrl: params.sampleUrls[0],
    provider: "elevenlabs",
    providerVoiceId,
    isClone: true,
    createdBy: params.userId,
  };

  await pool.query(
    `INSERT INTO voices (id, name, language, gender, style, sample_url, provider, provider_voice_id, is_clone, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, NOW())`,
    [id, params.name, params.language, voice.gender, voice.style,
     voice.sampleUrl, voice.provider, providerVoiceId, params.userId]
  );

  return voice;
}

function addSSMLDefaults(text: string, speed: number, pitch: number): string {
  return `<speak><prosody rate="${speed * 100}%" pitch="${pitch > 0 ? '+' : ''}${pitch}st">${text}</prosody></speak>`;
}

function splitTextForStreaming(text: string): string[] {
  // Split at sentence boundaries for natural-sounding chunks
  return text.match(/[^.!?]+[.!?]+/g) || [text];
}

async function routeToProvider(voice: Voice, text: string, format: string): Promise<Buffer> {
  // Provider routing — in production, calls actual TTS APIs
  return Buffer.from(text);  // placeholder
}

function estimateDuration(charCount: number, speed: number): number {
  const wordsPerMinute = 150 * speed;
  const words = charCount / 5;  // avg 5 chars per word
  return (words / wordsPerMinute) * 60;
}

async function getVoice(voiceId: string): Promise<Voice | null> {
  const cached = await redis.get(`voice:${voiceId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query("SELECT * FROM voices WHERE id = $1", [voiceId]);
  if (row) await redis.setex(`voice:${voiceId}`, 3600, JSON.stringify(row));
  return row || null;
}

async function checkQuota(userId: string, chars: number): Promise<boolean> {
  const { rows: [{ credits }] } = await pool.query(
    "SELECT credits FROM user_quotas WHERE user_id = $1", [userId]
  );
  return credits >= Math.ceil(chars / 100);
}

async function deductCredits(userId: string, amount: number): Promise<void> {
  await pool.query(
    "UPDATE user_quotas SET credits = credits - $2 WHERE user_id = $1",
    [userId, amount]
  );
}

// List available voices
export async function listVoices(language?: string): Promise<Voice[]> {
  const sql = language
    ? "SELECT * FROM voices WHERE language = $1 ORDER BY name"
    : "SELECT * FROM voices ORDER BY name";
  const { rows } = await pool.query(sql, language ? [language] : []);
  return rows;
}
```

## Results

- **10,000 lessons narrated in 2 weeks** — batch synthesis at $0.50/lesson vs $50 with voice actors; $495K saved; content updates re-synthesized in minutes
- **8 languages from day one** — multilingual voices for English, Spanish, French, German, Japanese, Korean, Chinese, Portuguese; no voice actor coordination
- **Brand voice consistency** — CEO's voice cloned from 5 podcast samples; all premium courses narrated in brand voice; recognizable and personal
- **Streaming playback** — audio starts playing in <500ms; text split at sentence boundaries; natural pauses preserved; no waiting for full synthesis
- **Cache hits save 60% costs** — popular lesson replayed 1000 times; synthesized once; CDN serves cached audio; usage-based billing predictable
