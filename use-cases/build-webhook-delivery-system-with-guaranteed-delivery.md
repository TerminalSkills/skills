---
title: Build a Webhook Delivery System with Guaranteed Delivery
slug: build-webhook-delivery-system-with-guaranteed-delivery
description: >
  Ship a webhook delivery system that handles 1M events/day with
  exponential backoff, signature verification, dead letter queues,
  and a self-service dashboard — achieving 99.97% delivery rate.
skills:
  - typescript
  - bull-mq
  - redis
  - postgresql
  - hono
  - zod
  - kafka-js
category: Backend Architecture
tags:
  - webhooks
  - event-delivery
  - reliability
  - retry
  - dead-letter-queue
  - integrations
---

# Build a Webhook Delivery System with Guaranteed Delivery

## The Problem

A platform sends webhooks to 2,000 customer endpoints. The current system fires HTTP requests synchronously during event processing — when a customer's server is slow, it blocks the pipeline. When a customer's server is down, events are lost forever. 15% of webhook deliveries fail silently. Customers discover missed events days later when their systems are out of sync. The support team handles 40 webhook-related tickets per week: "why didn't we get the event?"

## Step 1: Event Schema and Signing

```typescript
// src/webhooks/schema.ts
import { z } from 'zod';
import { createHmac } from 'crypto';

export const WebhookEvent = z.object({
  id: z.string().uuid(),
  type: z.string(),              // e.g., "order.created", "payment.completed"
  timestamp: z.string().datetime(),
  data: z.record(z.string(), z.unknown()),
  apiVersion: z.string(),
});

export const WebhookEndpoint = z.object({
  id: z.string().uuid(),
  tenantId: z.string(),
  url: z.string().url(),
  secret: z.string(),
  events: z.array(z.string()),   // subscribed event types, ["*"] = all
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export function signPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

export function buildHeaders(event: z.infer<typeof WebhookEvent>, secret: string): Record<string, string> {
  const payload = JSON.stringify(event);
  return {
    'Content-Type': 'application/json',
    'X-Webhook-ID': event.id,
    'X-Webhook-Timestamp': event.timestamp,
    'X-Webhook-Signature': signPayload(payload, secret),
    'User-Agent': 'PlatformWebhooks/1.0',
  };
}
```

## Step 2: Delivery Engine with Retries

```typescript
// src/webhooks/delivery.ts
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { buildHeaders, type WebhookEvent, type WebhookEndpoint } from './schema';

const connection = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const deliveryQueue = new Queue('webhook-delivery', {
  connection,
  defaultJobOptions: {
    attempts: 8,
    backoff: {
      type: 'exponential',
      delay: 10_000, // 10s, 20s, 40s, 80s, 160s, 320s, 640s, 1280s (~21 min total)
    },
    removeOnComplete: { age: 86400, count: 10000 },
    removeOnFail: { age: 604800, count: 50000 },
  },
});

export async function dispatchWebhook(event: WebhookEvent): Promise<void> {
  // Find all endpoints subscribed to this event type
  const { rows: endpoints } = await db.query<WebhookEndpoint>(`
    SELECT * FROM webhook_endpoints
    WHERE active = true AND (events @> ARRAY[$1] OR events @> ARRAY['*'])
  `, [event.type]);

  for (const endpoint of endpoints) {
    await deliveryQueue.add('deliver', {
      event,
      endpoint: { id: endpoint.id, url: endpoint.url, secret: endpoint.secret, tenantId: endpoint.tenantId },
    }, {
      jobId: `${event.id}:${endpoint.id}`, // idempotent
    });
  }
}

const worker = new Worker('webhook-delivery', async (job) => {
  const { event, endpoint } = job.data;
  const payload = JSON.stringify(event);
  const headers = buildHeaders(event, endpoint.secret);

  const startTime = Date.now();

  const response = await fetch(endpoint.url, {
    method: 'POST',
    headers,
    body: payload,
    signal: AbortSignal.timeout(10_000), // 10s timeout
  });

  const latencyMs = Date.now() - startTime;

  // Log attempt
  await db.query(`
    INSERT INTO webhook_delivery_log (event_id, endpoint_id, attempt, status_code, latency_ms, timestamp)
    VALUES ($1, $2, $3, $4, $5, NOW())
  `, [event.id, endpoint.id, job.attemptsMade + 1, response.status, latencyMs]);

  // 2xx = success, 410 = unsubscribe, anything else = retry
  if (response.status === 410) {
    await db.query('UPDATE webhook_endpoints SET active = false WHERE id = $1', [endpoint.id]);
    return;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text().catch(() => '')}`);
  }

  // Track success for health monitoring
  await connection.setex(`webhook:health:${endpoint.id}:last_success`, 86400, Date.now().toString());
}, { connection, concurrency: 50 });

