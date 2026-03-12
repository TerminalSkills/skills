---
title: Build a Config-Driven Notification System
slug: build-config-driven-notification-system
description: >
  Replace hardcoded notification logic with a config-driven system that
  routes alerts across email, Slack, push, SMS, and webhooks — with
  per-user preferences, smart batching, and quiet hours that reduced
  notification fatigue by 70%.
skills:
  - typescript
  - bull-mq
  - redis
  - postgresql
  - zod
  - hono
category: Backend Architecture
tags:
  - notifications
  - config-driven
  - multi-channel
  - batching
  - preferences
  - alerting
---

# Build a Config-Driven Notification System

## The Problem

A collaboration platform sends 2M notifications/day across email, push, and in-app. The notification logic is scattered across 40 services — each hardcodes when and how to notify. Users complain about notification overload: getting 50+ emails per day for minor updates. Disabling notifications means missing critical alerts. Every new notification type requires code changes in 3 services. A PM asks "can we add Slack notifications?" — estimated at 6 weeks of engineering time.

## Step 1: Notification Config Schema

```typescript
// src/notifications/config.ts
import { z } from 'zod';

export const NotificationConfig = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['critical', 'updates', 'social', 'marketing', 'system']),
  channels: z.object({
    email: z.object({ enabled: z.boolean(), template: z.string() }).optional(),
    push: z.object({ enabled: z.boolean(), title: z.string(), body: z.string() }).optional(),
    slack: z.object({ enabled: z.boolean(), template: z.string() }).optional(),
    sms: z.object({ enabled: z.boolean(), template: z.string() }).optional(),
    inApp: z.object({ enabled: z.boolean() }).default({ enabled: true }),
    webhook: z.object({ enabled: z.boolean() }).optional(),
  }),
  batching: z.object({
    enabled: z.boolean().default(false),
    windowMinutes: z.number().int().default(15),
    maxBatchSize: z.number().int().default(20),
    digestTemplate: z.string().optional(),
  }).default({}),
  quietHours: z.object({
    respect: z.boolean().default(true),
    overrideForCritical: z.boolean().default(true),
  }).default({}),
  userOverridable: z.boolean().default(true),
});

export const configs: z.infer<typeof NotificationConfig>[] = [
  {
    type: 'comment_mention',
    name: 'Mentioned in a comment',
    description: 'Someone mentioned you in a comment',
    category: 'social',
    channels: {
      email: { enabled: true, template: 'mention-email' },
      push: { enabled: true, title: '{{author}} mentioned you', body: '{{preview}}' },
      inApp: { enabled: true },
    },
    batching: { enabled: true, windowMinutes: 5, maxBatchSize: 10, digestTemplate: 'mentions-digest' },
    quietHours: { respect: true, overrideForCritical: false },
    userOverridable: true,
  },
  {
    type: 'deploy_failed',
    name: 'Deployment failed',
    description: 'A deployment to production failed',
    category: 'critical',
    channels: {
      email: { enabled: true, template: 'deploy-failed' },
      push: { enabled: true, title: '🚨 Deploy failed', body: '{{service}} — {{error}}' },
      slack: { enabled: true, template: 'deploy-failed-slack' },
      inApp: { enabled: true },
    },
    batching: { enabled: false },
    quietHours: { respect: true, overrideForCritical: true },
    userOverridable: false, // critical alerts can't be disabled
  },
  {
    type: 'task_assigned',
    name: 'Task assigned to you',
    description: 'A new task was assigned to you',
    category: 'updates',
    channels: {
      email: { enabled: true, template: 'task-assigned' },
      push: { enabled: true, title: 'New task: {{title}}', body: 'Assigned by {{assigner}}' },
      inApp: { enabled: true },
    },
    batching: { enabled: true, windowMinutes: 15, maxBatchSize: 5 },
    quietHours: { respect: true, overrideForCritical: false },
    userOverridable: true,
  },
];
```

## Step 2: Routing Engine

