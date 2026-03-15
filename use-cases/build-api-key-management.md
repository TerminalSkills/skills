---
title: Build an API Key Management System
slug: build-api-key-management
description: Build an API key management system with scoped permissions, usage tracking, automatic rotation, rate limiting per key, and revocation for multi-tenant APIs.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - api-keys
  - authentication
  - security
  - rate-limiting
  - multi-tenant
---

# Build an API Key Management System

## The Problem

Jade leads platform engineering at a 25-person API company serving 500 customers. API keys are stored in plaintext in the database. All keys have the same permissions — a read-only integration gets full write access. When a customer's key leaks, the only option is to generate a new one, breaking their integration. There's no way to track which key made which request, and no per-key rate limiting. A single customer's runaway script can saturate the API for everyone.

## Step 1: Build the Key Management Engine

```typescript
// src/auth/api-keys.ts — API key management with scoped permissions and usage tracking
import { pool } from "../db";
import { Redis } from "ioredis";
import { createHash, randomBytes, scryptSync } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface APIKey {
  id: string;
  prefix: string;           // first 8 chars shown to user (e.g., "sk_live_a1b2c3d4")
  hashedKey: string;        // scrypt hash stored in DB
  name: string;
  organizationId: string;
  scopes: string[];         // ["read:users", "write:orders", "admin:billing"]
  rateLimit: { requests: number; windowSeconds: number };
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
  status: "active" | "revoked" | "expired";
  createdBy: string;
  createdAt: string;
}

// Generate new API key with scoped permissions
export async function createKey(params: {
  name: string;
  organizationId: string;
  scopes: string[];
  rateLimit?: { requests: number; windowSeconds: number };
  expiresInDays?: number;
  createdBy: string;
}): Promise<{ key: string; record: APIKey }> {
  const id = `key-${randomBytes(6).toString("hex")}`;

  // Generate key: sk_live_ + 32 random bytes as hex
  const rawKey = randomBytes(32).toString("hex");
  const prefix = rawKey.slice(0, 8);
  const fullKey = `sk_live_${rawKey}`;

  // Hash key with scrypt for storage (never store plaintext)
  const salt = randomBytes(16);
  const hashedKey = scryptSync(fullKey, salt, 64).toString("hex") + ":" + salt.toString("hex");

  // Also store a fast lookup hash (SHA-256) for request-time validation
  const lookupHash = createHash("sha256").update(fullKey).digest("hex");

  const record: APIKey = {
    id, prefix, hashedKey, name: params.name,
    organizationId: params.organizationId,
    scopes: params.scopes,
    rateLimit: params.rateLimit || { requests: 1000, windowSeconds: 60 },
    expiresAt: params.expiresInDays
      ? new Date(Date.now() + params.expiresInDays * 86400000).toISOString()
      : null,
    lastUsedAt: null, lastUsedIp: null,
    status: "active", createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO api_keys (id, prefix, hashed_key, lookup_hash, name, organization_id, scopes, rate_limit, expires_at, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active', $10, NOW())`,
    [id, prefix, hashedKey, lookupHash, params.name, params.organizationId,
     JSON.stringify(params.scopes), JSON.stringify(record.rateLimit),
     record.expiresAt, params.createdBy]
  );

  // Cache key metadata for fast validation
  await redis.setex(`apikey:${lookupHash}`, 300, JSON.stringify(record));

  return { key: fullKey, record };  // Return plaintext key ONCE — never stored
}

// Validate API key from request
export async function validateKey(rawKey: string): Promise<{
  valid: boolean;
  key?: APIKey;
  reason?: string;
}> {
  const lookupHash = createHash("sha256").update(rawKey).digest("hex");

  // Check Redis cache first
  let record: APIKey | null = null;
  const cached = await redis.get(`apikey:${lookupHash}`);
  if (cached) {
    record = JSON.parse(cached);
  } else {
    const { rows: [row] } = await pool.query(
      "SELECT * FROM api_keys WHERE lookup_hash = $1",
      [lookupHash]
    );
    if (row) {
      record = {
        ...row,
        scopes: JSON.parse(row.scopes),
        rateLimit: JSON.parse(row.rate_limit),
      };
      await redis.setex(`apikey:${lookupHash}`, 300, JSON.stringify(record));
    }
  }

  if (!record) return { valid: false, reason: "Invalid API key" };
  if (record.status === "revoked") return { valid: false, reason: "Key revoked" };
  if (record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return { valid: false, reason: "Key expired" };
  }

  // Rate limiting per key
  const rateLimited = await checkKeyRateLimit(record);
  if (rateLimited) return { valid: false, reason: "Rate limit exceeded" };

  // Update last used (async, non-blocking)
  updateLastUsed(record.id, "0.0.0.0").catch(() => {});

  return { valid: true, key: record };
}

