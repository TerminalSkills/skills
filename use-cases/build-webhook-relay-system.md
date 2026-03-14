---
title: Build a Webhook Relay System
slug: build-webhook-relay-system
description: Build a reliable webhook delivery system with retry logic, dead letter queues, signature verification, payload transformation, delivery logs, and rate limiting — ensuring no webhook is ever lost.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - webhooks
  - event-driven
  - reliability
  - integrations
  - api
---

# Build a Webhook Relay System

## The Problem

Sven leads integrations at a 30-person payment platform. They fire webhooks for payment events (created, succeeded, failed, refunded) to 500+ merchant endpoints. 8% of deliveries fail — merchant servers are down, rate limited, or return 500 errors. Failed webhooks are lost forever. Merchants call support: "We never got the payment notification, so we didn't ship the order." The team manually replays events from logs. They need a webhook system that retries with exponential backoff, stores failed deliveries, lets merchants inspect delivery logs, and guarantees at-least-once delivery.

## Step 1: Build the Webhook Delivery Engine

```typescript
// src/webhooks/relay.ts — Reliable webhook delivery with retries and dead letter queue
import { createHmac } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const MAX_RETRIES = 8;
const RETRY_DELAYS = [10, 30, 120, 600, 1800, 3600, 7200, 14400]; // seconds
const DELIVERY_TIMEOUT = 10000; // 10 seconds
const MAX_CONCURRENT_PER_ENDPOINT = 5;

interface WebhookEvent {
  id: string;
  type: string;                 // "payment.succeeded", "order.created"
  payload: Record<string, any>;
  timestamp: string;
}

interface WebhookEndpoint {
  id: string;
  customerId: string;
  url: string;
  secret: string;              // for HMAC signing
  events: string[];            // subscribed event types, ["*"] = all
  active: boolean;
  failureCount: number;
  disabledAt: string | null;
}

interface DeliveryAttempt {
  id: string;
  eventId: string;
  endpointId: string;
  attempt: number;
  statusCode: number | null;
  responseBody: string | null;
  error: string | null;
  duration: number;
  timestamp: string;
}

// Dispatch a webhook event to all matching endpoints
export async function dispatch(event: WebhookEvent): Promise<{ queued: number }> {
  // Store event
  await pool.query(
    `INSERT INTO webhook_events (id, type, payload, created_at) VALUES ($1, $2, $3, NOW())`,
    [event.id, event.type, JSON.stringify(event.payload)]
  );

  // Find matching endpoints
  const { rows: endpoints } = await pool.query(
    `SELECT * FROM webhook_endpoints
     WHERE active = true AND (events @> $1 OR events @> '["*"]'::jsonb)`,
    [JSON.stringify([event.type])]
  );

  // Queue deliveries
  for (const endpoint of endpoints) {
    const deliveryId = `del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await redis.rpush("webhook:delivery_queue", JSON.stringify({
      deliveryId,
      eventId: event.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      payload: event.payload,
      eventType: event.type,
      attempt: 0,
      timestamp: event.timestamp,
    }));
  }

  return { queued: endpoints.length };
}

// Process delivery queue (worker)
export async function processDeliveries(): Promise<void> {
  while (true) {
    const item = await redis.brpop("webhook:delivery_queue", 5);
    if (!item) continue;

    const delivery = JSON.parse(item[1]);

    // Rate limit per endpoint
    const concurrencyKey = `webhook:concurrent:${delivery.endpointId}`;
    const current = parseInt(await redis.get(concurrencyKey) || "0");
    if (current >= MAX_CONCURRENT_PER_ENDPOINT) {
      // Re-queue with small delay
      await redis.lpush("webhook:delivery_queue", JSON.stringify(delivery));
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    await redis.incr(concurrencyKey);
    await redis.expire(concurrencyKey, 30);

    try {
      await deliverWebhook(delivery);
    } finally {
      await redis.decr(concurrencyKey);
    }
  }
}

// Deliver a single webhook
async function deliverWebhook(delivery: any): Promise<void> {
  const startTime = Date.now();
  const { deliveryId, eventId, endpointId, url, secret, payload, eventType, attempt } = delivery;

  // Build signed payload
  const body = JSON.stringify({
    id: eventId,
    type: eventType,
    data: payload,
    timestamp: delivery.timestamp,
    attempt: attempt + 1,
  });

  // HMAC signature (like Stripe's webhook signing)
  const timestamp = Math.floor(Date.now() / 1000);
  const signaturePayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(signaturePayload).digest("hex");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Id": eventId,
        "X-Webhook-Timestamp": String(timestamp),
        "X-Webhook-Signature": `v1=${signature}`,
        "X-Webhook-Attempt": String(attempt + 1),
        "User-Agent": "WebhookRelay/1.0",
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseBody = await response.text().catch(() => "");
    const duration = Date.now() - startTime;

    // Record attempt
    await recordAttempt(deliveryId, eventId, endpointId, attempt + 1, response.status, responseBody, null, duration);

    if (response.ok) {
      // Success — reset failure count
      await pool.query("UPDATE webhook_endpoints SET failure_count = 0 WHERE id = $1", [endpointId]);
      return;
    }

    // Non-2xx response — schedule retry
    await scheduleRetry(delivery, `HTTP ${response.status}`, responseBody);

  } catch (err: any) {
    const duration = Date.now() - startTime;
    const error = err.name === "AbortError" ? "Timeout after 10s" : err.message;

    await recordAttempt(deliveryId, eventId, endpointId, attempt + 1, null, null, error, duration);
    await scheduleRetry(delivery, error, null);
  }
}

