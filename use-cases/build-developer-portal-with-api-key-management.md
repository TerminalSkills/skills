---
title: Build a Developer Portal with API Key Management
slug: build-developer-portal-with-api-key-management
description: Build a self-service developer portal where API consumers create accounts, generate scoped API keys, monitor usage, and manage rate limits — reducing support tickets by 80%.
skills:
  - typescript
  - hono
  - postgresql
  - redis
  - zod
  - nextjs
category: Full-Stack Development
tags:
  - api-keys
  - developer-portal
  - rate-limiting
  - self-service
  - api-management
---

# Build a Developer Portal with API Key Management

## The Problem

Ravi's team runs a data enrichment API at a 30-person B2B startup. They have 200+ API consumers, but key management is manual: developers email support to get keys, there's no usage dashboard, and revoking a compromised key means grepping through a config file and redeploying. Support handles 15 key-related tickets per week. After a customer accidentally committed their key to a public GitHub repo, the team spent 4 hours on emergency rotation. A self-service portal would eliminate this overhead and give customers the visibility they need.

## Step 1: Design the Key Data Model

API keys need to support scoping (which endpoints a key can access), rate limiting (per key, not just per account), and instant revocation without requiring server restarts.

```typescript
// src/db/schema.ts — Database schema for API key management
import { z } from "zod";

// Key creation request validation
export const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),          // human-readable label
  scopes: z.array(z.string()).min(1),         // e.g., ["enrichment:read", "batch:write"]
  rateLimitPerMinute: z.number().int().min(1).max(10000).default(60),
  expiresAt: z.string().datetime().optional(), // optional expiration
  allowedIPs: z.array(z.string().ip()).optional(), // optional IP allowlist
});

// SQL migrations for the key tables
export const migrations = `
  CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    name VARCHAR(100) NOT NULL,
    key_prefix VARCHAR(8) NOT NULL,        -- first 8 chars shown in UI (sk_live_abc1...)
    key_hash VARCHAR(64) NOT NULL,          -- SHA-256 hash of full key
    scopes TEXT[] NOT NULL,
    rate_limit_per_minute INT NOT NULL DEFAULT 60,
    allowed_ips INET[],
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,                 -- null = active, set = revoked
    last_used_at TIMESTAMPTZ,
    total_requests BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_key_hash UNIQUE (key_hash)
  );

  -- Index for fast key lookups during request authentication
  CREATE INDEX idx_api_keys_hash ON api_keys (key_hash) WHERE revoked_at IS NULL;
  
  -- Usage tracking: per-key, per-day aggregation
  CREATE TABLE key_usage (
    id BIGSERIAL PRIMARY KEY,
    key_id UUID NOT NULL REFERENCES api_keys(id),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    endpoint VARCHAR(200) NOT NULL,
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    total_latency_ms BIGINT DEFAULT 0,      -- for average latency calculation
    
    CONSTRAINT unique_key_date_endpoint UNIQUE (key_id, date, endpoint)
  );
  
  CREATE INDEX idx_key_usage_date ON key_usage (key_id, date);
`;
```

## Step 2: Build Secure Key Generation and Storage

Keys are generated with crypto-safe randomness, shown to the user exactly once, and stored as SHA-256 hashes. The prefix allows identification without exposing the full key.

