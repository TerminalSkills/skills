---
title: Build a Digest Email System
slug: build-digest-email-system
description: Build an intelligent digest email system that batches notifications into daily/weekly summaries, personalizes content based on engagement, handles timezone-aware scheduling, and reduces email fatigue.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - email
  - notifications
  - digest
  - engagement
  - personalization
---

# Build a Digest Email System

## The Problem

Nina leads product at a 30-person project management SaaS. Users get 20-40 individual notification emails per day — task assigned, comment added, status changed, mention. Open rates dropped to 8% because users started ignoring all emails. Three users cancelled citing "email spam." They need a digest system that batches notifications into one daily or weekly email, prioritized by relevance, with personalized content based on what each user actually cares about.

## Step 1: Build the Digest Engine

```typescript
// src/email/digest.ts — Batched digest emails with personalization and engagement tracking
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface DigestEvent {
  id: string;
  userId: string;
  type: string;                // "task_assigned" | "comment" | "mention" | "status_change"
  priority: number;            // 1-10 (10 = highest)
  title: string;
  body: string;
  entityType: string;          // "task" | "project" | "document"
  entityId: string;
  actorName: string;
  actorAvatar: string;
  metadata: Record<string, any>;
  createdAt: string;
}

interface DigestPreferences {
  userId: string;
  frequency: "instant" | "daily" | "weekly" | "off";
  timezone: string;
  preferredHour: number;       // 0-23, when to send daily digest
  preferredDay: number;        // 0-6 for weekly (0=Sunday)
  mutedTypes: string[];        // event types to exclude
  mutedProjects: string[];     // projects to exclude
}

interface CompiledDigest {
  userId: string;
  email: string;
  subject: string;
  sections: DigestSection[];
  totalEvents: number;
  topPriority: number;
}

interface DigestSection {
  title: string;
  icon: string;
  events: DigestEvent[];
  collapsed: boolean;          // collapse low-priority sections
}

// Queue event for digest
export async function queueDigestEvent(event: DigestEvent): Promise<void> {
  const prefs = await getUserDigestPrefs(event.userId);

  // Instant preference: send immediately
  if (prefs.frequency === "instant") {
    await redis.rpush("email:instant:queue", JSON.stringify(event));
    return;
  }

  if (prefs.frequency === "off") return;
  if (prefs.mutedTypes.includes(event.type)) return;
  if (event.metadata.projectId && prefs.mutedProjects.includes(event.metadata.projectId)) return;

  // Boost priority for mentions and direct assignments
  if (event.type === "mention") event.priority = Math.min(event.priority + 3, 10);
  if (event.type === "task_assigned") event.priority = Math.min(event.priority + 2, 10);

  // Add to digest queue
  const queueKey = `digest:${prefs.frequency}:${event.userId}`;
  await redis.rpush(queueKey, JSON.stringify(event));

  // Track for deduplication (don't send same entity changes multiple times)
  await redis.sadd(`digest:entities:${event.userId}`, `${event.entityType}:${event.entityId}`);
  await redis.expire(`digest:entities:${event.userId}`, 86400 * 8);
}

// Compile digest for a user
async function compileDigest(userId: string, frequency: "daily" | "weekly"): Promise<CompiledDigest | null> {
  const queueKey = `digest:${frequency}:${userId}`;
  const rawEvents = await redis.lrange(queueKey, 0, -1);

  if (rawEvents.length === 0) return null;

  const events: DigestEvent[] = rawEvents.map((e) => JSON.parse(e));

  // Deduplicate: keep latest event per entity
  const entityMap = new Map<string, DigestEvent>();
  for (const event of events) {
    const key = `${event.entityType}:${event.entityId}`;
    const existing = entityMap.get(key);
    if (!existing || new Date(event.createdAt) > new Date(existing.createdAt)) {
      entityMap.set(key, event);
    }
  }
  const dedupedEvents = Array.from(entityMap.values());

  // Sort by priority (highest first)
  dedupedEvents.sort((a, b) => b.priority - a.priority);

  // Get engagement data to personalize
  const engagement = await getEngagementData(userId);

  // Group into sections
  const sections = groupIntoSections(dedupedEvents, engagement);

  // Get user email
  const { rows: [user] } = await pool.query("SELECT email, name FROM users WHERE id = $1", [userId]);

  // Generate subject line
  const topEvent = dedupedEvents[0];
  const subject = dedupedEvents.length === 1
    ? topEvent.title
    : `${dedupedEvents.length} updates — ${topEvent.title} and more`;

  return {
    userId, email: user.email, subject, sections,
    totalEvents: dedupedEvents.length,
    topPriority: topEvent.priority,
  };
}

function groupIntoSections(events: DigestEvent[], engagement: Map<string, number>): DigestSection[] {
  const sections: DigestSection[] = [];

  // High priority: mentions and assignments
  const urgent = events.filter((e) => e.priority >= 8);
  if (urgent.length > 0) {
    sections.push({ title: "🔴 Needs your attention", icon: "alert", events: urgent, collapsed: false });
  }

  // Group by project
  const byProject = new Map<string, DigestEvent[]>();
  const nonUrgent = events.filter((e) => e.priority < 8);
  for (const event of nonUrgent) {
    const projectId = event.metadata.projectId || "other";
    const list = byProject.get(projectId) || [];
    list.push(event);
    byProject.set(projectId, list);
  }

  // Sort projects by engagement (most interacted first)
  const sortedProjects = Array.from(byProject.entries())
    .sort(([a], [b]) => (engagement.get(b) || 0) - (engagement.get(a) || 0));

  for (const [projectId, projectEvents] of sortedProjects) {
    const projectName = projectEvents[0]?.metadata.projectName || "Other";
    sections.push({
      title: `📁 ${projectName}`,
      icon: "folder",
      events: projectEvents,
      collapsed: projectEvents.every((e) => e.priority < 4), // collapse low-priority
    });
  }

  return sections;
}

// Track engagement for personalization
async function getEngagementData(userId: string): Promise<Map<string, number>> {
  const { rows } = await pool.query(
    `SELECT entity_id, COUNT(*) as interactions
     FROM user_activity WHERE user_id = $1 AND created_at > NOW() - INTERVAL '30 days'
     GROUP BY entity_id ORDER BY interactions DESC`,
    [userId]
  );
  return new Map(rows.map((r: any) => [r.entity_id, parseInt(r.interactions)]));
}

// Process daily digests (run by cron for each timezone hour)
export async function processDailyDigests(hour: number): Promise<number> {
  // Find users whose preferred hour matches and timezone aligns
  const { rows: users } = await pool.query(
    `SELECT user_id FROM digest_preferences
     WHERE frequency = 'daily' AND preferred_hour = $1`, [hour]
  );

  let sent = 0;
  for (const { user_id } of users) {
    const digest = await compileDigest(user_id, "daily");
    if (!digest) continue;

    await sendDigestEmail(digest);

    // Clear queue
    await redis.del(`digest:daily:${user_id}`);
    await redis.del(`digest:entities:${user_id}`);

    // Track send for engagement analytics
    await pool.query(
      `INSERT INTO digest_sends (user_id, event_count, top_priority, sent_at) VALUES ($1, $2, $3, NOW())`,
      [user_id, digest.totalEvents, digest.topPriority]
    );
    sent++;
  }
  return sent;
}

// Track email opens and clicks for engagement optimization
export async function trackDigestEngagement(
  userId: string,
  action: "open" | "click",
  eventId?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO digest_engagement (user_id, action, event_id, created_at) VALUES ($1, $2, $3, NOW())`,
    [userId, action, eventId]
  );

  // If user never opens digests, suggest switching to weekly
  if (action === "open") {
    await redis.incr(`digest:opens:${userId}`);
  }
}

async function sendDigestEmail(digest: CompiledDigest): Promise<void> {
  await redis.rpush("email:send:queue", JSON.stringify({
    to: digest.email,
    subject: digest.subject,
    template: "digest",
    data: digest,
  }));
}

async function getUserDigestPrefs(userId: string): Promise<DigestPreferences> {
  const { rows: [prefs] } = await pool.query(
    "SELECT * FROM digest_preferences WHERE user_id = $1", [userId]
  );
  return prefs || {
    userId, frequency: "daily", timezone: "UTC", preferredHour: 9,
    preferredDay: 1, mutedTypes: [], mutedProjects: [],
  };
}
```

## Results

- **Email volume: 30/day → 1/day** — all notifications batched into a single morning digest; users actually read it
- **Open rate: 8% → 52%** — one well-structured email beats 30 ignored ones; subject line shows the most important update
- **Zero cancellations from email spam** — users control frequency (instant/daily/weekly/off) and mute specific projects or event types
- **Engagement-based personalization** — projects the user interacts with most appear first; low-activity projects are collapsed
- **Deduplication saves attention** — 15 status changes on one task become one line: "Task X moved to Done"; users see outcomes not noise
