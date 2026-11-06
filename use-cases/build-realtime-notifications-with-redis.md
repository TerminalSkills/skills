---
title: "Build a Real-Time Notification System with WebSockets and Redis"
slug: build-realtime-notifications-with-redis
description: "Implement push notifications, in-app alerts, and real-time updates using WebSockets for delivery, Redis for pub/sub, and a persistent database for history."
skills:
  - notification-system
  - realtime-database
  - websocket-builder
category: development
tags:
  - notifications
  - websocket
  - redis
  - real-time
  - push-notifications
---

# Build a Real-Time Notification System with WebSockets and Redis

## The Problem

Your SaaS platform sends notifications via email only. Users do not see that a teammate commented on their task until they check their inbox 45 minutes later. Product asks for in-app notifications, push notifications on mobile, and real-time updates so a user sees new comments instantly without refreshing. The system must handle 5,000 concurrent users, deliver notifications within 500ms, and persist them so users can review their notification history. Building this on polling would hammer the database with 5,000 queries every few seconds.

## The Solution

Use the **websocket-builder** skill to establish authenticated persistent connections and scale them across servers with Redis pub/sub, **realtime-database** to persist history with cursor pagination and read tracking, and the **notification-system** skill to orchestrate multi-channel delivery (in-app, push, email) with user preferences, retries, and batching.

## Step-by-Step Walkthrough

### 1. Design the notification infrastructure

Set up the WebSocket server with Redis pub/sub for horizontal scaling. The handshake follows the websocket-builder skill: the app fetches a JWT that expires in about 60 seconds from an authenticated endpoint, the server verifies it (pinned algorithm) and checks `Origin` in the `upgrade` handler before accepting the socket, and `maxPayload` is set explicitly because `ws` defaults to 100 MiB.

> Design a notification system for our Node.js app with 5,000 concurrent users. Set up a WebSocket server that authenticates connections via JWT. Use Redis pub/sub so notifications are delivered regardless of which server instance the user is connected to. Include connection tracking so we know which users are online.

Redis pub/sub ensures that when a notification is published on server A, it reaches a user connected to server B. Without this, scaling to multiple server instances would silently drop notifications. Each server subscribes to `notify:{userId}` only while that user has a socket on it, and keeps one dedicated subscriber connection (a connection in subscribe mode cannot run other commands). Run Redis on a private network with a password.

### 2. Implement multi-channel delivery

Not every notification should go through every channel. A comment mention goes in-app immediately, with an email fallback after 5 minutes if unread.

> Build a notification dispatcher that routes notifications through channels based on type and user preferences. In-app via WebSocket is always first. Push notification goes to mobile if the user is offline. Email is sent for high-priority notifications (assigned a task, mentioned in a comment) if unread after 5 minutes. Users can configure which types they receive per channel.

```typescript
// notify/dispatch.ts — persist first, then fan out, then schedule the email fallback
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import type { WebSocket } from 'ws';
import { pool } from './db';

const redisUrl = process.env.REDIS_URL!;  // redis://:password@10.0.0.5:6379 — a private network, never a public interface
const redis = new IORedis(redisUrl, { maxRetriesPerRequest: null });  // BullMQ requires null
const emailQueue = new Queue('notification-email', { connection: redis });
const HIGH_PRIORITY = new Set(['task.assigned', 'comment.mention']);

export async function notify(n: { userId: string; type: string; title: string; body?: string; data?: object }) {
  // 1. Durable write. If anything below fails, the user still sees it in the feed.
  const { rows: [row] } = await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, data)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [n.userId, n.type, n.title, n.body ?? null, JSON.stringify(n.data ?? {})],
  );
  // 2. Real-time fan-out: pub/sub is fire-and-forget, so offline users simply miss it
  await redis.publish(`notify:${n.userId}`, JSON.stringify(row));
  // 3. Email fallback: one delayed job per notification (the id makes re-adding a no-op)
  if (HIGH_PRIORITY.has(n.type)) {
    await emailQueue.add('unread-email', { notificationId: row.id }, {
      jobId: `email-${row.id}`, delay: 5 * 60_000,
      attempts: 3, backoff: { type: 'exponential', delay: 60_000 }, removeOnComplete: true,
    });
  }
}

export const emailWorker = new Worker('notification-email', async (job) => {
  const { rows: [row] } = await pool.query(
    'SELECT * FROM notifications WHERE id = $1 AND read_at IS NULL', [job.data.notificationId]);
  if (!row) return;  // read in the meantime: nothing to send
  await sendEmail(row);  // your email adapter
}, { connection: redis });
declare function sendEmail(row: unknown): Promise<void>;

// Each server process: one dedicated subscriber connection (a connection in
// subscribe mode cannot run other commands) and a map of its own sockets.
const sub = new IORedis(redisUrl);
const local = new Map<string, Set<WebSocket>>();   // userId -> sockets on THIS server

sub.on('message', (channel, message) => {
  for (const ws of local.get(channel.slice('notify:'.length)) ?? []) {
    if (ws.readyState === ws.OPEN) ws.send(message);
  }
});

export async function attach(userId: string, ws: WebSocket) {  // call after the JWT handshake
  // Register the socket and its close handler synchronously, before any await
  const first = !local.has(userId);
  if (first) local.set(userId, new Set());
  local.get(userId)!.add(ws);
  ws.on('close', async () => {
    const set = local.get(userId);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) { local.delete(userId); await sub.unsubscribe(`notify:${userId}`); }
  });
  if (first) await sub.subscribe(`notify:${userId}`);
}
```

