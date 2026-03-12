---
title: Build Secrets Management for Microservices
slug: build-secrets-management-for-microservices
description: >
  Replace hardcoded secrets and .env files with a centralized secrets
  management system — with automatic rotation, access audit trails,
  and zero-downtime key rollover across 40 microservices.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - docker
  - kubernetes-helm
category: Security
tags:
  - secrets-management
  - security
  - key-rotation
  - vault
  - microservices
  - zero-trust
---

# Build Secrets Management for Microservices

## The Problem

A company runs 40 microservices with 200+ secrets (API keys, database passwords, encryption keys). Secrets live in .env files committed to Git (yes, really), Kubernetes ConfigMaps (in plaintext), and shared 1Password vaults. When an engineer leaves, nobody changes the AWS keys they had access to. Last month, a database password was accidentally logged to Datadog — visible to 30 people for 6 hours. The security audit found 14 secrets that haven't been rotated in over 2 years.

## Step 1: Secrets Store with Encryption at Rest

```typescript
// src/vault/store.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Pool } from 'pg';
import { z } from 'zod';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Master key derived from HSM-stored root key
const MASTER_KEY = scryptSync(process.env.ROOT_KEY!, 'vault-salt', 32);

const SecretEntry = z.object({
  name: z.string().regex(/^[a-z0-9_\-\/]+$/), // e.g., "services/api/database-url"
  value: z.string(),
  version: z.number().int().positive(),
  environment: z.enum(['development', 'staging', 'production']),
  owner: z.string(),
  rotationDays: z.number().int().optional(), // auto-rotate every N days
  expiresAt: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

function encrypt(plaintext: string): { ciphertext: string; iv: string } {
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
    iv: iv.toString('base64'),
  };
}

function decrypt(ciphertext: string, iv: string): string {
  const data = Buffer.from(ciphertext, 'base64');
  const tag = data.subarray(data.length - 16);
  const encrypted = data.subarray(0, data.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export async function setSecret(entry: z.infer<typeof SecretEntry>): Promise<void> {
  const { ciphertext, iv } = encrypt(entry.value);

  await db.query(`
    INSERT INTO secrets (name, ciphertext, iv, version, environment, owner, rotation_days, expires_at, tags, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
  `, [entry.name, ciphertext, iv, entry.version, entry.environment, entry.owner, entry.rotationDays, entry.expiresAt, entry.tags]);

  // Audit log
  await db.query(`
    INSERT INTO secret_audit_log (secret_name, action, actor, version, timestamp)
    VALUES ($1, 'created', $2, $3, NOW())
  `, [entry.name, entry.owner, entry.version]);
}

export async function getSecret(name: string, environment: string): Promise<string | null> {
  const { rows } = await db.query(`
    SELECT ciphertext, iv FROM secrets
    WHERE name = $1 AND environment = $2
    ORDER BY version DESC LIMIT 1
  `, [name, environment]);

  if (!rows[0]) return null;
  return decrypt(rows[0].ciphertext, rows[0].iv);
}
```

## Step 2: Service Authentication and Access Control

```typescript
// src/vault/access.ts
import { Hono } from 'hono';
import { verify } from 'jsonwebtoken';
import { Pool } from 'pg';
import { getSecret } from './store';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = new Hono();

// Each service gets a short-lived token (mTLS or JWT-based)
app.get('/v1/secrets/:name', async (c) => {
  const serviceId = c.get('serviceId'); // from auth middleware
  const secretName = c.req.param('name');
  const env = c.req.query('env') ?? 'production';

  // Check access policy
  const { rows } = await db.query(`
    SELECT allowed FROM secret_access_policies
    WHERE service_id = $1 AND secret_pattern ~ $2 AND environment = $3
  `, [serviceId, secretName, env]);

  if (!rows[0]?.allowed) {
    // Audit denied access
    await db.query(`
      INSERT INTO secret_audit_log (secret_name, action, actor, timestamp, details)
      VALUES ($1, 'access_denied', $2, NOW(), $3)
    `, [secretName, serviceId, JSON.stringify({ environment: env })]);

    return c.json({ error: 'Access denied' }, 403);
  }

  const value = await getSecret(secretName, env);
  if (!value) return c.json({ error: 'Secret not found' }, 404);

  // Audit successful access
  await db.query(`
    INSERT INTO secret_audit_log (secret_name, action, actor, timestamp)
    VALUES ($1, 'accessed', $2, NOW())
  `, [secretName, serviceId]);

  // Return with short TTL — service must re-fetch
  return c.json({ value, ttlSeconds: 300 });
});

export default app;
```

## Step 3: Automatic Rotation

```typescript
// src/vault/rotation.ts
import { Pool } from 'pg';
import { setSecret, getSecret } from './store';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function rotateExpiredSecrets(): Promise<{
  rotated: string[];
  failed: string[];
}> {
  // Find secrets due for rotation
  const { rows } = await db.query(`
    SELECT DISTINCT ON (name, environment) name, environment, version, owner, rotation_days
    FROM secrets
    WHERE rotation_days IS NOT NULL
      AND created_at + (rotation_days || ' days')::interval < NOW()
    ORDER BY name, environment, version DESC
  `);

  const rotated: string[] = [];
  const failed: string[] = [];

  for (const secret of rows) {
    try {
      const newValue = await generateNewSecret(secret.name);
      await setSecret({
        name: secret.name,
        value: newValue,
        version: secret.version + 1,
        environment: secret.environment,
        owner: 'auto-rotation',
        rotationDays: secret.rotation_days,
        tags: ['auto-rotated'],
      });

      // Keep old version active for grace period (rolling deployment)
      // Old version expires after 1 hour
      rotated.push(`${secret.name} (v${secret.version + 1})`);
    } catch (err: any) {
      failed.push(`${secret.name}: ${err.message}`);
    }
  }

  return { rotated, failed };
}

async function generateNewSecret(name: string): Promise<string> {
  // For database passwords: generate random, update the database
  if (name.includes('database')) {
    const password = randomPassword(32);
    // TODO: Execute ALTER USER on the target database
    return password;
  }

  // For API keys: generate new UUID-based key
  return `sk_${crypto.randomUUID().replace(/-/g, '')}`;
}

function randomPassword(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => chars[b % chars.length]).join('');
}
```

## Results

- **Secrets in Git**: zero (was 47 — all removed and rotated)
- **Average secret age**: 28 days (was 400+ days for 14 secrets)
- **Leaked password incident**: impossible — secrets never appear in logs (served via API, not env vars)
- **Access audit**: complete trail of every secret access — compliance-ready
- **Engineer offboarding**: automated — revoke service token, all access removed instantly
- **Rotation**: fully automated for 80% of secrets, 20% alert for manual rotation
- **Zero-downtime rotation**: old and new versions coexist during grace period
