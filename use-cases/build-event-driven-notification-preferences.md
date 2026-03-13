---
title: Build Event-Driven Notification Preferences
slug: build-event-driven-notification-preferences
description: Build a notification preferences system that lets users control what they receive, through which channels, and when — reducing unsubscribes by 60% while keeping engagement high.
skills:
  - typescript
  - postgresql
  - redis
  - bull-mq
  - hono
  - zod
category: Full-Stack Development
tags:
  - notifications
  - user-preferences
  - event-driven
  - email
  - multi-channel
---

# Build Event-Driven Notification Preferences

## The Problem

Kai runs product at a 45-person project management SaaS. The platform sends 2 million notifications per month — task assignments, due date reminders, comment mentions, status updates. But it's all-or-nothing: users either get everything or mute the whole app. Power users complain about notification fatigue (averaging 80 notifications/day), while casual users miss critical alerts because they muted everything. Email unsubscribe rate hit 12%, and three enterprise customers cited "notification spam" in churn interviews. The team needs granular preference controls without rebuilding the entire notification stack.

## Step 1: Design the Preference Schema

Preferences are structured as a matrix: notification type × delivery channel × urgency level. Users configure each cell independently. Smart defaults mean users only need to change what they care about.

```typescript
// src/types/preferences.ts — Notification preference data model
import { z } from "zod";

// All notification types the platform can emit
export const NotificationType = z.enum([
  "task_assigned",
  "task_completed",
  "task_due_soon",       // due within 24 hours
  "task_overdue",
  "comment_mention",
  "comment_reply",
  "project_status_change",
  "team_member_joined",
  "weekly_digest",
  "security_alert",      // always delivered, cannot be disabled
]);

export const DeliveryChannel = z.enum([
  "in_app",    // in-app notification center
  "email",     // email (immediate or batched)
  "push",      // mobile push notification
  "slack",     // Slack DM via integration
]);

export const PreferenceValue = z.enum([
  "immediate",  // send right away
  "batched",    // include in next digest (hourly or daily)
  "off",        // don't send through this channel
]);

// Per-notification-type, per-channel preference
export const PreferenceRule = z.object({
  notificationType: NotificationType,
  channel: DeliveryChannel,
  value: PreferenceValue,
});

// User's full preference set
export const UserPreferences = z.object({
  userId: z.string().uuid(),
  rules: z.array(PreferenceRule),
  quietHours: z.object({
    enabled: z.boolean(),
    startHour: z.number().min(0).max(23),    // user's local time
    endHour: z.number().min(0).max(23),
    timezone: z.string(),                     // e.g., "America/New_York"
    allowUrgent: z.boolean(),                 // security alerts still come through
  }).optional(),
  digestSchedule: z.enum(["hourly", "daily_morning", "daily_evening", "weekly"]).default("daily_morning"),
});

// Smart defaults — new users get sensible settings without configuration
export const DEFAULT_PREFERENCES: Record<string, Record<string, string>> = {
  task_assigned:          { in_app: "immediate", email: "immediate", push: "immediate", slack: "immediate" },
  task_completed:         { in_app: "immediate", email: "batched",   push: "off",       slack: "off" },
  task_due_soon:          { in_app: "immediate", email: "immediate", push: "immediate", slack: "immediate" },
  task_overdue:           { in_app: "immediate", email: "immediate", push: "immediate", slack: "immediate" },
  comment_mention:        { in_app: "immediate", email: "immediate", push: "immediate", slack: "immediate" },
  comment_reply:          { in_app: "immediate", email: "batched",   push: "off",       slack: "off" },
  project_status_change:  { in_app: "immediate", email: "batched",   push: "off",       slack: "batched" },
  team_member_joined:     { in_app: "immediate", email: "off",       push: "off",       slack: "off" },
  weekly_digest:          { in_app: "off",        email: "immediate", push: "off",       slack: "off" },
  security_alert:         { in_app: "immediate", email: "immediate", push: "immediate", slack: "immediate" },
};
```

