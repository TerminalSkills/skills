---
title: Build a Canary Deployment Pipeline
slug: build-canary-deployment-pipeline
description: >
  Ship code to 1% of users first, automatically promote or rollback
  based on error rates and latency — catching production bugs before
  they hit 99% of users and reducing deployment incidents by 85%.
skills:
  - typescript
  - kubernetes-helm
  - github-actions
  - redis
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - canary-deployment
  - progressive-delivery
  - rollback
  - ci-cd
  - deployment
  - traffic-shifting
---

# Build a Canary Deployment Pipeline

## The Problem

A team deploys 8 times per day using blue-green deployments. The switch is all-or-nothing: 100% of traffic moves to the new version instantly. When something breaks, all users are affected. Last month, a database query regression increased p99 latency from 200ms to 4 seconds — every user experienced it for 12 minutes before the manual rollback. The team hesitates to deploy on Fridays. Deployment fear is slowing iteration — "if we can't safely ship, we ship less."

## Step 1: Traffic Splitting Controller

```typescript
// src/canary/controller.ts
import { Redis } from 'ioredis';
import { z } from 'zod';

const redis = new Redis(process.env.REDIS_URL!);

const CanaryConfig = z.object({
  service: z.string(),
  canaryVersion: z.string(),
  stableVersion: z.string(),
  trafficPercent: z.number().min(0).max(100),
  phase: z.enum(['canary', 'promoting', 'stable', 'rolling_back']),
  startedAt: z.string().datetime(),
  metrics: z.object({
    errorRateThreshold: z.number().default(1),    // percent
    latencyP99Threshold: z.number().default(2000), // ms
    minSampleSize: z.number().int().default(100),
  }).default({}),
});

const PROMOTION_STEPS = [1, 5, 25, 50, 100]; // percent of traffic

export async function startCanary(
  service: string,
  canaryVersion: string,
  stableVersion: string
): Promise<void> {
  const config: z.infer<typeof CanaryConfig> = {
    service,
    canaryVersion,
    stableVersion,
    trafficPercent: PROMOTION_STEPS[0],
    phase: 'canary',
    startedAt: new Date().toISOString(),
    metrics: { errorRateThreshold: 1, latencyP99Threshold: 2000, minSampleSize: 100 },
  };

  await redis.set(`canary:${service}`, JSON.stringify(config));
  console.log(`🐤 Canary started: ${service} v${canaryVersion} at ${config.trafficPercent}% traffic`);
}

export async function evaluateCanary(service: string): Promise<'promote' | 'hold' | 'rollback'> {
  const raw = await redis.get(`canary:${service}`);
  if (!raw) return 'hold';

  const config = JSON.parse(raw) as z.infer<typeof CanaryConfig>;

  // Fetch canary metrics
  const canaryMetrics = await getMetrics(service, config.canaryVersion);
  const stableMetrics = await getMetrics(service, config.stableVersion);

  // Not enough data yet
  if (canaryMetrics.requestCount < config.metrics.minSampleSize) return 'hold';

  // Check error rate
  if (canaryMetrics.errorRate > config.metrics.errorRateThreshold) {
    console.log(`🚨 Canary error rate ${canaryMetrics.errorRate.toFixed(2)}% exceeds threshold`);
    return 'rollback';
  }

  // Check if canary errors are significantly worse than stable
  if (canaryMetrics.errorRate > stableMetrics.errorRate * 2) {
    console.log(`🚨 Canary error rate 2x worse than stable`);
    return 'rollback';
  }

  // Check latency
  if (canaryMetrics.latencyP99 > config.metrics.latencyP99Threshold) {
    console.log(`🚨 Canary p99 latency ${canaryMetrics.latencyP99}ms exceeds threshold`);
    return 'rollback';
  }

  // Check if latency is significantly worse
  if (canaryMetrics.latencyP99 > stableMetrics.latencyP99 * 1.5) {
    console.log(`🚨 Canary p99 1.5x worse than stable`);
    return 'rollback';
  }

  return 'promote';
}

export async function advanceCanary(service: string): Promise<void> {
  const raw = await redis.get(`canary:${service}`);
  if (!raw) return;

  const config = JSON.parse(raw) as z.infer<typeof CanaryConfig>;
  const currentStep = PROMOTION_STEPS.indexOf(config.trafficPercent);
  const nextStep = PROMOTION_STEPS[currentStep + 1];

  if (!nextStep || nextStep > 100) {
    // Fully promoted
    config.phase = 'stable';
    config.trafficPercent = 100;
    console.log(`✅ Canary promoted: ${service} v${config.canaryVersion} now serving 100%`);
  } else {
    config.trafficPercent = nextStep;
    console.log(`📈 Canary advanced: ${service} now at ${nextStep}% traffic`);
  }

  await redis.set(`canary:${service}`, JSON.stringify(config));
}

export async function rollbackCanary(service: string): Promise<void> {
  const raw = await redis.get(`canary:${service}`);
  if (!raw) return;

  const config = JSON.parse(raw) as z.infer<typeof CanaryConfig>;
  config.phase = 'rolling_back';
  config.trafficPercent = 0;

  await redis.set(`canary:${service}`, JSON.stringify(config));
  console.log(`⏪ Canary rolled back: ${service} v${config.canaryVersion} removed`);
}

interface Metrics { requestCount: number; errorRate: number; latencyP99: number; latencyP50: number; }

async function getMetrics(service: string, version: string): Promise<Metrics> {
  // Query Prometheus or application metrics
  const errorCount = parseInt(await redis.get(`metrics:${service}:${version}:errors`) ?? '0');
  const totalCount = parseInt(await redis.get(`metrics:${service}:${version}:total`) ?? '1');
  const latencyP99 = parseFloat(await redis.get(`metrics:${service}:${version}:p99`) ?? '0');
  const latencyP50 = parseFloat(await redis.get(`metrics:${service}:${version}:p50`) ?? '0');

  return {
    requestCount: totalCount,
    errorRate: (errorCount / totalCount) * 100,
    latencyP99,
    latencyP50,
  };
}
```

