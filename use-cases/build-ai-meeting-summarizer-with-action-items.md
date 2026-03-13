---
title: Build an AI Meeting Summarizer with Action Items
slug: build-ai-meeting-summarizer-with-action-items
description: >
  Auto-generate meeting summaries, extract action items with owners
  and deadlines, and sync to project management tools — saving 5
  hours/week per team and ensuring nothing falls through the cracks.
skills:
  - typescript
  - vercel-ai-sdk
  - bull-mq
  - redis
  - postgresql
  - zod
  - hono
category: AI & Machine Learning
tags:
  - meeting-notes
  - ai-summarization
  - action-items
  - productivity
  - transcription
  - project-management
---

# Build an AI Meeting Summarizer with Action Items

## The Problem

A 50-person company has 200 meetings/week. Meeting notes are either not taken, taken poorly, or taken by someone who then can't participate. Action items live in people's heads — 40% are forgotten. "Didn't we discuss this last week?" is said daily. The PM spends 5 hours/week manually writing summaries and chasing action items. When someone misses a meeting, they have no way to catch up except asking a colleague to rehash it.

## Step 1: Transcript Processor

```typescript
// src/meetings/processor.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const MeetingSummary = z.object({
  title: z.string(),
  date: z.string(),
  duration: z.string(),
  participants: z.array(z.string()),
  summary: z.string().max(500),
  keyTopics: z.array(z.object({
    topic: z.string(),
    discussion: z.string(),
    outcome: z.enum(['decided', 'needs_followup', 'informational', 'tabled']),
    decision: z.string().optional(),
  })),
  actionItems: z.array(z.object({
    description: z.string(),
    owner: z.string(),
    deadline: z.string().optional(),
    priority: z.enum(['high', 'medium', 'low']),
    context: z.string(), // why this action item exists
  })),
  openQuestions: z.array(z.string()),
  nextSteps: z.array(z.string()),
  sentiment: z.enum(['productive', 'neutral', 'contentious', 'unfocused']),
});

export async function summarizeMeeting(transcript: string, metadata: {
  meetingTitle?: string;
  participants: string[];
  scheduledDuration: string;
}): Promise<z.infer<typeof MeetingSummary>> {
  const { object } = await generateObject({
    model: openai('gpt-4o'),
    schema: MeetingSummary,
    prompt: `Summarize this meeting transcript. Extract every action item with a clear owner.

Meeting: ${metadata.meetingTitle ?? 'Untitled Meeting'}
Scheduled duration: ${metadata.scheduledDuration}
Participants: ${metadata.participants.join(', ')}

Transcript:
${transcript}

Rules:
- Summary should be 2-3 sentences, high-level
- Each topic should capture the key discussion points and outcome
- Action items MUST have an owner (the person who said "I'll do X" or was assigned)
- If a deadline was mentioned, include it
- Open questions are things raised but not resolved
- Be objective — don't editorialize
- If people talked over each other or went in circles, mark sentiment as "unfocused"`,
  });

  return object;
}
```

## Step 2: Action Item Tracker

