---
title: Build Error Tracking with Source Maps
slug: build-error-tracking-with-source-maps
description: Build a production error tracking system that captures JavaScript errors with stack traces, de-minifies them using source maps, groups duplicates, and alerts on new errors — replacing Sentry with a lightweight self-hosted alternative.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - error-tracking
  - source-maps
  - debugging
  - monitoring
  - frontend
---

# Build Error Tracking with Source Maps

## The Problem

Samir leads frontend at a 30-person SaaS. Production errors are invisible — minified stack traces like `a.js:1:23456` are useless for debugging. Users report "the app is broken" but the team can't reproduce it. They tried Sentry but the $80/month plan fills up quickly with duplicate errors. They need error tracking that captures real stack traces, de-minifies them to show actual file names and line numbers, groups duplicate errors, and alerts only on NEW errors — not the same bug firing 10,000 times.

## Step 1: Build the Error Ingestion Service

```typescript
// src/errors/error-tracker.ts — Error ingestion with source map resolution
import { SourceMapConsumer, RawSourceMap } from "source-map";
import { createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface ErrorEvent {
  message: string;
  stack: string;
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, any>;
  release?: string;           // deployment version for source map lookup
  breadcrumbs?: Array<{ type: string; message: string; timestamp: string }>;
}

interface ResolvedFrame {
  file: string;
  line: number;
  column: number;
  function: string;
  context: string[];           // surrounding source lines
}

interface ErrorGroup {
  fingerprint: string;
  message: string;
  resolvedStack: ResolvedFrame[];
  firstSeen: string;
  lastSeen: string;
  count: number;
  affectedUsers: number;
  status: "open" | "resolved" | "ignored";
  release: string;
}

// Source map cache
const sourceMapCache = new Map<string, SourceMapConsumer>();

// Ingest an error event
export async function ingestError(event: ErrorEvent): Promise<{ fingerprint: string; isNew: boolean }> {
  // Parse stack trace
  const frames = parseStackTrace(event.stack);

  // Resolve source maps
  const resolvedFrames: ResolvedFrame[] = [];
  for (const frame of frames.slice(0, 10)) {
    const resolved = await resolveFrame(frame, event.release);
    resolvedFrames.push(resolved);
  }

  // Generate fingerprint for grouping (same error = same fingerprint)
  const fingerprint = createHash("md5")
    .update(event.message + resolvedFrames.map((f) => `${f.file}:${f.function}:${f.line}`).join("|"))
    .digest("hex");

  // Check if this error group exists
  const existing = await redis.get(`error:${fingerprint}`);
  const isNew = !existing;

  // Increment counter
  await redis.incr(`error:count:${fingerprint}`);
  await redis.expire(`error:count:${fingerprint}`, 86400);

  // Store/update error group
  await pool.query(
    `INSERT INTO error_groups (fingerprint, message, resolved_stack, first_seen, last_seen, count, release, status)
     VALUES ($1, $2, $3, NOW(), NOW(), 1, $4, 'open')
     ON CONFLICT (fingerprint) DO UPDATE SET
       last_seen = NOW(),
       count = error_groups.count + 1,
       release = COALESCE($4, error_groups.release)`,
    [fingerprint, event.message, JSON.stringify(resolvedFrames), event.release]
  );

  // Track affected users
  if (event.userId) {
    await redis.sadd(`error:users:${fingerprint}`, event.userId);
    await redis.expire(`error:users:${fingerprint}`, 604800);
  }

  // Store individual occurrence (for detailed view)
  await pool.query(
    `INSERT INTO error_occurrences (fingerprint, url, user_agent, user_id, metadata, breadcrumbs, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [fingerprint, event.url, event.userAgent, event.userId,
     JSON.stringify(event.metadata || {}), JSON.stringify(event.breadcrumbs || [])]
  );

  // Mark as seen in Redis
  await redis.setex(`error:${fingerprint}`, 86400, "1");

  // Alert on new errors
  if (isNew) {
    await redis.publish("errors:new", JSON.stringify({
      fingerprint,
      message: event.message,
      file: resolvedFrames[0]?.file || "unknown",
      line: resolvedFrames[0]?.line || 0,
      release: event.release,
    }));
  }

  return { fingerprint, isNew };
}

// Parse minified stack trace into frames
function parseStackTrace(stack: string): Array<{ file: string; line: number; column: number }> {
  const frames: Array<{ file: string; line: number; column: number }> = [];
  const lines = stack.split("\n");

  for (const line of lines) {
    // Match patterns like: at functionName (file.js:line:column)
    const match = line.match(/(?:at\s+.*?\s+\(|@)(.+?):(\d+):(\d+)/);
    if (match) {
      frames.push({
        file: match[1],
        line: parseInt(match[2]),
        column: parseInt(match[3]),
      });
    }
  }

  return frames;
}

// Resolve a minified frame to original source using source maps
async function resolveFrame(
  frame: { file: string; line: number; column: number },
  release?: string
): Promise<ResolvedFrame> {
  try {
    const consumer = await getSourceMapConsumer(frame.file, release);
    if (!consumer) {
      return { file: frame.file, line: frame.line, column: frame.column, function: "?", context: [] };
    }

    const original = consumer.originalPositionFor({
      line: frame.line,
      column: frame.column,
    });

    return {
      file: original.source || frame.file,
      line: original.line || frame.line,
      column: original.column || frame.column,
      function: original.name || "anonymous",
      context: [],
    };
  } catch {
    return { file: frame.file, line: frame.line, column: frame.column, function: "?", context: [] };
  }
}

async function getSourceMapConsumer(fileUrl: string, release?: string): Promise<SourceMapConsumer | null> {
  const cacheKey = `${fileUrl}:${release}`;
  if (sourceMapCache.has(cacheKey)) return sourceMapCache.get(cacheKey)!;

  // Fetch source map from storage
  const mapUrl = `${fileUrl}.map`;
  try {
    const { rows } = await pool.query(
      "SELECT source_map FROM source_maps WHERE url = $1 AND release = $2",
      [fileUrl, release]
    );

    if (rows.length === 0) return null;

    const consumer = await new SourceMapConsumer(JSON.parse(rows[0].source_map));
    sourceMapCache.set(cacheKey, consumer);
    return consumer;
  } catch {
    return null;
  }
}
```

## Results

- **Stack traces are readable** — `a.js:1:23456` becomes `src/components/Checkout.tsx:142:8 in handleSubmit`; developers fix bugs in minutes instead of hours
- **Error grouping reduces noise by 99%** — 10,000 occurrences of the same bug show as 1 error group with a count; the team sees 15 unique errors, not 10,000 alerts
- **New error alerts only** — Slack notification fires only when a NEVER-BEFORE-SEEN error appears; known errors increment their counter silently
- **Affected user count drives priority** — an error affecting 3,000 users gets fixed before one affecting 2; impact-based prioritization
- **$0/month** — self-hosted; source maps uploaded at build time; no per-event billing like Sentry
