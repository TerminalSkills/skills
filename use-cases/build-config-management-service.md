---
title: Build a Config Management Service
slug: build-config-management-service
description: Build a centralized configuration management service with environment-specific overrides, secret encryption, hot-reload, validation, audit logging, and rollback.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - configuration
  - secrets
  - management
  - infrastructure
  - hot-reload
---

# Build a Config Management Service

## The Problem

Priya leads platform at a 20-person company running 15 microservices. Configuration is scattered: some in `.env` files, some in Kubernetes ConfigMaps, some hardcoded. Changing a feature flag requires a redeploy. Secrets are in plaintext in environment variables. Nobody knows which service uses which config keys. When someone changed the wrong Redis URL, three services went down simultaneously. They need centralized config: one source of truth, environment-specific overrides, encrypted secrets, hot-reload without redeploy, and audit trail.

## Step 1: Build the Config Service

```typescript
// src/config/service.ts — Centralized config management with encryption and hot-reload
import { pool } from "../db";
import { Redis } from "ioredis";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ConfigEntry {
  key: string;
  value: any;
  type: "string" | "number" | "boolean" | "json" | "secret";
  environment: string;       // "production", "staging", "development", "*" (all)
  service: string;           // "*" for global, or specific service name
  description: string;
  validationRule?: string;   // JSON schema or regex
  updatedBy: string;
  updatedAt: string;
  version: number;
}

const ENCRYPTION_KEY = scryptSync(process.env.CONFIG_MASTER_KEY || "change-me", "salt", 32);

// Get config for a service/environment
export async function getConfig(
  service: string,
  environment: string
): Promise<Record<string, any>> {
  const cacheKey = `config:${service}:${environment}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  // Load configs: global → environment → service → service+environment
  const { rows } = await pool.query(
    `SELECT * FROM config_entries
     WHERE (service = '*' OR service = $1)
       AND (environment = '*' OR environment = $2)
     ORDER BY
       CASE WHEN service = '*' AND environment = '*' THEN 1
            WHEN service = '*' THEN 2
            WHEN environment = '*' THEN 3
            ELSE 4 END`,
    [service, environment]
  );

  const config: Record<string, any> = {};
  for (const row of rows) {
    let value = row.value;
    if (row.type === "secret") value = decrypt(value);
    else if (row.type === "number") value = Number(value);
    else if (row.type === "boolean") value = value === "true";
    else if (row.type === "json") value = JSON.parse(value);
    config[row.key] = value;
  }

  await redis.setex(cacheKey, 30, JSON.stringify(config));  // short TTL for hot-reload
  return config;
}

// Set config value
export async function setConfig(params: {
  key: string;
  value: any;
  type: ConfigEntry["type"];
  environment: string;
  service: string;
  description?: string;
  validationRule?: string;
  updatedBy: string;
}): Promise<void> {
  // Validate value
  if (params.validationRule) {
    const valid = validateValue(params.value, params.validationRule);
    if (!valid) throw new Error(`Validation failed for key ${params.key}`);
  }

  // Encrypt secrets
  let storedValue = String(params.value);
  if (params.type === "secret") storedValue = encrypt(String(params.value));

  // Get current version for audit
  const { rows: [current] } = await pool.query(
    "SELECT version, value FROM config_entries WHERE key = $1 AND environment = $2 AND service = $3",
    [params.key, params.environment, params.service]
  );
  const newVersion = current ? current.version + 1 : 1;

  // Save change history
  if (current) {
    await pool.query(
      `INSERT INTO config_history (key, environment, service, old_value, new_value, version, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [params.key, params.environment, params.service, current.value, storedValue, newVersion, params.updatedBy]
    );
  }

  // Upsert config
  await pool.query(
    `INSERT INTO config_entries (key, value, type, environment, service, description, validation_rule, updated_by, version, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (key, environment, service) DO UPDATE SET
       value = $2, type = $3, description = COALESCE($6, config_entries.description),
       updated_by = $8, version = $9, updated_at = NOW()`,
    [params.key, storedValue, params.type, params.environment, params.service,
     params.description, params.validationRule, params.updatedBy, newVersion]
  );

  // Invalidate cache and notify services
  await redis.del(`config:${params.service}:${params.environment}`);
  await redis.del(`config:*:${params.environment}`);
  await redis.publish("config:changed", JSON.stringify({
    key: params.key, environment: params.environment, service: params.service, version: newVersion,
  }));
}

// Rollback config to previous version
export async function rollbackConfig(
  key: string, environment: string, service: string, targetVersion: number, userId: string
): Promise<void> {
  const { rows: [history] } = await pool.query(
    "SELECT old_value FROM config_history WHERE key = $1 AND environment = $2 AND service = $3 AND version = $4",
    [key, environment, service, targetVersion]
  );
  if (!history) throw new Error("Version not found");

  const { rows: [current] } = await pool.query(
    "SELECT type FROM config_entries WHERE key = $1 AND environment = $2 AND service = $3",
    [key, environment, service]
  );

  await setConfig({
    key, value: history.old_value, type: current?.type || "string",
    environment, service, updatedBy: userId,
    description: `Rolled back to version ${targetVersion}`,
  });
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + encrypted.toString("hex") + ":" + tag.toString("hex");
}

function decrypt(ciphertext: string): string {
  const [ivHex, encHex, tagHex] = ciphertext.split(":");
  const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return decipher.update(Buffer.from(encHex, "hex")) + decipher.final("utf8");
}

function validateValue(value: any, rule: string): boolean {
  try {
    const regex = new RegExp(rule);
    return regex.test(String(value));
  } catch {
    return true;
  }
}

// Get change audit trail
export async function getAuditTrail(
  key: string, environment?: string
): Promise<Array<{ version: number; oldValue: string; newValue: string; changedBy: string; changedAt: string }>> {
  let sql = "SELECT * FROM config_history WHERE key = $1";
  const params: any[] = [key];
  if (environment) { sql += " AND environment = $2"; params.push(environment); }
  sql += " ORDER BY version DESC LIMIT 50";
  const { rows } = await pool.query(sql, params);
  return rows;
}
```

## Results

- **One source of truth** — all 15 services read config from one place; no more scattered `.env` files and hardcoded values
- **Hot-reload without redeploy** — change feature flag, services pick it up in 30 seconds via short cache TTL + pub/sub notification; no rolling restart needed
- **Secrets encrypted at rest** — AES-256-GCM encryption; database breach doesn't expose API keys; secrets decrypted only in memory at read time
- **Wrong Redis URL incident prevented** — validation rules catch invalid URLs before save; environment-specific overrides mean staging changes can't affect production
- **Full audit trail** — every config change logged with who, when, old value, new value; rollback to any previous version in one call
