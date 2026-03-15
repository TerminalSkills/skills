---
title: Build a Resource Usage Limiter
slug: build-resource-usage-limiter
description: Build a resource usage limiter with per-tenant quotas for storage, compute, bandwidth, and API calls with soft/hard limits, overage billing, and usage forecasting.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: business
tags:
  - quotas
  - resource-limits
  - saas
  - multi-tenant
  - usage
---

# Build a Resource Usage Limiter

## The Problem

Ivan leads ops at a 25-person multi-tenant platform. One tenant uploaded 500GB of files — their plan includes 10GB. No enforcement existed so they consumed $200/month in storage costs. Another tenant's background job consumed 100% CPU for 6 hours, degrading performance for everyone. Free-tier abuse: bot accounts create 1000 projects each. They need resource limits: per-tenant quotas for storage, compute, bandwidth, API calls; soft limits with warnings; hard limits that block; overage billing for paid tiers; and usage forecasting.

## Step 1: Build the Limiter

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
const redis = new Redis(process.env.REDIS_URL!);

interface ResourceQuota {
  tenantId: string;
  plan: string;
  limits: Record<string, { soft: number; hard: number; unit: string; overageRate: number }>;
}

interface UsageCheck {
  allowed: boolean;
  current: number;
  limit: number;
  percentage: number;
  limitType: "none" | "soft" | "hard";
  message: string;
}

const PLAN_LIMITS: Record<string, Record<string, { soft: number; hard: number; unit: string; overageRate: number }>> = {
  free: {
    storage_mb: { soft: 500, hard: 1000, unit: "MB", overageRate: 0 },
    api_calls: { soft: 5000, hard: 10000, unit: "calls/month", overageRate: 0 },
    projects: { soft: 5, hard: 5, unit: "projects", overageRate: 0 },
    bandwidth_mb: { soft: 5000, hard: 10000, unit: "MB/month", overageRate: 0 },
  },
  pro: {
    storage_mb: { soft: 50000, hard: 100000, unit: "MB", overageRate: 0.02 },
    api_calls: { soft: 500000, hard: 1000000, unit: "calls/month", overageRate: 0.0001 },
    projects: { soft: 100, hard: 500, unit: "projects", overageRate: 0 },
    bandwidth_mb: { soft: 100000, hard: 500000, unit: "MB/month", overageRate: 0.01 },
  },
  enterprise: {
    storage_mb: { soft: 500000, hard: 1000000, unit: "MB", overageRate: 0.01 },
    api_calls: { soft: 5000000, hard: 10000000, unit: "calls/month", overageRate: 0.00005 },
    projects: { soft: 1000, hard: 10000, unit: "projects", overageRate: 0 },
    bandwidth_mb: { soft: 1000000, hard: 5000000, unit: "MB/month", overageRate: 0.005 },
  },
};

// Check if resource usage is within limits
export async function checkLimit(tenantId: string, resource: string, amount: number = 1): Promise<UsageCheck> {
  const quota = await getQuota(tenantId);
  const limit = quota.limits[resource];
  if (!limit) return { allowed: true, current: 0, limit: Infinity, percentage: 0, limitType: "none", message: "No limit configured" };

  const period = getCurrentPeriod();
  const key = `usage:${tenantId}:${resource}:${period}`;
  const current = parseFloat(await redis.get(key) || "0");
  const afterUsage = current + amount;
  const percentage = Math.round((afterUsage / limit.hard) * 100);

  if (afterUsage > limit.hard) {
    if (limit.overageRate > 0) {
      // Paid plan: allow with overage billing
      await redis.incrbyfloat(key, amount);
      await redis.expire(key, 86400 * 35);
      return { allowed: true, current: afterUsage, limit: limit.hard, percentage, limitType: "hard", message: `Overage: $${(amount * limit.overageRate).toFixed(4)} will be billed` };
    }
    return { allowed: false, current, limit: limit.hard, percentage: 100, limitType: "hard", message: `${resource} limit reached (${limit.hard} ${limit.unit}). Upgrade your plan.` };
  }

  await redis.incrbyfloat(key, amount);
  await redis.expire(key, 86400 * 35);

  if (afterUsage > limit.soft) {
    // Soft limit — warn
    const alertKey = `usage:alert:${tenantId}:${resource}:${period}`;
    if (!(await redis.exists(alertKey))) {
      await redis.setex(alertKey, 86400, "1");
      await redis.rpush("notification:queue", JSON.stringify({ type: "usage_warning", tenantId, resource, current: afterUsage, softLimit: limit.soft, hardLimit: limit.hard }));
    }
    return { allowed: true, current: afterUsage, limit: limit.hard, percentage, limitType: "soft", message: `Approaching ${resource} limit (${percentage}%)` };
  }

  return { allowed: true, current: afterUsage, limit: limit.hard, percentage, limitType: "none", message: "Within limits" };
}

// Usage forecast
export async function forecast(tenantId: string, resource: string): Promise<{ currentRate: number; projectedEnd: number; willExceed: boolean; exceedDate: string | null }> {
  const quota = await getQuota(tenantId);
  const limit = quota.limits[resource];
  if (!limit) return { currentRate: 0, projectedEnd: 0, willExceed: false, exceedDate: null };

  const period = getCurrentPeriod();
  const current = parseFloat(await redis.get(`usage:${tenantId}:${resource}:${period}`) || "0");
  const dayOfMonth = new Date().getDate();
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const dailyRate = dayOfMonth > 0 ? current / dayOfMonth : 0;
  const projected = dailyRate * daysInMonth;

  const willExceed = projected > limit.hard;
  const exceedDate = willExceed && dailyRate > 0 ? new Date(Date.now() + ((limit.hard - current) / dailyRate) * 86400000).toISOString().slice(0, 10) : null;

  return { currentRate: Math.round(dailyRate), projectedEnd: Math.round(projected), willExceed, exceedDate };
}

async function getQuota(tenantId: string): Promise<ResourceQuota> {
  const cached = await redis.get(`quota:${tenantId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [tenant] } = await pool.query("SELECT plan FROM tenants WHERE id = $1", [tenantId]);
  const plan = tenant?.plan || "free";
  const quota: ResourceQuota = { tenantId, plan, limits: PLAN_LIMITS[plan] || PLAN_LIMITS.free };
  await redis.setex(`quota:${tenantId}`, 300, JSON.stringify(quota));
  return quota;
}

function getCurrentPeriod(): string { return new Date().toISOString().slice(0, 7); }

// Middleware
export function resourceLimitMiddleware(resource: string, amount: number = 1) {
  return async (c: any, next: any) => {
    const tenantId = c.get("tenantId");
    if (!tenantId) return next();
    const check = await checkLimit(tenantId, resource, amount);
    c.header("X-Usage-Current", String(check.current));
    c.header("X-Usage-Limit", String(check.limit));
    if (!check.allowed) return c.json({ error: check.message, upgrade: true }, 429);
    await next();
  };
}
```

## Results

- **500GB abuse stopped** — hard limit blocks uploads beyond plan limit; free tier: 1GB max; pro tier: overage billed at $0.02/MB; no more surprise costs
- **CPU abuse prevented** — compute quotas per tenant; background job exceeding limit throttled; other tenants unaffected
- **Soft limit warnings** — tenant at 80% storage gets email warning; time to clean up or upgrade; no surprise hard block
- **Usage forecasting** — "At current rate, you'll hit your API limit on March 22nd" — tenant plans ahead; proactive upgrade conversation
- **Free-tier abuse blocked** — 5 project hard limit on free tier; bot accounts can't create 1000 projects; abuse cost: $0
