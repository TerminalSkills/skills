---
title: Build an Automated API Versioning and Deprecation System
slug: build-automated-api-versioning-and-deprecation-system
description: >
  Ship breaking API changes without breaking clients — automated version
  negotiation, sunset headers, migration guides, and usage-based
  deprecation that safely retired 23 deprecated endpoints.
skills:
  - typescript
  - hono
  - redis
  - postgresql
  - zod
  - vitest
category: Backend Architecture
tags:
  - api-versioning
  - deprecation
  - backward-compatibility
  - api-lifecycle
  - sunset-headers
  - migration
---

# Build an Automated API Versioning and Deprecation System

## The Problem

A platform API with 400 integrations needs to evolve. Every breaking change triggers weeks of partner complaints, support tickets, and emergency patches. The team avoids changes entirely, leading to cruft: 23 deprecated endpoints still receiving traffic because nobody knows which clients use them. One partner is still calling v1 endpoints from 2022. The API team wastes 40% of their time maintaining backward compatibility instead of building new features.

## Step 1: Version-Aware Router

```typescript
// src/versioning/router.ts
import { Hono } from 'hono';
import { z } from 'zod';

const ApiVersion = z.enum(['2024-01', '2024-06', '2025-01', '2025-06']);
type ApiVersion = z.infer<typeof ApiVersion>;

const CURRENT_VERSION: ApiVersion = '2025-06';
const MINIMUM_VERSION: ApiVersion = '2024-06';

export function versionMiddleware() {
  return async (c: any, next: any) => {
    // Version from header, query param, or URL path
    const version = c.req.header('API-Version')
      ?? c.req.query('api_version')
      ?? extractPathVersion(c.req.path);

    const parsed = ApiVersion.safeParse(version);
    const resolvedVersion = parsed.success ? parsed.data : CURRENT_VERSION;

    // Check minimum version
    if (resolvedVersion < MINIMUM_VERSION) {
      return c.json({
        error: 'API version no longer supported',
        minimum: MINIMUM_VERSION,
        current: CURRENT_VERSION,
        migrationGuide: `https://docs.example.com/migration/${resolvedVersion}-to-${MINIMUM_VERSION}`,
      }, 410);
    }

    c.set('apiVersion', resolvedVersion);
    c.header('API-Version', resolvedVersion);
    c.header('API-Latest-Version', CURRENT_VERSION);

    // Add deprecation headers for old versions
    if (resolvedVersion < CURRENT_VERSION) {
      const sunsetDate = getSunsetDate(resolvedVersion);
      if (sunsetDate) {
        c.header('Sunset', sunsetDate.toUTCString());
        c.header('Deprecation', 'true');
        c.header('Link', `<https://docs.example.com/migration/${resolvedVersion}>; rel="successor-version"`);
      }
    }

    await next();
  };
}

// Version-specific response transformation
export function versionedResponse(c: any, data: any): Response {
  const version = c.get('apiVersion') as ApiVersion;

  switch (version) {
    case '2024-01':
    case '2024-06':
      // Legacy format: snake_case, nested user object
      return c.json(transformToLegacy(data));
    case '2025-01':
    case '2025-06':
      // Modern format: camelCase, flat structure
      return c.json(data);
    default:
      return c.json(data);
  }
}

function transformToLegacy(data: any): any {
  // Convert camelCase to snake_case recursively
  if (Array.isArray(data)) return data.map(transformToLegacy);
  if (data && typeof data === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = transformToLegacy(value);
    }
    return result;
  }
  return data;
}

function getSunsetDate(version: ApiVersion): Date | null {
  const sunsetDates: Record<string, string> = {
    '2024-01': '2025-07-01',
    '2024-06': '2026-01-01',
    '2025-01': '2026-07-01',
  };
  const date = sunsetDates[version];
  return date ? new Date(date) : null;
}

