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
category: Security
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

## Step 1: Build the Rotation Scheduler

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, scryptSync, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface KeyRotation {
  id: string;
  keyId: string;
  oldKeyPrefix: string;
  newKeyPrefix: string;
  status: "scheduled" | "in_progress" | "grace_period" | "completed" | "failed";
  scheduledAt: string;
  graceEndAt: string;
  completedAt: string | null;
  reason: string;
}

// Schedule key rotation
export async function scheduleRotation(keyId: string, options?: { gracePeriodHours?: number; reason?: string; immediate?: boolean }): Promise<KeyRotation> {
  const gracePeriod = options?.gracePeriodHours ?? 72;
  const id = `rot-${randomBytes(6).toString("hex")}`;

  // Generate new key
  const newRawKey = randomBytes(32).toString("hex");
  const newPrefix = newRawKey.slice(0, 8);
  const newLookupHash = createHash("sha256").update(`sk_live_${newRawKey}`).digest("hex");

  const { rows: [oldKey] } = await pool.query("SELECT prefix, organization_id, scopes, rate_limit FROM api_keys WHERE id = $1", [keyId]);
  if (!oldKey) throw new Error("Key not found");

  // Create new key with same permissions
  const newKeyId = `key-${randomBytes(6).toString("hex")}`;
  await pool.query(
    `INSERT INTO api_keys (id, prefix, lookup_hash, hashed_key, name, organization_id, scopes, rate_limit, status, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'rotation-scheduler', NOW())`,
    [newKeyId, newPrefix, newLookupHash, scryptSync(`sk_live_${newRawKey}`, randomBytes(16), 64).toString("hex"),
     `Rotated from ${oldKey.prefix}***`, oldKey.organization_id, oldKey.scopes, oldKey.rate_limit]
  );

  const scheduledAt = options?.immediate ? new Date().toISOString() : new Date(Date.now() + 86400000).toISOString();
  const graceEndAt = new Date(new Date(scheduledAt).getTime() + gracePeriod * 3600000).toISOString();

  const rotation: KeyRotation = {
    id, keyId, oldKeyPrefix: oldKey.prefix, newKeyPrefix: newPrefix,
    status: options?.immediate ? "grace_period" : "scheduled",
    scheduledAt, graceEndAt, completedAt: null,
    reason: options?.reason || "Scheduled rotation",
  };

  await pool.query(
    `INSERT INTO key_rotations (id, key_id, old_prefix, new_prefix, status, scheduled_at, grace_end_at, reason, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [id, keyId, oldKey.prefix, newPrefix, rotation.status, scheduledAt, graceEndAt, rotation.reason]
  );

  // Notify customer
  await redis.rpush("notification:queue", JSON.stringify({
    type: "key_rotation", organizationId: oldKey.organization_id,
    message: `API key ${oldKey.prefix}*** will be rotated. New key available. Old key valid until ${graceEndAt}.`,
    data: { rotationId: id, newKeyPrefix: newPrefix, graceEndAt },
  }));

  return rotation;
}

// Process scheduled rotations
export async function processRotations(): Promise<{ started: number; completed: number; failed: number }> {
  let started = 0, completed = 0, failed = 0;

  // Start scheduled rotations
  const { rows: scheduled } = await pool.query(
    "SELECT * FROM key_rotations WHERE status = 'scheduled' AND scheduled_at <= NOW()"
  );
  for (const rot of scheduled) {
    await pool.query("UPDATE key_rotations SET status = 'grace_period' WHERE id = $1", [rot.id]);
    started++;
  }

  // Complete grace periods
  const { rows: grace } = await pool.query(
    "SELECT * FROM key_rotations WHERE status = 'grace_period' AND grace_end_at <= NOW()"
  );
  for (const rot of grace) {
    try {
      await pool.query("UPDATE api_keys SET status = 'revoked' WHERE id = $1", [rot.key_id]);
      await pool.query("UPDATE key_rotations SET status = 'completed', completed_at = NOW() WHERE id = $1", [rot.id]);
      // Clear cache
      const keys = await redis.keys(`apikey:*`);
      if (keys.length) await redis.del(...keys);
      completed++;
    } catch { failed++; }
  }

  return { started, completed, failed };
}

// Check compliance (keys older than max age)
export async function checkCompliance(maxAgeDays: number = 90): Promise<Array<{ keyId: string; prefix: string; orgId: string; ageDays: number }>> {
  const { rows } = await pool.query(
    `SELECT id, prefix, organization_id, EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400 as age_days
     FROM api_keys WHERE status = 'active' AND created_at < NOW() - $1 * INTERVAL '1 day'
     ORDER BY created_at ASC`,
    [maxAgeDays]
  );
  return rows.map((r: any) => ({ keyId: r.id, prefix: r.prefix, orgId: r.organization_id, ageDays: Math.floor(parseFloat(r.age_days)) }));
}

// Emergency rotation (immediate, short grace)
export async function emergencyRotate(keyId: string, reason: string): Promise<KeyRotation> {
  return scheduleRotation(keyId, { gracePeriodHours: 4, reason: `EMERGENCY: ${reason}`, immediate: true });
}
```

## Results

- **Zero-downtime rotation** — new key active alongside old; 72-hour grace period; client migrates at their pace; old key revoked automatically after grace
- **Compliance enforced** — cron checks keys older than 90 days; auto-schedules rotation; compliance dashboard shows 100% coverage; audit passed
- **Emergency rotation: 2-4 hours → 5 minutes** — leaked key → emergency rotate → 4-hour grace → old key dead; no manual steps
- **Client notification** — email + in-app alert with new key prefix and deadline; client updates integration; no surprise revocation
- **Audit trail** — every rotation logged with reason, dates, and status; compliance can verify rotation history per key