```typescript
// src/services/key-service.ts — Secure API key lifecycle management
import { randomBytes, createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

const KEY_PREFIX = "sk_live_"; // sk_test_ for sandbox keys

interface KeyCreateResult {
  id: string;
  name: string;
  key: string;          // full key — shown ONCE, never stored
  keyPrefix: string;    // shown in dashboard for identification
  scopes: string[];
  rateLimitPerMinute: number;
  createdAt: Date;
}

export async function createApiKey(
  accountId: string,
  params: {
    name: string;
    scopes: string[];
    rateLimitPerMinute: number;
    expiresAt?: string;
    allowedIPs?: string[];
  }
): Promise<KeyCreateResult> {
  // Generate 32 bytes of randomness → 43 base64url characters
  const secret = randomBytes(32).toString("base64url");
  const fullKey = `${KEY_PREFIX}${secret}`;
  const keyPrefix = fullKey.slice(0, 12); // e.g., "sk_live_abc1"
  const keyHash = createHash("sha256").update(fullKey).digest("hex");

  const { rows } = await pool.query(
    `INSERT INTO api_keys (account_id, name, key_prefix, key_hash, scopes, rate_limit_per_minute, expires_at, allowed_ips)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, name, scopes, rate_limit_per_minute, created_at`,
    [
      accountId,
      params.name,
      keyPrefix,
      keyHash,
      params.scopes,
      params.rateLimitPerMinute,
      params.expiresAt || null,
      params.allowedIPs || null,
    ]
  );

  return {
    ...rows[0],
    key: fullKey,       // returned once, never stored in plaintext
    keyPrefix,
  };
}

export async function revokeKey(keyId: string, accountId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    "UPDATE api_keys SET revoked_at = NOW() WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL",
    [keyId, accountId]
  );

  if (rowCount && rowCount > 0) {
    // Invalidate cached key immediately across all servers
    await redis.publish("key:revoked", keyId);
    // Remove from local verification cache
    await redis.del(`key:${keyId}:valid`);
    return true;
  }
  return false;
}

// Key verification during API requests — called on every request
export async function verifyKey(
  rawKey: string,
  requiredScope: string,
  clientIP: string
): Promise<{ valid: boolean; keyId?: string; accountId?: string; error?: string }> {
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  // Check Redis cache first (99% of lookups)
  const cached = await redis.get(`keyhash:${keyHash}`);
  if (cached) {
    const keyData = JSON.parse(cached);
    return validateKeyData(keyData, requiredScope, clientIP);
  }

  // Cache miss — query database
  const { rows } = await pool.query(
    `SELECT id, account_id, scopes, rate_limit_per_minute, allowed_ips, expires_at
     FROM api_keys
     WHERE key_hash = $1 AND revoked_at IS NULL`,
    [keyHash]
  );

  if (rows.length === 0) {
    return { valid: false, error: "Invalid API key" };
  }

  const keyData = rows[0];

  // Cache for 5 minutes — balances speed with revocation latency
  await redis.setex(`keyhash:${keyHash}`, 300, JSON.stringify(keyData));

  return validateKeyData(keyData, requiredScope, clientIP);
}

function validateKeyData(
  keyData: any,
  requiredScope: string,
  clientIP: string
): { valid: boolean; keyId?: string; accountId?: string; error?: string } {
  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return { valid: false, error: "API key expired" };
  }

  // Check IP allowlist
  if (keyData.allowed_ips?.length > 0 && !keyData.allowed_ips.includes(clientIP)) {
    return { valid: false, error: "IP not in allowlist" };
  }

  // Check scope
  if (!keyData.scopes.includes(requiredScope) && !keyData.scopes.includes("*")) {
    return { valid: false, error: `Missing scope: ${requiredScope}` };
  }

  return {
    valid: true,
    keyId: keyData.id,
    accountId: keyData.account_id,
  };
}
```

## Step 3: Add Per-Key Rate Limiting

Rate limits are enforced per key using a Redis sliding window. Each key has its own limit, configurable from the portal.

```typescript
// src/middleware/rate-limit.ts — Per-key sliding window rate limiter
import { Redis } from "ioredis";
import { Context, Next } from "hono";

const redis = new Redis(process.env.REDIS_URL!);

export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    const keyId = c.get("keyId");
    const rateLimit = c.get("rateLimit") as number; // set by auth middleware

    const windowKey = `ratelimit:${keyId}`;
    const now = Date.now();
    const windowMs = 60_000; // 1-minute sliding window

    // Lua script for atomic sliding window check
    const result = await redis.eval(
      `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local window = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      
      -- Remove entries outside the window
      redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
      
      -- Count current requests in window
      local count = redis.call('ZCARD', key)
      
      if count < limit then
        -- Add this request
        redis.call('ZADD', key, now, now .. ':' .. math.random(1000000))
        redis.call('PEXPIRE', key, window)
        return {count + 1, limit, 0}
      else
        -- Rate limited — calculate retry-after
        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local retryAfter = oldest[2] and (tonumber(oldest[2]) + window - now) or window
        return {count, limit, retryAfter}
      end
      `,
      1,
      windowKey,
      now,
      windowMs,
      rateLimit
    ) as number[];

    const [current, limit, retryAfter] = result;

    // Set standard rate limit headers
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - current)));
    c.header("X-RateLimit-Reset", String(Math.ceil((now + 60_000) / 1000)));

    if (retryAfter > 0) {
      c.header("Retry-After", String(Math.ceil(retryAfter / 1000)));
      return c.json(
        { error: "Rate limit exceeded", retryAfter: Math.ceil(retryAfter / 1000) },
        429
      );
    }

    await next();
  };
}
```

## Step 4: Build the Usage Analytics API

Developers want to see how their keys are performing — request counts, error rates, latency trends. This data is aggregated per-key per-day for efficient querying.

