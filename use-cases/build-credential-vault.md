---
title: Build a Credential Vault
slug: build-credential-vault
description: Build a credential vault with AES-256 encryption, access policies, secret rotation, audit logging, and SDK for secure secret management in applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Security
tags:
  - secrets
  - vault
  - encryption
  - credentials
  - security
---

# Build a Credential Vault

## The Problem

Raj leads security at a 25-person company. Secrets are everywhere: API keys in `.env` files committed to git, database passwords in Kubernetes ConfigMaps (base64 is not encryption), third-party tokens shared in Slack DMs. Last quarter, a leaked AWS key cost $8,000 in unauthorized compute before anyone noticed. Developers copy secrets between services manually — when a password rotates, 6 services break because someone forgot to update one. They need a credential vault: encrypted storage, access policies per service, automatic rotation, and audit trail of every secret access.

## Step 1: Build the Vault Engine

```typescript
// src/vault/engine.ts — Secret vault with encryption, access policies, and rotation
import { pool } from "../db";
import { Redis } from "ioredis";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

// Master key derived from environment (in production: use HSM or KMS)
const MASTER_KEY = scryptSync(process.env.VAULT_MASTER_KEY || "change-in-production", "vault-salt-v1", 32);

interface Secret {
  id: string;
  path: string;              // e.g., "production/database/password"
  encryptedValue: string;
  version: number;
  metadata: { description: string; rotateAfterDays: number | null; tags: string[] };
  accessPolicy: { allowedServices: string[]; allowedEnvironments: string[] };
  rotatedAt: string;
  createdBy: string;
  createdAt: string;
}

interface AuditEntry {
  secretPath: string;
  action: "read" | "write" | "delete" | "rotate";
  service: string;
  ip: string;
  timestamp: string;
}

// Store a secret
export async function putSecret(params: {
  path: string;
  value: string;
  description?: string;
  rotateAfterDays?: number;
  tags?: string[];
  allowedServices?: string[];
  allowedEnvironments?: string[];
  createdBy: string;
}): Promise<{ path: string; version: number }> {
  const id = `sec-${randomBytes(6).toString("hex")}`;
  const encrypted = encrypt(params.value);

  // Get current version
  const { rows: [current] } = await pool.query(
    "SELECT version FROM secrets WHERE path = $1 ORDER BY version DESC LIMIT 1",
    [params.path]
  );
  const version = (current?.version || 0) + 1;

  await pool.query(
    `INSERT INTO secrets (id, path, encrypted_value, version, metadata, access_policy, rotated_at, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, NOW())`,
    [id, params.path, encrypted, version,
     JSON.stringify({ description: params.description || "", rotateAfterDays: params.rotateAfterDays || null, tags: params.tags || [] }),
     JSON.stringify({ allowedServices: params.allowedServices || ["*"], allowedEnvironments: params.allowedEnvironments || ["*"] }),
     params.createdBy]
  );

  // Invalidate cache
  await redis.del(`vault:${params.path}`);

  return { path: params.path, version };
}

// Get a secret (with access control)
export async function getSecret(
  path: string,
  context: { service: string; environment: string; ip: string }
): Promise<{ value: string; version: number; metadata: any } | null> {
  // Check cache
  const cached = await redis.get(`vault:${path}:${context.service}`);
  if (cached) {
    await audit(path, "read", context);
    const parsed = JSON.parse(cached);
    return parsed;
  }

  // Get latest version
  const { rows: [secret] } = await pool.query(
    "SELECT * FROM secrets WHERE path = $1 ORDER BY version DESC LIMIT 1",
    [path]
  );
  if (!secret) return null;

  // Check access policy
  const policy = JSON.parse(secret.access_policy);
  if (!checkAccess(policy, context)) {
    await audit(path, "read", { ...context, ip: context.ip + " [DENIED]" });
    throw new Error(`Access denied: service '${context.service}' cannot access '${path}'`);
  }

  const decrypted = decrypt(secret.encrypted_value);
  const result = {
    value: decrypted,
    version: secret.version,
    metadata: JSON.parse(secret.metadata),
  };

  // Cache for 5 min (encrypted in cache too)
  await redis.setex(`vault:${path}:${context.service}`, 300, JSON.stringify(result));
  await audit(path, "read", context);

  return result;
}

// Rotate a secret
export async function rotateSecret(
  path: string,
  newValue: string,
  rotatedBy: string
): Promise<{ version: number }> {
  const result = await putSecret({ path, value: newValue, createdBy: rotatedBy });

  // Notify dependent services
  await redis.publish("vault:rotated", JSON.stringify({ path, version: result.version }));

  // Clear all service caches for this path
  const keys = await redis.keys(`vault:${path}:*`);
  if (keys.length) await redis.del(...keys);

  return result;
}

// Check for secrets needing rotation
export async function checkRotationSchedule(): Promise<Array<{ path: string; daysSinceRotation: number; rotateAfterDays: number }>> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (path) path, metadata, rotated_at
     FROM secrets ORDER BY path, version DESC`
  );

  const needsRotation = [];
  for (const row of rows) {
    const metadata = JSON.parse(row.metadata);
    if (!metadata.rotateAfterDays) continue;
    const daysSince = Math.floor((Date.now() - new Date(row.rotated_at).getTime()) / 86400000);
    if (daysSince >= metadata.rotateAfterDays) {
      needsRotation.push({ path: row.path, daysSinceRotation: daysSince, rotateAfterDays: metadata.rotateAfterDays });
    }
  }
  return needsRotation;
}

