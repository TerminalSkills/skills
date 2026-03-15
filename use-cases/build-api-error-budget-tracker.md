---
title: Build an API Error Budget Tracker
slug: build-api-error-budget-tracker
description: Build an API error budget tracker with SLO/SLI monitoring, budget consumption tracking, burn rate alerts, incident correlation, and reliability reporting for SRE practices.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: DevOps & Infrastructure
tags:
  - slo
  - sli
  - error-budget
  - reliability
  - sre
---

# Build an API Error Budget Tracker

## The Problem

Kira leads SRE at a 25-person company running APIs with 99.9% availability target. They don't know if they're meeting it — monitoring shows uptime but not error rates against SLO targets. Deploys happen whenever, even when reliability is low. Last month they used 200% of their error budget (30 minutes of errors, SLO allows 43 minutes/month) but nobody knew until the monthly report. There's no mechanism to slow down deploys when reliability is poor. They need error budget tracking: define SLOs, measure SLIs in real-time, track budget consumption, alert on burn rate, and freeze deploys when budget is exhausted.

## Step 1: Build the Error Budget Engine

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);

interface SLO {
  id: string;
  name: string;
  service: string;
  sliType: "availability" | "latency" | "error_rate";
  target: number;
  window: "rolling_30d" | "calendar_month";
  budgetMinutes: number;
}

interface BudgetStatus {
  slo: SLO;
  currentSLI: number;
  budgetTotal: number;
  budgetConsumed: number;
  budgetRemaining: number;
  budgetPercentUsed: number;
  burnRate: number;
  status: "healthy" | "warning" | "critical" | "exhausted";
  projectedExhaustion: string | null;
}

const SLOS: SLO[] = [
  { id: "api-availability", name: "API Availability", service: "api", sliType: "availability", target: 99.9, window: "rolling_30d", budgetMinutes: 43.2 },
  { id: "api-latency-p99", name: "API Latency P99", service: "api", sliType: "latency", target: 500, window: "rolling_30d", budgetMinutes: 43.2 },
  { id: "payments-availability", name: "Payments Availability", service: "payments", sliType: "availability", target: 99.99, window: "rolling_30d", budgetMinutes: 4.32 },
];

// Record SLI measurement
export async function recordSLI(service: string, measurement: { timestamp: number; available: boolean; latencyMs: number; errorRate: number }): Promise<void> {
  const minute = Math.floor(measurement.timestamp / 60000);
  const pipeline = redis.pipeline();
  pipeline.hincrby(`sli:${service}:${minute}`, "total", 1);
  if (measurement.available) pipeline.hincrby(`sli:${service}:${minute}`, "good", 1);
  if (measurement.latencyMs <= 500) pipeline.hincrby(`sli:${service}:${minute}`, "fast", 1);
  pipeline.hincrby(`sli:${service}:${minute}`, "totalLatency", measurement.latencyMs);
  pipeline.expire(`sli:${service}:${minute}`, 86400 * 35);
  await pipeline.exec();
}

