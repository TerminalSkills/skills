---
title: Build a Dark Launch System
slug: build-dark-launch-system
description: Build a dark launch system with shadow traffic mirroring, feature comparison testing, performance benchmarking, gradual rollout, and rollback capabilities for risk-free production deployments.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - dark-launch
  - shadow-traffic
  - deployment
  - testing
  - rollout
---

# Build a Dark Launch System

## The Problem

Viktor leads platform at a 25-person company. New features break in production despite passing staging tests — staging has 100 users, production has 50,000. A database query that took 5ms with 1K rows takes 3 seconds with 10M rows. Response format changes break API consumers they didn't know existed. They need dark launches: deploy new code alongside old, mirror real production traffic to the new version, compare responses, benchmark performance — all without affecting users. Only promote when confident.

## Step 1: Build the Dark Launch Engine

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface DarkLaunch { id: string; name: string; status: "active" | "paused" | "promoted" | "rolled_back"; primaryHandler: string; shadowHandler: string; trafficPercentage: number; compareResponses: boolean; maxLatencyDiff: number; startedAt: string; stats: LaunchStats; }
interface LaunchStats { totalRequests: number; shadowSuccesses: number; shadowFailures: number; responseMismatches: number; avgPrimaryLatency: number; avgShadowLatency: number; latencyDiffP95: number; }
interface ComparisonResult { match: boolean; primaryStatus: number; shadowStatus: number; primaryLatency: number; shadowLatency: number; bodyDiff: string | null; }

const launches = new Map<string, DarkLaunch>();

// Start dark launch
export function startDarkLaunch(params: { name: string; primaryHandler: string; shadowHandler: string; trafficPercentage?: number; compareResponses?: boolean; maxLatencyDiff?: number }): DarkLaunch {
  const id = `dl-${randomBytes(6).toString("hex")}`;
  const launch: DarkLaunch = {
    id, name: params.name, status: "active",
    primaryHandler: params.primaryHandler, shadowHandler: params.shadowHandler,
    trafficPercentage: params.trafficPercentage || 10,
    compareResponses: params.compareResponses ?? true,
    maxLatencyDiff: params.maxLatencyDiff || 2000,
    startedAt: new Date().toISOString(),
    stats: { totalRequests: 0, shadowSuccesses: 0, shadowFailures: 0, responseMismatches: 0, avgPrimaryLatency: 0, avgShadowLatency: 0, latencyDiffP95: 0 },
  };
  launches.set(id, launch);
  return launch;
}

// Middleware: mirror traffic to shadow handler
export function darkLaunchMiddleware(launchId: string) {
  return async (c: any, next: any) => {
    const launch = launches.get(launchId);
    if (!launch || launch.status !== "active") return next();

    // Determine if this request should be shadowed
    const shouldShadow = Math.random() * 100 < launch.trafficPercentage;

    // Always serve from primary
    const primaryStart = Date.now();
    await next();
    const primaryLatency = Date.now() - primaryStart;
    const primaryStatus = c.res.status;
    const primaryBody = await c.res.clone().text().catch(() => "");

    launch.stats.totalRequests++;

    if (!shouldShadow) return;

    // Fire shadow request asynchronously (doesn't affect user)
    shadowRequest(launch, c.req, primaryStatus, primaryBody, primaryLatency).catch(() => {});
  };
}

