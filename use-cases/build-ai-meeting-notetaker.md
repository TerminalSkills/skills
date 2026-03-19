---
title: Build an AI Meeting Notetaker
slug: build-ai-meeting-notetaker
description: Record, transcribe, and summarize meetings automatically — speaker-aware notes, action items per person, and email summaries sent to all participants the moment the call ends.
skills:
  - assemblyai
  - anthropic-sdk
  - resend
tags:
  - meetings
  - transcription
  - ai
  - productivity
  - automation
---

## The Problem

Maya's team has 15+ recurring meetings per week. They rotate note-takers, but someone always misses action items, no one checks the notes doc, and follow-through is inconsistent. They tried Fireflies and Otter — both work fine, but they're paying $40/seat/month, can't customize the summary format, and the data lives on someone else's servers.

Maya wants a self-hosted notetaker that joins calls, transcribes with speaker labels, and emails each participant a clean summary with the decisions and their specific action items — all in the format her team already uses.

## The Solution

Use assemblyai for transcription with speaker diarization. Use anthropic-sdk to structure the transcript into agenda items, decisions, and per-person action items. Use resend to email the formatted summary to all participants immediately after the meeting ends.

## Step-by-Step Walkthrough

### Step 1: Capture Audio from the Meeting

The simplest path is a desktop recording app that captures system audio and microphone, or a browser-based bot using Puppeteer/Playwright that joins via a meeting link and records the audio stream.

```typescript
// recorder/capture.ts
import { execSync } from 'child_process';
import * as fs from 'fs';

export interface RecordingConfig {
  outputPath: string;
  durationSeconds?: number;  // undefined = manual stop
}

/**
 * Record system audio + microphone using ffmpeg.
 * On macOS: use BlackHole or Soundflower for system audio capture.
 * On Linux: use PulseAudio monitor source.
 * Returns the path to the recorded .mp3 file.
 */
export async function recordMeeting(config: RecordingConfig): Promise<string> {
  const { outputPath } = config;
  
  // macOS: record from default input (mic) — swap for virtual device to capture system audio
  const ffmpegCmd = config.durationSeconds
    ? `ffmpeg -f avfoundation -i ":0" -t ${config.durationSeconds} -q:a 0 ${outputPath}`
    : `ffmpeg -f avfoundation -i ":0" -q:a 0 ${outputPath}`;
  
  console.log(`Recording to ${outputPath}...`);
  execSync(ffmpegCmd);
  
  return outputPath;
}

/**
 * Alternative: download a recording from cloud storage (S3, GCS)
 * if your meeting bot stores raw audio externally.
 */
export async function downloadRecording(url: string, destPath: string): Promise<string> {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
  return destPath;
}
```

### Step 2: Transcribe with Speaker Diarization

AssemblyAI supports async transcription with speaker labels — it returns speaker A/B/C with timestamps that you'll map to real names later.

```typescript
// transcriber/assemblyai.ts
import Anthropic from '@anthropic-ai/sdk';  // just for types example
import { AssemblyAI } from 'assemblyai';

const client = new AssemblyAI({ apiKey: process.env.ASSEMBLYAI_API_KEY! });

export interface TranscriptSegment {
  speaker: string;
  text: string;
  start: number;  // ms
  end: number;    // ms
}

export interface MeetingTranscript {
  segments: TranscriptSegment[];
  fullText: string;
  duration: number;  // seconds
}

/**
 * Upload audio file and transcribe with speaker diarization.
 * AssemblyAI auto-detects the number of speakers.
 */
export async function transcribeRecording(audioPath: string): Promise<MeetingTranscript> {
  console.log('Uploading audio to AssemblyAI...');
  
  const transcript = await client.transcripts.transcribeFile(audioPath, {
    speaker_labels: true,        // enable diarization
    speakers_expected: 4,        // hint: expected number of speakers
    language_detection: true,    // auto-detect language
    punctuate: true,
    format_text: true,
  });

  if (transcript.status === 'error') {
    throw new Error(`Transcription failed: ${transcript.error}`);
  }

  // Parse utterances into segments
  const segments: TranscriptSegment[] = (transcript.utterances || []).map(utterance => ({
    speaker: utterance.speaker || 'Unknown',
    text: utterance.text,
    start: utterance.start,
    end: utterance.end,
  }));

  return {
    segments,
    fullText: transcript.text || '',
    duration: Math.round((transcript.audio_duration || 0)),
  };
}

/**
 * Map AssemblyAI speaker codes (A, B, C...) to real names.
 * Usually done via a participant list passed in with the meeting invite.
 */
export function mapSpeakers(
  segments: TranscriptSegment[],
  speakerMap: Record<string, string>  // { A: 'Maya', B: 'John' }
): TranscriptSegment[] {
  return segments.map(seg => ({
    ...seg,
    speaker: speakerMap[seg.speaker] || `Speaker ${seg.speaker}`,
  }));
}
```

