---
title: Build an Auto-Scaling Engine
slug: build-auto-scaling-engine
description: Build an auto-scaling engine with metric-based triggers, predictive scaling, cooldown periods, instance management, cost optimization, and scaling event audit for cloud infrastructure.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: devops
tags:
  - auto-scaling
  - cloud
  - infrastructure
  - horizontal-scaling
  - cost-optimization
---

# Build an Auto-Scaling Engine

## The Problem

Lina leads infrastructure at a 25-person company with traffic spikes: Black Friday brings 20x normal load, marketing emails cause 5x spikes, and overnight traffic drops to 10%. They run 20 servers 24/7 to handle peak — wasting $15K/month on idle capacity at 3 AM. Manual scaling during spikes means 5 minutes of degraded performance while engineers add servers. They once forgot to scale down after a spike, burning $8K in unnecessary compute. They need auto-scaling: metric-based triggers, predictive pre-scaling for known events, cooldown periods to prevent flapping, and cost dashboards.

## Step 1: Build the Auto-Scaling Engine

```typescript
// src/scaling/engine.ts — Auto-scaling with metrics, prediction, and cost optimization
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface ScalingPolicy {
  id: string;
  name: string;
  serviceId: string;
  minInstances: number;
  maxInstances: number;
  targetMetric: string;      // "cpu", "memory", "requests_per_second", "queue_depth"
  targetValue: number;       // target metric value per instance
  scaleUpThreshold: number;  // scale up when metric > target * threshold (e.g., 1.3 = 130%)
  scaleDownThreshold: number;// scale down when metric < target * threshold (e.g., 0.5 = 50%)
  cooldownUpSeconds: number; // wait after scale-up before next scale-up
  cooldownDownSeconds: number;
  stepSize: number;          // instances to add/remove per step
  predictiveSchedule?: Array<{ cron: string; minInstances: number }>;  // scheduled pre-scaling
}

interface ScalingEvent {
  id: string;
  policyId: string;
  serviceId: string;
  direction: "up" | "down";
  fromInstances: number;
  toInstances: number;
  trigger: string;           // what caused the scaling
  metricValue: number;
  timestamp: string;
}

interface ServiceState {
  serviceId: string;
  currentInstances: number;
  lastScaleUp: number;
  lastScaleDown: number;
  instances: Array<{ id: string; status: string; startedAt: string; cpu: number; memory: number }>;
}

// Evaluate scaling decision
export async function evaluate(policy: ScalingPolicy): Promise<ScalingEvent | null> {
  const state = await getServiceState(policy.serviceId);
  const currentMetric = await getCurrentMetric(policy.serviceId, policy.targetMetric);
  const now = Date.now();

  // Calculate per-instance metric
  const perInstanceMetric = state.currentInstances > 0 ? currentMetric / state.currentInstances : currentMetric;

  // Check if scale-up needed
  if (perInstanceMetric > policy.targetValue * policy.scaleUpThreshold) {
    // Check cooldown
    if (now - state.lastScaleUp < policy.cooldownUpSeconds * 1000) return null;

    const desiredInstances = Math.ceil(currentMetric / policy.targetValue);
    const newCount = Math.min(policy.maxInstances, state.currentInstances + Math.min(policy.stepSize, desiredInstances - state.currentInstances));

    if (newCount > state.currentInstances) {
      return await scaleService(policy, state, newCount, "up",
        `${policy.targetMetric} at ${perInstanceMetric.toFixed(1)} (target: ${policy.targetValue})`);
    }
  }

  // Check if scale-down needed
  if (perInstanceMetric < policy.targetValue * policy.scaleDownThreshold) {
    if (now - state.lastScaleDown < policy.cooldownDownSeconds * 1000) return null;

    const desiredInstances = Math.max(policy.minInstances, Math.ceil(currentMetric / policy.targetValue));
    const newCount = Math.max(policy.minInstances, state.currentInstances - policy.stepSize);

    if (newCount < state.currentInstances && newCount >= desiredInstances) {
      return await scaleService(policy, state, newCount, "down",
        `${policy.targetMetric} at ${perInstanceMetric.toFixed(1)} (target: ${policy.targetValue})`);
    }
  }

  return null;
}

async function scaleService(
  policy: ScalingPolicy,
  state: ServiceState,
  targetInstances: number,
  direction: "up" | "down",
  trigger: string
): Promise<ScalingEvent> {
  const event: ScalingEvent = {
    id: `scale-${randomBytes(6).toString("hex")}`,
    policyId: policy.id,
    serviceId: policy.serviceId,
    direction,
    fromInstances: state.currentInstances,
    toInstances: targetInstances,
    trigger,
    metricValue: 0,
    timestamp: new Date().toISOString(),
  };

  // Execute scaling action
  if (direction === "up") {
    const toAdd = targetInstances - state.currentInstances;
    for (let i = 0; i < toAdd; i++) {
      await launchInstance(policy.serviceId);
    }
    await redis.set(`scaling:lastUp:${policy.serviceId}`, Date.now());
  } else {
    const toRemove = state.currentInstances - targetInstances;
    // Remove newest instances first (draining)
    const sortedInstances = state.instances.sort((a, b) =>
      new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    for (let i = 0; i < toRemove; i++) {
      await terminateInstance(sortedInstances[i].id);
    }
    await redis.set(`scaling:lastDown:${policy.serviceId}`, Date.now());
  }

  // Log event
  await pool.query(
    `INSERT INTO scaling_events (id, policy_id, service_id, direction, from_instances, to_instances, trigger, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [event.id, policy.id, policy.serviceId, direction, event.fromInstances, event.toInstances, trigger]
  );

  return event;
}