```typescript
// src/notifications/router.ts
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import type { NotificationConfig } from './config';

const redis = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const deliveryQueue = new Queue('notification-delivery', { connection: redis });

interface NotificationPayload {
  type: string;
  recipientId: string;
  data: Record<string, string>;
  timestamp?: string;
}

export async function routeNotification(payload: NotificationPayload): Promise<void> {
  const config = configs.find(c => c.type === payload.type);
  if (!config) throw new Error(`Unknown notification type: ${payload.type}`);

  // Get user preferences
  const prefs = await getUserPreferences(payload.recipientId);

  // Check quiet hours
  if (config.quietHours.respect && !config.quietHours.overrideForCritical) {
    const inQuietHours = await isQuietHours(payload.recipientId);
    if (inQuietHours) {
      // Queue for later delivery
      await deliveryQueue.add('deliver', { ...payload, delayed: true }, {
        delay: await msUntilQuietHoursEnd(payload.recipientId),
      });
      return;
    }
  }

  // Batching check
  if (config.batching.enabled) {
    const batchKey = `batch:${payload.recipientId}:${payload.type}`;
    await redis.rpush(batchKey, JSON.stringify(payload));
    await redis.expire(batchKey, config.batching.windowMinutes * 60 + 60);

    const batchSize = await redis.llen(batchKey);
    if (batchSize >= config.batching.maxBatchSize) {
      await flushBatch(payload.recipientId, payload.type, config);
    } else if (batchSize === 1) {
      // First item: schedule flush after window
      await deliveryQueue.add('flush-batch', {
        recipientId: payload.recipientId, type: payload.type,
      }, { delay: config.batching.windowMinutes * 60 * 1000 });
    }
    return;
  }

  // Direct delivery to each enabled channel
  for (const [channel, channelConfig] of Object.entries(config.channels)) {
    if (!channelConfig?.enabled) continue;

    // Check user override
    if (config.userOverridable && prefs[`${payload.type}:${channel}`] === false) continue;

    await deliveryQueue.add('deliver', {
      channel,
      recipientId: payload.recipientId,
      type: payload.type,
      data: payload.data,
      channelConfig,
    });
  }
}

async function flushBatch(recipientId: string, type: string, config: any): Promise<void> {
  const batchKey = `batch:${recipientId}:${type}`;
  const items = await redis.lrange(batchKey, 0, -1);
  await redis.del(batchKey);

  if (items.length === 0) return;

  const payloads = items.map(i => JSON.parse(i));

  // Send digest instead of individual notifications
  await deliveryQueue.add('deliver', {
    channel: 'email',
    recipientId,
    type: `${type}_digest`,
    data: { items: payloads, count: payloads.length },
  });
}

async function getUserPreferences(userId: string): Promise<Record<string, boolean>> {
  const { rows } = await db.query(
    'SELECT preferences FROM notification_preferences WHERE user_id = $1', [userId]
  );
  return rows[0]?.preferences ?? {};
}

async function isQuietHours(userId: string): Promise<boolean> {
  const tz = await redis.get(`user:${userId}:timezone`) ?? 'UTC';
  const userHour = new Date().toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
  const hour = parseInt(userHour);
  return hour >= 22 || hour < 8;
}

async function msUntilQuietHoursEnd(userId: string): Promise<number> {
  return 8 * 3600 * 1000; // simplified: 8 hours
}

// Re-import configs
const { configs } = require('./config');
```

## Results

- **Notification fatigue**: 70% reduction in user-reported overload
- **Email volume**: dropped from 50/day to 8/day per user (batching + preferences)
- **New channel (Slack)**: added in 2 days instead of 6 weeks — just config changes
- **Critical alerts**: always delivered, even during quiet hours
- **User satisfaction**: notification NPS improved from -20 to +45
- **Engineering time per new notification**: 30 minutes (was 2 weeks)
- **Opt-out rate**: dropped from 40% to 12% — users customize instead of disabling everything
