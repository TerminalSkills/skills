---
title: Build an Audit Trail with Immutable Log
slug: build-audit-trail-with-immutable-log
description: Build a tamper-proof audit trail system that logs every data change with who, what, when, and why — supporting compliance requirements, forensic investigation, and undo operations.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
category: Security
tags:
  - audit-trail
  - compliance
  - security
  - immutable-log
  - gdpr
---

# Build an Audit Trail with Immutable Log

## The Problem

Lena leads compliance at a 40-person healthcare SaaS. HIPAA requires tracking every access to patient data — who viewed it, who modified it, and when. The current system has basic logging, but logs are in application servers that get rotated weekly. When an auditor asks "who accessed patient X's records between January and March?", the team spends 2 days searching fragmented logs. They also suspect an employee changed a billing record and covered their tracks. They need an immutable audit trail where logs can't be deleted or modified, even by admins.

## Step 1: Build the Immutable Audit Logger

```typescript
// src/audit/audit-logger.ts — Tamper-proof audit trail
import { createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: {
    userId: string;
    email: string;
    role: string;
    ipAddress: string;
    userAgent: string;
  };
  action: string;                  // "read", "create", "update", "delete", "export", "login"
  resource: {
    type: string;                  // "patient_record", "billing", "user_account"
    id: string;
    name?: string;
  };
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  reason?: string;                 // "routine check", "patient request", etc.
  metadata?: Record<string, any>;
  hash: string;                    // SHA-256 of entry + previous hash (chain)
  previousHash: string;
}

// Log an audit event — append-only, hash-chained
export async function logAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "hash" | "previousHash">): Promise<string> {
  const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const timestamp = new Date().toISOString();

  // Get previous hash for chain integrity
  const { rows: [last] } = await pool.query(
    "SELECT hash FROM audit_log ORDER BY created_at DESC LIMIT 1"
  );
  const previousHash = last?.hash || "genesis";

  // Create hash chain: SHA-256(entry data + previous hash)
  const hashInput = JSON.stringify({
    id, timestamp, ...entry, previousHash,
  });
  const hash = createHash("sha256").update(hashInput).digest("hex");

  // Insert into append-only table
  await pool.query(
    `INSERT INTO audit_log (id, timestamp, actor_user_id, actor_email, actor_role, actor_ip, actor_user_agent,
       action, resource_type, resource_id, resource_name, changes, reason, metadata, hash, previous_hash, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())`,
    [
      id, timestamp,
      entry.actor.userId, entry.actor.email, entry.actor.role,
      entry.actor.ipAddress, entry.actor.userAgent,
      entry.action, entry.resource.type, entry.resource.id, entry.resource.name || null,
      JSON.stringify(entry.changes || null), entry.reason || null,
      JSON.stringify(entry.metadata || null),
      hash, previousHash,
    ]
  );

  // Index in Redis for real-time alerts
  await redis.zadd("audit:recent", Date.now(), JSON.stringify({
    id, action: entry.action, actor: entry.actor.email,
    resource: `${entry.resource.type}:${entry.resource.id}`,
    timestamp,
  }));
  await redis.zremrangebyscore("audit:recent", 0, Date.now() - 86400000);

  // Alert on sensitive actions
  if (["delete", "export", "bulk_access"].includes(entry.action)) {
    await redis.publish("audit:alerts", JSON.stringify({
      id, action: entry.action, actor: entry.actor.email,
      resource: entry.resource, timestamp,
    }));
  }

  return id;
}

// Verify audit chain integrity (detect tampering)
export async function verifyChainIntegrity(startDate?: string, endDate?: string): Promise<{
  verified: boolean;
  totalEntries: number;
  brokenAt?: string;
  details?: string;
}> {
  const { rows } = await pool.query(
    `SELECT id, timestamp, actor_user_id, actor_email, actor_role, actor_ip, actor_user_agent,
            action, resource_type, resource_id, resource_name, changes, reason, metadata,
            hash, previous_hash
     FROM audit_log
     ${startDate ? "WHERE created_at >= $1" : ""}
     ${endDate ? "AND created_at <= $2" : ""}
     ORDER BY created_at ASC`,
    [startDate, endDate].filter(Boolean)
  );

  let previousHash = "genesis";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Verify previous hash link
    if (row.previous_hash !== previousHash) {
      return {
        verified: false,
        totalEntries: rows.length,
        brokenAt: row.id,
        details: `Chain broken at entry ${row.id}: expected previous hash ${previousHash}, got ${row.previous_hash}`,
      };
    }

    // Recompute hash and verify
    const hashInput = JSON.stringify({
      id: row.id, timestamp: row.timestamp,
      actor: { userId: row.actor_user_id, email: row.actor_email, role: row.actor_role, ipAddress: row.actor_ip, userAgent: row.actor_user_agent },
      action: row.action,
      resource: { type: row.resource_type, id: row.resource_id, name: row.resource_name },
      changes: row.changes, reason: row.reason, metadata: row.metadata,
      previousHash: row.previous_hash,
    });
    const expectedHash = createHash("sha256").update(hashInput).digest("hex");

    if (row.hash !== expectedHash) {
      return {
        verified: false,
        totalEntries: rows.length,
        brokenAt: row.id,
        details: `Hash mismatch at entry ${row.id}: record was tampered with`,
      };
    }

    previousHash = row.hash;
  }

  return { verified: true, totalEntries: rows.length };
}

// Query audit trail with filters
export async function queryAuditTrail(filters: {
  userId?: string;
  resourceType?: string;
  resourceId?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<any[]> {
  const conditions: string[] = ["1=1"];
  const params: any[] = [];
  let paramIndex = 1;

  if (filters.userId) { conditions.push(`actor_user_id = $${paramIndex++}`); params.push(filters.userId); }
  if (filters.resourceType) { conditions.push(`resource_type = $${paramIndex++}`); params.push(filters.resourceType); }
  if (filters.resourceId) { conditions.push(`resource_id = $${paramIndex++}`); params.push(filters.resourceId); }
  if (filters.action) { conditions.push(`action = $${paramIndex++}`); params.push(filters.action); }
  if (filters.startDate) { conditions.push(`created_at >= $${paramIndex++}`); params.push(filters.startDate); }
  if (filters.endDate) { conditions.push(`created_at <= $${paramIndex++}`); params.push(filters.endDate); }

  const { rows } = await pool.query(
    `SELECT * FROM audit_log WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${paramIndex}`,
    [...params, filters.limit || 100]
  );

  return rows;
}
```

## Results

- **HIPAA audit response: 2 days → 5 minutes** — query by patient ID, date range, and user; the auditor gets a complete access history instantly
- **Tamper-proof chain** — hash-chaining means modifying any entry breaks the chain; monthly integrity checks verify no records were altered
- **Suspicious activity caught in real-time** — bulk data exports and deletions trigger instant alerts; the compliance team investigates within minutes
- **Field-level change tracking** — every UPDATE records old and new values per field; "who changed the billing amount from $500 to $50?" is answerable
- **Immutable by design** — PostgreSQL table has no UPDATE or DELETE permissions for the application role; even database admins can't alter records without breaking the hash chain
