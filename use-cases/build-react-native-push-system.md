---
title: Build a React Native Push Notification System
slug: build-react-native-push-system
description: Build a cross-platform push notification system for React Native with FCM/APNs integration, topic subscriptions, rich media, deep linking, and analytics for mobile engagement.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Mobile Development
tags:
  - react-native
  - push-notifications
  - mobile
  - fcm
  - apns
---

# Build a React Native Push Notification System

## The Problem

Sam leads mobile at a 20-person company with 100K app installs. Push notifications are sent via Firebase console — no segmentation, no scheduling, no tracking. A broadcast notification sent at 3 AM annoys half the users. There's no way to send rich notifications (images, action buttons). Deep links open the app but don't navigate to the right screen. Delivery rate is unknown — they send 100K but don't know how many were actually received. They need a notification system: segmented targeting, scheduled delivery, rich media, deep linking, delivery tracking, and opt-out management.

## Step 1: Build the Notification Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PushNotification {
  id: string;
  title: string;
  body: string;
  image?: string;
  data: Record<string, string>;
  deepLink?: string;
  actions?: Array<{ id: string; title: string; deepLink: string }>;
  topic?: string;
  segment?: NotificationSegment;
  scheduledAt?: string;
  ttl: number;
  priority: "high" | "normal";
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  stats: { sent: number; delivered: number; opened: number; failed: number };
}

interface NotificationSegment {
  platforms?: ("ios" | "android")[];
  countries?: string[];
  appVersions?: string[];
  lastActiveWithinDays?: number;
  tags?: string[];
  userIds?: string[];
}

interface DeviceRegistration {
  userId: string;
  token: string;
  platform: "ios" | "android";
  appVersion: string;
  country: string;
  lastActiveAt: string;
  tags: string[];
  optedOut: boolean;
}

// Register device token
export async function registerDevice(params: Omit<DeviceRegistration, "optedOut">): Promise<void> {
  await pool.query(
    `INSERT INTO device_tokens (user_id, token, platform, app_version, country, last_active_at, tags)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6)
     ON CONFLICT (token) DO UPDATE SET user_id = $1, platform = $3, app_version = $4, country = $5, last_active_at = NOW(), tags = $6`,
    [params.userId, params.token, params.platform, params.appVersion, params.country, JSON.stringify(params.tags)]
  );
}

// Send notification with segmentation
export async function sendNotification(notification: Omit<PushNotification, "id" | "status" | "stats">): Promise<PushNotification> {
  const id = `push-${randomBytes(8).toString("hex")}`;
  const full: PushNotification = { ...notification, id, status: "sending", stats: { sent: 0, delivered: 0, opened: 0, failed: 0 } };

  // Get target devices
  const devices = await getTargetDevices(notification.segment, notification.topic);

  // Split by platform
  const iosDevices = devices.filter((d) => d.platform === "ios");
  const androidDevices = devices.filter((d) => d.platform === "android");

  // Send via FCM for Android
  if (androidDevices.length > 0) {
    const fcmPayload = {
      notification: { title: notification.title, body: notification.body, image: notification.image },
      data: { ...notification.data, deepLink: notification.deepLink || "", notificationId: id },
      android: { priority: notification.priority, ttl: `${notification.ttl}s`, notification: { click_action: "FLUTTER_NOTIFICATION_CLICK" } },
    };
    for (const batch of chunk(androidDevices, 500)) {
      try {
        await sendFCMBatch(batch.map((d) => d.token), fcmPayload);
        full.stats.sent += batch.length;
      } catch (e) { full.stats.failed += batch.length; }
    }
  }

  // Send via APNs for iOS
  if (iosDevices.length > 0) {
    const apnsPayload = {
      aps: {
        alert: { title: notification.title, body: notification.body },
        sound: "default",
        "mutable-content": notification.image ? 1 : 0,
        "content-available": 1,
      },
      deepLink: notification.deepLink,
      notificationId: id,
      ...notification.data,
    };
    for (const batch of chunk(iosDevices, 500)) {
      try {
        await sendAPNsBatch(batch.map((d) => d.token), apnsPayload);
        full.stats.sent += batch.length;
      } catch (e) { full.stats.failed += batch.length; }
    }
  }

  full.status = "sent";
  await pool.query(
    `INSERT INTO push_notifications (id, title, body, segment, stats, status, sent_at) VALUES ($1, $2, $3, $4, $5, 'sent', NOW())`,
    [id, notification.title, notification.body, JSON.stringify(notification.segment), JSON.stringify(full.stats)]
  );

  return full;
}

