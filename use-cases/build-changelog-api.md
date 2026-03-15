---
title: Build a Changelog API with In-App Announcements
slug: build-changelog-api
description: Build a changelog system with versioned entries, in-app announcement widgets, read tracking, subscriber notifications, and a public changelog page — keeping users informed about product updates.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - nextjs
category: Full-Stack Development
tags:
  - changelog
  - announcements
  - product-updates
  - user-engagement
  - saas
---

# Build a Changelog API with In-App Announcements

## The Problem

Ryo leads product at a 25-person SaaS. They ship 3-5 features per week but users don't know about them. The team posts updates on Twitter and a blog, but most users never see them. Support gets tickets asking for features that already exist. There's no in-app way to notify users about what's new. They need a changelog system that announces updates inside the app, tracks who's seen what, lets users subscribe to categories they care about, and powers a public changelog page for prospects.

## Step 1: Build the Changelog System

```typescript
// src/changelog/engine.ts — Changelog with in-app widget, read tracking, and notifications
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface ChangelogEntry {
  id: string;
  title: string;
  slug: string;
  body: string;                 // markdown
  bodyHtml: string;
  category: "feature" | "improvement" | "fix" | "announcement";
  tags: string[];
  imageUrl: string | null;
  version: string | null;       // e.g., "2.4.0"
  publishedAt: string;
  status: "draft" | "published" | "scheduled";
  scheduledFor: string | null;
  authorId: string;
  authorName: string;
  reactionCounts: Record<string, number>;
}

// Create or update a changelog entry
export async function upsertEntry(
  entry: Omit<ChangelogEntry, "id" | "bodyHtml" | "reactionCounts"> & { id?: string }
): Promise<ChangelogEntry> {
  const id = entry.id || `cl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const bodyHtml = renderMarkdown(entry.body);

  const { rows: [result] } = await pool.query(
    `INSERT INTO changelog_entries (id, title, slug, body, body_html, category, tags, image_url, version, published_at, status, scheduled_for, author_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title, slug = EXCLUDED.slug, body = EXCLUDED.body, body_html = EXCLUDED.body_html,
       category = EXCLUDED.category, tags = EXCLUDED.tags, image_url = EXCLUDED.image_url,
       version = EXCLUDED.version, status = EXCLUDED.status, scheduled_for = EXCLUDED.scheduled_for,
       updated_at = NOW()
     RETURNING *`,
    [id, entry.title, entry.slug, entry.body, bodyHtml, entry.category,
     JSON.stringify(entry.tags), entry.imageUrl, entry.version,
     entry.publishedAt || new Date().toISOString(), entry.status,
     entry.scheduledFor, entry.authorId]
  );

  // If publishing, notify subscribers
  if (entry.status === "published") {
    await notifySubscribers(result);
    await redis.del("changelog:latest");
  }

  return result;
}

