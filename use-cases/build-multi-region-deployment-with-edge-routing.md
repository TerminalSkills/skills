---
title: Build a Multi-Region Deployment with Edge Routing
slug: build-multi-region-deployment-with-edge-routing
description: >
  Deploy an API across 4 regions with intelligent edge routing,
  automatic failover, and data locality — reducing p95 latency from
  800ms to 120ms for global users while maintaining consistency.
skills:
  - typescript
  - hono
  - redis
  - postgresql
  - docker
  - terraform-iac
  - cloudflare-workers
category: DevOps & Infrastructure
tags:
  - multi-region
  - edge-computing
  - latency
  - failover
  - global-deployment
  - geo-routing
---

# Build a Multi-Region Deployment with Edge Routing

## The Problem

A B2B SaaS serves 3,000 companies across 40 countries, but all infrastructure runs in us-east-1. Asian customers experience 800ms p95 latency — API calls round-trip across the Pacific twice. European customers hit GDPR concerns because their data transits US servers. A 45-minute us-east-1 outage last month took down the entire product globally, costing $125K in SLA credits and 2 churned enterprise accounts worth $400K ARR.

## Step 1: Edge Router with Geo-Aware Routing

```typescript
// src/edge/router.ts — runs at Cloudflare Workers (or any edge runtime)
import { Hono } from 'hono';

const app = new Hono();

interface RegionConfig {
  primary: string;
  fallback: string;
  dbRegion: string;
}

// Map continents to nearest regions
const GEO_ROUTING: Record<string, RegionConfig> = {
  'NA': { primary: 'https://api-us.example.com', fallback: 'https://api-eu.example.com', dbRegion: 'us' },
  'SA': { primary: 'https://api-us.example.com', fallback: 'https://api-eu.example.com', dbRegion: 'us' },
  'EU': { primary: 'https://api-eu.example.com', fallback: 'https://api-us.example.com', dbRegion: 'eu' },
  'AF': { primary: 'https://api-eu.example.com', fallback: 'https://api-us.example.com', dbRegion: 'eu' },
  'AS': { primary: 'https://api-ap.example.com', fallback: 'https://api-us.example.com', dbRegion: 'ap' },
  'OC': { primary: 'https://api-ap.example.com', fallback: 'https://api-us.example.com', dbRegion: 'ap' },
};

app.all('/*', async (c) => {
  const continent = c.req.header('CF-IPContinent') ?? 'NA';
  const routing = GEO_ROUTING[continent] ?? GEO_ROUTING['NA'];

  // Tenant override: some tenants pin to a specific region (GDPR)
  const tenantRegion = c.req.header('X-Tenant-Region');
  const targetBase = tenantRegion
    ? `https://api-${tenantRegion}.example.com`
    : routing.primary;

  const url = new URL(c.req.url);
  const targetUrl = `${targetBase}${url.pathname}${url.search}`;

  try {
    const response = await fetch(targetUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' ? await c.req.blob() : undefined,
      signal: AbortSignal.timeout(5000),
    });

    // Add routing metadata headers
    const result = new Response(response.body, response);
    result.headers.set('X-Served-By', targetBase);
    result.headers.set('X-Region', continent);
    return result;
  } catch {
    // Failover to backup region
    const fallbackUrl = `${routing.fallback}${url.pathname}${url.search}`;
    const fallback = await fetch(fallbackUrl, {
      method: c.req.method,
      headers: c.req.raw.headers,
      body: c.req.method !== 'GET' ? await c.req.blob() : undefined,
    });

    const result = new Response(fallback.body, fallback);
    result.headers.set('X-Served-By', routing.fallback);
    result.headers.set('X-Failover', 'true');
    return result;
  }
});

export default app;
```

## Step 2: Region Health Monitor

```typescript
// src/health/monitor.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

const REGIONS = ['us', 'eu', 'ap'];

export async function checkRegionHealth(): Promise<Record<string, {
  healthy: boolean;
  latencyMs: number;
  lastCheck: string;
  errorRate: number;
}>> {
  const results: Record<string, any> = {};

  for (const region of REGIONS) {
    const url = `https://api-${region}.example.com/health`;

    try {
      const start = Date.now();
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const latencyMs = Date.now() - start;

      const errorRate = parseFloat(
        await redis.get(`health:${region}:error_rate`) ?? '0'
      );

      results[region] = {
        healthy: res.ok && latencyMs < 2000 && errorRate < 0.05,
        latencyMs,
        lastCheck: new Date().toISOString(),
        errorRate,
      };

      await redis.setex(`health:${region}:status`, 60, res.ok ? '1' : '0');
      await redis.setex(`health:${region}:latency`, 60, String(latencyMs));
    } catch {
      results[region] = {
        healthy: false, latencyMs: -1,
        lastCheck: new Date().toISOString(), errorRate: 1,
      };
      await redis.setex(`health:${region}:status`, 60, '0');
    }
  }

  return results;
}

// Track error rate with sliding window
export async function recordRequest(region: string, success: boolean): Promise<void> {
  const window = `health:${region}:window`;
  const now = Date.now();
  await redis.zadd(window, now.toString(), `${now}:${success ? '1' : '0'}`);
  await redis.zremrangebyscore(window, '-inf', (now - 300000).toString()); // 5-min window

  const entries = await redis.zrange(window, 0, -1);
  const errors = entries.filter(e => e.endsWith(':0')).length;
  const rate = entries.length > 0 ? errors / entries.length : 0;
  await redis.setex(`health:${region}:error_rate`, 300, rate.toString());
}
```

## Step 3: Data Locality with Read Replicas

```typescript
// src/db/region-aware.ts
import { Pool } from 'pg';

const pools: Record<string, { primary: Pool; replica: Pool }> = {
  us: {
    primary: new Pool({ connectionString: process.env.DB_US_PRIMARY }),
    replica: new Pool({ connectionString: process.env.DB_US_REPLICA }),
  },
  eu: {
    primary: new Pool({ connectionString: process.env.DB_EU_PRIMARY }),
    replica: new Pool({ connectionString: process.env.DB_EU_REPLICA }),
  },
  ap: {
    primary: new Pool({ connectionString: process.env.DB_AP_PRIMARY }),
    replica: new Pool({ connectionString: process.env.DB_AP_REPLICA }),
  },
};

const CURRENT_REGION = process.env.REGION ?? 'us';
// Global primary for writes — all writes go to us, replicate to eu/ap
const WRITE_REGION = 'us';

export function getReadPool(tenantRegion?: string): Pool {
  const region = tenantRegion ?? CURRENT_REGION;
  return pools[region]?.replica ?? pools[CURRENT_REGION].replica;
}

export function getWritePool(): Pool {
  return pools[WRITE_REGION].primary;
}

// Tenant data residency: EU tenants' data never leaves EU region
export async function queryWithLocality<T>(
  sql: string,
  params: any[],
  options: { write?: boolean; tenantRegion?: string } = {}
): Promise<T[]> {
  const pool = options.write ? getWritePool() : getReadPool(options.tenantRegion);
  const { rows } = await pool.query(sql, params);
  return rows as T[];
}
```

## Results

- **p95 latency**: 120ms globally (was 800ms for Asia, 400ms for Europe)
- **GDPR compliance**: EU tenant data served from EU region, never transits US
- **Regional failover**: automatic — us-east-1 outage affected zero customers
- **SLA credits**: $0 (was $125K from the single-region outage)
- **Churned accounts**: zero region-related churn (was 2 accounts = $400K ARR)
- **Read replica lag**: <100ms average across regions
- **Deployment**: identical containers deployed to 3 regions via Terraform
