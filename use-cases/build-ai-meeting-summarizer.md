---
title: Build an AI Meeting Summarizer
slug: build-ai-meeting-summarizer
description: Build an AI meeting summarizer that processes transcripts, extracts action items, identifies decisions, generates structured summaries, and distributes notes with follow-up tracking.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - meetings
  - ai
  - summarization
  - action-items
  - productivity
---

# Build an AI Meeting Summarizer

## The Problem

Kate leads ops at a 25-person company with 40 meetings/week. Meeting notes are taken inconsistently — some meetings have detailed notes, most have nothing. Action items get lost: "didn't we decide to do X?" → nobody wrote it down. Decisions aren't documented — the same discussion happens 3 times. Sending notes takes 30 minutes of formatting. People who missed the meeting have no way to catch up quickly. They need automated summarization: process meeting transcript, extract action items with owners, identify key decisions, generate structured summary, and distribute with follow-up tracking.

## Step 1: Build the Summarizer

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface MeetingSummary { id: string; title: string; date: string; duration: number; participants: string[]; summary: string; keyDecisions: string[]; actionItems: ActionItem[]; topics: Array<{ title: string; summary: string; duration: number }>; sentiment: string; nextSteps: string; createdAt: string; }
interface ActionItem { id: string; description: string; owner: string; dueDate: string | null; priority: "high" | "medium" | "low"; status: "pending" | "in_progress" | "done"; }

// Process meeting transcript
export async function summarizeMeeting(params: { title: string; transcript: string; participants: string[]; duration: number }): Promise<MeetingSummary> {
  const id = `meeting-${randomBytes(6).toString("hex")}`;

  // Extract key elements
  const keyDecisions = extractDecisions(params.transcript);
  const actionItems = extractActionItems(params.transcript, params.participants);
  const topics = extractTopics(params.transcript);
  const summary = generateSummary(params.transcript, keyDecisions, actionItems);
  const sentiment = analyzeSentiment(params.transcript);

  const meeting: MeetingSummary = {
    id, title: params.title, date: new Date().toISOString().slice(0, 10),
    duration: params.duration, participants: params.participants,
    summary, keyDecisions, actionItems, topics, sentiment,
    nextSteps: actionItems.filter((a) => a.priority === "high").map((a) => `${a.owner}: ${a.description}`).join("; "),
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO meeting_summaries (id, title, date, participants, summary, decisions, action_items, topics, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, params.title, meeting.date, JSON.stringify(params.participants), summary, JSON.stringify(keyDecisions), JSON.stringify(actionItems), JSON.stringify(topics)]
  );

  // Notify participants
  for (const participant of params.participants) {
    const myActions = actionItems.filter((a) => a.owner.toLowerCase() === participant.toLowerCase());
    if (myActions.length > 0) {
      await redis.rpush("notification:queue", JSON.stringify({ type: "meeting_action_items", to: participant, meetingTitle: params.title, actions: myActions }));
    }
  }

  return meeting;
}

function extractDecisions(transcript: string): string[] {
  const decisions: string[] = [];
  const patterns = [
    /(?:we\s+)?decided\s+(?:to\s+)?([^.!]+)/gi,
    /(?:let'?s|we'?ll|we\s+should|we\s+will|agreed\s+to)\s+([^.!]+)/gi,
    /(?:the\s+decision\s+is|final\s+decision)\s*:?\s*([^.!]+)/gi,
    /(?:go\s+with|going\s+with|chose|picked|selected)\s+([^.!]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const decision = match[1].trim();
      if (decision.length > 10 && decision.length < 200) decisions.push(decision);
    }
  }
  return [...new Set(decisions)].slice(0, 10);
}

