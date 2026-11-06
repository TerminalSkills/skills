---
title: Build a Multi-Region Deployment with Edge Routing
slug: build-multi-region-deployment-with-edge-routing
description: >
  Deploy an API across 3 regions with a Cloudflare Worker that routes by
  tenant home region and geography, fails reads over safely, and keeps
  pinned tenants' data inside their region.
skills:
  - typescript
  - hono
  - redis
  - postgresql
  - docker-helper
  - terraform-iac
  - cloudflare-workers
category: devops
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

A B2B SaaS serves 3,000 companies across 40 countries, but all infrastructure runs in us-east-1. Asian customers see slow API calls because every request crosses the Pacific twice. European customers raise data-residency concerns because their data sits in US databases. A 45-minute us-east-1 outage last month took the whole product down, cost SLA credits and lost two enterprise accounts.

The design: identical API containers in three regions (`us`, `eu`, `ap`), a Worker at the edge that picks the region, and a database layout where each tenant's data has a home region.

## Step 1: Edge router

The router runs on Cloudflare Workers with Hono. Three rules matter more than the routing table:

- **The client never picks the region.** A tenant's region comes from Workers KV, keyed by the tenant in the hostname (`acme.example.com`). Interpolating a client-supplied header such as `X-Tenant-Region` into the upstream URL would let anyone steer requests, or the Worker's `fetch`, to a host of their choosing.
- **Only repeat requests that are safe to repeat.** Failing a `POST` over to a second region after a timeout can apply it twice. Only `GET` and `HEAD` retry.
- **Pinned tenants never fail over.** Sending an EU-pinned tenant to the US during an outage would break the residency promise, so they get the origin's own error or a 503 instead.

The visitor's continent is `request.cf.continent`, set by Cloudflare on every request.

```typescript
// src/edge/router.ts
import { Hono } from 'hono';

type Region = 'us' | 'eu' | 'ap';
type Bindings = { TENANT_REGIONS: KVNamespace };

const ORIGINS: Record<Region, string> = {
  us: 'https://api-us.example.com',
  eu: 'https://api-eu.example.com',
  ap: 'https://api-ap.example.com',
};

const GEO: Record<string, Region> = { NA: 'us', SA: 'us', EU: 'eu', AF: 'eu', AS: 'ap', OC: 'ap' };

const FALLBACK: Record<Region, Region> = { us: 'eu', eu: 'us', ap: 'us' };

// KV value per tenant: {"region":"eu","pinned":true}. Written at signup, never by the client.
interface TenantRecord { region: Region; pinned: boolean }

const app = new Hono<{ Bindings: Bindings }>();

async function forward(origin: string, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const target = new URL(url.pathname + url.search, origin);
  return fetch(new Request(target, req), { signal: AbortSignal.timeout(5000) });
}

app.all('/*', async (c) => {
  const req = c.req.raw;
  const cf = (req as Request & { cf?: IncomingRequestCfProperties }).cf;
  const continent: string = cf?.continent ?? 'NA';

  const tenant = new URL(req.url).hostname.split('.')[0];
  const record: TenantRecord | null = await c.env.TENANT_REGIONS.get<TenantRecord>(tenant, 'json');
  const primary: Region = record?.region ?? GEO[continent] ?? 'us';
  const fallback: Region | null = record?.pinned ? null : FALLBACK[primary];

  const canRetry = req.method === 'GET' || req.method === 'HEAD';
  try {
    const res = await forward(ORIGINS[primary], req);
    if (res.status < 500 || !canRetry || !fallback) return tag(res, primary, false);
  } catch {
    if (!canRetry || !fallback) return c.text('Region unavailable', 503);
  }
  if (!fallback) return c.text('Region unavailable', 503);

  try {
    return tag(await forward(ORIGINS[fallback], req), fallback, true);
  } catch {
    return c.text('All regions unavailable', 503);
  }
});

function tag(res: Response, region: Region, failover: boolean): Response {
  const out = new Response(res.body, res);
  out.headers.set('X-Served-By', region);
  if (failover) out.headers.set('X-Failover', 'true');
  return out;
}

export default app;
```