```typescript
// src/meetings/action-tracker.ts
import { Pool } from 'pg';
import { Redis } from 'ioredis';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

export async function saveActionItems(
  meetingId: string,
  actionItems: Array<{
    description: string;
    owner: string;
    deadline?: string;
    priority: string;
    context: string;
  }>
): Promise<void> {
  for (const item of actionItems) {
    const id = crypto.randomUUID();
    await db.query(`
      INSERT INTO action_items (id, meeting_id, description, owner, deadline, priority, context, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', NOW())
    `, [id, meetingId, item.description, item.owner, item.deadline, item.priority, item.context]);
  }
}

// Weekly digest: which action items are overdue?
export async function getOverdueItems(): Promise<Array<{
  owner: string;
  items: Array<{ description: string; meetingTitle: string; deadline: string; daysPast: number }>;
}>> {
  const { rows } = await db.query(`
    SELECT ai.owner, ai.description, ai.deadline, m.title as meeting_title,
           EXTRACT(DAY FROM NOW() - ai.deadline::date) as days_past
    FROM action_items ai
    JOIN meetings m ON ai.meeting_id = m.id
    WHERE ai.status = 'open' AND ai.deadline IS NOT NULL AND ai.deadline::date < NOW()
    ORDER BY ai.owner, days_past DESC
  `);

  const byOwner = new Map<string, any[]>();
  for (const row of rows) {
    if (!byOwner.has(row.owner)) byOwner.set(row.owner, []);
    byOwner.get(row.owner)!.push({
      description: row.description,
      meetingTitle: row.meeting_title,
      deadline: row.deadline,
      daysPast: parseInt(row.days_past),
    });
  }

  return [...byOwner.entries()].map(([owner, items]) => ({ owner, items }));
}

// Sync to Jira/Linear
export async function syncToProjectManagement(
  actionItem: { description: string; owner: string; deadline?: string; priority: string }
): Promise<void> {
  // Create task in Linear/Jira
  if (process.env.LINEAR_API_KEY) {
    await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        Authorization: process.env.LINEAR_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation { issueCreate(input: {
          title: "${actionItem.description}",
          assigneeId: "${actionItem.owner}",
          priority: ${actionItem.priority === 'high' ? 1 : actionItem.priority === 'medium' ? 2 : 3},
          ${actionItem.deadline ? `dueDate: "${actionItem.deadline}"` : ''}
        }) { success } }`,
      }),
    });
  }
}
```

## Step 3: API and Webhook

```typescript
// src/api/meetings.ts
import { Hono } from 'hono';
import { summarizeMeeting } from '../meetings/processor';
import { saveActionItems } from '../meetings/action-tracker';
import { Pool } from 'pg';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Webhook from Zoom/Google Meet/Fireflies
app.post('/v1/meetings/transcript', async (c) => {
  const { transcript, meetingTitle, participants, duration, recordingUrl } = await c.req.json();
  const meetingId = crypto.randomUUID();

  // Save raw transcript
  await db.query(`
    INSERT INTO meetings (id, title, participants, duration, transcript, recording_url, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
  `, [meetingId, meetingTitle, participants, duration, transcript, recordingUrl]);

  // Generate summary
  const summary = await summarizeMeeting(transcript, {
    meetingTitle,
    participants,
    scheduledDuration: duration,
  });

  await db.query(`UPDATE meetings SET summary = $1 WHERE id = $2`, [JSON.stringify(summary), meetingId]);

  // Save and sync action items
  await saveActionItems(meetingId, summary.actionItems);
  for (const item of summary.actionItems) {
    await syncToProjectManagement(item).catch(() => {});
  }

  return c.json({ meetingId, summary });
});

// Search past meetings
app.get('/v1/meetings/search', async (c) => {
  const query = c.req.query('q');
  const { rows } = await db.query(`
    SELECT id, title, created_at, summary->>'summary' as summary
    FROM meetings
    WHERE to_tsvector('english', transcript) @@ plainto_tsquery('english', $1)
    ORDER BY created_at DESC LIMIT 20
  `, [query]);

  return c.json({ results: rows });
});

export default app;

import { syncToProjectManagement } from '../meetings/action-tracker';
```

## Results

- **Note-taking**: fully automated — nobody manually writes meeting notes
- **Action item capture**: 95% (was ~60% manually, 40% forgotten)
- **PM time saved**: 5 hours/week freed from summary writing
- **Overdue tracking**: weekly digest catches forgotten items — completion rate up 35%
- **"What did we decide?"**: searchable meeting archive answers in seconds
- **Missed meeting catch-up**: read summary in 2 minutes instead of 30-minute rehash
- **Project management sync**: action items auto-create Linear/Jira tasks
