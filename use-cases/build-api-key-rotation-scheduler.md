---
title: Build an API Key Rotation Scheduler
slug: build-api-key-rotation-scheduler
description: Build an API key rotation scheduler with automated key generation, grace period overlap, client notification, zero-downtime rollover, and compliance tracking for secret lifecycle management.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - api-keys
  - rotation
  - security
  - automation
  - lifecycle
---

# Build an API Key Rotation Scheduler

## The Problem

Sam leads security at a 25-person API company. API keys live forever — some customers haven't rotated in 3 years. When a key leaks, there's no automated way to rotate; customer must generate a new key and update all their integrations manually (2-4 hours downtime). Compliance requires 90-day key rotation but there's no enforcement. Some keys are embedded in client mobile apps — rotating them breaks the app until a new version is deployed. They need automated rotation: schedule key rotation, generate replacement with overlap period, notify clients, track compliance, and handle graceful rollover.

## The Solution

Rotation is a two-key overlap. Starting a rotation creates a second active key with the same scopes and rate limit and returns its value once. The old key keeps working for a grace period, then a cron job revokes it. Keys are stored only as SHA-256 hashes, so the plaintext can never be re-sent later; it is shown in the API response and nowhere else. The stack uses [PostgreSQL](/skills/postgresql) for keys and rotations, [Redis](/skills/redis) for the notification queue and key cache, [Hono](/skills/hono) with [Zod](/skills/zod) for the endpoint, and [TypeScript](/skills/typescript) throughout.

## Step-by-Step Walkthrough

### Step 1: Create the tables

```sql
CREATE TABLE api_keys (
  id text PRIMARY KEY,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  organization_id text NOT NULL,
  scopes text[] NOT NULL DEFAULT '{}',
  rate_limit int NOT NULL DEFAULT 1000,
  status text NOT NULL DEFAULT 'active',  -- active | revoked
  created_at timestamptz NOT NULL DEFAULT NOW(),
  revoked_at timestamptz
);

CREATE TABLE key_rotations (
  id text PRIMARY KEY,
  key_id text NOT NULL REFERENCES api_keys(id),
  new_key_id text NOT NULL REFERENCES api_keys(id),
  status text NOT NULL,                   -- grace_period | completed
  grace_end_at timestamptz NOT NULL,
  completed_at timestamptz,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX ON key_rotations (grace_end_at) WHERE status = 'grace_period';
```

### Step 2: Rotation logic

`pg` and `ioredis` are the two drivers; install them with `npm i pg ioredis hono @hono/zod-validator zod`. The insert of the new key and the rotation row happen in one transaction, and `FOR UPDATE` stops two concurrent rotations of the same key.

```typescript
import { Pool } from "pg";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const redis = new Redis(process.env.REDIS_URL!);

// API keys are 256 random bits, so a plain SHA-256 is enough for lookup.
// (Slow hashes such as scrypt are for low-entropy passwords.)
const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");

export interface Rotation {
  id: string;
  keyId: string;
  newKeyId: string;
  graceEndAt: Date;
  reason: string;
}

/** Create the replacement key. The raw value is returned once and never stored. */
export async function startRotation(
  keyId: string,
  opts: { gracePeriodHours?: number; reason?: string } = {},
): Promise<{ rotation: Rotation; newKey: string }> {
  const grace = opts.gracePeriodHours ?? 72;
  const newKey = `sk_live_${randomBytes(32).toString("base64url")}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [old] } = await client.query(
      "SELECT name, organization_id, scopes, rate_limit FROM api_keys WHERE id = $1 AND status = 'active' FOR UPDATE",
      [keyId],
    );
    if (!old) throw new Error("Active key not found");
    const newKeyId = `key_${randomBytes(6).toString("hex")}`;
    await client.query(
      `INSERT INTO api_keys (id, name, key_hash, organization_id, scopes, rate_limit, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW())`,
      [newKeyId, `${old.name} (rotated)`, hashKey(newKey), old.organization_id, old.scopes, old.rate_limit],
    );
    const id = `rot_${randomBytes(6).toString("hex")}`;
    const reason = opts.reason ?? "Scheduled rotation";
    const { rows: [row] } = await client.query(
      `INSERT INTO key_rotations (id, key_id, new_key_id, status, grace_end_at, reason, created_at)
       VALUES ($1, $2, $3, 'grace_period', NOW() + $4 * INTERVAL '1 hour', $5, NOW())
       RETURNING grace_end_at`,
      [id, keyId, newKeyId, grace, reason],
    );
    await client.query("COMMIT");
    // Tell the customer a rotation started; the new key itself goes only to the caller.
    await redis.rpush("notification:queue", JSON.stringify({
      type: "key_rotation", organizationId: old.organization_id, rotationId: id, graceEndAt: row.grace_end_at,
    }));
    return { rotation: { id, keyId, newKeyId, graceEndAt: row.grace_end_at, reason }, newKey };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Run from cron every few minutes: revoke old keys whose grace period is over. */