## Step 2: Build the Preference Resolution Engine

When a notification event fires, the engine resolves the user's preferences, applies quiet hours, and routes to the correct channels. Security alerts bypass all user preferences.

```typescript
// src/services/preference-engine.ts — Resolves user preferences for each notification event
import { pool } from "../db";
import { Redis } from "ioredis";
import { DEFAULT_PREFERENCES } from "../types/preferences";

const redis = new Redis(process.env.REDIS_URL!);

interface ResolvedDelivery {
  channel: string;
  timing: "immediate" | "batched";
}

interface NotificationEvent {
  type: string;
  userId: string;
  data: Record<string, any>;
  urgency: "low" | "normal" | "high" | "critical";
}

export async function resolveDeliveryChannels(
  event: NotificationEvent
): Promise<ResolvedDelivery[]> {
  // Security alerts always go through all channels immediately
  if (event.type === "security_alert") {
    return [
      { channel: "in_app", timing: "immediate" },
      { channel: "email", timing: "immediate" },
      { channel: "push", timing: "immediate" },
    ];
  }

  const prefs = await getUserPreferences(event.userId);
  const deliveries: ResolvedDelivery[] = [];

  // Get preference for each channel
  const typeDefaults = DEFAULT_PREFERENCES[event.type] || {};

  for (const channel of ["in_app", "email", "push", "slack"]) {
    // User-set preference takes priority over defaults
    const userRule = prefs.rules.find(
      (r) => r.notificationType === event.type && r.channel === channel
    );
    const value = userRule?.value || typeDefaults[channel] || "off";

    if (value === "off") continue;

    // Check quiet hours
    if (value === "immediate" && prefs.quietHours?.enabled) {
      const isQuiet = isInQuietHours(prefs.quietHours);
      if (isQuiet && !prefs.quietHours.allowUrgent) {
        // Downgrade to batched during quiet hours
        deliveries.push({ channel, timing: "batched" });
        continue;
      }
      if (isQuiet && event.urgency !== "critical") {
        deliveries.push({ channel, timing: "batched" });
        continue;
      }
    }

    deliveries.push({ channel, timing: value as "immediate" | "batched" });
  }

  return deliveries;
}

async function getUserPreferences(userId: string) {
  // Check Redis cache (preferences rarely change)
  const cacheKey = `prefs:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    "SELECT rules, quiet_hours, digest_schedule FROM user_preferences WHERE user_id = $1",
    [userId]
  );

  const prefs = rows.length > 0
    ? {
        rules: rows[0].rules || [],
        quietHours: rows[0].quiet_hours,
        digestSchedule: rows[0].digest_schedule || "daily_morning",
      }
    : { rules: [], quietHours: null, digestSchedule: "daily_morning" };

  // Cache for 10 minutes
  await redis.setex(cacheKey, 600, JSON.stringify(prefs));
  return prefs;
}

function isInQuietHours(quietHours: {
  startHour: number;
  endHour: number;
  timezone: string;
}): boolean {
  const now = new Date();
  const userHour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: quietHours.timezone,
    }).format(now)
  );

  if (quietHours.startHour < quietHours.endHour) {
    // Same day range: e.g., 22-08 won't match, 09-17 will
    return userHour >= quietHours.startHour && userHour < quietHours.endHour;
  } else {
    // Overnight range: e.g., 22-08 means 22,23,0,1,...,7
    return userHour >= quietHours.startHour || userHour < quietHours.endHour;
  }
}
```

## Step 3: Build the Notification Dispatcher

The dispatcher takes resolved delivery targets and sends notifications through each channel. Immediate notifications go directly; batched ones are accumulated and sent on the user's digest schedule.

```typescript
// src/services/dispatcher.ts — Multi-channel notification dispatch with batching
import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { resolveDeliveryChannels } from "./preference-engine";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

const immediateQueue = new Queue("notifications:immediate", { connection: redis });
const batchQueue = new Queue("notifications:batch", { connection: redis });

