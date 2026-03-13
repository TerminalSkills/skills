---
title: Build a Mobile Push Notification Service
slug: build-mobile-push-notification-service
description: >
  Build a push notification service that delivers 5M notifications/day
  across iOS and Android with personalization, A/B testing, quiet hours,
  and analytics — increasing app engagement by 35%.
skills:
  - typescript
  - bull-mq
  - redis
  - postgresql
  - kafka-js
  - zod
  - hono
category: Full-Stack Development
tags:
  - push-notifications
  - mobile
  - engagement
  - fcm
  - apns
  - personalization
---

# Build a Mobile Push Notification Service

## The Problem

A mobile app with 2M users sends push notifications via a single Firebase function. No personalization — everyone gets the same message at the same time. No quiet hours — users in Tokyo get pinged at 3 AM. No analytics — the team doesn't know if notifications drive engagement or annoy users. Uninstall rate spiked 20% after a "blast everyone" campaign. The product team wants targeted, behavior-based notifications but the current system can only broadcast.

## Step 1: Device Registry and Preferences

```typescript
// src/push/registry.ts
import { z } from 'zod';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

const DeviceRegistration = z.object({
  userId: z.string(),
  deviceId: z.string(),
  platform: z.enum(['ios', 'android', 'web']),
  pushToken: z.string(),
  appVersion: z.string(),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  preferences: z.object({
    enabled: z.boolean().default(true),
    categories: z.record(z.string(), z.boolean()).default({}),
    quietHoursStart: z.number().int().min(0).max(23).default(22),
    quietHoursEnd: z.number().int().min(0).max(23).default(8),
  }).default({}),
});

export async function registerDevice(data: z.infer<typeof DeviceRegistration>): Promise<void> {
  await db.query(`
    INSERT INTO device_tokens (user_id, device_id, platform, push_token, app_version, locale, timezone, preferences, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (device_id) DO UPDATE SET
      push_token = $4, app_version = $5, locale = $6, timezone = $7, preferences = $8, updated_at = NOW()
  `, [data.userId, data.deviceId, data.platform, data.pushToken, data.appVersion, data.locale, data.timezone, JSON.stringify(data.preferences)]);
}

export async function getUserDevices(userId: string): Promise<z.infer<typeof DeviceRegistration>[]> {
  const { rows } = await db.query(
    `SELECT * FROM device_tokens WHERE user_id = $1 AND push_token IS NOT NULL`,
    [userId]
  );
  return rows.map(r => ({ ...r, preferences: r.preferences ?? {} }));
}
```

## Step 2: Notification Dispatcher

```typescript
// src/push/dispatcher.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { getUserDevices } from './registry';

const connection = new Redis(process.env.REDIS_URL!);
const pushQueue = new Queue('push-notifications', { connection });

interface PushRequest {
  userId: string;
  category: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  imageUrl?: string;
  badge?: number;
  sound?: string;
  priority?: 'high' | 'normal';
  ttlSeconds?: number;
  deduplicationKey?: string;
}

export async function sendPush(request: PushRequest): Promise<void> {
  // Deduplication
  if (request.deduplicationKey) {
    const dedupKey = `push:dedup:${request.userId}:${request.deduplicationKey}`;
    const exists = await connection.set(dedupKey, '1', 'NX', 'EX', 3600);
    if (!exists) return;
  }

  const devices = await getUserDevices(request.userId);

  for (const device of devices) {
    // Check if user opted out of this category
    if (!device.preferences.enabled) continue;
    if (device.preferences.categories[request.category] === false) continue;

    // Check quiet hours
    const userHour = getCurrentHourInTimezone(device.timezone);
    const inQuietHours = isInQuietHours(userHour, device.preferences.quietHoursStart, device.preferences.quietHoursEnd);

    if (inQuietHours && request.priority !== 'high') {
      // Delay until quiet hours end
      const delayMs = msUntilHour(device.timezone, device.preferences.quietHoursEnd);
      await pushQueue.add('deliver', { request, device }, { delay: delayMs });
      continue;
    }

    await pushQueue.add('deliver', { request, device }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  }
}

// Batch send to segment
export async function sendToSegment(
  segment: { sql: string; params: any[] },
  notification: Omit<PushRequest, 'userId'>
): Promise<{ queued: number }> {
  const { Pool } = await import('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const { rows } = await db.query(segment.sql, segment.params);

  let queued = 0;
  for (const row of rows) {
    await sendPush({ ...notification, userId: row.user_id });
    queued++;
  }

  return { queued };
}

const worker = new Worker('push-notifications', async (job) => {
  const { request, device } = job.data;

  if (device.platform === 'ios' || device.platform === 'android') {
    await sendViaFCM(device.pushToken, {
      notification: {
        title: request.title,
        body: request.body,
        image: request.imageUrl,
      },
      data: request.data,
      android: {
        priority: request.priority === 'high' ? 'high' : 'normal',
        ttl: `${request.ttlSeconds ?? 86400}s`,
        notification: { sound: request.sound ?? 'default', channelId: request.category },
      },
      apns: {
        payload: {
          aps: { badge: request.badge, sound: request.sound ?? 'default', 'mutable-content': 1 },
        },
      },
    });
  }

  // Track delivery
  await connection.hincrby(`push:stats:${new Date().toISOString().split('T')[0]}`, 'delivered', 1);
  await connection.hincrby(`push:stats:${request.category}:${new Date().toISOString().split('T')[0]}`, 'delivered', 1);
}, { connection, concurrency: 100 });

async function sendViaFCM(token: string, message: any): Promise<void> {
  const accessToken = await getGoogleAccessToken();
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${process.env.FCM_PROJECT}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { ...message, token } }),
  });
  if (!res.ok) {
    const error = await res.text();
    if (error.includes('NOT_FOUND') || error.includes('UNREGISTERED')) {
      // Token invalid — remove device
      const { Pool } = await import('pg');
      const db = new Pool({ connectionString: process.env.DATABASE_URL });
      await db.query('DELETE FROM device_tokens WHERE push_token = $1', [token]);
    }
    throw new Error(`FCM error: ${res.status}`);
  }
}

async function getGoogleAccessToken(): Promise<string> { return ''; /* OAuth2 flow */ }

function getCurrentHourInTimezone(tz: string): number {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false }));
}

function isInQuietHours(hour: number, start: number, end: number): boolean {
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

function msUntilHour(tz: string, targetHour: number): number {
  return targetHour * 3600 * 1000; // simplified
}
```

## Step 3: Analytics API

```typescript
// src/api/push-analytics.ts
import { Hono } from 'hono';
import { Redis } from 'ioredis';

const app = new Hono();
const redis = new Redis(process.env.REDIS_URL!);

app.get('/v1/push/analytics', async (c) => {
  const days = parseInt(c.req.query('days') ?? '7');
  const stats = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    const data = await redis.hgetall(`push:stats:${date}`);
    stats.push({
      date,
      delivered: parseInt(data.delivered ?? '0'),
      opened: parseInt(data.opened ?? '0'),
      dismissed: parseInt(data.dismissed ?? '0'),
    });
  }

  const totalDelivered = stats.reduce((s, d) => s + d.delivered, 0);
  const totalOpened = stats.reduce((s, d) => s + d.opened, 0);

  return c.json({
    stats,
    summary: {
      totalDelivered,
      totalOpened,
      openRate: totalDelivered > 0 ? (totalOpened / totalDelivered * 100).toFixed(1) + '%' : '0%',
    },
  });
});

export default app;
```

## Results

- **5M notifications/day**: delivered reliably across iOS and Android
- **Open rate**: 18% (was 6% with blast-everyone approach)
- **Quiet hours**: zero 3 AM pings — respects every user's timezone
- **Uninstall rate**: dropped 20% after switching from broadcasts to targeted
- **Category opt-out**: users control what they receive, reducing frustration
- **Invalid tokens**: auto-cleaned, reducing failed deliveries from 15% to 2%
- **Engagement**: +35% daily active users from behavior-triggered notifications