export async function finishExpiredRotations(): Promise<number> {
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT id, key_id FROM key_rotations
       WHERE status = 'grace_period' AND grace_end_at <= NOW()
       FOR UPDATE SKIP LOCKED
     ), done AS (
       UPDATE key_rotations r SET status = 'completed', completed_at = NOW()
       FROM due WHERE r.id = due.id RETURNING due.key_id
     )
     UPDATE api_keys k SET status = 'revoked', revoked_at = NOW()
     FROM done WHERE k.id = done.key_id RETURNING k.key_hash`,
  );
  // Drop only the cached entries of the revoked keys.
  if (rows.length) await redis.del(...rows.map((r) => `apikey:${r.key_hash}`));
  return rows.length;
}

/** Active keys older than the compliance window (default 90 days). */
export async function overdueKeys(maxAgeDays = 90) {
  const { rows } = await pool.query(
    `SELECT id, organization_id, FLOOR(EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400)::int AS age_days
     FROM api_keys WHERE status = 'active' AND created_at < NOW() - $1 * INTERVAL '1 day'
     ORDER BY created_at`,
    [maxAgeDays],
  );
  return rows as { id: string; organization_id: string; age_days: number }[];
}
```

### Step 3: The HTTP endpoint

Zod validates the grace period, and the response is marked `no-store` so proxies never cache the new key.

```typescript
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { startRotation } from "./rotation";

const app = new Hono();

const body = z.object({
  gracePeriodHours: z.number().int().min(1).max(24 * 30).default(72),
  reason: z.string().max(200).optional(),
});

app.post("/keys/:id/rotate", zValidator("json", body), async (c) => {
  // Add your own auth middleware: the caller must own this key's organization.
  const { gracePeriodHours, reason } = c.req.valid("json");
  const { rotation, newKey } = await startRotation(c.req.param("id"), { gracePeriodHours, reason });
  c.header("Cache-Control", "no-store");
  return c.json({ rotation, newKey }, 201); // newKey is shown exactly once
});

// Emergency: leaked key, 4-hour overlap (same auth middleware as above)
app.post("/keys/:id/emergency-rotate", async (c) => {
  const { rotation, newKey } = await startRotation(c.req.param("id"), { gracePeriodHours: 4, reason: "EMERGENCY: suspected leak" });
  c.header("Cache-Control", "no-store");
  return c.json({ rotation, newKey }, 201);
});

export default app;
```

### Step 4: Run the scheduler

Call `finishExpiredRotations()` from a cron job or a worker timer every few minutes. Call `overdueKeys(90)` daily and either email the owners or call `startRotation` for each result. Your auth middleware should read `apikey:<hash>` from Redis before Postgres; that is the cache entry the scheduler deletes on revocation, so set a short TTL (for example 5 minutes) on it as a second safety net.

## Real-World Example

Sam leads security at a 25-person API company. Some customer keys are three years old, and compliance wants 90-day rotation. Sam deploys the endpoint and the cron job. The nightly `overdueKeys(90)` report goes to the customers' account owners, who rotate from the dashboard: the new key appears once, the old one keeps working for 72 hours, and the cron job revokes it afterwards. When a key leaks in a public repository, support calls the emergency endpoint, hands the customer the new key and the old one dies four hours later. The `key_rotations` table gives auditors a per-key history of reasons and dates.

Mobile apps that embed a key still need a release to pick up a new one. For them, set a longer `gracePeriodHours` (up to 30 days here) and plan the rotation around the app release cycle, or move the secret out of the app to a backend.

## Related Skills

- [typescript](/skills/typescript) - typed rotation code
- [redis](/skills/redis) - notification queue and key cache
- [postgresql](/skills/postgresql) - key and rotation tables
- [hono](/skills/hono) - the rotation endpoint
- [zod](/skills/zod) - request validation