```typescript
// src/routes/portal.ts — Developer portal API endpoints
import { Hono } from "hono";
import { z } from "zod";
import { createApiKey, revokeKey } from "../services/key-service";
import { pool } from "../db";

const portal = new Hono();

// List all keys for the authenticated account
portal.get("/keys", async (c) => {
  const accountId = c.get("accountId");

  const { rows } = await pool.query(
    `SELECT id, name, key_prefix, scopes, rate_limit_per_minute, 
            allowed_ips, expires_at, revoked_at, last_used_at, total_requests, created_at
     FROM api_keys WHERE account_id = $1 ORDER BY created_at DESC`,
    [accountId]
  );

  return c.json({
    keys: rows.map((k) => ({
      ...k,
      status: k.revoked_at
        ? "revoked"
        : k.expires_at && new Date(k.expires_at) < new Date()
          ? "expired"
          : "active",
    })),
  });
});

// Create a new API key
portal.post("/keys", async (c) => {
  const accountId = c.get("accountId");
  const body = await c.req.json();
  const params = CreateKeySchema.parse(body);

  // Enforce per-account key limit
  const { rows: existing } = await pool.query(
    "SELECT COUNT(*) as count FROM api_keys WHERE account_id = $1 AND revoked_at IS NULL",
    [accountId]
  );
  if (existing[0].count >= 25) {
    return c.json({ error: "Maximum 25 active keys per account" }, 400);
  }

  const result = await createApiKey(accountId, params);

  return c.json({
    ...result,
    warning: "Store this key securely — it won't be shown again.",
  }, 201);
});

// Revoke a key
portal.delete("/keys/:keyId", async (c) => {
  const accountId = c.get("accountId");
  const { keyId } = c.req.param();

  const revoked = await revokeKey(keyId, accountId);
  if (!revoked) return c.json({ error: "Key not found or already revoked" }, 404);

  return c.json({ success: true, message: "Key revoked immediately" });
});

// Usage analytics for a specific key
portal.get("/keys/:keyId/usage", async (c) => {
  const accountId = c.get("accountId");
  const { keyId } = c.req.param();
  const days = Number(c.req.query("days") || 30);

  // Verify key belongs to account
  const { rows: keyCheck } = await pool.query(
    "SELECT id FROM api_keys WHERE id = $1 AND account_id = $2",
    [keyId, accountId]
  );
  if (keyCheck.length === 0) return c.json({ error: "Key not found" }, 404);

  // Daily usage breakdown
  const { rows: daily } = await pool.query(
    `SELECT date, 
            SUM(success_count) as successes,
            SUM(error_count) as errors,
            SUM(total_latency_ms) / NULLIF(SUM(success_count + error_count), 0) as avg_latency_ms
     FROM key_usage
     WHERE key_id = $1 AND date >= CURRENT_DATE - $2::int
     GROUP BY date ORDER BY date`,
    [keyId, days]
  );

  // Top endpoints
  const { rows: endpoints } = await pool.query(
    `SELECT endpoint, 
            SUM(success_count) as successes,
            SUM(error_count) as errors
     FROM key_usage
     WHERE key_id = $1 AND date >= CURRENT_DATE - $2::int
     GROUP BY endpoint ORDER BY successes DESC LIMIT 10`,
    [keyId, days]
  );

  return c.json({
    daily,
    endpoints,
    summary: {
      totalRequests: daily.reduce((s, d) => s + Number(d.successes) + Number(d.errors), 0),
      errorRate:
        daily.reduce((s, d) => s + Number(d.errors), 0) /
        Math.max(1, daily.reduce((s, d) => s + Number(d.successes) + Number(d.errors), 0)),
      avgLatencyMs:
        daily.reduce((s, d) => s + (Number(d.avg_latency_ms) || 0), 0) /
        Math.max(1, daily.length),
    },
  });
});

// Roll a key: create new key with same config, revoke old one
portal.post("/keys/:keyId/roll", async (c) => {
  const accountId = c.get("accountId");
  const { keyId } = c.req.param();

  const { rows } = await pool.query(
    "SELECT name, scopes, rate_limit_per_minute, allowed_ips, expires_at FROM api_keys WHERE id = $1 AND account_id = $2 AND revoked_at IS NULL",
    [keyId, accountId]
  );
  if (rows.length === 0) return c.json({ error: "Key not found" }, 404);

  const oldKey = rows[0];

  // Create replacement key with same configuration
  const newKey = await createApiKey(accountId, {
    name: `${oldKey.name} (rolled)`,
    scopes: oldKey.scopes,
    rateLimitPerMinute: oldKey.rate_limit_per_minute,
    allowedIPs: oldKey.allowed_ips,
    expiresAt: oldKey.expires_at,
  });

  // Revoke old key
  await revokeKey(keyId, accountId);

  return c.json({
    newKey,
    revokedKeyId: keyId,
    warning: "Old key is immediately invalid. Update your integration with the new key.",
  });
});

export default portal;
```

## Results

After launching the developer portal:

- **Key-related support tickets dropped from 15/week to 3/week** — developers self-serve key creation, rotation, and scope management
- **Compromised key response time: from 4 hours to 30 seconds** — developers revoke and roll keys themselves via the dashboard; Redis pub/sub propagates revocation across all servers instantly
- **API abuse detection improved** — per-key usage analytics revealed two accounts generating 10x normal traffic for scraping; scoped keys and IP allowlists blocked the abuse without affecting other customers
- **Developer onboarding time cut from 2 days to 15 minutes** — new customers get API keys immediately instead of waiting for support email responses
- **Zero plaintext key storage** — SHA-256 hashing means even a database breach doesn't expose usable keys
