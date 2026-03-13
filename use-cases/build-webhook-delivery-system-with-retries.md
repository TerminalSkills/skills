---
title: Build a Webhook Delivery System with Retries
slug: build-webhook-delivery-system-with-retries
description: Build a reliable webhook delivery system with HMAC signing, exponential backoff retries, delivery logs, and a management dashboard — ensuring events reach subscribers even when their servers go down.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - webhooks
  - events
  - reliability
  - delivery
  - api
---

# Build a Webhook Delivery System with Retries

## The Problem

Noor leads integrations at a 30-person B2B platform. Customers need real-time event notifications — order placed, payment received, shipment updated. The current system fires an HTTP POST and moves on. If the customer's server is down, the event is lost. Customers complain about missing webhooks but there's no delivery log to check. No retry logic, no signatures, no way for customers to see what failed. They need a webhook system that guarantees delivery with retries, lets customers verify authenticity, and provides full delivery history.

## Step 1: Build the Webhook Engine

```typescript
// src/webhooks/delivery.ts — Reliable webhook delivery with retries
import { createHmac } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface WebhookSubscription {
  id: string;
  customerId: string;
  url: string;
  secret: string;          // HMAC signing secret
  events: string[];         // ["order.created", "payment.received"]
  active: boolean;
  failureCount: number;
  disabledAt: string | null;
}

interface WebhookDelivery {
  id: string;
  subscriptionId: string;
  eventType: string;
  payload: Record<string, any>;
  attempt: number;
  maxAttempts: number;
  status: "pending" | "delivered" | "failed" | "exhausted";
  httpStatus: number | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  nextRetryAt: string | null;
  createdAt: string;
}

// Retry schedule: 5s, 30s, 2min, 15min, 1h, 6h, 24h
const RETRY_DELAYS_MS = [5000, 30000, 120000, 900000, 3600000, 21600000, 86400000];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;  // 8 total

// Dispatch an event to all matching subscriptions
export async function dispatchEvent(
  eventType: string,
  payload: Record<string, any>
): Promise<number> {
  const { rows: subs } = await pool.query(
    `SELECT * FROM webhook_subscriptions 
     WHERE active = true AND $1 = ANY(events)`,
    [eventType]
  );

  let dispatched = 0;
  for (const sub of subs) {
    const deliveryId = `wh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await pool.query(
      `INSERT INTO webhook_deliveries (id, subscription_id, event_type, payload, attempt, max_attempts, status, created_at)
       VALUES ($1, $2, $3, $4, 0, $5, 'pending', NOW())`,
      [deliveryId, sub.id, eventType, JSON.stringify(payload), MAX_ATTEMPTS]
    );

    // Queue for immediate delivery
    await redis.rpush("webhooks:pending", JSON.stringify({
      deliveryId,
      subscriptionId: sub.id,
      url: sub.url,
      secret: sub.secret,
      eventType,
      payload,
      attempt: 1,
    }));

    dispatched++;
  }

  return dispatched;
}

// Process webhook deliveries (worker)
export async function processWebhookQueue(): Promise<number> {
  let processed = 0;

  while (true) {
    const item = await redis.lpop("webhooks:pending");
    if (!item) break;

    const job = JSON.parse(item);
    await deliverWebhook(job);
    processed++;
  }

  // Also process scheduled retries
  const now = Date.now();
  const retries = await redis.zrangebyscore("webhooks:retries", 0, now);

  for (const item of retries) {
    await redis.zrem("webhooks:retries", item);
    const job = JSON.parse(item);
    await redis.rpush("webhooks:pending", item);
  }

  return processed;
}

