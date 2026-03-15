---
title: Build an Event-Driven Notification Orchestrator
slug: build-event-driven-notification-orchestrator
description: Build a multi-channel notification system that routes alerts through email, push, SMS, and in-app based on user preferences, urgency levels, and smart batching to avoid notification fatigue.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - notifications
  - event-driven
  - multi-channel
  - real-time
  - user-preferences
---

# Build an Event-Driven Notification Orchestrator

## The Problem

Dani runs product at a 45-person project management SaaS with 18,000 active users. Users get too many notifications — task assignments, comments, status changes, mentions, deadline reminders — averaging 47 per day. Unsubscribe rates are climbing: 12% of users have turned off all email notifications. But critical alerts (deadline in 1 hour, production incident) get buried in the noise. Each notification channel (email, push, in-app) has its own code path with duplicated logic. When marketing wants to add SMS, it means building a fourth silo. A centralized notification orchestrator would route messages intelligently: batch low-priority updates, escalate urgent ones, respect user preferences, and prevent fatigue.

## Step 1: Build the Notification Router

The router receives events and decides which channels to use based on urgency, user preferences, and quiet hours. It batches non-urgent notifications to reduce volume.

```typescript
// src/router/notification-router.ts — Intelligent notification routing engine
import { Redis } from "ioredis";
import { pool } from "../db";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);

// Notification urgency levels determine routing behavior
const UrgencyLevel = z.enum(["critical", "high", "normal", "low", "digest"]);
type UrgencyLevel = z.infer<typeof UrgencyLevel>;

const NotificationEvent = z.object({
  id: z.string(),
  type: z.string(),                    // "task.assigned", "comment.mention", "deadline.approaching"
  urgency: UrgencyLevel,
  recipientId: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.record(z.unknown()).optional(),
  groupKey: z.string().optional(),     // group related notifications (e.g., same task thread)
  dedupeKey: z.string().optional(),    // prevent duplicate notifications
});
type NotificationEvent = z.infer<typeof NotificationEvent>;

interface UserPreferences {
  email: boolean;
  push: boolean;
  sms: boolean;
  inApp: boolean;
  quietHoursStart: number | null;  // hour in user's timezone (e.g., 22)
  quietHoursEnd: number | null;    // hour in user's timezone (e.g., 8)
  timezone: string;
  batchDigest: boolean;            // batch low-priority into daily digest
  disabledTypes: string[];         // notification types the user has muted
}

interface RoutingDecision {
  channels: Array<"email" | "push" | "sms" | "inApp">;
  delay: number;           // ms to wait before sending (0 = immediate)
  batch: boolean;          // add to digest instead of sending now
  reason: string;
}

export async function routeNotification(event: NotificationEvent): Promise<RoutingDecision> {
  const prefs = await getUserPreferences(event.recipientId);

  // Check if the user has muted this notification type
  if (prefs.disabledTypes.includes(event.type)) {
    return { channels: ["inApp"], delay: 0, batch: false, reason: "Type muted by user — in-app only" };
  }

  // Deduplication: skip if same dedupeKey was sent recently
  if (event.dedupeKey) {
    const exists = await redis.get(`notif:dedupe:${event.recipientId}:${event.dedupeKey}`);
    if (exists) {
      return { channels: [], delay: 0, batch: false, reason: "Deduplicated — already sent" };
    }
    await redis.setex(`notif:dedupe:${event.recipientId}:${event.dedupeKey}`, 3600, "1");
  }

  // Check quiet hours
  const isQuietHours = checkQuietHours(prefs);

  // Route based on urgency
  switch (event.urgency) {
    case "critical":
      // Critical: all enabled channels, ignore quiet hours
      return {
        channels: getEnabledChannels(prefs, ["email", "push", "sms", "inApp"]),
        delay: 0,
        batch: false,
        reason: "Critical — immediate delivery on all channels",
      };

    case "high":
      // High: push + email, respect quiet hours for email
      return {
        channels: getEnabledChannels(prefs, isQuietHours ? ["push", "inApp"] : ["push", "email", "inApp"]),
        delay: 0,
        batch: false,
        reason: isQuietHours ? "High during quiet hours — push + in-app only" : "High priority — push + email",
      };

    case "normal":
      if (isQuietHours) {
        return { channels: ["inApp"], delay: 0, batch: false, reason: "Normal during quiet hours — in-app only" };
      }
      return {
        channels: getEnabledChannels(prefs, ["push", "inApp"]),
        delay: 0,
        batch: false,
        reason: "Normal priority — push + in-app",
      };

    case "low":
      // Low priority: batch if user prefers digests
      if (prefs.batchDigest) {
        await addToDigest(event);
        return { channels: [], delay: 0, batch: true, reason: "Low priority — added to daily digest" };
      }
      return { channels: ["inApp"], delay: 0, batch: false, reason: "Low priority — in-app only" };

    case "digest":
      await addToDigest(event);
      return { channels: [], delay: 0, batch: true, reason: "Digest item — batched" };
  }
}

function getEnabledChannels(
  prefs: UserPreferences,
  desired: Array<"email" | "push" | "sms" | "inApp">
): Array<"email" | "push" | "sms" | "inApp"> {
  return desired.filter((ch) => {
    switch (ch) {
      case "email": return prefs.email;
      case "push": return prefs.push;
      case "sms": return prefs.sms;
      case "inApp": return prefs.inApp;
    }
  });
}

function checkQuietHours(prefs: UserPreferences): boolean {
  if (prefs.quietHoursStart === null || prefs.quietHoursEnd === null) return false;

  const now = new Date();
  // Convert to user's timezone
  const userHour = parseInt(
    now.toLocaleString("en-US", { timeZone: prefs.timezone, hour: "numeric", hour12: false })
  );

  if (prefs.quietHoursStart > prefs.quietHoursEnd) {
    // Wraps midnight: e.g., 22-8
    return userHour >= prefs.quietHoursStart || userHour < prefs.quietHoursEnd;
  }
  return userHour >= prefs.quietHoursStart && userHour < prefs.quietHoursEnd;
}

async function addToDigest(event: NotificationEvent): Promise<void> {
  await redis.rpush(`digest:${event.recipientId}`, JSON.stringify({
    ...event,
    queuedAt: Date.now(),
  }));
  // Expire in 48h to auto-clean if digest job fails
  await redis.expire(`digest:${event.recipientId}`, 172800);
}

async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const cached = await redis.get(`prefs:${userId}`);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query(
    "SELECT * FROM notification_preferences WHERE user_id = $1",
    [userId]
  );

  const prefs: UserPreferences = rows[0] ? {
    email: rows[0].email_enabled,
    push: rows[0].push_enabled,
    sms: rows[0].sms_enabled,
    inApp: true,
    quietHoursStart: rows[0].quiet_start,
    quietHoursEnd: rows[0].quiet_end,
    timezone: rows[0].timezone || "UTC",
    batchDigest: rows[0].batch_digest,
    disabledTypes: rows[0].disabled_types || [],
  } : {
    email: true, push: true, sms: false, inApp: true,
    quietHoursStart: 22, quietHoursEnd: 8, timezone: "UTC",
    batchDigest: false, disabledTypes: [],
  };

  await redis.setex(`prefs:${userId}`, 300, JSON.stringify(prefs));
  return prefs;
}
```