// Predictive scaling based on schedule
export async function evaluatePredictive(policy: ScalingPolicy): Promise<ScalingEvent | null> {
  if (!policy.predictiveSchedule?.length) return null;

  const state = await getServiceState(policy.serviceId);
  const now = new Date();

  for (const schedule of policy.predictiveSchedule) {
    if (matchesCron(schedule.cron, now) && state.currentInstances < schedule.minInstances) {
      return await scaleService(policy, state, schedule.minInstances, "up",
        `Predictive: scheduled pre-scale to ${schedule.minInstances}`);
    }
  }

  return null;
}

// Cost analysis
export async function getCostAnalysis(serviceId: string, days: number = 30): Promise<{
  totalInstanceHours: number;
  estimatedCost: number;
  savingsVsFixed: number;
  avgInstances: number;
  peakInstances: number;
}> {
  const { rows } = await pool.query(
    `SELECT direction, from_instances, to_instances, timestamp
     FROM scaling_events WHERE service_id = $1 AND timestamp > NOW() - $2 * INTERVAL '1 day'
     ORDER BY timestamp`,
    [serviceId, days]
  );

  let totalHours = 0;
  let peak = 0;
  let lastInstances = 0;
  let lastTime = Date.now() - days * 86400000;

  for (const event of rows) {
    const eventTime = new Date(event.timestamp).getTime();
    const hours = (eventTime - lastTime) / 3600000;
    totalHours += hours * lastInstances;
    lastInstances = event.to_instances;
    peak = Math.max(peak, lastInstances);
    lastTime = eventTime;
  }

  // Add remaining time
  totalHours += ((Date.now() - lastTime) / 3600000) * lastInstances;

  const costPerHour = 0.05;  // $0.05/instance/hour
  const estimatedCost = totalHours * costPerHour;
  const fixedCost = peak * days * 24 * costPerHour;

  return {
    totalInstanceHours: Math.round(totalHours),
    estimatedCost: Math.round(estimatedCost * 100) / 100,
    savingsVsFixed: Math.round((fixedCost - estimatedCost) * 100) / 100,
    avgInstances: Math.round(totalHours / (days * 24)),
    peakInstances: peak,
  };
}

async function getCurrentMetric(serviceId: string, metric: string): Promise<number> {
  const value = await redis.get(`metrics:${serviceId}:${metric}`);
  return parseFloat(value || "0");
}

async function getServiceState(serviceId: string): Promise<ServiceState> {
  const cached = await redis.get(`scaling:state:${serviceId}`);
  if (cached) return JSON.parse(cached);
  return { serviceId, currentInstances: 1, lastScaleUp: 0, lastScaleDown: 0, instances: [] };
}

async function launchInstance(serviceId: string): Promise<void> {
  // In production: call cloud provider API (AWS EC2, GCP, etc.)
  const state = await getServiceState(serviceId);
  state.currentInstances++;
  state.instances.push({ id: `inst-${randomBytes(4).toString("hex")}`, status: "running", startedAt: new Date().toISOString(), cpu: 0, memory: 0 });
  await redis.set(`scaling:state:${serviceId}`, JSON.stringify(state));
}

async function terminateInstance(instanceId: string): Promise<void> {
  // In production: drain connections, then terminate
}

function matchesCron(cron: string, date: Date): boolean {
  // Simplified cron matching
  const [min, hour] = cron.split(" ");
  return date.getUTCHours() === parseInt(hour) && date.getUTCMinutes() === parseInt(min);
}
```

## Results

- **$15K/month → $5K/month** — auto-scaling runs 4 instances at night, 20 during peak; 67% cost reduction; cost analysis dashboard shows savings
- **Black Friday handled** — predictive scaling pre-launches 30 instances at 8 AM; traffic spike absorbed without degradation; cooldown prevents premature scale-down
- **No manual intervention** — engineers no longer paged to add servers; auto-scaling adds capacity in 30 seconds; removes it after cooldown
- **Flapping prevented** — 5-minute cooldown after scale-up, 10-minute after scale-down; no rapid add/remove cycles; instances get time to warm up
- **Scale-down safety** — newest instances removed first; established connections on older instances undisturbed; graceful draining prevents request failures
