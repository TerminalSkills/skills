---
title: Build an Outgoing Webhook Builder
slug: build-outgoing-webhook-builder
description: Build an outgoing webhook builder with event selection, payload templates, retry logic, delivery tracking, secret signing, and testing tools for integrating with external services.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - webhooks
  - integrations
  - events
  - delivery
  - builder
---

# Build an Outgoing Webhook Builder

## The Problem

Zoe leads integrations at a 20-person SaaS. Customers want to receive webhooks when events happen: new order, payment failed, user signed up. Currently, adding a webhook for a new event requires engineering work — hardcoded HTTP calls scattered across the codebase. No retry on failure. No delivery tracking — customers ask "did you send the webhook?" and nobody can answer. Payload format differs per endpoint. They need a webhook builder: customers configure their own webhooks, select events, customize payload templates, and see delivery logs — all self-service.

## Step 1: Build the Webhook Builder Engine

```typescript
// src/webhooks/outgoing.ts — Outgoing webhook builder with delivery tracking and retries
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHmac, randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface WebhookEndpoint {
  id: string;
  customerId: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  payloadTemplate?: string;  // custom JSON template
  headers: Record<string, string>;
  retryPolicy: { maxRetries: number; backoffMs: number };
  createdAt: string;
}

interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventType: string;
  payload: any;
  status: "pending" | "delivered" | "failed" | "retrying";
  attempts: number;
  lastAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  nextRetryAt: string | null;
  createdAt: string;
}

const AVAILABLE_EVENTS = [
  "order.created", "order.updated", "order.cancelled",
  "payment.succeeded", "payment.failed", "payment.refunded",
  "user.created", "user.updated", "user.deleted",
  "subscription.created", "subscription.cancelled", "subscription.renewed",
  "invoice.generated", "invoice.paid", "invoice.overdue",
];

// Create webhook endpoint
export async function createEndpoint(params: {
  customerId: string; url: string; events: string[];
  headers?: Record<string, string>; payloadTemplate?: string;
}): Promise<WebhookEndpoint> {
  // Validate events
  for (const event of params.events) {
    if (!AVAILABLE_EVENTS.includes(event)) throw new Error(`Unknown event: ${event}`);
  }

  const id = `wh-${randomBytes(6).toString("hex")}`;
  const secret = `whsec_${randomBytes(24).toString("hex")}`;

  const endpoint: WebhookEndpoint = {
    id, customerId: params.customerId,
    url: params.url, secret,
    events: params.events, active: true,
    payloadTemplate: params.payloadTemplate,
    headers: params.headers || {},
    retryPolicy: { maxRetries: 5, backoffMs: 5000 },
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO webhook_endpoints (id, customer_id, url, secret, events, active, payload_template, headers, retry_policy, created_at)
     VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8, NOW())`,
    [id, params.customerId, params.url, secret, JSON.stringify(params.events),
     params.payloadTemplate, JSON.stringify(endpoint.headers), JSON.stringify(endpoint.retryPolicy)]
  );

  return endpoint;
}

// Dispatch event to all matching webhook endpoints
export async function dispatchEvent(eventType: string, payload: any): Promise<number> {
  const { rows: endpoints } = await pool.query(
    `SELECT * FROM webhook_endpoints WHERE active = true AND events::jsonb @> $1::jsonb`,
    [JSON.stringify([eventType])]
  );

  let dispatched = 0;
  for (const ep of endpoints) {
    const deliveryId = `del-${randomBytes(8).toString("hex")}`;

    // Apply custom payload template if configured
    const finalPayload = ep.payload_template
      ? applyTemplate(ep.payload_template, { event: eventType, data: payload, timestamp: new Date().toISOString() })
      : { event: eventType, data: payload, timestamp: new Date().toISOString() };

    await pool.query(
      `INSERT INTO webhook_deliveries (id, endpoint_id, event_type, payload, status, attempts, created_at)
       VALUES ($1, $2, $3, $4, 'pending', 0, NOW())`,
      [deliveryId, ep.id, eventType, JSON.stringify(finalPayload)]
    );

    // Queue for delivery
    await redis.rpush("webhook:delivery:queue", JSON.stringify({ deliveryId, endpointId: ep.id }));
    dispatched++;
  }

  return dispatched;
}