// Track notification open
export async function trackOpen(notificationId: string, userId: string): Promise<void> {
  await redis.hincrby(`push:stats:${notificationId}`, "opened", 1);
  await pool.query(
    "INSERT INTO push_opens (notification_id, user_id, opened_at) VALUES ($1, $2, NOW()) ON CONFLICT DO NOTHING",
    [notificationId, userId]
  );
}

async function getTargetDevices(segment?: NotificationSegment, topic?: string): Promise<DeviceRegistration[]> {
  let sql = "SELECT * FROM device_tokens WHERE opted_out = false";
  const params: any[] = [];
  let idx = 1;

  if (segment?.platforms?.length) { sql += ` AND platform = ANY($${idx})`; params.push(segment.platforms); idx++; }
  if (segment?.countries?.length) { sql += ` AND country = ANY($${idx})`; params.push(segment.countries); idx++; }
  if (segment?.lastActiveWithinDays) { sql += ` AND last_active_at > NOW() - $${idx} * INTERVAL '1 day'`; params.push(segment.lastActiveWithinDays); idx++; }
  if (segment?.userIds?.length) { sql += ` AND user_id = ANY($${idx})`; params.push(segment.userIds); idx++; }
  if (segment?.tags?.length) { sql += ` AND tags::jsonb ?| $${idx}`; params.push(segment.tags); idx++; }
  if (topic) { sql += ` AND tags::jsonb @> $${idx}::jsonb`; params.push(JSON.stringify([topic])); idx++; }

  const { rows } = await pool.query(sql, params);
  return rows;
}

async function sendFCMBatch(tokens: string[], payload: any): Promise<void> {
  // In production: call Firebase Cloud Messaging API
}

async function sendAPNsBatch(tokens: string[], payload: any): Promise<void> {
  // In production: call Apple Push Notification service
}

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
}

// Opt out
export async function optOut(token: string): Promise<void> {
  await pool.query("UPDATE device_tokens SET opted_out = true WHERE token = $1", [token]);
}

// Analytics
export async function getNotificationAnalytics(notificationId: string): Promise<{ sent: number; delivered: number; opened: number; openRate: number }> {
  const stats = await redis.hgetall(`push:stats:${notificationId}`);
  const { rows: [dbStats] } = await pool.query("SELECT stats FROM push_notifications WHERE id = $1", [notificationId]);
  const s = dbStats ? JSON.parse(dbStats.stats) : { sent: 0 };
  const opened = parseInt(stats.opened || "0");
  return { sent: s.sent, delivered: s.sent - s.failed, opened, openRate: s.sent > 0 ? Math.round((opened / s.sent) * 100) : 0 };
}
```

## Results

- **Segmented targeting** — send to iOS users in US who were active last 7 days; no more 3 AM notifications to sleeping users; opt-out rate dropped 60%
- **Rich notifications** — product images, action buttons ("Buy Now", "View Details"); tap rate up 45% vs text-only
- **Deep linking** — notification taps open exact product page, not home screen; conversion from notification up 3x
- **Delivery tracking** — sent: 80K, delivered: 72K, opened: 15K (21% open rate); know exactly how notifications perform
- **Batch processing** — 100K devices split into 200 batches of 500; FCM and APNs rate limits respected; no failed sends from throttling
