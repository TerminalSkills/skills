---
title: Build Feature Usage Analytics
slug: build-feature-usage-analytics
description: Build feature usage analytics with event tracking, adoption funnels, cohort analysis, feature retention curves, and product decision dashboards for data-driven product development.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - analytics
  - feature-usage
  - product
  - tracking
  - metrics
---

# Build Feature Usage Analytics

## The Problem

Sam leads product at a 25-person SaaS. They shipped 30 features last year but don't know which ones users actually use. The "advanced filters" feature took 3 months to build — 4% adoption. Nobody discovered it. The "quick export" took 2 weeks — 60% adoption. Product decisions are based on loudest customer requests, not usage data. Feature flags exist but there's no analytics on post-launch adoption. They need feature usage tracking: who uses what, adoption curves, feature retention, discovery funnel, and data to decide what to build (or kill) next.

## Step 1: Build the Analytics Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface FeatureEvent { userId: string; feature: string; action: "viewed" | "activated" | "used" | "completed"; metadata?: Record<string, any>; timestamp: number; }
interface FeatureMetrics { feature: string; totalUsers: number; activeUsers: number; adoptionRate: number; avgUsagePerUser: number; retentionDay7: number; retentionDay30: number; discoveryRate: number; }

// Track feature usage event
export async function trackFeatureEvent(event: FeatureEvent): Promise<void> {
  const day = new Date(event.timestamp).toISOString().slice(0, 10);
  const pipeline = redis.pipeline();
  pipeline.sadd(`feature:users:${event.feature}`, event.userId);
  pipeline.sadd(`feature:users:${event.feature}:${day}`, event.userId);
  pipeline.hincrby(`feature:events:${event.feature}`, event.action, 1);
  pipeline.hincrby(`feature:events:${event.feature}:${day}`, event.action, 1);
  if (event.action === "activated") {
    pipeline.sadd(`feature:activated:${event.feature}`, event.userId);
    pipeline.set(`feature:first_use:${event.feature}:${event.userId}`, event.timestamp);
  }
  await pipeline.exec();

  await pool.query(
    `INSERT INTO feature_events (user_id, feature, action, metadata, created_at) VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
    [event.userId, event.feature, event.action, JSON.stringify(event.metadata || {}), event.timestamp]
  );
}

// Get metrics for a feature
export async function getFeatureMetrics(feature: string): Promise<FeatureMetrics> {
  const totalUsers = await redis.scard(`feature:users:${feature}`);
  const today = new Date().toISOString().slice(0, 10);
  const activeUsers = await redis.scard(`feature:users:${feature}:${today}`);
  const activatedUsers = await redis.scard(`feature:activated:${feature}`);

  // Total registered users
  const { rows: [{ count: totalRegistered }] } = await pool.query("SELECT COUNT(*) as count FROM users WHERE status = 'active'");
  const adoptionRate = parseInt(totalRegistered) > 0 ? (totalUsers / parseInt(totalRegistered)) * 100 : 0;

  // Average usage per user
  const events = await redis.hgetall(`feature:events:${feature}`);
  const totalUsed = parseInt(events.used || "0");
  const avgUsage = totalUsers > 0 ? totalUsed / totalUsers : 0;

  // Discovery rate (viewed → activated)
  const viewed = parseInt(events.viewed || "0");
  const activated = parseInt(events.activated || "0");
  const discoveryRate = viewed > 0 ? (activated / viewed) * 100 : 0;

  // Retention
  const retentionDay7 = await calculateRetention(feature, 7);
  const retentionDay30 = await calculateRetention(feature, 30);

  return { feature, totalUsers, activeUsers, adoptionRate: Math.round(adoptionRate * 10) / 10, avgUsagePerUser: Math.round(avgUsage * 10) / 10, retentionDay7, retentionDay30, discoveryRate: Math.round(discoveryRate * 10) / 10 };
}

async function calculateRetention(feature: string, days: number): Promise<number> {
  const targetDate = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const firstUseDate = new Date(Date.now() - (days + 7) * 86400000).toISOString().slice(0, 10);

  // Users who first used the feature around firstUseDate
  const { rows: firstUsers } = await pool.query(
    `SELECT DISTINCT user_id FROM feature_events WHERE feature = $1 AND action = 'activated' AND created_at::date = $2`,
    [feature, firstUseDate]
  );
  if (firstUsers.length === 0) return 0;

  // Of those, how many used it again on targetDate or after
  const userIds = firstUsers.map((r: any) => r.user_id);
  const { rows: [{ count: retained }] } = await pool.query(
    `SELECT COUNT(DISTINCT user_id) as count FROM feature_events WHERE feature = $1 AND user_id = ANY($2) AND created_at::date >= $3`,
    [feature, userIds, targetDate]
  );

  return Math.round((parseInt(retained) / firstUsers.length) * 100);
}

// Get adoption funnel for a feature
export async function getAdoptionFunnel(feature: string): Promise<Array<{ stage: string; users: number; dropoff: number }>> {
  const events = await redis.hgetall(`feature:events:${feature}`);
  const stages = [
    { stage: "Viewed", users: parseInt(events.viewed || "0") },
    { stage: "Activated", users: parseInt(events.activated || "0") },
    { stage: "Used (1x)", users: parseInt(events.used || "0") > 0 ? await redis.scard(`feature:users:${feature}`) : 0 },
    { stage: "Used (5x+)", users: 0 },
    { stage: "Completed", users: parseInt(events.completed || "0") },
  ];

  return stages.map((s, i) => ({
    ...s,
    dropoff: i > 0 && stages[i - 1].users > 0 ? Math.round(((stages[i - 1].users - s.users) / stages[i - 1].users) * 100) : 0,
  }));
}

// Dashboard: all features ranked by usage
export async function getFeatureDashboard(): Promise<FeatureMetrics[]> {
  const { rows: features } = await pool.query("SELECT DISTINCT feature FROM feature_events");
  const metrics: FeatureMetrics[] = [];
  for (const f of features) {
    metrics.push(await getFeatureMetrics(f.feature));
  }
  return metrics.sort((a, b) => b.adoptionRate - a.adoptionRate);
}

// Middleware: auto-track feature views
export function featureTrackingMiddleware(featureMap: Record<string, string>) {
  return async (c: any, next: any) => {
    await next();
    const feature = featureMap[c.req.path];
    if (feature && c.get("userId")) {
      trackFeatureEvent({ userId: c.get("userId"), feature, action: "used", timestamp: Date.now() }).catch(() => {});
    }
  };
}
```

## Results

- **Kill underperformers** — "advanced filters": 4% adoption, 20% day-7 retention → deprioritized; "quick export": 60% adoption, 75% retention → invested more; data-driven roadmap
- **Discovery problem solved** — feature funnel shows 500 viewed → 50 activated (90% dropoff!); added onboarding tooltip → 500 viewed → 250 activated; 5x improvement
- **Retention curves reveal quality** — feature with high adoption but low retention = novelty; feature with moderate adoption but high retention = core value; different product strategies
- **Automatic tracking** — middleware auto-tracks feature usage per endpoint; no manual event calls; every API endpoint mapped to a feature
- **Product decisions backed by data** — stakeholder says "we need feature X"; dashboard shows 3% of users even tried similar feature Y; build something else
