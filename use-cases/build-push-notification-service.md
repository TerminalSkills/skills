---
title: Build a Web Push Notification Service
slug: build-push-notification-service
description: Build a web push notification system with subscription management, topic targeting, scheduled sends, click tracking and automatic cleanup of expired subscriptions.
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

Ren leads growth at a 25-person content platform. Readers visit, read one article and leave, and the email newsletter reaches only a fraction of them. Web push could bring them back, but it has to be done carefully: a permission prompt on the first visit gets blocked, notifications to everyone get ignored, and a server that sends to dead subscriptions forever wastes time. Ren needs subscription management, topic targeting, scheduled sends, click tracking and automatic cleanup.

## The Solution

A small TypeScript service: [Hono](https://hono.dev) serves the HTTP API, [Zod](https://zod.dev) validates every request body, PostgreSQL stores subscriptions and campaigns, Redis counts clicks, and the [`web-push`](https://github.com/web-push-libs/web-push) library encrypts and delivers messages through each browser's push service using VAPID keys. Checked against web-push 3.6, Hono 4, Zod 4, ioredis 6 and Node 24; run against real PostgreSQL 18 and Redis 8 with a local fake push service.

## Step-by-Step Walkthrough

### Step 1: Install and generate VAPID keys

```bash
npm install web-push ioredis pg hono @hono/node-server @hono/zod-validator zod
npm install -D typescript tsx @types/web-push @types/pg @types/node
npx web-push generate-vapid-keys --json
```

Put the two keys in `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, and set `DATABASE_URL`, `REDIS_URL`, `ADMIN_TOKEN` and `PUSH_CONTACT_EMAIL` (the VAPID contact). Keep the private key in your secret store, never in the repo. Do not change the key pair later: existing subscriptions are bound to the public key.

### Step 2: Schema

```sql
CREATE TABLE push_subscriptions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        text,
  endpoint       text NOT NULL UNIQUE,
  p256dh         text NOT NULL,
  auth           text NOT NULL,
  timezone       text NOT NULL DEFAULT 'UTC',
  topics         text[] NOT NULL DEFAULT '{}',
  status         text NOT NULL DEFAULT 'active',  -- active | expired | unsubscribed
  delivery_count int NOT NULL DEFAULT 0,
  click_count    int NOT NULL DEFAULT 0,
  last_sent_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON push_subscriptions USING gin (topics);

CREATE TABLE push_campaigns (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title   text NOT NULL,
  body    text NOT NULL,
  url     text NOT NULL,
  image   text,
  topics  text[] NOT NULL DEFAULT '{}',   -- empty = everyone
  send_at timestamptz,
  status  text NOT NULL DEFAULT 'draft',  -- draft | scheduled | sending | sent
  stats   jsonb NOT NULL DEFAULT '{"sent":0,"delivered":0,"failed":0}'
);
```

### Step 3: Push service

`sendPush` separates a revoked subscription (404 or 410 from the push service: mark it `expired`) from a temporary failure (leave it active). Campaigns are claimed with a single `UPDATE ... WHERE status IN ('draft','scheduled')`, so a double click or a second worker cannot send one twice.

```typescript
// src/service.ts
import pg from "pg";
import { Redis } from "ioredis";
import webpush from "web-push";
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);
webpush.setVapidDetails(`mailto:${process.env.PUSH_CONTACT_EMAIL}`, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
export type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export async function subscribe(
  s: { endpoint: string; keys: { p256dh: string; auth: string } },
  o: { userId?: string; timezone?: string; topics?: string[] },
) {
  const { rows } = await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, timezone, topics)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
       p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       topics = EXCLUDED.topics, status = 'active'
     RETURNING id`,
    [o.userId ?? null, s.endpoint, s.keys.p256dh, s.keys.auth, o.timezone ?? "UTC", o.topics ?? []]);
  return rows[0].id as string;
}
type Payload = { title: string; body: string; url: string; image?: string | null; campaignId?: string };
/** Returns "ok", "gone" (the browser revoked it) or "failed" (try again later). */
async function sendPush(sub: Sub, payload: Payload): Promise<"ok" | "gone" | "failed"> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify({ ...payload, subscriptionId: sub.id }),
      { TTL: 86400, urgency: "normal", topic: payload.campaignId?.replaceAll("-", "").slice(0, 32) });
    await pool.query("UPDATE push_subscriptions SET last_sent_at = now(), delivery_count = delivery_count + 1 WHERE id = $1", [sub.id]);
    return "ok";
  } catch (err) {
    const code = (err as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) {
      await pool.query("UPDATE push_subscriptions SET status = 'expired' WHERE id = $1", [sub.id]);
      return "gone";
    }
    return "failed";
  }
}
export async function sendCampaign(id: string) {
  const { rows: [c] } = await pool.query(
    "UPDATE push_campaigns SET status = 'sending' WHERE id = $1 AND status IN ('draft','scheduled') RETURNING *", [id]);
  if (!c) throw new Error("Campaign not found or already sent");
  const { rows: subs } = await pool.query<Sub>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions
     WHERE status = 'active' AND (cardinality($1::text[]) = 0 OR topics && $1::text[])`, [c.topics]);
  const stats = { sent: subs.length, delivered: 0, failed: 0 };
  for (let i = 0; i < subs.length; i += 100) {
    const results = await Promise.all(
      subs.slice(i, i + 100).map((s) =>
        sendPush(s, { title: c.title, body: c.body, url: c.url, image: c.image, campaignId: id }),
      ),
    );
    for (const r of results) r === "ok" ? stats.delivered++ : stats.failed++;
  }
  await pool.query("UPDATE push_campaigns SET status = 'sent', stats = $2 WHERE id = $1", [id, stats]);
  return stats;
}
/** Call every minute from a timer or cron. sendCampaign claims a campaign atomically, so two workers cannot send it twice. */
export async function runDueCampaigns() {
  const { rows } = await pool.query(
    `SELECT id FROM push_campaigns WHERE status = 'scheduled' AND send_at <= now()
     ORDER BY send_at LIMIT 5`,
  );
  for (const r of rows) await sendCampaign(r.id).catch(() => {}); // another worker got it first
}
/** Count each subscription's click on a campaign once. */
export async function trackClick(subscriptionId: string, campaignId: string) {
  if ((await redis.sadd(`push:clicked:${campaignId}`, subscriptionId)) === 0) return;
  await redis.hincrby(`push:campaign:${campaignId}`, "clicks", 1);
  await pool.query("UPDATE push_subscriptions SET click_count = click_count + 1 WHERE id = $1", [subscriptionId]);
}
export async function campaignAnalytics(id: string) {
  const { rows: [c] } = await pool.query("SELECT stats FROM push_campaigns WHERE id = $1", [id]);
  const clicks = Number(await redis.hget(`push:campaign:${id}`, "clicks")) || 0;
  const { delivered, failed, sent } = c.stats;
  return { sent, delivered, failed, clicks, ctr: delivered ? +((clicks / delivered) * 100).toFixed(1) : 0 };
}
```

### Step 4: HTTP API

The subscribe endpoint accepts only `https` endpoints, because the server will POST to whatever URL it is given; for stricter control, also allow-list the hosts of the push services you support. Admin routes sit behind a bearer token. Run it with `PORT=3000 npx tsx src/api.ts`; it binds to 127.0.0.1, so put your reverse proxy in front.

```typescript
// src/api.ts
import { Hono } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { serve } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import * as z from "zod";
import { subscribe, sendCampaign, trackClick, campaignAnalytics, pool } from "./service.js";
const app = new Hono();
const subscribeBody = z.object({
  subscription: z.object({
    endpoint: z.url({ protocol: /^https$/ }), // the server will POST to this URL: https only
    keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  }),
  timezone: z.string().max(64).optional(),
  topics: z.array(z.string().max(40)).max(20).optional(),
});
app.post("/api/push/subscribe", zValidator("json", subscribeBody), async (c) => {
  const { subscription, timezone, topics } = c.req.valid("json");
  return c.json({ id: await subscribe(subscription, { timezone, topics }) }, 201);
});
// Called by the service worker when a notification is clicked.
app.post("/api/push/click", zValidator("json", z.object({
  subscriptionId: z.uuid(), campaignId: z.uuid(),
})), async (c) => {
  const { subscriptionId, campaignId } = c.req.valid("json");
  await trackClick(subscriptionId, campaignId);
  return c.body(null, 204);
});
const admin = new Hono();
admin.use(bearerAuth({ token: process.env.ADMIN_TOKEN! }));
admin.post("/campaigns", zValidator("json", z.object({
  title: z.string().max(80), body: z.string().max(200), url: z.string().startsWith("/"),
  image: z.url({ protocol: /^https$/ }).optional(), topics: z.array(z.string()).default([]),
  sendAt: z.iso.datetime().optional(),
})), async (c) => {
  const b = c.req.valid("json");
  const { rows } = await pool.query(
    `INSERT INTO push_campaigns (title, body, url, image, topics, send_at, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [b.title, b.body, b.url, b.image ?? null, b.topics, b.sendAt ?? null, b.sendAt ? "scheduled" : "draft"]);
  return c.json(rows[0], 201);
});
admin.post("/campaigns/:id/send", async (c) => c.json(await sendCampaign(c.req.param("id"))));
admin.get("/campaigns/:id/analytics", async (c) => c.json(await campaignAnalytics(c.req.param("id"))));
app.route("/api/admin", admin);
serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: "127.0.0.1" });
```

### Step 5: Service worker and opt-in

Push requires HTTPS (or `localhost`). Ask for permission from a click handler, ideally after a reader has shown interest (for example after the third article), not on page load. On iPhone and iPad, web push works only for a site the user has added to the Home Screen (iOS 16.4 and later). The `image` option is honoured by Chromium browsers only, so never depend on it.

```javascript
// public/sw.js
self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      image: data.image || undefined,
      tag: data.campaignId,
      data, // read again in notificationclick
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { url, subscriptionId, campaignId } = event.notification.data;
  event.waitUntil(Promise.all([
    clients.openWindow(url),
    campaignId && fetch("/api/push/click", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subscriptionId, campaignId }),
      keepalive: true,
    }),
  ]));
});
```

```javascript
// public/subscribe.mjs
// Run from a click handler: browsers ignore permission prompts that are not a user gesture.
export async function enablePush(vapidPublicKey) {
  const reg = await navigator.serviceWorker.register("/sw.js");
  if ((await Notification.requestPermission()) !== "granted") return null;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: vapidPublicKey, // the base64url string from generate-vapid-keys
  });
  return fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      topics: ["articles"],
    }),
  });
}
```

### Step 6: Schedule and send

Create a campaign, then either call `POST /api/admin/campaigns/:id/send` or give it a `sendAt` and run `runDueCampaigns()` from a one-minute timer:

```console
$ curl -s -X POST -H "authorization: Bearer $ADMIN_TOKEN" -H 'content-type: application/json' \
    http://127.0.0.1:3000/api/admin/campaigns \
    -d '{"title":"New: how we cut build times","body":"6 min read","url":"/a/build-times","topics":["articles"]}'
{"id":"85ca5afa-c213-4d11-8cb4-e568aa7f1d2d"}
$ curl -s -X POST -H "authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/campaigns/85ca5afa-c213-4d11-8cb4-e568aa7f1d2d/send
{"sent":2,"delivered":1,"failed":1}
$ curl -s -H "authorization: Bearer $ADMIN_TOKEN" http://127.0.0.1:3000/api/admin/campaigns/85ca5afa-c213-4d11-8cb4-e568aa7f1d2d/analytics
{"sent":2,"delivered":1,"failed":1,"clicks":1,"ctr":100}
```

"Delivered" means the push service accepted the message; it does not prove the notification was shown. Clicks are counted once per subscription per campaign.

## Real-World Example

Ren's team adds the opt-in prompt to the article footer after a reader's third visit, with topic checkboxes (`articles`, `weekly-digest`). The editor schedules the weekly digest for Tuesday morning; the one-minute timer picks it up, the send marks expired browsers, and the Wednesday report shows delivered, failed and clicks per campaign. Because subscriptions that answer 410 are retired automatically, the audience list stays honest, and Ren can compare click rates between topics before deciding what to send more of.

## Related Skills

- [typescript](/skills/typescript): strict types for the service and API
- [postgresql](/skills/postgresql): subscription and campaign storage, array and GIN-index topic matching
- [redis](/skills/redis): click counters and once-per-subscription deduplication
- [hono](/skills/hono): the HTTP API and bearer-auth admin routes
- [zod](/skills/zod): request validation, including the https-only endpoint check
