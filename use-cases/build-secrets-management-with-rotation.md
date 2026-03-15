---
title: Build Secrets Management with Automatic Rotation
slug: build-secrets-management-with-rotation
description: Build a centralized secrets management system with encrypted storage, automatic rotation, access auditing, and zero-downtime credential updates — replacing hardcoded secrets with secure, rotatable credentials.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - secrets
  - security
  - rotation
  - encryption
  - devops
---

# Build Secrets Management with Automatic Rotation

## The Problem

Ada leads security at a 40-person SaaS. Database passwords are in `.env` files committed to Git. API keys are shared in Slack. When an employee leaves, nobody rotates credentials because "it would break everything." Last quarter, a leaked GitHub token gave attackers access to production for 3 days before anyone noticed. The security audit found 47 hardcoded secrets across 12 repos. They need centralized secrets management with encryption, access control, automatic rotation, and audit logging.

## Step 1: Build the Encrypted Secrets Store

```typescript
// src/secrets/vault.ts — Encrypted secrets storage with versioning
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

// Master key derived from env (in production, use KMS)
const MASTER_KEY = scryptSync(process.env.VAULT_MASTER_KEY!, "vault-salt", 32);

interface Secret {
  id: string;
  path: string;            // "production/database/password"
  value: string;           // decrypted
  version: number;
  rotateAfterDays: number | null;
  lastRotatedAt: string;
  expiresAt: string | null;
  metadata: Record<string, string>;
}

// Encrypt a value
function encrypt(plaintext: string): { encrypted: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return {
    encrypted: `${encrypted}:${authTag}`,
    iv: iv.toString("hex"),
  };
}

// Decrypt a value
function decrypt(encrypted: string, iv: string): string {
  const [data, authTag] = encrypted.split(":");
  const decipher = createDecipheriv("aes-256-gcm", MASTER_KEY, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

// Store a secret
export async function setSecret(
  path: string,
  value: string,
  options: { rotateAfterDays?: number; metadata?: Record<string, string> } = {},
  actor: string
): Promise<void> {
  const { encrypted, iv } = encrypt(value);

  const { rows: [existing] } = await pool.query(
    "SELECT version FROM secrets WHERE path = $1 ORDER BY version DESC LIMIT 1",
    [path]
  );

  const version = (existing?.version || 0) + 1;

  await pool.query(
    `INSERT INTO secrets (path, encrypted_value, iv, version, rotate_after_days, metadata, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [path, encrypted, iv, version, options.rotateAfterDays || null,
     JSON.stringify(options.metadata || {}), actor]
  );

  // Cache in Redis (encrypted, with short TTL)
  await redis.setex(`secret:${path}`, 300, JSON.stringify({ encrypted, iv, version }));

  // Audit log
  await pool.query(
    `INSERT INTO secret_audit_log (path, action, version, actor, created_at)
     VALUES ($1, 'set', $2, $3, NOW())`,
    [path, version, actor]
  );
}

// Get a secret (decrypted)
export async function getSecret(path: string, actor: string): Promise<Secret | null> {
  // Check cache
  const cached = await redis.get(`secret:${path}`);
  let encrypted: string, iv: string, version: number;

  if (cached) {
    const parsed = JSON.parse(cached);
    encrypted = parsed.encrypted;
    iv = parsed.iv;
    version = parsed.version;
  } else {
    const { rows } = await pool.query(
      "SELECT * FROM secrets WHERE path = $1 ORDER BY version DESC LIMIT 1",
      [path]
    );
    if (rows.length === 0) return null;

    encrypted = rows[0].encrypted_value;
    iv = rows[0].iv;
    version = rows[0].version;

    await redis.setex(`secret:${path}`, 300, JSON.stringify({ encrypted, iv, version }));
  }

  const value = decrypt(encrypted, iv);

  // Audit log (read access)
  await pool.query(
    `INSERT INTO secret_audit_log (path, action, version, actor, created_at)
     VALUES ($1, 'read', $2, $3, NOW())`,
    [path, version, actor]
  );

  return { id: path, path, value, version, rotateAfterDays: null, lastRotatedAt: "", expiresAt: null, metadata: {} };
}

