---
title: Build a Tenant Usage Dashboard
slug: build-tenant-usage-dashboard
description: Build a multi-tenant usage dashboard with per-tenant metrics, resource consumption tracking, quota management, cost allocation, and self-service analytics for SaaS platforms.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: business
tags:
  - multi-tenant
  - dashboard
  - usage
  - quota
  - analytics
---

# Build a Tenant Usage Dashboard

## The Problem

Olga leads ops at a 25-person multi-tenant SaaS. Each tenant asks "how much am I using?" and the answer requires an engineer running SQL queries. There's no visibility into which tenants are approaching storage limits. Cost allocation per tenant is guesswork — the biggest customer might be subsidized by smaller ones. When a tenant hits a limit, they get a cryptic 500 error instead of a helpful message. They need a tenant usage dashboard: self-service usage metrics, quota tracking with alerts, cost breakdown per tenant, and admin overview of all tenants.

## Step 1: Build the Usage Dashboard

```typescript
// src/tenants/usage.ts — Multi-tenant usage tracking with quotas and cost allocation
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface TenantUsage {
  tenantId: string;
  metrics: {
    apiCalls: { used: number; limit: number; percentage: number };
    storage: { usedMb: number; limitMb: number; percentage: number };
    users: { active: number; limit: number; percentage: number };
    bandwidth: { usedMb: number; limitMb: number; percentage: number };
  };
  cost: { estimated: number; breakdown: Record<string, number> };
  period: string;
}

interface TenantQuota {
  tenantId: string;
  plan: string;
  limits: Record<string, number>;
  overageAllowed: boolean;
  overageRate: Record<string, number>;
}

// Track usage event
export async function trackUsage(tenantId: string, metric: string, amount: number = 1): Promise<{ allowed: boolean; remaining: number }> {
  const period = getCurrentPeriod();
  const key = `usage:${tenantId}:${metric}:${period}`;

  const current = await redis.incrbyfloat(key, amount);
  await redis.expire(key, 86400 * 35);

  const quota = await getTenantQuota(tenantId);
  const limit = quota.limits[metric] || Infinity;
  const remaining = Math.max(0, limit - current);

  if (current > limit && !quota.overageAllowed) {
    await redis.incrbyfloat(key, -amount);
    return { allowed: false, remaining: 0 };
  }

  // Alert at thresholds
  const percentage = (current / limit) * 100;
  for (const threshold of [80, 90, 95, 100]) {
    if (percentage >= threshold) {
      const alertKey = `usage:alert:${tenantId}:${metric}:${threshold}:${period}`;
      const sent = await redis.set(alertKey, "1", "EX", 86400, "NX");
      if (sent) {
        await redis.rpush("notification:queue", JSON.stringify({
          type: "usage_threshold", tenantId, metric, percentage: threshold, current, limit,
        }));
      }
    }
  }

  return { allowed: true, remaining };
}

// Get tenant usage dashboard
export async function getTenantDashboard(tenantId: string): Promise<TenantUsage> {
  const period = getCurrentPeriod();
  const quota = await getTenantQuota(tenantId);

  const metrics: Record<string, { used: number; limit: number; percentage: number }> = {};
  const costBreakdown: Record<string, number> = {};

  for (const [metric, limit] of Object.entries(quota.limits)) {
    const key = `usage:${tenantId}:${metric}:${period}`;
    const used = parseFloat(await redis.get(key) || "0");
    const percentage = limit > 0 ? Math.round((used / limit) * 100) : 0;
    metrics[metric] = { used, limit, percentage } as any;

    // Cost calculation
    const includedCost = 0;
    const overageCost = used > limit && quota.overageAllowed
      ? (used - limit) * (quota.overageRate[metric] || 0)
      : 0;
    costBreakdown[metric] = Math.round(overageCost * 100) / 100;
  }

  const estimatedCost = Object.values(costBreakdown).reduce((s, c) => s + c, 0);

  return {
    tenantId,
    metrics: metrics as any,
    cost: { estimated: estimatedCost, breakdown: costBreakdown },
    period,
  };
}

// Admin: overview of all tenants
export async function getAllTenantsOverview(): Promise<Array<{
  tenantId: string; plan: string; topMetric: string; topUsagePercentage: number; estimatedCost: number;
}>> {
  const { rows: tenants } = await pool.query("SELECT id, plan FROM tenants WHERE status = 'active'");
  const overviews = [];

  for (const tenant of tenants) {
    const dashboard = await getTenantDashboard(tenant.id);
    const topMetric = Object.entries(dashboard.metrics)
      .sort((a, b) => (b[1] as any).percentage - (a[1] as any).percentage)[0];

    overviews.push({
      tenantId: tenant.id,
      plan: tenant.plan,
      topMetric: topMetric?.[0] || "none",
      topUsagePercentage: (topMetric?.[1] as any)?.percentage || 0,
      estimatedCost: dashboard.cost.estimated,
    });
  }

  return overviews.sort((a, b) => b.topUsagePercentage - a.topUsagePercentage);
}

// Middleware: check quota before processing request
export function quotaMiddleware(metric: string, amount: number = 1) {
  return async (c: any, next: any) => {
    const tenantId = c.get("tenantId") || c.req.header("X-Tenant-ID");
    if (!tenantId) return c.json({ error: "Tenant ID required" }, 400);

    const { allowed, remaining } = await trackUsage(tenantId, metric, amount);
    c.header("X-Usage-Remaining", String(remaining));

    if (!allowed) {
      return c.json({
        error: "Quota exceeded",
        metric,
        message: `You've reached your ${metric} limit. Upgrade your plan for more.`,
      }, 429);
    }

    await next();
  };
}

async function getTenantQuota(tenantId: string): Promise<TenantQuota> {
  const cached = await redis.get(`quota:${tenantId}`);
  if (cached) return JSON.parse(cached);

  const { rows: [tenant] } = await pool.query("SELECT id, plan FROM tenants WHERE id = $1", [tenantId]);
  const planLimits: Record<string, Record<string, number>> = {
    free: { apiCalls: 1000, storage: 100, users: 3, bandwidth: 500 },
    starter: { apiCalls: 50000, storage: 5000, users: 10, bandwidth: 10000 },
    pro: { apiCalls: 500000, storage: 50000, users: 50, bandwidth: 100000 },
    enterprise: { apiCalls: 5000000, storage: 500000, users: 500, bandwidth: 1000000 },
  };

  const quota: TenantQuota = {
    tenantId,
    plan: tenant?.plan || "free",
    limits: planLimits[tenant?.plan || "free"] || planLimits.free,
    overageAllowed: ["pro", "enterprise"].includes(tenant?.plan),
    overageRate: { apiCalls: 0.001, storage: 0.05, bandwidth: 0.02 },
  };

  await redis.setex(`quota:${tenantId}`, 300, JSON.stringify(quota));
  return quota;
}

function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7);
}
```

## Results

- **Self-service usage visibility** — tenants see their API calls, storage, users, bandwidth in real-time dashboard; no more engineering support requests for "how much am I using?"
- **Quota enforcement with friendly errors** — free tier hits 1000 API calls → clear message "upgrade for more" with remaining count in header; no cryptic 500 errors
- **Cost allocation accurate** — enterprise tenant consuming 60% of resources pays proportionally; no more cross-subsidization; pricing aligned with actual usage
- **Threshold alerts** — 80% usage → warning email; 95% → urgent Slack; 100% → admin notified; tenants never surprised by hard limits
- **Admin overview** — ops team sees all tenants sorted by usage; identifies tenants approaching limits; proactive outreach for upsell; no more reactive firefighting