### Step 3: Summarize with Claude

Structure the raw transcript into a meeting summary with agenda, decisions, and action items organized by owner.

```typescript
// summarizer/claude.ts
import Anthropic from '@anthropic-ai/sdk';
import type { MeetingTranscript } from '../transcriber/assemblyai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export interface ActionItem {
  owner: string;
  task: string;
  deadline?: string;
}

export interface MeetingSummary {
  title: string;
  date: string;
  duration: string;
  attendees: string[];
  agenda: string[];
  keyDecisions: string[];
  actionItems: ActionItem[];
  nextMeeting?: string;
  rawSummary: string;
}

/**
 * Use Claude to extract structured summary from the transcript.
 * Returns both a JSON structure and a formatted markdown summary.
 */
export async function summarizeMeeting(
  transcript: MeetingTranscript,
  meetingContext: { title: string; date: string; attendees: string[] }
): Promise<MeetingSummary> {
  // Format transcript as a readable dialogue
  const formattedTranscript = transcript.segments
    .map(seg => `[${seg.speaker}]: ${seg.text}`)
    .join('\n');

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [
      {
        role: 'user',
        content: `You are a meeting summarizer. Extract a structured summary from this transcript.

Meeting: ${meetingContext.title}
Date: ${meetingContext.date}
Attendees: ${meetingContext.attendees.join(', ')}

TRANSCRIPT:
${formattedTranscript}

Return a JSON object with:
- title: meeting title
- agenda: array of main topics discussed
- keyDecisions: array of decisions made
- actionItems: array of { owner, task, deadline? }
- nextMeeting: next meeting date/time if mentioned
- rawSummary: 3-5 sentence prose summary

Return only valid JSON, no markdown code blocks.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  const parsed = JSON.parse(content.text) as Partial<MeetingSummary>;

  return {
    title: parsed.title || meetingContext.title,
    date: meetingContext.date,
    duration: `${Math.round(transcript.duration / 60)} minutes`,
    attendees: meetingContext.attendees,
    agenda: parsed.agenda || [],
    keyDecisions: parsed.keyDecisions || [],
    actionItems: parsed.actionItems || [],
    nextMeeting: parsed.nextMeeting,
    rawSummary: parsed.rawSummary || '',
  };
}
```

### Step 4: Email Summary to Participants

Use Resend to send each participant a formatted summary with their personal action items highlighted.

```typescript
// emailer/send-summary.ts
import { Resend } from 'resend';
import type { MeetingSummary } from '../summarizer/claude';

const resend = new Resend(process.env.RESEND_API_KEY!);

