---
title: Build a Performance Budget Monitor
slug: build-performance-budget-monitor
description: Build a performance budget system that tracks bundle sizes, Core Web Vitals, and page load metrics — blocking deployments that exceed budgets and alerting on regressions.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - performance
  - web-vitals
  - monitoring
  - ci-cd
  - frontend
---

# Build a Performance Budget Monitor

## The Problem

Emil leads frontend at a 25-person company. The app started at 200KB JavaScript and now ships 1.4MB. Page load went from 1.5s to 6.8s. Nobody noticed because it happened gradually — each PR added "just" 20KB. Core Web Vitals are red in Google Search Console, hurting SEO. They need a performance budget that prevents regressions: if a PR increases bundle size beyond the budget, the CI build fails. If real-user metrics degrade, the team gets alerted.

## Step 1: Build the Performance Budget System

```typescript
// src/performance/budget.ts — Performance budgets with CI integration and RUM tracking
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface PerformanceBudget {
  metric: string;
  target: number;
  warning: number;             // warn at this threshold
  unit: string;
  category: "size" | "timing" | "score";
}

const BUDGETS: PerformanceBudget[] = [
  // Bundle sizes
  { metric: "js_total", target: 300000, warning: 250000, unit: "bytes", category: "size" },
  { metric: "css_total", target: 100000, warning: 80000, unit: "bytes", category: "size" },
  { metric: "image_total", target: 500000, warning: 400000, unit: "bytes", category: "size" },
  { metric: "total_transfer", target: 1000000, warning: 800000, unit: "bytes", category: "size" },

  // Core Web Vitals
  { metric: "lcp", target: 2500, warning: 2000, unit: "ms", category: "timing" },         // Largest Contentful Paint
  { metric: "fid", target: 100, warning: 50, unit: "ms", category: "timing" },             // First Input Delay
  { metric: "cls", target: 0.1, warning: 0.05, unit: "score", category: "score" },         // Cumulative Layout Shift
  { metric: "ttfb", target: 800, warning: 500, unit: "ms", category: "timing" },           // Time to First Byte
  { metric: "fcp", target: 1800, warning: 1200, unit: "ms", category: "timing" },          // First Contentful Paint
  { metric: "inp", target: 200, warning: 100, unit: "ms", category: "timing" },            // Interaction to Next Paint

  // Other
  { metric: "dom_elements", target: 1500, warning: 1000, unit: "count", category: "score" },
  { metric: "requests", target: 50, warning: 35, unit: "count", category: "score" },
];

interface BudgetCheckResult {
  passed: boolean;
  results: Array<{
    metric: string;
    value: number;
    target: number;
    status: "pass" | "warning" | "fail";
    overBy: number;            // how much over budget (0 if under)
    unit: string;
  }>;
  summary: string;
}

// CI check: validate build against budgets
export async function checkBuildBudget(
  buildMetrics: Record<string, number>,
  commitSha: string,
  branch: string
): Promise<BudgetCheckResult> {
  const results = [];
  let hasFailure = false;
  let hasWarning = false;

  for (const budget of BUDGETS) {
    const value = buildMetrics[budget.metric];
    if (value === undefined) continue;

    let status: "pass" | "warning" | "fail" = "pass";
    if (value > budget.target) {
      status = "fail";
      hasFailure = true;
    } else if (value > budget.warning) {
      status = "warning";
      hasWarning = true;
    }

    results.push({
      metric: budget.metric,
      value,
      target: budget.target,
      status,
      overBy: Math.max(0, value - budget.target),
      unit: budget.unit,
    });
  }

  // Store build metrics for trend tracking
  await pool.query(
    `INSERT INTO build_metrics (commit_sha, branch, metrics, results, passed, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [commitSha, branch, JSON.stringify(buildMetrics), JSON.stringify(results), !hasFailure]
  );

  // Compare with previous build
  const { rows: [previous] } = await pool.query(
    `SELECT metrics FROM build_metrics WHERE branch = 'main' ORDER BY created_at DESC LIMIT 1`
  );

  let regressions: string[] = [];
  if (previous) {
    const prevMetrics = JSON.parse(previous.metrics);
    for (const result of results) {
      const prevValue = prevMetrics[result.metric];
      if (prevValue !== undefined && result.value > prevValue * 1.05) {
        regressions.push(`${result.metric}: ${formatValue(prevValue, result.unit)} → ${formatValue(result.value, result.unit)} (+${Math.round((result.value / prevValue - 1) * 100)}%)`);
      }
    }
  }

  const failedMetrics = results.filter((r) => r.status === "fail");
  const warningMetrics = results.filter((r) => r.status === "warning");

  let summary = hasFailure
    ? `❌ Budget exceeded: ${failedMetrics.map((f) => `${f.metric} (${formatValue(f.value, f.unit)} > ${formatValue(f.target, f.unit)})`).join(", ")}`
    : hasWarning
    ? `⚠️ Approaching budget: ${warningMetrics.map((w) => w.metric).join(", ")}`
    : "✅ All performance budgets passed";

  if (regressions.length > 0) {
    summary += `\n📈 Regressions: ${regressions.join("; ")}`;
  }

  return { passed: !hasFailure, results, summary };
}

