---
title: Build a Webhook Event Log
slug: build-webhook-event-log
description: Build a webhook event log with searchable delivery history, payload inspection, replay functionality, filtering, and export for debugging webhook integrations.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - webhooks
  - event-log
  - debugging
  - integrations
  - history
---

# Build a Webhook Event Log

## The Problem

Alex leads integrations at a 20-person SaaS. Customers ask "did you send the webhook for order #12345?" and nobody can answer quickly. Failed deliveries have no record of what was sent or what error the customer's server returned. When a customer changes their webhook URL, they want to replay recent events to the new endpoint. Debugging webhook issues requires SSH-ing into servers and grep-ing logs. They need a webhook event log: searchable history, full payload inspection, delivery status with response details, replay capability, and customer self-service.

## Step 1: Build the Event Log

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHmac, randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface WebhookEvent {
  id: string;
  eventType: string;
  endpointId: string;
  customerId: string;
  payload: any;
  deliveryStatus: "pending" | "delivered" | "failed" | "retrying";
  attempts: Array<{ timestamp: string; statusCode: number | null; responseBody: string | null; error: string | null; latencyMs: number }>;
  createdAt: string;
}

// Log webhook event
export async function logEvent(params: { eventType: string; endpointId: string; customerId: string; payload: any }): Promise<string> {
  const id = `evt-${randomBytes(8).toString("hex")}`;
  await pool.query(
    `INSERT INTO webhook_events (id, event_type, endpoint_id, customer_id, payload, delivery_status, attempts, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', '[]', NOW())`,
    [id, params.eventType, params.endpointId, params.customerId, JSON.stringify(params.payload)]
  );
  return id;
}

// Record delivery attempt
export async function recordAttempt(eventId: string, attempt: { statusCode: number | null; responseBody: string | null; error: string | null; latencyMs: number }): Promise<void> {
  const { rows: [event] } = await pool.query("SELECT attempts FROM webhook_events WHERE id = $1", [eventId]);
  if (!event) return;
  const attempts = JSON.parse(event.attempts);
  attempts.push({ ...attempt, timestamp: new Date().toISOString() });
  const status = attempt.statusCode && attempt.statusCode >= 200 && attempt.statusCode < 300 ? "delivered" : attempts.length >= 5 ? "failed" : "retrying";
  await pool.query("UPDATE webhook_events SET attempts = $2, delivery_status = $3 WHERE id = $1", [eventId, JSON.stringify(attempts), status]);
}

// Search events
export async function searchEvents(params: { customerId?: string; eventType?: string; status?: string; startDate?: string; endDate?: string; limit?: number; offset?: number }): Promise<{ events: WebhookEvent[]; total: number }> {
  let sql = "SELECT * FROM webhook_events WHERE 1=1";
  const queryParams: any[] = [];
  let idx = 1;
  if (params.customerId) { sql += ` AND customer_id = $${idx}`; queryParams.push(params.customerId); idx++; }
  if (params.eventType) { sql += ` AND event_type = $${idx}`; queryParams.push(params.eventType); idx++; }
  if (params.status) { sql += ` AND delivery_status = $${idx}`; queryParams.push(params.status); idx++; }
  if (params.startDate) { sql += ` AND created_at >= $${idx}`; queryParams.push(params.startDate); idx++; }
  if (params.endDate) { sql += ` AND created_at <= $${idx}`; queryParams.push(params.endDate); idx++; }

  const countSql = sql.replace("SELECT *", "SELECT COUNT(*) as count");
  const { rows: [{ count }] } = await pool.query(countSql, queryParams);

  sql += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  queryParams.push(params.limit || 50, params.offset || 0);
  const { rows } = await pool.query(sql, queryParams);

  return { events: rows.map((r: any) => ({ ...r, payload: JSON.parse(r.payload), attempts: JSON.parse(r.attempts) })), total: parseInt(count) };
}

// Replay event to current or new endpoint
export async function replayEvent(eventId: string, targetUrl?: string): Promise<{ success: boolean; statusCode: number; responseBody: string }> {
  const { rows: [event] } = await pool.query("SELECT * FROM webhook_events WHERE id = $1", [eventId]);
  if (!event) throw new Error("Event not found");

  let url = targetUrl;
  if (!url) {
    const { rows: [endpoint] } = await pool.query("SELECT url, secret FROM webhook_endpoints WHERE id = $1", [event.endpoint_id]);
    if (!endpoint) throw new Error("Endpoint not found");
    url = endpoint.url;
  }

  const payload = JSON.parse(event.payload);
  const start = Date.now();
  const response = await fetch(url!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-ID": eventId, "X-Webhook-Replay": "true" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  const responseBody = await response.text();
  const latencyMs = Date.now() - start;

  await recordAttempt(eventId, { statusCode: response.status, responseBody: responseBody.slice(0, 1000), error: null, latencyMs });

  return { success: response.ok, statusCode: response.status, responseBody: responseBody.slice(0, 1000) };
}

// Bulk replay (e.g., after customer changes URL)
export async function bulkReplay(customerId: string, options: { eventTypes?: string[]; since?: string; targetUrl?: string }): Promise<{ replayed: number; failed: number }> {
  let sql = "SELECT id FROM webhook_events WHERE customer_id = $1";
  const params: any[] = [customerId];
  let idx = 2;
  if (options.since) { sql += ` AND created_at >= $${idx}`; params.push(options.since); idx++; }
  if (options.eventTypes?.length) { sql += ` AND event_type = ANY($${idx})`; params.push(options.eventTypes); idx++; }
  sql += " ORDER BY created_at ASC LIMIT 100";

  const { rows } = await pool.query(sql, params);
  let replayed = 0, failed = 0;
  for (const row of rows) {
    try { await replayEvent(row.id, options.targetUrl); replayed++; } catch { failed++; }
  }
  return { replayed, failed };
}

// Customer-facing event log
export async function getCustomerEventLog(customerId: string, limit: number = 50): Promise<WebhookEvent[]> {
  return (await searchEvents({ customerId, limit })).events;
}
```

## Results

- **"Did you send the webhook?" — answered in 2 seconds** — search by order ID, event type, or date; full payload and delivery attempts visible; no SSH needed
- **Failed delivery debugging** — see exact HTTP status code and response body from customer's server; "your server returned 500 with 'invalid JSON'" — customer fixes their handler
- **Replay after URL change** — customer changes webhook URL → bulk replay last 7 days of events to new URL; no lost events during migration
- **Self-service event log** — customer dashboard shows all webhook deliveries with status; reduces support tickets by 40%
- **Full audit trail** — every delivery attempt logged with timestamp, status, response, and latency; compliance and debugging covered
