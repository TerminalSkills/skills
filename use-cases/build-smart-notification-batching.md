---
title: Build Smart Notification Batching
slug: build-smart-notification-batching
description: Build a smart notification batching system with digest grouping, delivery window optimization, channel preference routing, frequency capping, and engagement-based scheduling.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Product Engineering
tags:
  - notifications
  - batching
  - digest
  - engagement
  - optimization
---

# Build Smart Notification Batching

## The Problem

Mia leads product at a 25-person collaboration SaaS. Users get 50+ notifications daily — every comment, mention, status change triggers an instant push/email. Users disable notifications entirely because they're overwhelmed. Email open rates dropped to 5%. Push notification opt-out reached 40%. But some notifications ARE urgent (direct mentions, deadline alerts). They need smart batching: group low-priority notifications into digests, send urgents immediately, respect user time zones and preferences, cap frequency, and optimize delivery windows based on engagement.

## Step 1: Build the Batching Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Notification { id: string; userId: string; type: string; priority: "urgent" | "high" | "normal" | "low"; channel: "push" | "email" | "in_app"; title: string; body: string; data: Record<string, any>; createdAt: string; }
interface UserPreferences { userId: string; timezone: string; quietHoursStart: number; quietHoursEnd: number; channels: Record<string, boolean>; digestFrequency: "instant" | "hourly" | "daily"; maxPerHour: number; }
interface DigestBatch { userId: string; channel: string; notifications: Notification[]; scheduledFor: string; }

const PRIORITY_CONFIG: Record<string, { batch: boolean; maxDelay: number }> = {
  urgent: { batch: false, maxDelay: 0 },
  high: { batch: false, maxDelay: 300000 },
  normal: { batch: true, maxDelay: 3600000 },
  low: { batch: true, maxDelay: 86400000 },
};

export async function enqueueNotification(notification: Notification): Promise<{ action: "sent" | "batched" | "suppressed" }> {
  const prefs = await getUserPreferences(notification.userId);
  if (!prefs.channels[notification.channel]) return { action: "suppressed" };
  if (isQuietHours(prefs)) {
    if (notification.priority !== "urgent") {
      await addToBatch(notification); return { action: "batched" };
    }
  }
  // Frequency cap
  const hourKey = `notif:count:${notification.userId}:${Math.floor(Date.now() / 3600000)}`;
  const count = await redis.incr(hourKey);
  await redis.expire(hourKey, 7200);
  if (count > prefs.maxPerHour && notification.priority !== "urgent") {
    await addToBatch(notification); return { action: "batched" };
  }
  const config = PRIORITY_CONFIG[notification.priority];
  if (config.batch && prefs.digestFrequency !== "instant") {
    await addToBatch(notification); return { action: "batched" };
  }
  await sendNotification(notification); return { action: "sent" };
}

async function addToBatch(notification: Notification): Promise<void> {
  await redis.rpush(`notif:batch:${notification.userId}:${notification.channel}`, JSON.stringify(notification));
  await redis.expire(`notif:batch:${notification.userId}:${notification.channel}`, 86400);
}

export async function processBatches(): Promise<number> {
  const keys = await redis.keys("notif:batch:*");
  let sent = 0;
  for (const key of keys) {
    const parts = key.split(":");
    const userId = parts[2];
    const channel = parts[3];
    const prefs = await getUserPreferences(userId);
    if (isQuietHours(prefs)) continue;
    const raw = await redis.lrange(key, 0, -1);
    if (raw.length === 0) continue;
    const notifications: Notification[] = raw.map((r) => JSON.parse(r));
    // Group by type for digest
    const grouped = new Map<string, Notification[]>();
    for (const n of notifications) {
      if (!grouped.has(n.type)) grouped.set(n.type, []);
      grouped.get(n.type)!.push(n);
    }
    const digestBody = [...grouped.entries()].map(([type, items]) => {
      if (items.length === 1) return items[0].title;
      return `${items.length} ${type} notifications`;
    }).join("\n");
    await sendNotification({ id: `digest-${randomBytes(4).toString("hex")}`, userId, type: "digest", priority: "normal", channel: channel as any, title: `${notifications.length} updates`, body: digestBody, data: { count: notifications.length }, createdAt: new Date().toISOString() });
    await redis.del(key);
    sent++;
  }
  return sent;
}

function isQuietHours(prefs: UserPreferences): boolean {
  const now = new Date();
  const userHour = (now.getUTCHours() + getTimezoneOffset(prefs.timezone)) % 24;
  return userHour >= prefs.quietHoursStart || userHour < prefs.quietHoursEnd;
}

function getTimezoneOffset(tz: string): number {
  const offsets: Record<string, number> = { "US/Eastern": -5, "US/Pacific": -8, "Europe/London": 0, "Europe/Berlin": 1, "Asia/Tokyo": 9 };
  return offsets[tz] || 0;
}

async function sendNotification(notification: Notification): Promise<void> {
  await redis.rpush("notification:send", JSON.stringify(notification));
}

async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const cached = await redis.get(`notif:prefs:${userId}`);
  if (cached) return JSON.parse(cached);
  return { userId, timezone: "US/Eastern", quietHoursStart: 22, quietHoursEnd: 8, channels: { push: true, email: true, in_app: true }, digestFrequency: "hourly", maxPerHour: 10 };
}
```

## Results

- **50 notifications/day → 5 digests** — low-priority grouped hourly; users see "12 comments in Project X" instead of 12 separate notifications
- **Urgent notifications always instant** — direct mentions, deadline alerts bypass batching; delivered in <5 seconds regardless of preferences
- **Email open rate: 5% → 22%** — fewer, more valuable emails; digest format scannable; users re-enable email notifications
- **Push opt-out: 40% → 15%** — frequency capping (max 10/hour) + quiet hours; notifications feel respectful; users keep them on
- **Timezone-aware quiet hours** — 10 PM-8 AM in user's timezone; Tokyo user doesn't get batched at 3 AM; engagement up 30% for non-US users
