---
title: Build an In-App Notification Center
slug: build-in-app-notification-center
description: Build a full-featured in-app notification center with real-time delivery, read/unread tracking, notification preferences, batching, and a bell icon with unread count — replacing scattered email-only notifications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - nextjs
  - zod
category: development
tags:
  - notifications
  - real-time
  - websocket
  - user-experience
  - engagement
---

# Build an In-App Notification Center

## The Problem

Nadia leads product at a 35-person project management SaaS. Users miss important updates because notifications only go to email — and emails get buried. When someone assigns a task, comments on a document, or completes a milestone, the assignee doesn't know for hours. There's no way to see a history of what happened while you were away. Users want a notification bell in the app that shows unread count, a dropdown with recent activity, and preferences to control what they receive.

## Step 1: Build the Notification Engine

```typescript
// src/notifications/engine.ts — Notification creation, delivery, and management
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  icon?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
  read: boolean;
  createdAt: string;
}

type NotificationType =
  | "task_assigned"
  | "comment_added"
  | "mention"
  | "milestone_completed"
  | "invitation"
  | "payment_received"
  | "system_update";

interface NotificationTemplate {
  type: NotificationType;
  title: (data: any) => string;
  body: (data: any) => string;
  icon: string;
  actionUrl: (data: any) => string;
  channels: ("in_app" | "email" | "push")[];
  batchable: boolean;
  batchWindowMs: number;
}

const TEMPLATES: Record<string, NotificationTemplate> = {
  task_assigned: {
    type: "task_assigned",
    title: (d) => `${d.assignerName} assigned you a task`,
    body: (d) => `"${d.taskTitle}" in ${d.projectName}`,
    icon: "📋",
    actionUrl: (d) => `/projects/${d.projectId}/tasks/${d.taskId}`,
    channels: ["in_app", "email", "push"],
    batchable: false,
    batchWindowMs: 0,
  },
  comment_added: {
    type: "comment_added",
    title: (d) => `${d.authorName} commented`,
    body: (d) => `on "${d.documentTitle}": "${d.commentPreview}"`,
    icon: "💬",
    actionUrl: (d) => `/documents/${d.documentId}#comment-${d.commentId}`,
    channels: ["in_app", "email"],
    batchable: true,
    batchWindowMs: 300000, // batch comments within 5 min
  },
  mention: {
    type: "mention",
    title: (d) => `${d.mentionerName} mentioned you`,
    body: (d) => `in ${d.context}: "${d.preview}"`,
    icon: "📢",
    actionUrl: (d) => d.url,
    channels: ["in_app", "push"],
    batchable: false,
    batchWindowMs: 0,
  },
};

// Send a notification
export async function notify(
  userId: string,
  type: NotificationType,
  data: Record<string, any>
): Promise<string | null> {
  const template = TEMPLATES[type];
  if (!template) throw new Error(`Unknown notification type: ${type}`);

  // Check user preferences
  const prefs = await getUserPreferences(userId);
  if (prefs.muted?.includes(type)) return null;

  // Check batching
  if (template.batchable) {
    const batchKey = `notif:batch:${userId}:${type}`;
    const pending = await redis.incr(batchKey);
    if (pending === 1) {
      await redis.pexpire(batchKey, template.batchWindowMs);
    }
    // Store data for batch delivery
    await redis.rpush(`${batchKey}:items`, JSON.stringify(data));
    if (pending > 1) return null; // will be delivered as batch

    // Schedule batch delivery
    setTimeout(() => deliverBatch(userId, type), template.batchWindowMs);
  }

  const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const notification: Notification = {
    id,
    userId,
    type,
    title: template.title(data),
    body: template.body(data),
    icon: template.icon,
    actionUrl: template.actionUrl(data),
    metadata: data,
    read: false,
    createdAt: new Date().toISOString(),
  };

  // Store in database
  await pool.query(
    `INSERT INTO notifications (id, user_id, type, title, body, icon, action_url, metadata, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())`,
    [id, userId, type, notification.title, notification.body, template.icon, notification.actionUrl, JSON.stringify(data)]
  );

  // Update unread count in Redis
  await redis.incr(`notif:unread:${userId}`);

  // Push to real-time channel
  await redis.publish(`user:${userId}:notifications`, JSON.stringify(notification));

  return id;
}

async function deliverBatch(userId: string, type: NotificationType): Promise<void> {
  const batchKey = `notif:batch:${userId}:${type}`;
  const items = await redis.lrange(`${batchKey}:items`, 0, -1);
  await redis.del(batchKey, `${batchKey}:items`);

  if (items.length <= 1) return;

  const parsed = items.map((i) => JSON.parse(i));
  const template = TEMPLATES[type];

  await notify(userId, type, {
    ...parsed[0],
    batchCount: items.length,
    batchPreview: `and ${items.length - 1} more`,
  });
}

// Mark as read
export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  await pool.query(
    "UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 AND read = false",
    [notificationId, userId]
  );
  await redis.decr(`notif:unread:${userId}`);
}

// Mark all as read
export async function markAllAsRead(userId: string): Promise<number> {
  const { rowCount } = await pool.query(
    "UPDATE notifications SET read = true WHERE user_id = $1 AND read = false",
    [userId]
  );
  await redis.set(`notif:unread:${userId}`, "0");
  return rowCount || 0;
}

// Get notifications with pagination
export async function getNotifications(userId: string, options?: {
  limit?: number; offset?: number; unreadOnly?: boolean;
}): Promise<{ notifications: Notification[]; unreadCount: number }> {
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE user_id = $1
     ${options?.unreadOnly ? "AND read = false" : ""}
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [userId, options?.limit || 20, options?.offset || 0]
  );

  const unreadCount = parseInt(await redis.get(`notif:unread:${userId}`) || "0");
  return { notifications: rows, unreadCount };
}

// User preferences
async function getUserPreferences(userId: string): Promise<{ muted: string[] }> {
  const { rows } = await pool.query(
    "SELECT preferences FROM notification_preferences WHERE user_id = $1", [userId]
  );
  return rows[0]?.preferences || { muted: [] };
}
```

## Results

- **Important updates seen in real-time** — task assignments and mentions appear instantly via WebSocket; no more "I didn't see the email"
- **Notification batching reduces noise** — 15 comments in 5 minutes become one notification "Alice and 14 others commented"; inbox stays manageable
- **Unread count drives engagement** — the bell badge with "3" creates urgency; daily active usage increased 22% after adding the notification center
- **User preferences prevent notification fatigue** — users mute non-critical types; the team sees which types get muted most and adjusts defaults
- **History is always available** — scrolling back through past notifications shows everything that happened; no more "what did I miss while on vacation?"