Stub `fetch` and call `app.request()` to test it without deploying. With the EU origin returning 502, a pinned tenant's `GET` gets the 502 and makes one upstream call, an unpinned tenant's `GET` is retried against `us` and returns 200 with `X-Failover: true`, and an unpinned `POST` is not retried.

```jsonc
{
  "name": "edge-router",
  "main": "src/edge/router.ts",
  "compatibility_date": "2026-11-01",
  "kv_namespaces": [{ "binding": "TENANT_REGIONS", "id": "<id printed by wrangler kv namespace create>" }]
}
```

```console
$ npx wrangler kv namespace create TENANT_REGIONS
$ npx wrangler kv key put --binding TENANT_REGIONS acme '{"region":"eu","pinned":true}' --remote
$ npx wrangler deploy
```

## Step 2: Region health monitor

A small Node service next to Redis in each region probes every region's `/health`, keeps a 5-minute error-rate window in a sorted set, and writes `health:<region>:*` keys that dashboards and alerts read. (The Worker's per-request failover above does not depend on it.)

```typescript
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://redis:6379');
const REGIONS = ['us', 'eu', 'ap'] as const;
const WINDOW_MS = 5 * 60_000;

export interface RegionHealth { healthy: boolean; latencyMs: number; lastCheck: string; errorRate: number }

async function check(region: string): Promise<RegionHealth> {
  const lastCheck = new Date().toISOString();
  const errorRate = Number((await redis.get(`health:${region}:error_rate`)) ?? '0');
  try {
    const start = Date.now();
    const res = await fetch(`https://api-${region}.example.com/health`, { signal: AbortSignal.timeout(3000) });
    const latencyMs = Date.now() - start;
    const healthy = res.ok && latencyMs < 2000 && errorRate < 0.05;
    await redis.set(`health:${region}:status`, healthy ? '1' : '0', 'EX', 60);
    return { healthy, latencyMs, lastCheck, errorRate };
  } catch {
    await redis.set(`health:${region}:status`, '0', 'EX', 60);
    return { healthy: false, latencyMs: -1, lastCheck, errorRate };
  }
}

export async function checkRegionHealth(): Promise<Record<string, RegionHealth>> {
  const entries = await Promise.all(REGIONS.map(async (r) => [r, await check(r)] as const));
  return Object.fromEntries(entries);
}

// Error rate over a sliding 5-minute window, kept in a sorted set scored by time
export async function recordRequest(region: string, success: boolean): Promise<void> {
  const key = `health:${region}:window`;
  const now = Date.now();
  await redis
    .multi()
    .zadd(key, String(now), `${randomUUID()}:${success ? '1' : '0'}`)
    .zremrangebyscore(key, '-inf', String(now - WINDOW_MS))
    .exec();
  const entries = await redis.zrange(key, '0', '-1');
  const errors = entries.filter((e) => e.endsWith(':0')).length;
  await redis.set(`health:${region}:error_rate`, String(entries.length ? errors / entries.length : 0), 'EX', 300);
}

if (process.env.RUN_MONITOR === '1') setInterval(() => void checkRegionHealth().catch(console.error), 15_000);
```

The `randomUUID()` member keeps two requests in the same millisecond from overwriting each other in the sorted set. Run it with Redis in Compose; Redis publishes no port, so it is reachable only from the `monitor` service:

```yaml
services:
  redis:
    image: redis:8-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  monitor:
    build: .
    environment:
      REDIS_URL: redis://redis:6379
      RUN_MONITOR: "1"
    depends_on:
      redis:
        condition: service_healthy