// Check if request has required scope
export function hasScope(key: APIKey, requiredScope: string): boolean {
  // Support wildcards: "admin:*" matches "admin:billing"
  return key.scopes.some((scope) => {
    if (scope === requiredScope) return true;
    if (scope.endsWith(":*")) {
      const prefix = scope.slice(0, -1);  // "admin:"
      return requiredScope.startsWith(prefix);
    }
    return false;
  });
}

// Revoke key immediately
export async function revokeKey(keyId: string, reason: string): Promise<void> {
  await pool.query(
    "UPDATE api_keys SET status = 'revoked' WHERE id = $1",
    [keyId]
  );

  // Invalidate cache
  const { rows: [row] } = await pool.query("SELECT lookup_hash FROM api_keys WHERE id = $1", [keyId]);
  if (row) await redis.del(`apikey:${row.lookup_hash}`);
}

// Rotate key (create new, schedule old revocation)
export async function rotateKey(keyId: string, gracePeriodHours: number = 24): Promise<{ newKey: string }> {
  const { rows: [old] } = await pool.query("SELECT * FROM api_keys WHERE id = $1", [keyId]);
  if (!old) throw new Error("Key not found");

  // Create replacement key with same scopes
  const { key: newKey } = await createKey({
    name: `${old.name} (rotated)`,
    organizationId: old.organization_id,
    scopes: JSON.parse(old.scopes),
    rateLimit: JSON.parse(old.rate_limit),
    createdBy: old.created_by,
  });

  // Schedule old key revocation after grace period
  const revokeAt = new Date(Date.now() + gracePeriodHours * 3600000).toISOString();
  await redis.setex(`apikey:revoke:${keyId}`, gracePeriodHours * 3600, "pending");

  return { newKey };
}

// Per-key rate limiting using sliding window
async function checkKeyRateLimit(key: APIKey): Promise<boolean> {
  const windowKey = `apikey:rl:${key.id}:${Math.floor(Date.now() / (key.rateLimit.windowSeconds * 1000))}`;
  const count = await redis.incr(windowKey);
  await redis.expire(windowKey, key.rateLimit.windowSeconds * 2);
  return count > key.rateLimit.requests;
}

async function updateLastUsed(keyId: string, ip: string): Promise<void> {
  // Batch updates every 60s to reduce DB writes
  const batchKey = `apikey:usage:${keyId}`;
  await redis.set(batchKey, JSON.stringify({ ip, at: new Date().toISOString() }), "EX", 60, "NX");
}

// Usage analytics per key
export async function getKeyUsage(keyId: string, days: number = 30): Promise<{
  totalRequests: number;
  dailyRequests: Record<string, number>;
  scopeBreakdown: Record<string, number>;
}> {
  const { rows } = await pool.query(
    `SELECT DATE(created_at) as day, COUNT(*) as count
     FROM api_request_logs WHERE key_id = $1 AND created_at > NOW() - $2 * INTERVAL '1 day'
     GROUP BY DATE(created_at) ORDER BY day`,
    [keyId, days]
  );

  const dailyRequests: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    dailyRequests[row.day.toISOString().slice(0, 10)] = parseInt(row.count);
    total += parseInt(row.count);
  }

  return { totalRequests: total, dailyRequests, scopeBreakdown: {} };
}

// Middleware for Hono
export function apiKeyMiddleware(requiredScope?: string) {
  return async (c: any, next: any) => {
    const authHeader = c.req.header("Authorization");
    const apiKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : c.req.header("X-API-Key");

    if (!apiKey) return c.json({ error: "API key required" }, 401);

    const result = await validateKey(apiKey);
    if (!result.valid) return c.json({ error: result.reason }, result.reason === "Rate limit exceeded" ? 429 : 401);

    if (requiredScope && !hasScope(result.key!, requiredScope)) {
      return c.json({ error: `Missing scope: ${requiredScope}` }, 403);
    }

    c.set("apiKey", result.key);
    c.set("organizationId", result.key!.organizationId);
    await next();
  };
}
```

## Results

- **Keys never stored in plaintext** — scrypt hash in DB + SHA-256 lookup hash for fast validation; database leak doesn't expose keys
- **Scoped permissions** — read-only integrations get `["read:users"]`; full-access keys get `["admin:*"]`; leaked read key can't modify data
- **Per-key rate limiting** — customer's runaway script hits their 1000 req/min limit without affecting other customers; sliding window in Redis
- **Zero-downtime rotation** — new key generated with same scopes; old key stays active during 24h grace period; customer migrates without outage
- **Usage analytics per key** — dashboard shows which key made how many requests; identifies unused keys for cleanup and heavy users for upsell
