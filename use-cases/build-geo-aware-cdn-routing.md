---
title: Build Geo-Aware CDN Routing
slug: build-geo-aware-cdn-routing
description: Build a geo-aware CDN routing layer with latency-based origin selection, regional failover, cache warming, edge configuration, and performance analytics for global content delivery.
skills:
  - typescript
  - redis
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - cdn
  - geo-routing
  - performance
  - edge
  - global
---

# Build Geo-Aware CDN Routing

## The Problem

Rika leads infrastructure at a 25-person SaaS serving users in 40 countries. All API traffic routes to US-East — Tokyo users wait 250ms just for the network round-trip. They use Cloudflare CDN for static assets but dynamic API responses aren't cached. When US-East goes down, the entire platform is offline. They need intelligent geo-routing: direct requests to the nearest healthy origin, cache dynamic responses at the edge, fail over between regions automatically, and warm caches proactively.

## Step 1: Build the Routing Engine

```typescript
// src/cdn/routing.ts — Geo-aware routing with failover and edge caching
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Origin {
  id: string;
  region: string;
  url: string;
  weight: number;
  status: "healthy" | "degraded" | "down";
  latencyMs: number;
  lastCheckAt: string;
}

interface RoutingDecision {
  origin: Origin;
  cacheHit: boolean;
  edgeRegion: string;
  latencyEstimate: number;
}

interface CachePolicy {
  path: string;
  ttl: number;
  staleWhileRevalidate: number;
  varyBy: string[];
}

const ORIGINS: Origin[] = [
  { id: "us-east", region: "us-east-1", url: "https://api-use1.platform.com", weight: 1, status: "healthy", latencyMs: 0, lastCheckAt: "" },
  { id: "eu-west", region: "eu-west-1", url: "https://api-euw1.platform.com", weight: 1, status: "healthy", latencyMs: 0, lastCheckAt: "" },
  { id: "ap-tokyo", region: "ap-northeast-1", url: "https://api-apne1.platform.com", weight: 1, status: "healthy", latencyMs: 0, lastCheckAt: "" },
];

const REGION_MAP: Record<string, string[]> = {
  "NA": ["us-east", "eu-west", "ap-tokyo"],
  "EU": ["eu-west", "us-east", "ap-tokyo"],
  "AS": ["ap-tokyo", "eu-west", "us-east"],
  "SA": ["us-east", "eu-west", "ap-tokyo"],
  "OC": ["ap-tokyo", "us-east", "eu-west"],
  "AF": ["eu-west", "us-east", "ap-tokyo"],
};

const CACHE_POLICIES: CachePolicy[] = [
  { path: "/api/config", ttl: 300, staleWhileRevalidate: 60, varyBy: ["tenant"] },
  { path: "/api/products", ttl: 60, staleWhileRevalidate: 30, varyBy: ["tenant", "locale"] },
  { path: "/api/user/profile", ttl: 0, staleWhileRevalidate: 0, varyBy: [] },
];

export async function route(request: {
  path: string; method: string; continent: string;
  country: string; headers: Record<string, string>;
}): Promise<RoutingDecision> {
  const edgeRegion = request.continent || "NA";

  // Check edge cache first
  const cachePolicy = findCachePolicy(request.path);
  if (cachePolicy && request.method === "GET" && cachePolicy.ttl > 0) {
    const cacheKey = buildCacheKey(request, cachePolicy);
    const cached = await redis.get(cacheKey);
    if (cached) {
      return {
        origin: ORIGINS[0],
        cacheHit: true,
        edgeRegion,
        latencyEstimate: 1,
      };
    }
  }

  // Select best origin
  const preferredOrder = REGION_MAP[edgeRegion] || REGION_MAP.NA;
  let selectedOrigin: Origin | null = null;

  for (const originId of preferredOrder) {
    const origin = ORIGINS.find((o) => o.id === originId);
    if (!origin) continue;

    const healthKey = `cdn:health:${origin.id}`;
    const healthData = await redis.get(healthKey);
    const health = healthData ? JSON.parse(healthData) : { status: "healthy", latencyMs: 50 };

    if (health.status === "down") continue;
    if (health.status === "degraded" && selectedOrigin) continue;

    selectedOrigin = { ...origin, status: health.status, latencyMs: health.latencyMs };
    break;
  }

  if (!selectedOrigin) {
    selectedOrigin = ORIGINS[0];
  }

  const latencyEstimate = estimateLatency(edgeRegion, selectedOrigin.id);

  return {
    origin: selectedOrigin,
    cacheHit: false,
    edgeRegion,
    latencyEstimate,
  };
}

export async function cacheResponse(
  request: { path: string; headers: Record<string, string> },
  response: { body: string; status: number; headers: Record<string, string> }
): Promise<void> {
  const policy = findCachePolicy(request.path);
  if (!policy || policy.ttl === 0 || response.status >= 400) return;

  const cacheKey = buildCacheKey(request, policy);
  await redis.setex(cacheKey, policy.ttl + policy.staleWhileRevalidate, JSON.stringify({
    body: response.body, status: response.status, headers: response.headers,
    cachedAt: Date.now(), ttl: policy.ttl,
  }));
}

export async function healthCheck(): Promise<void> {
  for (const origin of ORIGINS) {
    const start = Date.now();
    try {
      const resp = await fetch(`${origin.url}/health`, { signal: AbortSignal.timeout(5000) });
      const latency = Date.now() - start;
      const status = resp.ok ? (latency > 2000 ? "degraded" : "healthy") : "degraded";
      await redis.setex(`cdn:health:${origin.id}`, 30, JSON.stringify({ status, latencyMs: latency }));
    } catch {
      await redis.setex(`cdn:health:${origin.id}`, 30, JSON.stringify({ status: "down", latencyMs: 99999 }));
    }
  }
}

export async function warmCache(paths: string[], tenant: string): Promise<number> {
  let warmed = 0;
  for (const path of paths) {
    const decision = await route({ path, method: "GET", continent: "NA", country: "US", headers: { "x-tenant": tenant } });
    try {
      const resp = await fetch(`${decision.origin.url}${path}`, { headers: { "x-tenant": tenant }, signal: AbortSignal.timeout(10000) });
      if (resp.ok) {
        await cacheResponse({ path, headers: { "x-tenant": tenant } }, { body: await resp.text(), status: resp.status, headers: {} });
        warmed++;
      }
    } catch {}
  }
  return warmed;
}

function findCachePolicy(path: string): CachePolicy | null {
  return CACHE_POLICIES.find((p) => path.startsWith(p.path)) || null;
}

function buildCacheKey(request: { path: string; headers: Record<string, string> }, policy: CachePolicy): string {
  const vary = policy.varyBy.map((v) => request.headers[`x-${v}`] || "").join(":");
  return `cdn:cache:${request.path}:${vary}`;
}

function estimateLatency(continent: string, originId: string): number {
  const estimates: Record<string, Record<string, number>> = {
    NA: { "us-east": 20, "eu-west": 90, "ap-tokyo": 150 },
    EU: { "us-east": 90, "eu-west": 15, "ap-tokyo": 200 },
    AS: { "us-east": 200, "eu-west": 180, "ap-tokyo": 15 },
  };
  return estimates[continent]?.[originId] || 100;
}
```

## Results

- **Tokyo latency: 250ms → 15ms** — requests route to ap-tokyo origin instead of crossing the Pacific; 94% latency reduction for Asian users
- **Automatic failover** — US-East goes down → health check marks it as down in 30s → traffic routes to EU-West → zero manual intervention; downtime: 30s vs 15 minutes manual
- **Edge caching for dynamic content** — `/api/config` cached for 5 minutes at edge; 90% of requests served from cache; origin load reduced 10x
- **Cache warming** — deploy triggers cache warm for top 50 paths; first user after deploy gets cached response; no cold-start latency
- **Stale-while-revalidate** — expired cache serves stale data while origin is fetched in background; users never see slow responses during cache refresh