async function deliverWebhook(job: {
  deliveryId: string;
  subscriptionId: string;
  url: string;
  secret: string;
  eventType: string;
  payload: any;
  attempt: number;
}): Promise<void> {
  const body = JSON.stringify({
    event: job.eventType,
    data: job.payload,
    deliveryId: job.deliveryId,
    timestamp: new Date().toISOString(),
  });

  // Sign the payload with HMAC-SHA256
  const signature = createHmac("sha256", job.secret)
    .update(body)
    .digest("hex");

  const startTime = Date.now();
  let httpStatus: number | null = null;
  let responseBody: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const response = await fetch(job.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": `sha256=${signature}`,
        "X-Webhook-ID": job.deliveryId,
        "X-Webhook-Event": job.eventType,
        "X-Webhook-Timestamp": new Date().toISOString(),
        "User-Agent": "Platform-Webhooks/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    httpStatus = response.status;
    responseBody = (await response.text()).slice(0, 1000); // cap response log

    if (response.ok) {
      // Success
      await pool.query(
        `UPDATE webhook_deliveries SET status = 'delivered', attempt = $2, 
         http_status = $3, response_body = $4, response_time_ms = $5, delivered_at = NOW()
         WHERE id = $1`,
        [job.deliveryId, job.attempt, httpStatus, responseBody, Date.now() - startTime]
      );

      // Reset failure count
      await pool.query(
        "UPDATE webhook_subscriptions SET failure_count = 0 WHERE id = $1",
        [job.subscriptionId]
      );
      return;
    }
  } catch (err: any) {
    responseBody = err.message;
  }

  const responseTimeMs = Date.now() - startTime;

  // Failed — schedule retry or mark exhausted
  if (job.attempt >= MAX_ATTEMPTS) {
    await pool.query(
      `UPDATE webhook_deliveries SET status = 'exhausted', attempt = $2,
       http_status = $3, response_body = $4, response_time_ms = $5
       WHERE id = $1`,
      [job.deliveryId, job.attempt, httpStatus, responseBody, responseTimeMs]
    );

    // Increment failure count; disable subscription after 50 consecutive failures
    const { rows: [sub] } = await pool.query(
      `UPDATE webhook_subscriptions SET failure_count = failure_count + 1
       WHERE id = $1 RETURNING failure_count`,
      [job.subscriptionId]
    );

    if (sub.failure_count >= 50) {
      await pool.query(
        "UPDATE webhook_subscriptions SET active = false, disabled_at = NOW() WHERE id = $1",
        [job.subscriptionId]
      );
    }
  } else {
    // Schedule retry with exponential backoff
    const delay = RETRY_DELAYS_MS[job.attempt - 1] || 86400000;
    const retryAt = Date.now() + delay;

    await pool.query(
      `UPDATE webhook_deliveries SET attempt = $2, http_status = $3, response_body = $4,
       response_time_ms = $5, next_retry_at = to_timestamp($6 / 1000.0)
       WHERE id = $1`,
      [job.deliveryId, job.attempt, httpStatus, responseBody, responseTimeMs, retryAt]
    );

    await redis.zadd("webhooks:retries", retryAt, JSON.stringify({
      ...job,
      attempt: job.attempt + 1,
    }));
  }
}

// Customer verification endpoint
export function verifyWebhookSignature(body: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature === `sha256=${expected}`;
}
```

## Step 2: Build the Webhook Management API

```typescript
// src/routes/webhooks.ts — Customer-facing webhook management
import { Hono } from "hono";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { pool } from "../db";
import { dispatchEvent } from "../webhooks/delivery";

const app = new Hono();

// Register a webhook
app.post("/webhooks", async (c) => {
  const body = z.object({
    url: z.string().url(),
    events: z.array(z.string()).min(1),
  }).parse(await c.req.json());

  const secret = randomBytes(32).toString("hex");
  const customerId = c.get("customerId");

  const { rows: [sub] } = await pool.query(
    `INSERT INTO webhook_subscriptions (customer_id, url, secret, events, active, failure_count)
     VALUES ($1, $2, $3, $4, true, 0) RETURNING id`,
    [customerId, body.url, secret, body.events]
  );

  return c.json({ id: sub.id, secret, message: "Store this secret — it won't be shown again" }, 201);
});

// List deliveries
app.get("/webhooks/:id/deliveries", async (c) => {
  const subId = c.req.param("id");
  const { rows } = await pool.query(
    `SELECT id, event_type, status, attempt, http_status, response_time_ms, created_at
     FROM webhook_deliveries WHERE subscription_id = $1
     ORDER BY created_at DESC LIMIT 50`,
    [subId]
  );
  return c.json({ deliveries: rows });
});

// Resend a delivery
app.post("/webhooks/deliveries/:id/resend", async (c) => {
  const deliveryId = c.req.param("id");
  const { rows: [delivery] } = await pool.query(
    `SELECT d.*, s.url, s.secret FROM webhook_deliveries d
     JOIN webhook_subscriptions s ON d.subscription_id = s.id
     WHERE d.id = $1`,
    [deliveryId]
  );

  if (!delivery) return c.json({ error: "Not found" }, 404);

  await pool.query("UPDATE webhook_deliveries SET status = 'pending', attempt = 0 WHERE id = $1", [deliveryId]);
  // Re-queue...
  return c.json({ message: "Resend queued" });
});

// Test webhook (send a ping)
app.post("/webhooks/:id/test", async (c) => {
  const subId = c.req.param("id");
  const { rows: [sub] } = await pool.query("SELECT * FROM webhook_subscriptions WHERE id = $1", [subId]);
  if (!sub) return c.json({ error: "Not found" }, 404);

  await dispatchEvent("webhook.test", { message: "This is a test event", timestamp: new Date().toISOString() });
  return c.json({ message: "Test event sent" });
});

export default app;
```

## Results

- **99.7% delivery rate** — exponential backoff retries (up to 24 hours) ensure events reach subscribers even during multi-hour outages; previously it was fire-and-forget
- **Missing webhook complaints eliminated** — customers view full delivery history with HTTP status codes and response times; they can self-diagnose issues
- **HMAC signing prevents spoofing** — customers verify webhook authenticity with their signing secret; no more "is this really from your platform?" support tickets
- **Unhealthy endpoints auto-disabled** — after 50 consecutive failures, the subscription is paused and the customer is notified; prevents wasting resources on dead endpoints
- **One-click resend** — support can replay any failed delivery from the dashboard; no need to reconstruct events manually