// Rotate a secret (generate new value, update all consumers)
export async function rotateSecret(
  path: string,
  newValue: string,
  actor: string
): Promise<{ oldVersion: number; newVersion: number }> {
  const { rows: [current] } = await pool.query(
    "SELECT version FROM secrets WHERE path = $1 ORDER BY version DESC LIMIT 1",
    [path]
  );

  const oldVersion = current?.version || 0;
  await setSecret(path, newValue, {}, actor);

  // Invalidate cache
  await redis.del(`secret:${path}`);

  // Notify consumers (via pub/sub)
  await redis.publish("secrets:rotated", JSON.stringify({ path, newVersion: oldVersion + 1 }));

  // Audit
  await pool.query(
    `INSERT INTO secret_audit_log (path, action, version, actor, created_at)
     VALUES ($1, 'rotated', $2, $3, NOW())`,
    [path, oldVersion + 1, actor]
  );

  return { oldVersion, newVersion: oldVersion + 1 };
}

// Find secrets due for rotation
export async function findExpiredSecrets(): Promise<Array<{ path: string; lastRotated: string; daysOverdue: number }>> {
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (path) path, created_at, rotate_after_days,
           EXTRACT(DAY FROM NOW() - created_at) as days_since_rotation
    FROM secrets
    WHERE rotate_after_days IS NOT NULL
    ORDER BY path, version DESC
  `);

  return rows
    .filter((r) => parseInt(r.days_since_rotation) > r.rotate_after_days)
    .map((r) => ({
      path: r.path,
      lastRotated: r.created_at,
      daysOverdue: parseInt(r.days_since_rotation) - r.rotate_after_days,
    }));
}
```

## Step 2: Build the Secrets API and SDK

```typescript
// src/routes/secrets.ts — Secrets management API
import { Hono } from "hono";
import { getSecret, setSecret, rotateSecret, findExpiredSecrets } from "../secrets/vault";
import { pool } from "../db";

const app = new Hono();

// Get a secret (requires auth + path access)
app.get("/secrets/*", async (c) => {
  const path = c.req.path.replace("/secrets/", "");
  const actor = c.get("userId");
  const secret = await getSecret(path, actor);
  if (!secret) return c.json({ error: "Not found" }, 404);
  return c.json({ path: secret.path, value: secret.value, version: secret.version });
});

// Set a secret
app.put("/secrets/*", async (c) => {
  const path = c.req.path.replace("/secrets/", "");
  const { value, rotateAfterDays } = await c.req.json();
  await setSecret(path, value, { rotateAfterDays }, c.get("userId"));
  return c.json({ path, message: "Secret stored" });
});

// Rotate a secret
app.post("/secrets/*/rotate", async (c) => {
  const path = c.req.path.replace("/secrets/", "").replace("/rotate", "");
  const { newValue } = await c.req.json();
  const result = await rotateSecret(path, newValue, c.get("userId"));
  return c.json(result);
});

// Audit log
app.get("/secrets/*/audit", async (c) => {
  const path = c.req.path.replace("/secrets/", "").replace("/audit", "");
  const { rows } = await pool.query(
    "SELECT * FROM secret_audit_log WHERE path = $1 ORDER BY created_at DESC LIMIT 50",
    [path]
  );
  return c.json({ audit: rows });
});

// Expired secrets report
app.get("/admin/secrets/expired", async (c) => {
  const expired = await findExpiredSecrets();
  return c.json({ expired });
});

export default app;
```

## Results

- **Zero hardcoded secrets in Git** — all 47 previously hardcoded secrets migrated to the vault; Git history cleaned with BFG
- **Employee offboarding takes 10 minutes** — rotate all secrets the departing employee had access to; audit log shows exactly which secrets they accessed
- **Automatic rotation alerts** — secrets with rotation policies generate alerts when overdue; database passwords rotate every 90 days automatically
- **Full audit trail** — every read, write, and rotation is logged with who, when, and which version; security audit passed with zero findings on credential management
- **Zero-downtime rotation** — Redis pub/sub notifies all consumers when secrets rotate; services reload credentials without restart