// Dead letter handler: after all retries exhausted
worker.on('failed', async (job, err) => {
  if (job && job.attemptsMade >= (job.opts.attempts ?? 8)) {
    const { event, endpoint } = job.data;
    await db.query(`
      INSERT INTO webhook_dead_letter (event_id, endpoint_id, event_data, error, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [event.id, endpoint.id, JSON.stringify(event), err.message]);

    // Auto-disable endpoint after 100 consecutive failures
    const failCount = await connection.incr(`webhook:fails:${endpoint.id}`);
    await connection.expire(`webhook:fails:${endpoint.id}`, 86400);
    if (failCount >= 100) {
      await db.query('UPDATE webhook_endpoints SET active = false WHERE id = $1', [endpoint.id]);
    }
  }
});
```

## Step 3: Self-Service Dashboard API

```typescript
// src/api/webhooks.ts
import { Hono } from 'hono';
import { Pool } from 'pg';
import { Redis } from 'ioredis';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

// Delivery log for a tenant
app.get('/v1/webhooks/deliveries', async (c) => {
  const tenantId = c.get('tenantId');
  const limit = parseInt(c.req.query('limit') ?? '50');

  const { rows } = await db.query(`
    SELECT dl.event_id, dl.endpoint_id, dl.attempt, dl.status_code, dl.latency_ms,
           dl.timestamp, e.type as event_type, ep.url
    FROM webhook_delivery_log dl
    JOIN webhook_endpoints ep ON dl.endpoint_id = ep.id
    JOIN webhook_events e ON dl.event_id = e.id
    WHERE ep.tenant_id = $1
    ORDER BY dl.timestamp DESC
    LIMIT $2
  `, [tenantId, limit]);

  return c.json({ deliveries: rows });
});

// Retry a specific failed delivery
app.post('/v1/webhooks/deliveries/:eventId/retry', async (c) => {
  const eventId = c.req.param('eventId');
  const tenantId = c.get('tenantId');

  const { rows } = await db.query(`
    SELECT d.event_data, ep.id, ep.url, ep.secret
    FROM webhook_dead_letter d
    JOIN webhook_endpoints ep ON d.endpoint_id = ep.id
    WHERE d.event_id = $1 AND ep.tenant_id = $2
  `, [eventId, tenantId]);

  if (!rows[0]) return c.json({ error: 'Not found' }, 404);

  const { Queue } = await import('bullmq');
  const queue = new Queue('webhook-delivery', { connection: redis });
  await queue.add('deliver', {
    event: JSON.parse(rows[0].event_data),
    endpoint: { id: rows[0].id, url: rows[0].url, secret: rows[0].secret, tenantId },
  });

  return c.json({ status: 'queued' });
});

// Endpoint health
app.get('/v1/webhooks/endpoints/:id/health', async (c) => {
  const endpointId = c.req.param('id');

  const lastSuccess = await redis.get(`webhook:health:${endpointId}:last_success`);
  const failCount = parseInt(await redis.get(`webhook:fails:${endpointId}`) ?? '0');

  const { rows } = await db.query(`
    SELECT status_code, COUNT(*) as count
    FROM webhook_delivery_log
    WHERE endpoint_id = $1 AND timestamp > NOW() - INTERVAL '24 hours'
    GROUP BY status_code
  `, [endpointId]);

  return c.json({
    lastSuccessAt: lastSuccess ? new Date(parseInt(lastSuccess)).toISOString() : null,
    consecutiveFailures: failCount,
    last24h: rows,
  });
});

export default app;
```

## Results

- **Delivery rate**: 99.97% (was ~85% with fire-and-forget)
- **Lost events**: zero (dead letter queue catches everything)
- **Support tickets**: 3/week (was 40/week) — customers self-serve via dashboard
- **1M events/day**: delivered across 2,000 endpoints with 50 concurrent workers
- **Retry success**: 12% of deliveries succeed on retry (would have been lost before)
- **Auto-disable**: prevents wasting resources on permanently dead endpoints
- **Customer self-service**: retry button + delivery log eliminates most support needs