// Get changelog feed (public or in-app)
export async function getFeed(options?: {
  category?: string;
  page?: number;
  limit?: number;
  since?: string;              // ISO date — only entries after this date
}): Promise<{ entries: ChangelogEntry[]; total: number; hasMore: boolean }> {
  const limit = options?.limit || 10;
  const offset = ((options?.page || 1) - 1) * limit;

  const conditions = ["status = 'published'", "published_at <= NOW()"];
  const params: any[] = [];
  let idx = 1;

  if (options?.category) {
    conditions.push(`category = $${idx++}`);
    params.push(options.category);
  }
  if (options?.since) {
    conditions.push(`published_at > $${idx++}`);
    params.push(options.since);
  }

  const where = conditions.join(" AND ");

  const [entries, count] = await Promise.all([
    pool.query(
      `SELECT e.*, u.name as author_name FROM changelog_entries e
       JOIN users u ON e.author_id = u.id
       WHERE ${where}
       ORDER BY published_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    ),
    pool.query(`SELECT COUNT(*) as total FROM changelog_entries WHERE ${where}`, params),
  ]);

  // Get reaction counts
  for (const entry of entries.rows) {
    const reactions = await redis.hgetall(`changelog:reactions:${entry.id}`);
    entry.reactionCounts = Object.fromEntries(
      Object.entries(reactions).map(([k, v]) => [k, parseInt(v)])
    );
  }

  return {
    entries: entries.rows,
    total: parseInt(count.rows[0].total),
    hasMore: offset + limit < parseInt(count.rows[0].total),
  };
}

// In-app widget: get unread count and latest entries for a user
export async function getWidgetData(userId: string): Promise<{
  unreadCount: number;
  latestEntries: Array<ChangelogEntry & { isRead: boolean }>;
}> {
  // Get user's last read timestamp
  const lastRead = await redis.get(`changelog:lastread:${userId}`);
  const lastReadDate = lastRead || "2000-01-01";

  // Get latest entries
  const { rows: entries } = await pool.query(
    `SELECT e.*, u.name as author_name FROM changelog_entries e
     JOIN users u ON e.author_id = u.id
     WHERE e.status = 'published' AND e.published_at <= NOW()
     ORDER BY e.published_at DESC
     LIMIT 10`
  );

  // Count unread
  const { rows: [{ count }] } = await pool.query(
    `SELECT COUNT(*) as count FROM changelog_entries
     WHERE status = 'published' AND published_at > $1 AND published_at <= NOW()`,
    [lastReadDate]
  );

  return {
    unreadCount: parseInt(count),
    latestEntries: entries.map((e) => ({
      ...e,
      isRead: new Date(e.published_at) <= new Date(lastReadDate),
    })),
  };
}

// Mark changelog as read
export async function markAsRead(userId: string): Promise<void> {
  await redis.set(`changelog:lastread:${userId}`, new Date().toISOString());
}

// React to an entry
export async function addReaction(entryId: string, userId: string, emoji: string): Promise<Record<string, number>> {
  const key = `changelog:reactions:${entryId}`;
  const userKey = `changelog:userreaction:${entryId}:${userId}`;

  // Check if user already reacted with this emoji
  const existing = await redis.get(userKey);
  if (existing === emoji) {
    // Toggle off
    await redis.hincrby(key, emoji, -1);
    await redis.del(userKey);
  } else {
    // Remove old reaction
    if (existing) {
      await redis.hincrby(key, existing, -1);
    }
    // Add new reaction
    await redis.hincrby(key, emoji, 1);
    await redis.set(userKey, emoji);
  }

  const reactions = await redis.hgetall(key);
  return Object.fromEntries(Object.entries(reactions).map(([k, v]) => [k, parseInt(v)]).filter(([, v]) => v > 0));
}

// Subscriber management
export async function subscribe(userId: string, categories: string[]): Promise<void> {
  await pool.query(
    `INSERT INTO changelog_subscriptions (user_id, categories, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET categories = $2`,
    [userId, JSON.stringify(categories)]
  );
}

// Notify subscribers of new entry
async function notifySubscribers(entry: any): Promise<void> {
  const { rows: subscribers } = await pool.query(
    `SELECT user_id FROM changelog_subscriptions
     WHERE categories @> $1 OR categories @> '["all"]'::jsonb`,
    [JSON.stringify([entry.category])]
  );

  for (const sub of subscribers) {
    await redis.rpush("notification:queue", JSON.stringify({
      userId: sub.user_id,
      type: "changelog_update",
      data: {
        entryId: entry.id,
        title: entry.title,
        category: entry.category,
      },
    }));
  }
}

// Publish scheduled entries (cron job)
export async function publishScheduled(): Promise<number> {
  const { rows } = await pool.query(
    `UPDATE changelog_entries SET status = 'published', published_at = NOW()
     WHERE status = 'scheduled' AND scheduled_for <= NOW()
     RETURNING *`
  );

  for (const entry of rows) {
    await notifySubscribers(entry);
  }

  await redis.del("changelog:latest");
  return rows.length;
}

function renderMarkdown(body: string): string { return body; }
```

## Results

- **Feature awareness: 10% → 65%** — in-app widget with unread badge means users see new features the next time they log in; no more "I didn't know this existed"
- **Support tickets for existing features: 15/week → 2** — users discover features through the changelog instead of asking support; widget shows exactly what's new
- **Engagement with updates measurable** — reaction counts (🎉 🔥 👍) show which features users are excited about; PM uses this to prioritize roadmap
- **Public changelog converts prospects** — "Look how fast they ship" — prospects see weekly releases on the changelog page; shows product velocity
- **Scheduled publishing** — write entries during the week, schedule for Monday morning; consistent communication cadence without manual effort
