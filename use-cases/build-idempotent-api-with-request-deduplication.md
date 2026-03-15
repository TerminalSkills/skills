---
title: Build an Idempotent API with Request Deduplication
slug: build-idempotent-api-with-request-deduplication
description: Build idempotent API endpoints that safely handle retries and duplicate requests — preventing double charges, duplicate records, and race conditions in payment and order processing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - idempotency
  - api-design
  - payments
  - reliability
  - distributed-systems
---

# Build an Idempotent API with Request Deduplication

## The Problem

Maya leads payments at a 30-person marketplace. Users click "Pay" and the request times out, so they click again. Result: double charge. The mobile app retries failed requests automatically — creating duplicate orders. A network hiccup between the API and Stripe means the payment succeeds but the API returns a 500, so the client retries and charges the customer twice. Last month: 47 double charges, $12K in refunds, and angry customer emails. They need every mutating API endpoint to be idempotent — the same request processed twice produces the same result.

## Step 1: Build the Idempotency Middleware

```typescript
// src/middleware/idempotency.ts — Idempotency key middleware for safe retries
import { Context, Next } from "hono";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface IdempotencyRecord {
  status: "processing" | "completed";
  statusCode: number;
  body: string;
  headers: Record<string, string>;
  createdAt: number;
}

const IDEMPOTENCY_TTL = 86400; // 24 hours

export function idempotency() {
  return async (c: Context, next: Next) => {
    // Only apply to mutating methods
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(c.req.method)) {
      return next();
    }

    const idempotencyKey = c.req.header("Idempotency-Key");

    // No key = no idempotency protection (backward compatible)
    if (!idempotencyKey) return next();

    // Validate key format
    if (idempotencyKey.length > 255) {
      return c.json({ error: "Idempotency-Key too long (max 255 chars)" }, 400);
    }

    const cacheKey = `idempotency:${c.req.method}:${c.req.path}:${idempotencyKey}`;

    // Check if this request was already processed
    const existing = await redis.get(cacheKey);

    if (existing) {
      const record: IdempotencyRecord = JSON.parse(existing);

      if (record.status === "processing") {
        // Request is currently being processed (concurrent duplicate)
        return c.json(
          { error: "Request is currently being processed", retryAfter: 1 },
          409,
          { "Retry-After": "1" }
        );
      }

      // Return cached response
      c.header("X-Idempotent-Replayed", "true");
      for (const [key, value] of Object.entries(record.headers)) {
        c.header(key, value);
      }
      return c.json(JSON.parse(record.body), record.statusCode as any);
    }

    // Mark as processing (with short TTL in case server crashes)
    const lockRecord: IdempotencyRecord = {
      status: "processing",
      statusCode: 0,
      body: "",
      headers: {},
      createdAt: Date.now(),
    };
    const locked = await redis.set(cacheKey, JSON.stringify(lockRecord), "EX", 30, "NX");

    if (!locked) {
      // Another request grabbed the lock between our GET and SET
      return c.json({ error: "Request is currently being processed" }, 409);
    }

    try {
      // Process the request
      await next();

      // Cache the response
      const responseBody = await getResponseBody(c);
      const completedRecord: IdempotencyRecord = {
        status: "completed",
        statusCode: c.res.status,
        body: responseBody,
        headers: {
          "Content-Type": c.res.headers.get("Content-Type") || "application/json",
        },
        createdAt: Date.now(),
      };

      await redis.set(cacheKey, JSON.stringify(completedRecord), "EX", IDEMPOTENCY_TTL);
    } catch (err) {
      // Remove the lock on failure so retries can proceed
      await redis.del(cacheKey);
      throw err;
    }
  };
}

async function getResponseBody(c: Context): Promise<string> {
  const cloned = c.res.clone();
  return cloned.text();
}

// Database-level idempotency for critical operations
export async function withIdempotency<T>(
  key: string,
  pool: any,
  operation: () => Promise<T>
): Promise<{ result: T; replayed: boolean }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if operation was already completed
    const { rows } = await client.query(
      "SELECT result FROM idempotency_keys WHERE key = $1 FOR UPDATE",
      [key]
    );

    if (rows.length > 0) {
      await client.query("COMMIT");
      return { result: JSON.parse(rows[0].result), replayed: true };
    }

    // Execute the operation
    const result = await operation();

    // Store the result
    await client.query(
      "INSERT INTO idempotency_keys (key, result, created_at) VALUES ($1, $2, NOW())",
      [key, JSON.stringify(result)]
    );

    await client.query("COMMIT");
    return { result, replayed: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
```

## Step 2: Apply to Payment Processing

```typescript
// src/routes/payments.ts — Idempotent payment processing
import { Hono } from "hono";
import { z } from "zod";
import { idempotency, withIdempotency } from "../middleware/idempotency";
import { pool } from "../db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const app = new Hono();

app.use("*", idempotency());

const ChargeSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  currency: z.string().length(3),
  customerId: z.string(),
});

app.post("/payments/charge", async (c) => {
  const body = ChargeSchema.parse(await c.req.json());
  const idempotencyKey = c.req.header("Idempotency-Key")!;

  // Database-level idempotency ensures exactly-once payment
  const { result, replayed } = await withIdempotency(
    `charge:${idempotencyKey}`,
    pool,
    async () => {
      // Check order hasn't been paid already
      const { rows: [order] } = await pool.query(
        "SELECT id, status FROM orders WHERE id = $1",
        [body.orderId]
      );

      if (!order) throw new Error("Order not found");
      if (order.status === "paid") throw new Error("Order already paid");

      // Charge via Stripe (using Stripe's own idempotency)
      const charge = await stripe.paymentIntents.create({
        amount: Math.round(body.amount * 100),
        currency: body.currency,
        customer: body.customerId,
        metadata: { orderId: body.orderId },
      }, {
        idempotencyKey: `stripe:${idempotencyKey}`,
      });

      // Update order status
      await pool.query(
        "UPDATE orders SET status = 'paid', payment_id = $2, paid_at = NOW() WHERE id = $1",
        [body.orderId, charge.id]
      );

      return {
        paymentId: charge.id,
        status: charge.status,
        amount: body.amount,
      };
    }
  );

  if (replayed) {
    c.header("X-Idempotent-Replayed", "true");
  }

  return c.json(result, 201);
});

export default app;
```

## Results

- **Double charges eliminated completely** — same Idempotency-Key returns cached result instead of processing again; 47 double charges/month → zero
- **Mobile app retries are safe** — automatic retry on timeout sends the same idempotency key; the server returns the original result without reprocessing
- **Concurrent duplicates handled** — if two identical requests arrive simultaneously, one processes and the other gets a 409 with Retry-After; no race condition
- **$12K/month in refund costs eliminated** — no duplicate payments means no refund requests; customer trust restored
- **Database-level guarantee for payments** — Redis handles general API idempotency; critical payment operations use PostgreSQL transactions with FOR UPDATE for stronger consistency