The order matters: the row is written to PostgreSQL first, so a failed publish costs only the live push, never the notification. The email job is delayed and re-checks `read_at` when it fires, so notifications read within 5 minutes never send an email. Push to mobile (FCM, APNs) is a third channel adapter called from the same router when the user has no live socket (check `local` or a presence key); the notification-system skill covers token handling and retries.

### 3. Add notification persistence and history

Users need to see past notifications, mark them as read, and clear them.

> Set up notification persistence with a read/unread status per user. Store notifications in PostgreSQL with indexes for fast retrieval by user and timestamp. Implement cursor-based pagination for the notification feed. Add endpoints for mark-as-read (single and bulk), and an unread count that updates in real time via the WebSocket connection.

The notification table schema is designed for fast retrieval by user with proper indexing:

```sql
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    type        VARCHAR(50) NOT NULL,
    title       VARCHAR(255) NOT NULL,
    body        TEXT,
    data        JSONB DEFAULT '{}',
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread
    ON notifications (user_id, created_at DESC)
    WHERE read_at IS NULL;

CREATE INDEX idx_notifications_user_feed
    ON notifications (user_id, created_at DESC);
```

Read tracking is per row (`read_at`); mark-as-read is `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND id = ANY($2) AND read_at IS NULL`, and the feed uses keyset pagination (`WHERE user_id = $1 AND created_at < $2 ORDER BY created_at DESC LIMIT 30`), never `OFFSET`. The partial index on unread notifications means the "unread count" query touches only rows that have not been read, keeping it fast even when a user has thousands of historical notifications. The JSONB `data` column stores type-specific payload (task ID, comment text, mentioned user) without requiring schema changes for each new notification type.

### 4. Handle edge cases and batching

Prevent notification storms from flooding users.

> Implement notification batching: if 15 people comment on the same task within 2 minutes, send one notification saying "15 new comments on Task #234" instead of 15 separate notifications. Add rate limiting per user (max 30 notifications per minute). Handle the reconnection case where a user comes back online after 3 hours and needs to catch up without receiving 200 individual pings.

The burst collapse needs only a Redis counter and one delayed job per window:

```typescript
// notify/batch.ts — collapse a burst of comments into one summary
import IORedis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { notify } from './dispatch';

const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });
const summaryQueue = new Queue('notification-summary', { connection: redis });
const WINDOW_MS = 2 * 60_000;

export async function onComment(userId: string, taskId: string) {
  const key = `batch:${userId}:${taskId}`;
  if ((await redis.incr(key)) === 1) {  // first comment in this window opens it
    await redis.pexpire(key, WINDOW_MS * 2);  // safety net if the flush job is lost
    await summaryQueue.add('flush', { userId, taskId }, { delay: WINDOW_MS, removeOnComplete: true });
  }
}

export const summaryWorker = new Worker('notification-summary', async (job) => {
  const { userId, taskId } = job.data;
  const count = Number(await redis.getdel(`batch:${userId}:${taskId}`));  // read and reset atomically
  if (count > 0) {
    await notify({ userId, type: 'comment.summary',
      title: count === 1 ? 'New comment' : `${count} new comments on task #${taskId}`, data: { taskId } });
  }
}, { connection: redis });
```

For the per-user limit of 30 notifications a minute, `INCR rl:{userId}:{minute}` with a 60-second expiry in `notify()` does the job; over the limit, fold the notification into the summary instead of dropping it. On reconnect the client calls the REST feed with its newest known `created_at` and gets one list plus the unread count, rather than replaying pub/sub.

## Real-World Example

A project management SaaS with 3,200 daily active users had a notification delay problem. Users received email notifications for task comments 5 minutes after they were posted, and teammates in different time zones waited hours for responses because nobody knew a comment had been left. The team moved comments, assignments and mentions to the pipeline above: write to PostgreSQL, publish on Redis, deliver over the user's WebSocket, and email only what is still unread after 5 minutes. When a popular task got 30 comments in a meeting, users received one summary notification instead of 30 separate pings. They tracked delivery latency and notification click-through per channel from the first week, so they could tune the batching window against their own numbers.

## Tips

- Use Redis pub/sub for real-time fan-out but do not rely on it for durability: it is at-most-once, and a subscriber that is disconnected misses the message. Always write to PostgreSQL first, then publish.
- Implement WebSocket heartbeats: ping every 30 seconds and terminate any socket that did not answer the previous ping. Without heartbeats, a user whose network drops will appear online until the TCP timeout fires minutes later.
- Cap the notification history at 90 days or 1,000 records per user. Unbounded notification tables grow quickly and slow down feed queries even with proper indexing.
- Test the reconnection flow thoroughly. When a user comes back online after hours, the client should fetch missed notifications via the REST API rather than expecting Redis to replay them.

## Related Skills

- [websocket-builder](../skills/websocket-builder/SKILL.md) — authenticated handshake, heartbeats and Redis pub/sub across servers (Step 1)
- [realtime-database](../skills/realtime-database/SKILL.md) — notifications table, keyset pagination and unread tracking (Step 3)
- [notification-system](../skills/notification-system/SKILL.md) — channel routing, preferences, retries and batching (Steps 2, 4)