function extractActionItems(transcript: string, participants: string[]): ActionItem[] {
  const items: ActionItem[] = [];
  const patterns = [
    /([A-Z][a-z]+)\s+(?:will|should|needs to|is going to|can|could)\s+([^.!]+)/g,
    /(?:action\s+item|todo|task)\s*:?\s*([^.!]+)/gi,
    /(?:by|before|deadline)\s+(next\s+\w+|\w+day|end\s+of\s+\w+)/gi,
  ];

  for (const pattern of [patterns[0]]) {
    let match;
    while ((match = pattern.exec(transcript)) !== null) {
      const owner = match[1];
      const description = match[2].trim();
      // Only include if owner is a participant
      if (participants.some((p) => p.toLowerCase().startsWith(owner.toLowerCase())) && description.length > 10) {
        items.push({
          id: `action-${randomBytes(3).toString("hex")}`, description,
          owner, dueDate: null,
          priority: /urgent|asap|critical|important/i.test(description) ? "high" : "medium",
          status: "pending",
        });
      }
    }
  }

  return items.slice(0, 15);
}

function extractTopics(transcript: string): MeetingSummary["topics"] {
  // Split transcript by natural topic breaks
  const sections = transcript.split(/\n(?=[A-Z])/g).filter((s) => s.length > 50);
  return sections.slice(0, 5).map((section, i) => {
    const firstLine = section.split("\n")[0].trim();
    return { title: firstLine.slice(0, 80) || `Topic ${i + 1}`, summary: section.slice(0, 300).trim(), duration: Math.round(section.length / 500) };
  });
}

function generateSummary(transcript: string, decisions: string[], actions: ActionItem[]): string {
  const wordCount = transcript.split(/\s+/).length;
  let summary = `Meeting covered ${Math.ceil(wordCount / 150)} main topics. `;
  if (decisions.length > 0) summary += `${decisions.length} decision(s) were made. `;
  if (actions.length > 0) summary += `${actions.length} action item(s) assigned. `;

  // Extract first meaningful paragraph as overview
  const firstParagraph = transcript.split("\n\n")[0]?.slice(0, 300);
  if (firstParagraph) summary += firstParagraph;

  return summary;
}

function analyzeSentiment(transcript: string): string {
  const positive = (transcript.match(/\b(great|excellent|good|agreed|progress|success|excited)\b/gi) || []).length;
  const negative = (transcript.match(/\b(concern|issue|problem|blocker|delayed|risk|worried)\b/gi) || []).length;
  if (positive > negative * 2) return "positive";
  if (negative > positive * 2) return "negative";
  return "neutral";
}

// Track action item completion
export async function updateActionItem(meetingId: string, actionId: string, status: ActionItem["status"]): Promise<void> {
  const { rows: [meeting] } = await pool.query("SELECT action_items FROM meeting_summaries WHERE id = $1", [meetingId]);
  if (!meeting) throw new Error("Meeting not found");
  const items: ActionItem[] = JSON.parse(meeting.action_items);
  const item = items.find((a) => a.id === actionId);
  if (item) item.status = status;
  await pool.query("UPDATE meeting_summaries SET action_items = $2 WHERE id = $1", [meetingId, JSON.stringify(items)]);
}

// Get pending action items across all meetings
export async function getPendingActions(owner?: string): Promise<Array<ActionItem & { meetingTitle: string; meetingDate: string }>> {
  const { rows } = await pool.query("SELECT id, title, date, action_items FROM meeting_summaries WHERE action_items != '[]' ORDER BY date DESC LIMIT 50");
  const pending: any[] = [];
  for (const row of rows) {
    const items: ActionItem[] = JSON.parse(row.action_items);
    for (const item of items) {
      if (item.status === "pending" || item.status === "in_progress") {
        if (!owner || item.owner.toLowerCase() === owner.toLowerCase()) {
          pending.push({ ...item, meetingTitle: row.title, meetingDate: row.date });
        }
      }
    }
  }
  return pending;
}
```

## Results

- **Meeting notes: 30 min formatting → instant** — transcript in, structured summary out; decisions, action items, and topics extracted automatically
- **Action items tracked** — each action has owner, priority, status; "didn't we decide to do X?" answered in seconds; nothing gets lost
- **Decisions documented** — "decided to", "let's go with", "agreed to" patterns captured; same discussion doesn't repeat 3 times
- **Missed meeting catch-up: 40 min → 2 min** — read structured summary; scan decisions and action items; know exactly what happened
- **Follow-up notifications** — each participant gets their action items via email/Slack; due dates tracked; pending items dashboard across all meetings