## Step 2: Build the Channel Dispatchers

Each channel has its own dispatcher that handles delivery, retries, and tracking.

```typescript
// src/dispatchers/dispatcher.ts — Multi-channel notification delivery
import { pool } from "../db";

interface DeliveryPayload {
  notificationId: string;
  recipientId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channel: string;
}

// Email dispatcher (using Resend)
export async function sendEmail(payload: DeliveryPayload): Promise<boolean> {
  const { rows } = await pool.query("SELECT email FROM users WHERE id = $1", [payload.recipientId]);
  if (!rows[0]?.email) return false;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "notifications@app.example.com",
      to: rows[0].email,
      subject: payload.title,
      html: buildEmailHtml(payload.title, payload.body),
    }),
  });

  const success = response.ok;
  await logDelivery(payload.notificationId, "email", success);
  return success;
}

// Push notification dispatcher (using web-push for PWA)
export async function sendPush(payload: DeliveryPayload): Promise<boolean> {
  const { rows: subscriptions } = await pool.query(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1",
    [payload.recipientId]
  );

  let anySuccess = false;
  for (const sub of subscriptions) {
    try {
      const webpush = await import("web-push");
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ title: payload.title, body: payload.body, data: payload.data })
      );
      anySuccess = true;
    } catch (err: any) {
      if (err.statusCode === 410) {
        // Subscription expired — clean up
        await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]);
      }
    }
  }

  await logDelivery(payload.notificationId, "push", anySuccess);
  return anySuccess;
}

// In-app notification (stored for the notification center UI)
export async function sendInApp(payload: DeliveryPayload): Promise<boolean> {
  await pool.query(
    `INSERT INTO in_app_notifications (id, user_id, title, body, data, read, created_at)
     VALUES ($1, $2, $3, $4, $5, false, NOW())`,
    [payload.notificationId, payload.recipientId, payload.title, payload.body, JSON.stringify(payload.data || {})]
  );

  // Publish to real-time channel for instant UI update
  const { Redis } = await import("ioredis");
  const pub = new Redis(process.env.REDIS_URL!);
  await pub.publish(`user:${payload.recipientId}:notifications`, JSON.stringify({
    type: "new_notification",
    notification: { id: payload.notificationId, title: payload.title, body: payload.body },
  }));
  pub.disconnect();

  await logDelivery(payload.notificationId, "inApp", true);
  return true;
}

async function logDelivery(notificationId: string, channel: string, success: boolean) {
  await pool.query(
    `INSERT INTO notification_deliveries (notification_id, channel, success, delivered_at)
     VALUES ($1, $2, $3, NOW())`,
    [notificationId, channel, success]
  );
}

function buildEmailHtml(title: string, body: string): string {
  return `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1f2937; margin-bottom: 8px;">${title}</h2>
      <p style="color: #4b5563; line-height: 1.6;">${body}</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
      <p style="color: #9ca3af; font-size: 12px;">
        <a href="https://app.example.com/settings/notifications" style="color: #6b7280;">Manage notification preferences</a>
      </p>
    </div>
  `;
}
```