// Real User Monitoring (RUM): collect browser metrics
export async function collectRUM(metrics: {
  url: string;
  lcp: number;
  fid: number;
  cls: number;
  ttfb: number;
  fcp: number;
  inp: number;
  connectionType: string;
  deviceType: string;
  country: string;
}): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);

  // Store in Redis for real-time aggregation
  for (const [metric, value] of Object.entries(metrics)) {
    if (typeof value !== "number") continue;
    await redis.rpush(`rum:${metric}:${day}`, String(value));
    await redis.expire(`rum:${metric}:${day}`, 86400 * 30);
  }

  // Batch persist
  await pool.query(
    `INSERT INTO rum_events (url, lcp, fid, cls, ttfb, fcp, inp, connection_type, device_type, country, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [metrics.url, metrics.lcp, metrics.fid, metrics.cls, metrics.ttfb, metrics.fcp, metrics.inp,
     metrics.connectionType, metrics.deviceType, metrics.country]
  );

  // Check budget violations on real traffic
  await checkRUMBudgets(metrics);
}

async function checkRUMBudgets(metrics: Record<string, any>): Promise<void> {
  for (const budget of BUDGETS.filter((b) => b.category === "timing" || b.category === "score")) {
    const value = metrics[budget.metric];
    if (value === undefined) continue;

    if (value > budget.target * 1.5) {
      // Severe violation — alert
      const alertKey = `rum:alert:${budget.metric}`;
      const alreadyAlerted = await redis.get(alertKey);
      if (!alreadyAlerted) {
        await redis.setex(alertKey, 3600, "1");
        await redis.rpush("notification:queue", JSON.stringify({
          type: "performance_alert",
          metric: budget.metric,
          value, target: budget.target,
          message: `${budget.metric} is ${formatValue(value, budget.unit)} (budget: ${formatValue(budget.target, budget.unit)})`,
        }));
      }
    }
  }
}

// Get RUM percentiles for dashboard
export async function getRUMStats(metric: string, days: number = 7): Promise<{
  p50: number; p75: number; p95: number; p99: number;
  trend: Array<{ date: string; p75: number }>;
  budget: number;
  status: "pass" | "warning" | "fail";
}> {
  const values: number[] = [];
  const trend = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const dayValues = (await redis.lrange(`rum:${metric}:${date}`, 0, -1)).map(Number).sort((a, b) => a - b);

    if (dayValues.length > 0) {
      values.push(...dayValues);
      trend.push({ date, p75: percentile(dayValues, 75) });
    }
  }

  values.sort((a, b) => a - b);
  const budget = BUDGETS.find((b) => b.metric === metric);
  const p75 = percentile(values, 75);

  return {
    p50: percentile(values, 50),
    p75,
    p95: percentile(values, 95),
    p99: percentile(values, 99),
    trend: trend.reverse(),
    budget: budget?.target || 0,
    status: p75 > (budget?.target || Infinity) ? "fail" : p75 > (budget?.warning || Infinity) ? "warning" : "pass",
  };
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const idx = Math.ceil(arr.length * p / 100) - 1;
  return arr[Math.max(0, idx)];
}

function formatValue(value: number, unit: string): string {
  if (unit === "bytes") return `${(value / 1024).toFixed(0)}KB`;
  if (unit === "ms") return `${value}ms`;
  return String(value);
}
```

## Results

- **Bundle size: 1.4MB → 290KB** — budget of 300KB enforced in CI; PRs that exceed it fail; team learned to code-split and lazy-load
- **LCP: 6.8s → 1.9s** — Core Web Vitals budgets caught regressions early; each PR is checked against the 2.5s target
- **Google Search Console: red → green** — all Core Web Vitals passed; SEO ranking improved; organic traffic up 25%
- **Gradual degradation impossible** — "just 20KB" PRs that would push over budget are caught; performance death by a thousand cuts prevented
- **Real-user data validates lab metrics** — RUM p75 LCP matches Lighthouse scores; team trusts the numbers because they come from actual users