function formatSummaryHtml(summary: MeetingSummary, recipientName: string): string {
  const myActions = summary.actionItems.filter(item =>
    item.owner.toLowerCase().includes(recipientName.toLowerCase())
  );

  const actionItemsHtml = summary.actionItems
    .map(item => `<li><strong>${item.owner}:</strong> ${item.task}${item.deadline ? ` <em>(by ${item.deadline})</em>` : ''}</li>`)
    .join('');

  const myActionsHtml = myActions.length
    ? `<div style="background:#fff3cd;padding:12px;border-radius:6px;margin:16px 0;">
        <strong>Your Action Items:</strong>
        <ul>${myActions.map(a => `<li>${a.task}${a.deadline ? ` — by ${a.deadline}` : ''}</li>`).join('')}</ul>
       </div>`
    : '';

  return `
    <h2>${summary.title}</h2>
    <p><strong>Date:</strong> ${summary.date} &nbsp;|&nbsp; <strong>Duration:</strong> ${summary.duration}</p>
    <p><strong>Attendees:</strong> ${summary.attendees.join(', ')}</p>
    
    ${myActionsHtml}
    
    <h3>Summary</h3>
    <p>${summary.rawSummary}</p>
    
    <h3>Key Decisions</h3>
    <ul>${summary.keyDecisions.map(d => `<li>${d}</li>`).join('')}</ul>
    
    <h3>All Action Items</h3>
    <ul>${actionItemsHtml}</ul>
    
    ${summary.nextMeeting ? `<p><strong>Next Meeting:</strong> ${summary.nextMeeting}</p>` : ''}
  `;
}

export async function emailSummaryToAll(
  summary: MeetingSummary,
  participantEmails: Record<string, string>  // { 'Maya': 'maya@company.com' }
): Promise<void> {
  const sends = Object.entries(participantEmails).map(([name, email]) =>
    resend.emails.send({
      from: 'notetaker@yourcompany.com',
      to: email,
      subject: `Meeting Notes: ${summary.title} — ${summary.date}`,
      html: formatSummaryHtml(summary, name),
    })
  );

  const results = await Promise.allSettled(sends);
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length) {
    console.error(`Failed to send ${failed.length} emails`);
  } else {
    console.log(`Sent summaries to ${Object.keys(participantEmails).length} participants`);
  }
}
```

### Step 5: Orchestrate the Full Pipeline

```typescript
// index.ts — Orchestrate the full pipeline
import { recordMeeting } from './recorder/capture';
import { transcribeRecording, mapSpeakers } from './transcriber/assemblyai';
import { summarizeMeeting } from './summarizer/claude';
import { emailSummaryToAll } from './emailer/send-summary';

async function runMeetingNotetaker(meetingConfig: {
  title: string;
  audioPath: string;           // pre-recorded audio file
  participants: Record<string, string>;   // { 'Maya': 'maya@co.com' }
  speakerMap: Record<string, string>;     // { 'A': 'Maya', 'B': 'John' }
}) {
  const { title, audioPath, participants, speakerMap } = meetingConfig;
  const date = new Date().toLocaleDateString('en-US', { dateStyle: 'full' });

  console.log('Step 1: Transcribing recording...');
  const rawTranscript = await transcribeRecording(audioPath);
  const transcript = { ...rawTranscript, segments: mapSpeakers(rawTranscript.segments, speakerMap) };

  console.log('Step 2: Generating AI summary...');
  const summary = await summarizeMeeting(transcript, {
    title,
    date,
    attendees: Object.keys(participants),
  });

  console.log('Step 3: Emailing summaries...');
  await emailSummaryToAll(summary, participants);

  console.log('Done!', summary);
  return summary;
}

// Example usage
runMeetingNotetaker({
  title: 'Q2 Planning Sync',
  audioPath: './recordings/2024-01-15-q2-planning.mp3',
  participants: {
    Maya: 'maya@company.com',
    John: 'john@company.com',
    Sarah: 'sarah@company.com',
  },
  speakerMap: { A: 'Maya', B: 'John', C: 'Sarah' },
});
```

## What You've Built

A self-hosted meeting notetaker that:
- Transcribes audio with speaker diarization (who said what)
- Extracts agenda items, decisions, and action items per person
- Emails personalized summaries immediately after the call
- Stores structured data you fully control

**Next steps:** Store transcripts in a database (Postgres + pgvector) for semantic search. Add a Slack bot to post summaries to a channel. Integrate with Google Calendar to auto-pull attendee lists and kick off recordings automatically.