## Step 3: Build the Digest Processor and API

```typescript
// src/digest/digest-processor.ts — Daily digest email builder
import { Redis } from "ioredis";
import { sendEmail } from "../dispatchers/dispatcher";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

export async function processDigests(): Promise<{ processed: number; users: number }> {
  // Find all users with pending digest items
  const keys = await redis.keys("digest:*");
  let processed = 0;

  for (const key of keys) {
    const userId = key.replace("digest:", "");
    const items = await redis.lrange(key, 0, -1);

    if (items.length === 0) continue;

    const notifications = items.map((i) => JSON.parse(i));

    // Group by type for a clean digest layout
    const grouped = new Map<string, typeof notifications>();
    for (const n of notifications) {
      const group = n.groupKey || n.type;
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group)!.push(n);
    }

    // Build digest content
    let digestBody = `You have ${notifications.length} updates:\n\n`;
    for (const [group, items] of grouped) {
      digestBody += `**${formatGroupName(group)}** (${items.length})\n`;
      for (const item of items.slice(0, 5)) { // max 5 per group
        digestBody += `• ${item.title}\n`;
      }
      if (items.length > 5) {
        digestBody += `• ...and ${items.length - 5} more\n`;
      }
      digestBody += "\n";
    }

    await sendEmail({
      notificationId: `digest-${userId}-${Date.now()}`,
      recipientId: userId,
      title: `Your daily digest — ${notifications.length} updates`,
      body: digestBody,
      channel: "email",
    });

    // Clear processed items
    await redis.del(key);
    processed += notifications.length;
  }

  return { processed, users: keys.length };
}

function formatGroupName(key: string): string {
  return key.replace(".", " → ").replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}
```

## Results

After deploying the notification orchestrator:

- **Notification volume dropped from 47 to 12 per day per user** — smart batching, deduplication, and digest mode reduce noise by 74%; users see what matters, not everything that happens
- **Unsubscribe rate dropped from 12% to 3%** — users trust the system to be smart about what it sends; quiet hours and per-type controls give them ownership
- **Critical alerts never missed** — urgency-based routing means production incidents bypass quiet hours and use all channels; response time to critical events dropped from 23 minutes to 4 minutes
- **SMS channel added in 2 days** — the orchestrator architecture meant adding SMS was just one new dispatcher function, not a new pipeline
- **Delivery tracking centralized** — every notification has a full audit trail: which channels it went to, whether delivery succeeded, and when the user read it