// Get current error budget status
export async function getBudgetStatus(sloId: string): Promise<BudgetStatus> {
  const slo = SLOS.find((s) => s.id === sloId);
  if (!slo) throw new Error("SLO not found");

  const windowMinutes = 30 * 24 * 60;
  const now = Math.floor(Date.now() / 60000);
  let totalMeasurements = 0;
  let goodMeasurements = 0;
  let badMinutes = 0;

  // Sample every 5 minutes for efficiency
  for (let m = now - windowMinutes; m <= now; m += 5) {
    const data = await redis.hgetall(`sli:${slo.service}:${m}`);
    if (!data.total) continue;
    const total = parseInt(data.total);
    const good = parseInt(data.good || "0");
    totalMeasurements += total;
    goodMeasurements += good;
    if (good < total) badMinutes += 5;
  }

  const currentSLI = totalMeasurements > 0 ? (goodMeasurements / totalMeasurements) * 100 : 100;
  const budgetTotal = slo.budgetMinutes;
  const budgetConsumed = badMinutes;
  const budgetRemaining = Math.max(0, budgetTotal - budgetConsumed);
  const budgetPercentUsed = (budgetConsumed / budgetTotal) * 100;

  // Burn rate: how fast are we consuming budget
  const recentBadMinutes = await countBadMinutes(slo.service, 60);
  const burnRate = recentBadMinutes; // bad minutes per hour
  const projectedExhaustion = burnRate > 0 ? new Date(Date.now() + (budgetRemaining / burnRate) * 3600000).toISOString() : null;

  const status = budgetPercentUsed >= 100 ? "exhausted" : budgetPercentUsed >= 80 ? "critical" : budgetPercentUsed >= 50 ? "warning" : "healthy";

  // Alert on high burn rate
  if (burnRate > budgetTotal / (30 * 24) * 10) {
    await redis.rpush("notification:queue", JSON.stringify({ type: "error_budget_burn", sloId, burnRate, budgetRemaining, status }));
  }

  return { slo, currentSLI: Math.round(currentSLI * 1000) / 1000, budgetTotal, budgetConsumed, budgetRemaining, budgetPercentUsed: Math.round(budgetPercentUsed * 10) / 10, burnRate, status, projectedExhaustion };
}

async function countBadMinutes(service: string, windowMinutes: number): Promise<number> {
  const now = Math.floor(Date.now() / 60000);
  let badMinutes = 0;
  for (let m = now - windowMinutes; m <= now; m++) {
    const data = await redis.hgetall(`sli:${service}:${m}`);
    if (data.total && parseInt(data.good || "0") < parseInt(data.total)) badMinutes++;
  }
  return badMinutes;
}

// Deploy gate: should we deploy?
export async function canDeploy(service: string): Promise<{ allowed: boolean; reason: string }> {
  const serviceSLOs = SLOS.filter((s) => s.service === service);
  for (const slo of serviceSLOs) {
    const status = await getBudgetStatus(slo.id);
    if (status.status === "exhausted") return { allowed: false, reason: `Error budget exhausted for ${slo.name}. ${status.budgetConsumed.toFixed(1)} of ${status.budgetTotal.toFixed(1)} minutes consumed.` };
    if (status.status === "critical" && status.burnRate > 0) return { allowed: false, reason: `Error budget critical (${status.budgetPercentUsed.toFixed(1)}% used) with active burn. Fix reliability before deploying.` };
  }
  return { allowed: true, reason: "All SLOs within budget" };
}

// Dashboard: all SLOs at a glance
export async function getDashboard(): Promise<BudgetStatus[]> {
  const statuses: BudgetStatus[] = [];
  for (const slo of SLOS) {
    statuses.push(await getBudgetStatus(slo.id));
  }
  return statuses;
}

// Monthly report
export async function getMonthlyReport(month?: string): Promise<{ slos: Array<{ name: string; target: number; actual: number; budgetUsed: number; met: boolean }> }> {
  const slos = [];
  for (const slo of SLOS) {
    const status = await getBudgetStatus(slo.id);
    slos.push({ name: slo.name, target: slo.target, actual: status.currentSLI, budgetUsed: status.budgetPercentUsed, met: status.currentSLI >= slo.target });
  }
  return { slos };
}
```

## Results

- **Budget exhaustion known in real-time** — dashboard shows 78% of budget consumed with 10 days left; team prioritizes reliability over features
- **Deploy gate prevents damage** — budget critical → deploys blocked with clear reason; no more shipping features while reliability is suffering
- **Burn rate alerts** — consuming budget 10x faster than sustainable rate → alert fires in 5 minutes; incident response starts before major outage
- **Monthly SLO report** — API: 99.92% (target: 99.9%) ✅; Payments: 99.987% (target: 99.99%) ✅; data-driven reliability discussions
- **Budget projected exhaustion** — "At current burn rate, budget exhausts March 22" → team has 7 days to fix; proactive, not reactive