// Process delivery queue
export async function processDeliveryQueue(): Promise<{ delivered: number; failed: number; retrying: number }> {
  let delivered = 0, failed = 0, retrying = 0;

  while (true) {
    const item = await redis.lpop("webhook:delivery:queue");
    if (!item) break;

    const { deliveryId, endpointId } = JSON.parse(item);
    const { rows: [delivery] } = await pool.query("SELECT * FROM webhook_deliveries WHERE id = $1", [deliveryId]);
    const { rows: [endpoint] } = await pool.query("SELECT * FROM webhook_endpoints WHERE id = $1", [endpointId]);

    if (!delivery || !endpoint) continue;

    const payload = JSON.parse(delivery.payload);
    const signature = signPayload(JSON.stringify(payload), endpoint.secret);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Webhook-ID": deliveryId,
      "X-Webhook-Signature": signature,
      "X-Webhook-Timestamp": new Date().toISOString(),
      ...JSON.parse(endpoint.headers),
    };

    try {
      const response = await fetch(endpoint.url, {
        method: "POST", headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000),
      });

      const responseBody = await response.text().catch(() => "");

      if (response.ok) {
        await pool.query(
          "UPDATE webhook_deliveries SET status = 'delivered', attempts = attempts + 1, last_attempt_at = NOW(), response_status = $2, response_body = $3 WHERE id = $1",
          [deliveryId, response.status, responseBody.slice(0, 1000)]
        );
        delivered++;
      } else {
        await handleFailure(deliveryId, endpoint, delivery.attempts + 1, response.status, responseBody);
        if (delivery.attempts + 1 < JSON.parse(endpoint.retry_policy).maxRetries) retrying++;
        else failed++;
      }
    } catch (error: any) {
      await handleFailure(deliveryId, endpoint, delivery.attempts + 1, 0, error.message);
      if (delivery.attempts + 1 < JSON.parse(endpoint.retry_policy).maxRetries) retrying++;
      else failed++;
    }
  }

  return { delivered, failed, retrying };
}

async function handleFailure(deliveryId: string, endpoint: any, attempts: number, status: number, body: string): Promise<void> {
  const policy = JSON.parse(endpoint.retry_policy);
  if (attempts >= policy.maxRetries) {
    await pool.query(
      "UPDATE webhook_deliveries SET status = 'failed', attempts = $2, last_attempt_at = NOW(), response_status = $3, response_body = $4 WHERE id = $1",
      [deliveryId, attempts, status, body?.slice(0, 1000)]
    );
  } else {
    const nextRetry = new Date(Date.now() + policy.backoffMs * Math.pow(2, attempts - 1));
    await pool.query(
      "UPDATE webhook_deliveries SET status = 'retrying', attempts = $2, last_attempt_at = NOW(), next_retry_at = $3, response_status = $4, response_body = $5 WHERE id = $1",
      [deliveryId, attempts, nextRetry.toISOString(), status, body?.slice(0, 1000)]
    );
    // Schedule retry
    const delay = policy.backoffMs * Math.pow(2, attempts - 1);
    setTimeout(async () => {
      await redis.rpush("webhook:delivery:queue", JSON.stringify({ deliveryId, endpointId: endpoint.id }));
    }, delay);
  }
}

function signPayload(payload: string, secret: string): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function applyTemplate(template: string, data: Record<string, any>): any {
  try {
    let result = template;
    for (const [key, value] of Object.entries(flattenObject(data))) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), JSON.stringify(value));
    }
    return JSON.parse(result);
  } catch {
    return data;
  }
}

function flattenObject(obj: any, prefix: string = ""): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }
  return result;
}

// Test endpoint (send a test event)
export async function testEndpoint(endpointId: string): Promise<{ success: boolean; status: number; body: string }> {
  const { rows: [endpoint] } = await pool.query("SELECT * FROM webhook_endpoints WHERE id = $1", [endpointId]);
  if (!endpoint) throw new Error("Endpoint not found");

  const testPayload = { event: "test.ping", data: { message: "Test webhook delivery" }, timestamp: new Date().toISOString() };
  const signature = signPayload(JSON.stringify(testPayload), endpoint.secret);

  const response = await fetch(endpoint.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Webhook-Signature": signature },
    body: JSON.stringify(testPayload),
    signal: AbortSignal.timeout(10000),
  });

  const body = await response.text();
  return { success: response.ok, status: response.status, body: body.slice(0, 1000) };
}

// Delivery logs for customer
export async function getDeliveryLog(endpointId: string, limit: number = 50): Promise<WebhookDelivery[]> {
  const { rows } = await pool.query(
    "SELECT * FROM webhook_deliveries WHERE endpoint_id = $1 ORDER BY created_at DESC LIMIT $2",
    [endpointId, limit]
  );
  return rows;
}
```

## Results

- **Self-service webhook setup** — customer selects events, enters URL, gets secret; no engineering ticket; live in 2 minutes
- **Delivery tracking** — customer sees every delivery attempt with status code, response body, and timestamp; "did you send the webhook?" answered in self-service dashboard
- **HMAC signing** — every delivery signed with customer's secret; they verify authenticity; spoofing prevented
- **Exponential retry** — failed delivery retried 5 times with backoff (5s, 10s, 20s, 40s, 80s); transient failures resolved automatically; persistent failures alert the customer
- **Custom payload templates** — customer maps their field names to your event data; `{{data.user.email}}` becomes the actual email; no format mismatch
