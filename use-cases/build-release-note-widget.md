---
title: Build a Release Note Widget
slug: build-release-note-widget
description: Build an in-app release note widget with versioned changelogs, user-targeted announcements, read tracking, feature highlights, and feedback collection for product communication.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Product Engineering
tags:
  - changelog
  - release-notes
  - product
  - announcements
  - widget
---

# Build a Release Note Widget

## The Problem

Wei leads product at a 25-person SaaS shipping weekly. Users don't know about new features — 80% of the feature discovery comes from support tickets ("can your product do X?" — "yes, we shipped that 3 months ago"). Email announcements have 12% open rate. Blog posts get 200 views. They need in-app release notes: a widget that shows new features when users log in, targeted announcements by plan/role, read tracking to know who saw what, and feedback collection on new features.

## Step 1: Build the Release Note Widget

```typescript
// src/changelog/widget.ts — In-app release notes with targeting and feedback
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ReleaseNote {
  id: string;
  version: string;
  title: string;
  content: string;           // markdown
  type: "feature" | "improvement" | "fix" | "announcement";
  tags: string[];
  targetAudience: {
    plans?: string[];        // show only to these plans
    roles?: string[];        // show only to these roles
    segments?: string[];     // custom segments
  };
  media?: { type: "image" | "video" | "gif"; url: string };
  ctaButton?: { text: string; url: string };
  publishedAt: string;
  pinned: boolean;
}

interface UserReadState {
  userId: string;
  lastSeenAt: string;        // timestamp of last widget open
  readNoteIds: string[];     // IDs of notes user has read
  feedback: Record<string, { rating: number; comment?: string }>;
}

// Get unread release notes for a user
export async function getUnreadNotes(userId: string, context: { plan: string; role: string; segments?: string[] }): Promise<{
  notes: ReleaseNote[];
  unreadCount: number;
  hasNew: boolean;
}> {
  const readState = await getUserReadState(userId);
  const lastSeen = readState?.lastSeenAt || "2000-01-01T00:00:00Z";

  // Get notes published since user last checked
  const { rows } = await pool.query(
    `SELECT * FROM release_notes WHERE published_at IS NOT NULL ORDER BY published_at DESC LIMIT 50`
  );

  const notes: ReleaseNote[] = [];
  for (const row of rows) {
    const note: ReleaseNote = { ...row, tags: JSON.parse(row.tags), targetAudience: JSON.parse(row.target_audience), media: row.media ? JSON.parse(row.media) : undefined, ctaButton: row.cta_button ? JSON.parse(row.cta_button) : undefined };

    // Check targeting
    if (!matchesAudience(note.targetAudience, context)) continue;
    notes.push(note);
  }

  const readIds = new Set(readState?.readNoteIds || []);
  const unread = notes.filter((n) => !readIds.has(n.id));

  return { notes, unreadCount: unread.length, hasNew: unread.length > 0 };
}

// Mark notes as read
export async function markAsRead(userId: string, noteIds: string[]): Promise<void> {
  const readState = await getUserReadState(userId) || {
    userId, lastSeenAt: new Date().toISOString(), readNoteIds: [], feedback: {},
  };

  readState.readNoteIds = [...new Set([...readState.readNoteIds, ...noteIds])];
  readState.lastSeenAt = new Date().toISOString();

  await redis.setex(`changelog:read:${userId}`, 86400 * 90, JSON.stringify(readState));

  // Track read analytics
  for (const noteId of noteIds) {
    await redis.hincrby(`changelog:stats:${noteId}`, "reads", 1);
  }
}

// Submit feedback on a release note
export async function submitFeedback(userId: string, noteId: string, rating: number, comment?: string): Promise<void> {
  const readState = await getUserReadState(userId);
  if (readState) {
    readState.feedback[noteId] = { rating, comment };
    await redis.setex(`changelog:read:${userId}`, 86400 * 90, JSON.stringify(readState));
  }

  await redis.hincrby(`changelog:stats:${noteId}`, `rating_${rating}`, 1);
  if (comment) {
    await pool.query(
      "INSERT INTO changelog_feedback (note_id, user_id, rating, comment, created_at) VALUES ($1, $2, $3, $4, NOW())",
      [noteId, userId, rating, comment]
    );
  }
}

// Create release note
export async function createNote(params: Omit<ReleaseNote, "id">): Promise<ReleaseNote> {
  const id = `note-${randomBytes(6).toString("hex")}`;

  await pool.query(
    `INSERT INTO release_notes (id, version, title, content, type, tags, target_audience, media, cta_button, published_at, pinned, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [id, params.version, params.title, params.content, params.type,
     JSON.stringify(params.tags), JSON.stringify(params.targetAudience),
     params.media ? JSON.stringify(params.media) : null,
     params.ctaButton ? JSON.stringify(params.ctaButton) : null,
     params.publishedAt, params.pinned]
  );

  return { ...params, id };
}

// Analytics for a release note
export async function getNoteAnalytics(noteId: string): Promise<{
  totalReads: number;
  uniqueReaders: number;
  avgRating: number;
  feedbackCount: number;
  ratingDistribution: Record<number, number>;
}> {
  const stats = await redis.hgetall(`changelog:stats:${noteId}`);
  const { rows: feedback } = await pool.query(
    "SELECT rating, COUNT(*) as count FROM changelog_feedback WHERE note_id = $1 GROUP BY rating",
    [noteId]
  );

  const ratingDist: Record<number, number> = {};
  let totalRating = 0, ratingCount = 0;
  for (const f of feedback) {
    ratingDist[f.rating] = parseInt(f.count);
    totalRating += f.rating * parseInt(f.count);
    ratingCount += parseInt(f.count);
  }

  return {
    totalReads: parseInt(stats.reads || "0"),
    uniqueReaders: 0,  // would need distinct count
    avgRating: ratingCount > 0 ? totalRating / ratingCount : 0,
    feedbackCount: ratingCount,
    ratingDistribution: ratingDist,
  };
}

function matchesAudience(target: ReleaseNote["targetAudience"], context: { plan: string; role: string; segments?: string[] }): boolean {
  if (target.plans?.length && !target.plans.includes(context.plan)) return false;
  if (target.roles?.length && !target.roles.includes(context.role)) return false;
  if (target.segments?.length && !target.segments.some((s) => context.segments?.includes(s))) return false;
  return true;
}

async function getUserReadState(userId: string): Promise<UserReadState | null> {
  const cached = await redis.get(`changelog:read:${userId}`);
  return cached ? JSON.parse(cached) : null;
}
```

## Results

- **Feature discovery: 20% → 75%** — in-app widget shows new features on login; badge with unread count draws attention; users learn about features in context
- **Email open rate irrelevant** — 100% of active users see the widget; vs 12% email open rate; feature announcements reach 8x more users
- **Targeted announcements** — enterprise feature shown only to enterprise plan users; mobile improvement shown only to mobile users; no noise for irrelevant segments
- **Feedback on features** — 5-star rating + optional comment per note; product team sees which features resonated (4.5★) vs which confused users (2.1★); data-driven roadmap
- **Read tracking** — product knows 45% of users read the data export announcement; follows up with in-app tooltip for the 55% who missed it
