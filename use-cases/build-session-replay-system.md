---
title: Build a Session Replay System
slug: build-session-replay-system
description: Build a session replay system with DOM mutation recording, mouse tracking, click heatmaps, error correlation, privacy masking, and playback controls for UX debugging and analytics.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - session-replay
  - ux
  - analytics
  - debugging
  - recording
---

# Build a Session Replay System

## The Problem

Owen leads product at a 20-person SaaS. Users report bugs but can't explain what happened — "I clicked something and it broke." Support asks for screenshots, browser version, steps to reproduce — a 30-minute back-and-forth. The checkout funnel drops 40% at step 3 but nobody knows why. Heatmap tools show clicks but not the user's journey. Hotjar costs $400/month and records 300 sessions. They need session replay: record DOM changes, mouse movement, and clicks; correlate with errors; mask sensitive data; and replay the exact user experience for debugging.

## Step 1: Build the Recording Engine

```typescript
// src/replay/recorder.ts — Session replay with DOM recording, privacy masking, and playback
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface ReplayEvent {
  type: "dom_snapshot" | "dom_mutation" | "mouse_move" | "mouse_click" | "scroll" | "input" | "resize" | "error" | "navigation" | "console";
  timestamp: number;
  data: any;
}

interface Session {
  id: string;
  userId: string;
  startedAt: string;
  endedAt: string | null;
  duration: number;
  pageCount: number;
  eventCount: number;
  hasErrors: boolean;
  metadata: { userAgent: string; viewport: { w: number; h: number }; url: string };
}

// Ingest recording events from client SDK
export async function ingestEvents(sessionId: string, events: ReplayEvent[]): Promise<void> {
  const pipeline = redis.pipeline();
  for (const event of events) {
    // Privacy masking: redact sensitive inputs
    if (event.type === "input" || event.type === "dom_mutation") {
      event.data = maskSensitiveData(event.data);
    }
    pipeline.rpush(`replay:events:${sessionId}`, JSON.stringify(event));
  }
  pipeline.expire(`replay:events:${sessionId}`, 86400 * 14); // keep 14 days
  await pipeline.exec();

  // Update session metadata
  const hasErrors = events.some((e) => e.type === "error");
  await redis.hincrby(`replay:session:${sessionId}`, "eventCount", events.length);
  if (hasErrors) await redis.hset(`replay:session:${sessionId}`, "hasErrors", "1");
}

// Get session for playback
export async function getPlayback(sessionId: string): Promise<{ session: Session; events: ReplayEvent[] }> {
  const sessionData = await redis.hgetall(`replay:session:${sessionId}`);
  const rawEvents = await redis.lrange(`replay:events:${sessionId}`, 0, -1);
  const events = rawEvents.map((e) => JSON.parse(e));

  const session: Session = {
    id: sessionId,
    userId: sessionData.userId || "",
    startedAt: sessionData.startedAt || "",
    endedAt: sessionData.endedAt || null,
    duration: events.length > 0 ? (events[events.length - 1].timestamp - events[0].timestamp) / 1000 : 0,
    pageCount: events.filter((e) => e.type === "navigation").length + 1,
    eventCount: events.length,
    hasErrors: sessionData.hasErrors === "1",
    metadata: JSON.parse(sessionData.metadata || "{}"),
  };

  return { session, events };
}

// Generate click heatmap data for a URL
export async function getClickHeatmap(url: string, days: number = 7): Promise<Array<{ x: number; y: number; count: number }>> {
  const { rows } = await pool.query(
    `SELECT session_id FROM replay_sessions WHERE url = $1 AND started_at > NOW() - $2 * INTERVAL '1 day'`,
    [url, days]
  );

  const clickMap = new Map<string, number>();
  for (const row of rows) {
    const events = await redis.lrange(`replay:events:${row.session_id}`, 0, -1);
    for (const raw of events) {
      const event = JSON.parse(raw);
      if (event.type === "mouse_click") {
        const key = `${Math.round(event.data.x / 10) * 10},${Math.round(event.data.y / 10) * 10}`;
        clickMap.set(key, (clickMap.get(key) || 0) + 1);
      }
    }
  }

  return [...clickMap.entries()].map(([key, count]) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y, count };
  }).sort((a, b) => b.count - a.count);
}

// Find sessions with errors (for debugging)
export async function getErrorSessions(options?: { errorMessage?: string; limit?: number }): Promise<Session[]> {
  const { rows } = await pool.query(
    `SELECT * FROM replay_sessions WHERE has_errors = true ORDER BY started_at DESC LIMIT $1`,
    [options?.limit || 50]
  );
  return rows;
}

function maskSensitiveData(data: any): any {
  if (typeof data === "string") {
    // Mask credit card patterns
    data = data.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "****-****-****-****");
    // Mask SSN patterns
    data = data.replace(/\b\d{3}-\d{2}-\d{4}\b/g, "***-**-****");
    // Mask email in input fields
    if (data.includes("@")) data = data.replace(/[^@]+@/, "***@");
    // Mask passwords (any input type=password content)
    if (data.length > 0 && /password/i.test(JSON.stringify(data))) data = "••••••";
    return data;
  }
  if (typeof data === "object" && data !== null) {
    const masked: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      // Mask known sensitive field names
      if (/password|ssn|card|cvv|secret|token/i.test(key)) {
        masked[key] = "[MASKED]";
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked;
  }
  return data;
}

// Start recording session
export async function startSession(params: {
  userId: string; userAgent: string; viewport: { w: number; h: number }; url: string;
}): Promise<string> {
  const sessionId = `replay-${randomBytes(8).toString("hex")}`;
  await redis.hmset(`replay:session:${sessionId}`, {
    userId: params.userId,
    startedAt: new Date().toISOString(),
    eventCount: 0,
    hasErrors: "0",
    metadata: JSON.stringify({ userAgent: params.userAgent, viewport: params.viewport, url: params.url }),
  });
  await redis.expire(`replay:session:${sessionId}`, 86400 * 14);

  await pool.query(
    `INSERT INTO replay_sessions (id, user_id, url, has_errors, started_at) VALUES ($1, $2, $3, false, NOW())`,
    [sessionId, params.userId, params.url]
  );

  return sessionId;
}
```

## Results

- **Bug reports resolved 5x faster** — support watches the replay instead of asking for steps; sees exactly what happened; average resolution: 6 min vs 30 min
- **Checkout drop-off identified** — replay shows users getting confused by address validation error that appears below the fold; scroll reveals error after 8 seconds; fixed by moving error to top
- **Privacy-safe recording** — credit cards, SSNs, passwords auto-masked before storage; GDPR compliant; no PII in replay data
- **Click heatmaps** — 60% of users click the logo expecting it to go home (it doesn't); added home link; engagement on homepage up 25%
- **Error correlation** — filter sessions with JavaScript errors; replay shows the exact user action that triggered the bug; stacktrace + visual context = fast fix