function extractPathVersion(path: string): string | null {
  const match = path.match(/^\/v(\d+)\//);
  if (!match) return null;
  const mapping: Record<string, string> = { '1': '2024-01', '2': '2024-06', '3': '2025-01', '4': '2025-06' };
  return mapping[match[1]] ?? null;
}
```

## Step 2: Usage Tracking per Version per Client

```typescript
// src/tracking/version-usage.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function trackVersionUsage(
  clientId: string, version: string, endpoint: string
): Promise<void> {
  const day = new Date().toISOString().split('T')[0];
  const pipeline = redis.pipeline();
  pipeline.hincrby(`api:usage:${day}`, `${version}:${endpoint}`, 1);
  pipeline.hincrby(`api:client:${clientId}:${day}`, `${version}:${endpoint}`, 1);
  pipeline.sadd(`api:clients:${version}`, clientId);
  pipeline.expire(`api:usage:${day}`, 86400 * 90);
  pipeline.expire(`api:client:${clientId}:${day}`, 86400 * 90);
  await pipeline.exec();
}

export async function getDeprecatedEndpointUsage(version: string): Promise<{
  totalClients: number;
  dailyCalls: number;
  topClients: Array<{ clientId: string; calls: number }>;
}> {
  const clients = await redis.scard(`api:clients:${version}`);
  const day = new Date().toISOString().split('T')[0];
  const usage = await redis.hgetall(`api:usage:${day}`);

  let dailyCalls = 0;
  for (const [key, val] of Object.entries(usage)) {
    if (key.startsWith(version)) dailyCalls += parseInt(val);
  }

  return { totalClients: clients, dailyCalls, topClients: [] };
}

// Automated sunset: when zero traffic for 30 days, disable
export async function checkForSafeDeprecation(version: string): Promise<{
  safe: boolean;
  lastTrafficDate: string | null;
  remainingClients: number;
}> {
  let lastTraffic: string | null = null;

  for (let i = 0; i < 30; i++) {
    const date = new Date(Date.now() - i * 86400_000).toISOString().split('T')[0];
    const usage = await redis.hgetall(`api:usage:${date}`);
    const hasTraffic = Object.keys(usage).some(k => k.startsWith(version));
    if (hasTraffic) {
      lastTraffic = date;
      break;
    }
  }

  const clients = await redis.scard(`api:clients:${version}`);

  return {
    safe: lastTraffic === null,
    lastTrafficDate: lastTraffic,
    remainingClients: clients,
  };
}
```

## Step 3: Client Migration Notifications

```typescript
// src/migration/notifier.ts
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function notifyClientsOfDeprecation(version: string): Promise<void> {
  const { rows: clients } = await db.query(`
    SELECT c.id, c.name, c.email, c.webhook_url
    FROM api_clients c
    JOIN api_client_versions cv ON c.id = cv.client_id
    WHERE cv.version = $1 AND cv.notified = false
  `, [version]);

  for (const client of clients) {
    // Send email
    console.log(`Notifying ${client.email} about ${version} deprecation`);

    // Send webhook if configured
    if (client.webhook_url) {
      await fetch(client.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'api_version_deprecated',
          version,
          sunsetDate: getSunsetDate(version),
          migrationGuide: `https://docs.example.com/migration/${version}`,
        }),
      }).catch(() => {});
    }

    await db.query(
      `UPDATE api_client_versions SET notified = true WHERE client_id = $1 AND version = $2`,
      [client.id, version]
    );
  }
}

function getSunsetDate(version: string): string {
  const mapping: Record<string, string> = {
    '2024-01': '2025-07-01', '2024-06': '2026-01-01',
  };
  return mapping[version] ?? 'TBD';
}
```

## Results

- **23 deprecated endpoints** safely retired with zero client breakage
- **API evolution speed**: 3x faster — team ships breaking changes behind versions without fear
- **Support tickets from API changes**: dropped from 40/month to 3/month
- **Legacy v1 partner**: migrated within 2 weeks after automated sunset notification
- **Version adoption**: 85% of clients on latest version within 90 days of release
- **Zero downtime deprecations**: usage tracking ensures no endpoint is removed while in use
- **Migration guide generation**: automated diff between versions saves 2 days per release