export async function dispatchNotification(event: {
  type: string;
  userId: string;
  data: Record<string, any>;
  urgency: "low" | "normal" | "high" | "critical";
}) {
  const channels = await resolveDeliveryChannels(event);

  for (const delivery of channels) {
    if (delivery.timing === "immediate") {
      await immediateQueue.add(delivery.channel, {
        ...event,
        channel: delivery.channel,
      });
    } else {
      // Store in batch buffer — picked up by digest cron
      await redis.zadd(
        `batch:${event.userId}`,
        Date.now(),
        JSON.stringify({ ...event, channel: delivery.channel })
      );
    }
  }

  // Always store in notification center (in-app)
  await pool.query(
    `INSERT INTO notifications (user_id, type, data, read, created_at)
     VALUES ($1, $2, $3, false, NOW())`,
    [event.userId, event.type, event.data]
  );
}

// Immediate delivery workers — one per channel
const emailWorker = new Worker(
  "notifications:immediate",
  async (job) => {
    if (job.name !== "email") return;
    const { userId, type, data } = job.data;

    const { rows } = await pool.query("SELECT email, name FROM users WHERE id = $1", [userId]);
    if (rows.length === 0) return;

    const template = getEmailTemplate(type, data);
    await sendEmail({
      to: rows[0].email,
      subject: template.subject,
      html: template.html,
    });
  },
  { connection: redis, concurrency: 10 }
);

const pushWorker = new Worker(
  "notifications:immediate",
  async (job) => {
    if (job.name !== "push") return;
    const { userId, type, data } = job.data;

    const { rows } = await pool.query(
      "SELECT push_token, platform FROM push_tokens WHERE user_id = $1",
      [userId]
    );

    for (const device of rows) {
      await sendPushNotification({
        token: device.push_token,
        platform: device.platform,
        title: getNotificationTitle(type),
        body: getNotificationBody(type, data),
        data: { type, ...data },
      });
    }
  },
  { connection: redis, concurrency: 10 }
);

// Digest worker — runs on cron schedule (hourly or daily)
export async function processDigests(schedule: "hourly" | "daily_morning" | "daily_evening") {
  // Find all users with this digest schedule
  const { rows: users } = await pool.query(
    "SELECT user_id FROM user_preferences WHERE digest_schedule = $1",
    [schedule]
  );

  for (const { user_id } of users) {
    const items = await redis.zrangebyscore(`batch:${user_id}`, "-inf", "+inf");
    if (items.length === 0) continue;

    const notifications = items.map((item) => JSON.parse(item));

    // Group by channel
    const byChannel = new Map<string, any[]>();
    for (const n of notifications) {
      const list = byChannel.get(n.channel) || [];
      list.push(n);
      byChannel.set(n.channel, list);
    }

    // Send digest per channel
    for (const [channel, items] of byChannel) {
      if (channel === "email") {
        await sendDigestEmail(user_id, items);
      } else if (channel === "slack") {
        await sendSlackDigest(user_id, items);
      }
    }

    // Clear processed items
    await redis.del(`batch:${user_id}`);
  }
}

function getEmailTemplate(type: string, data: any) {
  const templates: Record<string, (d: any) => { subject: string; html: string }> = {
    task_assigned: (d) => ({
      subject: `New task assigned: ${d.taskName}`,
      html: `<p>${d.assignedBy} assigned you <strong>${d.taskName}</strong> in project ${d.projectName}.</p>`,
    }),
    comment_mention: (d) => ({
      subject: `${d.author} mentioned you in ${d.taskName}`,
      html: `<p>${d.author} mentioned you: "${d.commentPreview}"</p>`,
    }),
    task_overdue: (d) => ({
      subject: `⚠️ Task overdue: ${d.taskName}`,
      html: `<p><strong>${d.taskName}</strong> was due ${d.dueDate}. Please update the status.</p>`,
    }),
  };

  const template = templates[type];
  return template ? template(data) : { subject: `Notification: ${type}`, html: JSON.stringify(data) };
}

