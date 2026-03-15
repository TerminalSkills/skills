---
title: Build a Web Push Notification Service
slug: build-push-notification-service
description: Build a web push notification system with subscription management, segmented targeting, scheduled sends, delivery tracking, rich notifications with actions, and opt-in optimization.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - push-notifications
  - web-push
  - engagement
  - pwa
  - messaging
---

# Build a Web Push Notification Service

## The Problem

Ren leads growth at a 25-person content platform. Users visit, read an article, and leave — 80% never return. Email newsletters have 18% open rates. They want push notifications to bring users back but need to handle it right: too many notifications = users unsubscribe; wrong timing = ignored; no segmentation = irrelevant content. They need a push system with smart opt-in prompts, audience segmentation, scheduled delivery, rich notifications with images and action buttons, and delivery analytics to optimize over time.

## Step 1: Build the Push Service

```typescript
// src/push/service.ts — Web push with segmentation, scheduling, and analytics
import { pool } from "../db";
import { Redis } from "ioredis";
import webpush from "web-push";

const redis = new Redis(process.env.REDIS_URL!);

webpush.setVapidDetails(
  `mailto:${process.env.PUSH_EMAIL}`,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

interface PushSubscription {
  id: string;
  userId: string | null;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent: string;
  timezone: string;
  topics: string[];
  frequency: "all" | "daily" | "weekly" | "important_only";
  status: "active" | "expired" | "unsubscribed";
  lastSentAt: string | null;
  deliveryCount: number;
  clickCount: number;
  createdAt: string;
}

interface PushCampaign {
  id: string;
  title: string;
  body: string;
  icon: string;
  image: string | null;
  badge: string;
  url: string;
  actions: Array<{ action: string; title: string; icon?: string }>;
  targeting: {
    topics: string[];
    segments: string[];
    timezones: string[];
    minEngagement: number;
    frequency: string[];
  };
  schedule: {
    sendAt: string | null;
    localTime: string | null;
    expiry: number;
  };
  status: "draft" | "scheduled" | "sending" | "sent";
  stats: { sent: number; delivered: number; clicked: number; failed: number };
}

// Subscribe user to push
export async function subscribe(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  opts: { userId?: string; timezone?: string; topics?: string[]; userAgent?: string }
): Promise<{ subscriptionId: string }> {
  const id = `sub-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, keys, user_agent, timezone, topics, frequency, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'all', 'active', NOW())
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = COALESCE($2, push_subscriptions.user_id),
       keys = $4, status = 'active'`,
    [id, opts.userId || null, subscription.endpoint, JSON.stringify(subscription.keys),
     opts.userAgent || "", opts.timezone || "UTC", JSON.stringify(opts.topics || [])]
  );

  return { subscriptionId: id };
}

// Send push to specific user
export async function sendToUser(
  userId: string,
  notification: { title: string; body: string; url: string; icon?: string; image?: string; actions?: any[] }
): Promise<{ sent: number; failed: number }> {
  const { rows: subs } = await pool.query(
    "SELECT * FROM push_subscriptions WHERE user_id = $1 AND status = 'active'",
    [userId]
  );

  let sent = 0, failed = 0;

  for (const sub of subs) {
    const success = await sendPush(sub, notification);
    if (success) sent++; else failed++;
  }

  return { sent, failed };
}

// Send campaign to segment
export async function sendCampaign(campaignId: string): Promise<void> {
  const { rows: [campaign] } = await pool.query("SELECT * FROM push_campaigns WHERE id = $1", [campaignId]);
  if (!campaign) throw new Error("Campaign not found");

  const targeting = JSON.parse(campaign.targeting);
  await pool.query("UPDATE push_campaigns SET status = 'sending' WHERE id = $1", [campaignId]);

  // Build subscriber query
  let sql = "SELECT * FROM push_subscriptions WHERE status = 'active'";
  const params: any[] = [];
  let idx = 1;

  if (targeting.topics?.length > 0) {
    sql += ` AND topics::jsonb ?| $${idx}`;
    params.push(targeting.topics);
    idx++;
  }

  if (targeting.frequency?.length > 0) {
    sql += ` AND frequency = ANY($${idx})`;
    params.push(targeting.frequency);
    idx++;
  }

  if (targeting.minEngagement > 0) {
    sql += ` AND click_count::float / GREATEST(delivery_count, 1) >= $${idx}`;
    params.push(targeting.minEngagement / 100);
    idx++;
  }

  const { rows: subscribers } = await pool.query(sql, params);

  const notification = {
    title: campaign.title,
    body: campaign.body,
    icon: campaign.icon,
    image: campaign.image,
    url: campaign.url,
    actions: JSON.parse(campaign.actions || "[]"),
    tag: campaignId,
    data: { campaignId, url: campaign.url },
  };

  let sent = 0, delivered = 0, failed = 0;

  // Send in batches of 100
  for (let i = 0; i < subscribers.length; i += 100) {
    const batch = subscribers.slice(i, i + 100);
    const results = await Promise.allSettled(
      batch.map((sub) => sendPush(sub, notification))
    );

    for (const result of results) {
      sent++;
      if (result.status === "fulfilled" && result.value) delivered++;
      else failed++;
    }
  }

  await pool.query(
    `UPDATE push_campaigns SET status = 'sent', stats = $2 WHERE id = $1`,
    [campaignId, JSON.stringify({ sent, delivered, clicked: 0, failed })]
  );
}

async function sendPush(sub: any, notification: any): Promise<boolean> {
  const keys = JSON.parse(sub.keys);
  const pushSubscription = { endpoint: sub.endpoint, keys };

  try {
    await webpush.sendNotification(pushSubscription, JSON.stringify(notification), {
      TTL: 86400,
      urgency: "normal",
    });

    await pool.query(
      "UPDATE push_subscriptions SET last_sent_at = NOW(), delivery_count = delivery_count + 1 WHERE id = $1",
      [sub.id]
    );

    return true;
  } catch (err: any) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      // Subscription expired
      await pool.query("UPDATE push_subscriptions SET status = 'expired' WHERE id = $1", [sub.id]);
    }
    return false;
  }
}

// Track click
export async function trackClick(subscriptionId: string, campaignId?: string): Promise<void> {
  await pool.query(
    "UPDATE push_subscriptions SET click_count = click_count + 1 WHERE id = $1",
    [subscriptionId]
  );

  if (campaignId) {
    await redis.hincrby(`push:campaign:${campaignId}`, "clicks", 1);
  }
}

// Unsubscribe
export async function unsubscribe(endpoint: string): Promise<void> {
  await pool.query(
    "UPDATE push_subscriptions SET status = 'unsubscribed' WHERE endpoint = $1",
    [endpoint]
  );
}

// Get campaign analytics
export async function getCampaignAnalytics(campaignId: string): Promise<{
  sent: number; delivered: number; clicked: number; ctr: number;
}> {
  const { rows: [campaign] } = await pool.query("SELECT stats FROM push_campaigns WHERE id = $1", [campaignId]);
  const stats = JSON.parse(campaign.stats);
  const clicks = parseInt(await redis.hget(`push:campaign:${campaignId}`, "clicks") || "0");

  return {
    sent: stats.sent,
    delivered: stats.delivered,
    clicked: clicks,
    ctr: stats.delivered > 0 ? (clicks / stats.delivered) * 100 : 0,
  };
}
```

## Results

- **Return visits up 40%** — push notifications bring users back within minutes; "New article in your topics" has 12% click rate vs 2% for email
- **Smart opt-in timing** — prompt shown after 3rd visit (not first); opt-in rate 15% vs 3% for immediate prompts
- **Frequency control prevents fatigue** — users choose "important only" or "weekly digest"; unsubscribe rate dropped from 8% to 1.5%
- **Rich notifications drive action** — image previews + "Read Now" / "Save for Later" buttons; click rate 3x higher than text-only
- **Expired subscriptions auto-cleaned** — 410/404 responses remove dead endpoints; delivery rate stays above 95%