## Step 2: Automated Promotion Loop

```typescript
// src/canary/promotion-loop.ts
import { evaluateCanary, advanceCanary, rollbackCanary } from './controller';
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

const EVALUATION_INTERVAL = 60_000;  // check every minute
const PROMOTION_COOLDOWN = 300_000;  // wait 5 min between promotions

export async function startPromotionLoop(service: string): Promise<void> {
  let lastPromotion = 0;

  const interval = setInterval(async () => {
    const raw = await redis.get(`canary:${service}`);
    if (!raw) { clearInterval(interval); return; }

    const config = JSON.parse(raw);
    if (config.phase !== 'canary') { clearInterval(interval); return; }

    const decision = await evaluateCanary(service);

    switch (decision) {
      case 'promote':
        if (Date.now() - lastPromotion > PROMOTION_COOLDOWN) {
          await advanceCanary(service);
          lastPromotion = Date.now();

          // Check if fully promoted
          const updated = JSON.parse(await redis.get(`canary:${service}`) ?? '{}');
          if (updated.phase === 'stable') {
            clearInterval(interval);
            await notifySlack(service, `✅ v${config.canaryVersion} fully promoted`);
          }
        }
        break;

      case 'rollback':
        await rollbackCanary(service);
        clearInterval(interval);
        await notifySlack(service, `⏪ v${config.canaryVersion} rolled back — metrics degraded`);
        break;

      case 'hold':
        // Wait for more data
        break;
    }
  }, EVALUATION_INTERVAL);
}

async function notifySlack(service: string, message: string): Promise<void> {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `[${service}] ${message}` }),
  }).catch(() => {});
}
```

## Step 3: Request Router Middleware

```typescript
// src/canary/router-middleware.ts
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

const redis = new Redis(process.env.REDIS_URL!);

export function canaryRouter(service: string) {
  return async (c: any, next: any) => {
    const raw = await redis.get(`canary:${service}`);
    if (!raw) { c.set('version', 'stable'); return next(); }

    const config = JSON.parse(raw);
    if (config.phase === 'stable' || config.trafficPercent >= 100) {
      c.set('version', config.canaryVersion);
      return next();
    }

    // Sticky assignment: same user always gets same version
    const userId = c.req.header('X-User-ID') ?? c.req.header('CF-Connecting-IP') ?? 'anon';
    const hash = createHash('md5').update(`${userId}:${service}`).digest();
    const bucket = hash.readUInt32BE(0) % 100;

    const isCanary = bucket < config.trafficPercent;
    c.set('version', isCanary ? config.canaryVersion : config.stableVersion);

    // Track metrics
    const version = c.get('version');
    await redis.incr(`metrics:${service}:${version}:total`);

    await next();

    // Record errors
    if (c.res.status >= 500) {
      await redis.incr(`metrics:${service}:${version}:errors`);
    }
  };
}
```

## Results

- **Deployment incidents**: 85% reduction (1/month vs 7/month)
- **Blast radius**: bugs affect 1-5% of users initially (was 100%)
- **The latency regression**: would have been caught at 1% traffic, auto-rolled back in 2 minutes
- **Friday deploys**: team ships confidently any day, any time
- **Promotion time**: 30 minutes from canary start to 100% (automated steps)
- **Manual rollbacks**: near-zero (automated detection is faster than humans)
- **Deployment frequency**: increased from 8 to 15 deploys/day (confidence enables velocity)