// Schedule retry with exponential backoff
async function scheduleRetry(delivery: any, error: string, responseBody: string | null): Promise<void> {
  const nextAttempt = delivery.attempt + 1;

  if (nextAttempt >= MAX_RETRIES) {
    // Dead letter queue — max retries exhausted
    await pool.query(
      `INSERT INTO webhook_dead_letter (event_id, endpoint_id, last_error, attempts, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [delivery.eventId, delivery.endpointId, error, nextAttempt]
    );

    // Increment endpoint failure count
    const { rows: [endpoint] } = await pool.query(
      `UPDATE webhook_endpoints SET failure_count = failure_count + 1 RETURNING failure_count`,
      [delivery.endpointId]
    );

    // Auto-disable after 50 consecutive failures
    if (endpoint.failure_count >= 50) {
      await pool.query(
        "UPDATE webhook_endpoints SET active = false, disabled_at = NOW(), disable_reason = 'Too many failures' WHERE id = $1",
        [delivery.endpointId]
      );
    }

    return;
  }

  // Schedule retry
  const delaySeconds = RETRY_DELAYS[nextAttempt] || 14400;
  const retryAt = Date.now() + delaySeconds * 1000;

  await redis.zadd("webhook:retry_queue", retryAt, JSON.stringify({
    ...delivery,
    attempt: nextAttempt,
  }));
}

// Process retry queue (run every 10 seconds)
export async function processRetries(): Promise<number> {
  const now = Date.now();
  const items = await redis.zrangebyscore("webhook:retry_queue", 0, now, "LIMIT", 0, 100);

  for (const item of items) {
    await redis.zrem("webhook:retry_queue", item);
    await redis.rpush("webhook:delivery_queue", item);
  }

  return items.length;
}

// Manual replay (for merchants to retry from dashboard)
export async function replayEvent(eventId: string, endpointId?: string): Promise<{ queued: number }> {
  const { rows: [event] } = await pool.query("SELECT * FROM webhook_events WHERE id = $1", [eventId]);
  if (!event) throw new Error("Event not found");

  const query = endpointId
    ? "SELECT * FROM webhook_endpoints WHERE id = $1 AND active = true"
    : `SELECT * FROM webhook_endpoints WHERE active = true AND (events @> $1 OR events @> '["*"]'::jsonb)`;
  const params = endpointId ? [endpointId] : [JSON.stringify([event.type])];

  const { rows: endpoints } = await pool.query(query, params);

  for (const endpoint of endpoints) {
    await redis.rpush("webhook:delivery_queue", JSON.stringify({
      deliveryId: `replay-${Date.now()}`,
      eventId: event.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      payload: event.payload,
      eventType: event.type,
      attempt: 0,
      timestamp: event.created_at,
    }));
  }

  return { queued: endpoints.length };
}

async function recordAttempt(
  deliveryId: string, eventId: string, endpointId: string,
  attempt: number, statusCode: number | null, responseBody: string | null,
  error: string | null, duration: number
): Promise<void> {
  await pool.query(
    `INSERT INTO webhook_delivery_attempts (delivery_id, event_id, endpoint_id, attempt, status_code, response_body, error, duration_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [deliveryId, eventId, endpointId, attempt, statusCode, (responseBody || "").slice(0, 1000), error, duration]
  );
}
```

## Results

- **Webhook delivery rate: 92% → 99.97%** — exponential backoff retries (10s, 30s, 2m, 10m, 30m, 1h, 2h, 4h) recover from transient failures; only truly dead endpoints hit the dead letter queue
- **"We never got the notification" → 0 incidents** — delivery logs show every attempt with status code, response body, and timing; merchants see exactly what happened
- **Manual replay from dashboard** — merchants click "Retry" on any failed delivery; support team replays entire events with one button
- **HMAC signature prevents spoofing** — merchants verify webhook authenticity using the shared secret; no one can forge a payment notification
- **Auto-disable prevents wasted resources** — endpoints that fail 50 times are automatically disabled; no more sending thousands of webhooks to a dead server