```

The `build: .` image uses the multi-stage Node pattern from the `docker-helper` skill (`npm ci`, build, `npm prune --omit=dev`, `USER node`); the API container, built the same way, is the image every region runs.

## Step 3: Data locality

Each tenant has a home region. Writes always go to the home region's primary, so a pinned EU tenant's rows are never written outside the EU. Reads use the local replica: for a pinned tenant that is the home region (the router never sends it elsewhere), and for an unpinned tenant it is a replicated copy, which is what makes the `GET` failover in Step 1 return data. Cross-region replication is only configured for unpinned tenants.

```typescript
// src/db/region-aware.ts
import { Pool } from 'pg';

const REGIONS = ['us', 'eu', 'ap'] as const;
export type Region = (typeof REGIONS)[number];

function pool(name: string): Pool {
  const connectionString = process.env[name];
  if (!connectionString) throw new Error(`${name} is not set`);
  const p = new Pool({ connectionString, max: 10 });
  p.on('error', (err) => console.error(`${name}:`, err.message)); // idle clients can drop
  return p;
}

const pools = Object.fromEntries(
  REGIONS.map((r) => [r, { primary: pool(`DB_${r.toUpperCase()}_PRIMARY`), replica: pool(`DB_${r.toUpperCase()}_REPLICA`) }]),
) as Record<Region, { primary: Pool; replica: Pool }>;

const CURRENT_REGION = (process.env.REGION ?? 'us') as Region;

export async function query<T>(
  sql: string,
  params: unknown[],
  opts: { write?: boolean; homeRegion: Region },
): Promise<T[]> {
  const p = opts.write ? pools[opts.homeRegion].primary : pools[CURRENT_REGION].replica;
  const { rows } = await p.query(sql, params);
  return rows as T[];
}
```

Replication is lagged, so a read right after a write can miss it; read from the primary for that request when it matters.

## Step 4: One image, three regions with Terraform

A Terraform provider block is tied to one region and modules cannot loop over providers, so each region is listed once and calls the same module. The module (an ECS cluster and service, as in the `terraform-iac` skill; you write its body) is identical everywhere and only the provider differs:

```hcl
terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

provider "aws" {
  alias  = "us"
  region = "us-east-1"
}
provider "aws" {
  alias  = "eu"
  region = "eu-west-1"
}
provider "aws" {
  alias  = "ap"
  region = "ap-southeast-1"
}

variable "image" {
  type        = string
  description = "Image reference, pinned by digest; must be pullable in all three regions"
}

module "api_us" {
  source    = "./modules/api-region"
  providers = { aws = aws.us }
  region    = "us"
  image     = var.image
}

module "api_eu" {
  source    = "./modules/api-region"
  providers = { aws = aws.eu }
  region    = "eu"
  image     = var.image
}

# module "api_ap" is the same block with aws.ap and region = "ap"
```

`terraform fmt -check` and `terraform validate` pass on this layout. Container registries are regional on AWS, so replicate the image to each region (ECR replication) before applying.

## Real-World Example

The team moves Asian and European tenants to their home regions one cohort at a time: write the tenant's KV record, replicate its data, then flip. The first EU tenant to be pinned is a bank. During the next us-east-1 incident the `us` origin returns 5xx; unpinned tenants' reads continue from `eu` with `X-Failover: true` in the response, writes to the affected region return errors instead of being silently duplicated, and the bank's requests keep going to `eu` untouched. The team measures p95 per region from the `X-Served-By` header before and after each cohort moves, rather than trusting a single global number.

## Related Skills

- [cloudflare-workers](../skills/cloudflare-workers/) and [hono](../skills/hono/): the edge router, KV and `wrangler`
- [terraform-iac](../skills/terraform-iac/): one module, three regional providers
- [docker-helper](../skills/docker-helper/): multi-stage image and the Compose file
- [redis](../skills/redis/) and [postgresql](../skills/postgresql/): health windows and regional pools
- [typescript](../skills/typescript/): types for the Worker, monitor and data layer