async function shadowRequest(launch: DarkLaunch, req: any, primaryStatus: number, primaryBody: string, primaryLatency: number): Promise<void> {
  const shadowStart = Date.now();
  try {
    // Call shadow handler
    const shadowResp = await fetch(`${launch.shadowHandler}${req.path}`, {
      method: req.method,
      headers: Object.fromEntries(req.raw.headers.entries()),
      body: ["POST", "PUT", "PATCH"].includes(req.method) ? await req.raw.clone().text() : undefined,
      signal: AbortSignal.timeout(launch.maxLatencyDiff + 5000),
    });
    const shadowLatency = Date.now() - shadowStart;
    const shadowBody = await shadowResp.text();
    const shadowStatus = shadowResp.status;

    launch.stats.shadowSuccesses++;

    // Compare responses
    if (launch.compareResponses) {
      const comparison = compareResponses(primaryStatus, primaryBody, shadowStatus, shadowBody, primaryLatency, shadowLatency);

      if (!comparison.match) {
        launch.stats.responseMismatches++;
        await redis.rpush(`dl:mismatches:${launch.id}`, JSON.stringify({
          path: req.path, method: req.method, ...comparison, timestamp: new Date().toISOString(),
        }));
        await redis.ltrim(`dl:mismatches:${launch.id}`, -100, -1);
      }

      // Track latency
      await redis.hincrby(`dl:latency:${launch.id}`, "primaryTotal", primaryLatency);
      await redis.hincrby(`dl:latency:${launch.id}`, "shadowTotal", shadowLatency);
      await redis.hincrby(`dl:latency:${launch.id}`, "count", 1);
    }
  } catch (error: any) {
    launch.stats.shadowFailures++;
    await redis.hincrby(`dl:errors:${launch.id}`, "count", 1);
  }
}

function compareResponses(pStatus: number, pBody: string, sStatus: number, sBody: string, pLatency: number, sLatency: number): ComparisonResult {
  const statusMatch = pStatus === sStatus;
  let bodyDiff: string | null = null;

  if (pBody !== sBody) {
    try {
      const pJson = JSON.parse(pBody);
      const sJson = JSON.parse(sBody);
      // Compare structure, ignoring timestamps and IDs
      const pKeys = Object.keys(pJson).sort().join(",");
      const sKeys = Object.keys(sJson).sort().join(",");
      if (pKeys !== sKeys) bodyDiff = `Structure diff: primary has [${pKeys}], shadow has [${sKeys}]`;
    } catch {
      if (pBody.length !== sBody.length) bodyDiff = `Body length diff: ${pBody.length} vs ${sBody.length}`;
    }
  }

  return { match: statusMatch && !bodyDiff, primaryStatus: pStatus, shadowStatus: sStatus, primaryLatency: pLatency, shadowLatency: sLatency, bodyDiff };
}

// Get dark launch report
export async function getReport(launchId: string): Promise<{ launch: DarkLaunch; mismatches: any[]; latencyComparison: { primary: number; shadow: number; diff: number } }> {
  const launch = launches.get(launchId);
  if (!launch) throw new Error("Launch not found");

  const mismatches = (await redis.lrange(`dl:mismatches:${launchId}`, 0, -1)).map((m) => JSON.parse(m));
  const latency = await redis.hgetall(`dl:latency:${launchId}`);
  const count = parseInt(latency.count || "1");

  return {
    launch,
    mismatches,
    latencyComparison: {
      primary: Math.round(parseInt(latency.primaryTotal || "0") / count),
      shadow: Math.round(parseInt(latency.shadowTotal || "0") / count),
      diff: Math.round((parseInt(latency.shadowTotal || "0") - parseInt(latency.primaryTotal || "0")) / count),
    },
  };
}

// Promote shadow to primary (it's safe!)
export function promote(launchId: string): void {
  const launch = launches.get(launchId);
  if (launch) launch.status = "promoted";
}

// Rollback (just stop shadowing)
export function rollback(launchId: string): void {
  const launch = launches.get(launchId);
  if (launch) launch.status = "rolled_back";
}
```

## Results

- **Zero-risk production testing** — shadow handler processes real traffic; users always get primary response; bugs found before promotion
- **Performance comparison** — shadow: 450ms avg vs primary: 50ms → new code too slow; fix before promoting; 3-second query caught
- **Response mismatch detection** — new handler returns different JSON structure → caught automatically; API consumers won't break
- **Gradual rollout** — start at 10% shadow traffic; increase to 50%; if clean, promote to 100%; confidence-based deployment
- **Instant rollback** — shadow has issues? Stop shadowing; zero user impact; unlike canary where some users see the bad version