// Placeholder functions — replace with actual service integrations
async function sendEmail(params: any) { /* Resend/SES/SendGrid */ }
async function sendPushNotification(params: any) { /* FCM/APNs */ }
async function sendDigestEmail(userId: string, items: any[]) { /* Batched email */ }
async function sendSlackDigest(userId: string, items: any[]) { /* Slack API */ }
function getNotificationTitle(type: string): string { return type.replace(/_/g, " "); }
function getNotificationBody(type: string, data: any): string { return data.summary || type; }
```

## Step 4: Build the Preferences API

Users manage their notification preferences through a clean REST API. Changes invalidate the cache immediately so the next notification uses the updated settings.

```typescript
// src/routes/preferences.ts — User notification preferences API
import { Hono } from "hono";
import { Redis } from "ioredis";
import { UserPreferences, PreferenceRule } from "../types/preferences";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Get current preferences (with defaults filled in)
app.get("/preferences/notifications", async (c) => {
  const userId = c.get("userId");

  const { rows } = await pool.query(
    "SELECT rules, quiet_hours, digest_schedule FROM user_preferences WHERE user_id = $1",
    [userId]
  );

  if (rows.length === 0) {
    return c.json({ rules: [], quietHours: null, digestSchedule: "daily_morning", isDefault: true });
  }

  return c.json({
    rules: rows[0].rules,
    quietHours: rows[0].quiet_hours,
    digestSchedule: rows[0].digest_schedule,
    isDefault: false,
  });
});

// Update preferences (partial update — only send changed rules)
app.patch("/preferences/notifications", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const { rules, quietHours, digestSchedule } = body;

  await pool.query(
    `INSERT INTO user_preferences (user_id, rules, quiet_hours, digest_schedule, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       rules = COALESCE($2, user_preferences.rules),
       quiet_hours = COALESCE($3, user_preferences.quiet_hours),
       digest_schedule = COALESCE($4, user_preferences.digest_schedule),
       updated_at = NOW()`,
    [userId, rules ? JSON.stringify(rules) : null, quietHours ? JSON.stringify(quietHours) : null, digestSchedule]
  );

  // Invalidate cache immediately
  await redis.del(`prefs:${userId}`);

  return c.json({ success: true });
});

// Quick-mute: silence a specific notification type across all channels
app.post("/preferences/notifications/mute/:type", async (c) => {
  const userId = c.get("userId");
  const { type } = c.req.param();

  if (type === "security_alert") {
    return c.json({ error: "Security alerts cannot be muted" }, 400);
  }

  // Add "off" rules for all channels for this type
  const muteRules = ["in_app", "email", "push", "slack"].map((channel) => ({
    notificationType: type,
    channel,
    value: "off",
  }));

  const { rows } = await pool.query(
    "SELECT rules FROM user_preferences WHERE user_id = $1",
    [userId]
  );

  const existingRules = rows[0]?.rules || [];
  // Remove existing rules for this type, add mute rules
  const filtered = existingRules.filter((r: any) => r.notificationType !== type);
  const newRules = [...filtered, ...muteRules];

  await pool.query(
    `INSERT INTO user_preferences (user_id, rules, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET rules = $2, updated_at = NOW()`,
    [userId, JSON.stringify(newRules)]
  );

  await redis.del(`prefs:${userId}`);
  return c.json({ success: true, muted: type });
});

export default app;
```

## Results

After rolling out granular notification preferences:

- **Email unsubscribe rate dropped from 12% to 4.5%** — users customize instead of muting everything; most downgrade noisy types to "batched" rather than "off"
- **Critical alert response time improved by 40%** — with noise reduced, important notifications (task overdue, security alerts) get attention within 5 minutes vs. 12 minutes before
- **Power user satisfaction up 35%** — quiet hours and per-type controls eliminated the 80 notifications/day problem; average dropped to 15 relevant ones
- **Enterprise churn citations mentioning notifications: zero** — the three churning accounts renewed after seeing the preference center in their QBR
- **Daily digest adoption at 68%** — most users prefer a morning summary for low-urgency items, freeing their attention during focused work