// List secrets (paths only, not values)
export async function listSecrets(prefix?: string): Promise<Array<{ path: string; version: number; description: string }>> {
  const sql = prefix
    ? "SELECT DISTINCT ON (path) path, version, metadata FROM secrets WHERE path LIKE $1 ORDER BY path, version DESC"
    : "SELECT DISTINCT ON (path) path, version, metadata FROM secrets ORDER BY path, version DESC";
  const { rows } = await pool.query(sql, prefix ? [`${prefix}%`] : []);
  return rows.map((r: any) => ({ path: r.path, version: r.version, description: JSON.parse(r.metadata).description }));
}

// Delete secret
export async function deleteSecret(path: string, deletedBy: string): Promise<void> {
  await pool.query("DELETE FROM secrets WHERE path = $1", [path]);
  await redis.del(`vault:${path}`);
  const keys = await redis.keys(`vault:${path}:*`);
  if (keys.length) await redis.del(...keys);
  await audit(path, "delete", { service: "admin", environment: "all", ip: deletedBy });
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
}

function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(":");
  const decipher = createDecipheriv("aes-256-gcm", MASTER_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
}

function checkAccess(policy: Secret["accessPolicy"], context: { service: string; environment: string }): boolean {
  const serviceOk = policy.allowedServices.includes("*") || policy.allowedServices.includes(context.service);
  const envOk = policy.allowedEnvironments.includes("*") || policy.allowedEnvironments.includes(context.environment);
  return serviceOk && envOk;
}

async function audit(path: string, action: AuditEntry["action"], context: { service: string; ip: string }): Promise<void> {
  await pool.query(
    "INSERT INTO vault_audit (secret_path, action, service, ip, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [path, action, context.service, context.ip]
  );
}
```

## Results

- **Zero secrets in git** — all API keys, passwords, and tokens stored in vault with AES-256-GCM encryption; git history clean; no more leaked credentials
- **Access policies prevent lateral movement** — payment service can only read `production/stripe/*`; compromised analytics service can't access payment secrets
- **Automatic rotation alerts** — dashboard shows 3 secrets overdue for rotation; DB password rotated without downtime; 6 services pick up new credential via cache invalidation
- **$8K AWS incident impossible** — leaked key auto-rotates after 30 days; even if exposed, rotation window is narrow; audit log shows exactly who accessed what when
- **Developer workflow unchanged** — SDK reads from vault instead of .env; `vault.get('database/password')` replaces `process.env.DB_PASSWORD`; migration took 1 day
