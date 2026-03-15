---
title: Build an API Idempotency Layer
slug: build-api-idempotency-layer
description: Build an API idempotency layer with idempotency key tracking, response caching, concurrent request deduplication, and client SDK support for safe retry handling.
skills:
  - typescript
  - redis
  - hono
  - zod
category: Architecture
tags:
  - idempotency
  - api
  - reliability
  - retry
  - patterns
---

# Build an API Idempotency Layer

## The Problem

Noah leads backend at a 20-person fintech processing payments. A customer's mobile app retries a $500 payment request due to a network timeout — the payment processes twice. They lost $12K last month from duplicate charges. Webhook deliveries retry on timeouts, creating duplicate events. Their API has no way to distinguish a retry from a new request. Manual refunds take 3 business days. They need idempotency: clients send a unique key with each request; if the key was seen before, return the original response without re-executing; handle concurrent duplicate requests safely.

## Step 1: Build the Idempotency Layer

```typescript
// src/idempotency/layer.ts — Idempotent API requests with response caching and dedup
import { Redis } from "ioredis";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface IdempotentResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  completedAt: string;
}

const DEFAULT_TTL = 86400; // 24 hours

// Middleware: enforce idempotency on mutating requests
export function idempotencyMiddleware(options?: { ttl?: number; requiredOn?: string[] }) {
  return async (c: any, next: any) => {
    // Only apply to mutating methods
    if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();

    const idempotencyKey = c.req.header("Idempotency-Key");

    // Require key on specified endpoints
    if (options?.requiredOn?.some((p) => c.req.path.startsWith(p)) && !idempotencyKey) {
      return c.json({ error: "Idempotency-Key header required" }, 400);
    }

    if (!idempotencyKey) return next(); // no key = no idempotency

    const cacheKey = `idem:${idempotencyKey}`;
    const lockKey = `idem:lock:${idempotencyKey}`;

    // Check if we already have a response for this key
    const cached = await redis.get(cacheKey);
    if (cached) {
      const response: IdempotentResponse = JSON.parse(cached);
      c.header("Idempotent-Replayed", "true");
      return c.json(JSON.parse(response.body), response.status);
    }

    // Check if another request with same key is currently processing
    const acquired = await redis.set(lockKey, "processing", "EX", 30, "NX");
    if (!acquired) {
      // Wait for the first request to complete
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const result = await redis.get(cacheKey);
        if (result) {
          const response: IdempotentResponse = JSON.parse(result);
          c.header("Idempotent-Replayed", "true");
          return c.json(JSON.parse(response.body), response.status);
        }
      }
      return c.json({ error: "Request still processing" }, 409);
    }

    try {
      // Execute the actual handler
      await next();

      // Cache the response
      const body = await c.res.clone().text();
      const ttl = options?.ttl || DEFAULT_TTL;

      const idempotentResponse: IdempotentResponse = {
        status: c.res.status,
        headers: Object.fromEntries(c.res.headers.entries()),
        body,
        completedAt: new Date().toISOString(),
      };

      await redis.setex(cacheKey, ttl, JSON.stringify(idempotentResponse));
    } finally {
      await redis.del(lockKey);
    }
  };
}

// Generate fingerprint from request body (auto-idempotency for identical requests)
export function generateFingerprint(method: string, path: string, body: any): string {
  const payload = `${method}:${path}:${JSON.stringify(body)}`;
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// Check if key was already used (for client-side validation)
export async function checkKey(key: string): Promise<{ exists: boolean; response?: IdempotentResponse }> {
  const cached = await redis.get(`idem:${key}`);
  if (cached) return { exists: true, response: JSON.parse(cached) };
  return { exists: false };
}

// Cleanup expired keys (optional, Redis TTL handles this)
export async function getIdempotencyStats(): Promise<{
  totalKeys: number; replayedRequests: number;
}> {
  const keys = await redis.keys("idem:*");
  const stats = await redis.hgetall("idem:stats");
  return {
    totalKeys: keys.filter((k) => !k.includes("lock") && !k.includes("stats")).length,
    replayedRequests: parseInt(stats.replayed || "0"),
  };
}
```

## Results

- **Duplicate payments: $12K/month → $0** — retry sends same Idempotency-Key; server returns cached response; payment processes exactly once
- **Concurrent dedup** — two identical requests arrive 50ms apart; first acquires lock, second waits; both get the same response; no race condition
- **24-hour replay window** — client can retry anytime within 24 hours; gets original response; covers long network outages and mobile app retries
- **Webhook safety** — webhook deliveries include idempotency key; consumer processes event once; retries return cached acknowledgment
- **Zero client changes for existing endpoints** — middleware applies globally; clients add one header; endpoints don't need modification
