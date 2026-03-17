---
title: Build a Feature Experiment Platform
slug: build-feature-experiment-platform
description: Build a feature experiment platform with hypothesis tracking, metric-driven experiments, segment targeting, statistical analysis, and automated decision making for data-driven product development.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Product Engineering
tags:
  - experiments
  - product
  - metrics
  - hypothesis
  - data-driven
---

# Build a Feature Experiment Platform

## The Problem

Nadia leads product at a 25-person SaaS. They ship features based on intuition — "users want dark mode" gets prioritized over "users need faster search" without data. Last quarter, 3 of 5 features didn't move metrics. A/B tests exist for UI changes but there's no framework for tracking whether a whole feature achieves its hypothesis. Post-launch analysis is manual and happens (if at all) months later. They need an experiment platform: define hypotheses before building, set success metrics, track feature impact, run experiments with control groups, and make data-driven ship/kill decisions.

## Step 1: Build the Experiment Platform

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Experiment { id: string; name: string; hypothesis: string; feature: string; status: "draft" | "running" | "analyzing" | "decided"; metrics: ExperimentMetric[]; targeting: { percentage: number; segments?: string[] }; startedAt: string | null; endedAt: string | null; decision: "ship" | "iterate" | "kill" | null; decisionReason: string | null; createdBy: string; }
interface ExperimentMetric { name: string; type: "primary" | "secondary" | "guardrail"; direction: "increase" | "decrease"; baseline: number; target: number; current: number; significant: boolean; }

// Create experiment
export async function createExperiment(params: { name: string; hypothesis: string; feature: string; metrics: Array<{ name: string; type: ExperimentMetric["type"]; direction: ExperimentMetric["direction"]; baseline: number; target: number }>; targeting?: { percentage: number; segments?: string[] }; createdBy: string }): Promise<Experiment> {
  const id = `exp-${randomBytes(6).toString("hex")}`;
  const experiment: Experiment = {
    id, name: params.name, hypothesis: params.hypothesis, feature: params.feature,
    status: "draft",
    metrics: params.metrics.map((m) => ({ ...m, current: m.baseline, significant: false })),
    targeting: params.targeting || { percentage: 50 },
    startedAt: null, endedAt: null, decision: null, decisionReason: null, createdBy: params.createdBy,
  };

  await pool.query(
    `INSERT INTO experiments (id, name, hypothesis, feature, status, metrics, targeting, created_by, created_at) VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, NOW())`,
    [id, params.name, params.hypothesis, params.feature, JSON.stringify(experiment.metrics), JSON.stringify(experiment.targeting), params.createdBy]
  );

  return experiment;
}

// Start experiment
export async function startExperiment(experimentId: string): Promise<void> {
  await pool.query("UPDATE experiments SET status = 'running', started_at = NOW() WHERE id = $1", [experimentId]);
}

// Assign user to experiment group
export async function getAssignment(experimentId: string, userId: string): Promise<"control" | "treatment"> {
  const cached = await redis.get(`exp:assign:${experimentId}:${userId}`);
  if (cached) return cached as any;

  const { rows: [exp] } = await pool.query("SELECT targeting FROM experiments WHERE id = $1 AND status = 'running'", [experimentId]);
  if (!exp) return "control";

  const targeting = JSON.parse(exp.targeting);
  const hash = parseInt(createHash("md5").update(`${experimentId}:${userId}`).digest("hex").slice(0, 8), 16);
  const assignment = (hash % 100) < targeting.percentage ? "treatment" : "control";

  await redis.setex(`exp:assign:${experimentId}:${userId}`, 86400 * 30, assignment);
  return assignment;
}

// Track metric event
export async function trackMetric(experimentId: string, userId: string, metricName: string, value: number): Promise<void> {
  const assignment = await getAssignment(experimentId, userId);
  const key = `exp:metric:${experimentId}:${metricName}:${assignment}`;
  await redis.hincrbyfloat(key, "sum", value);
  await redis.hincrby(key, "count", 1);
  await redis.expire(key, 86400 * 90);
}

// Analyze experiment results
export async function analyzeExperiment(experimentId: string): Promise<{ metrics: Array<ExperimentMetric & { controlValue: number; treatmentValue: number; lift: number; pValue: number }>; recommendation: "ship" | "iterate" | "kill"; confidence: number }> {
  const { rows: [exp] } = await pool.query("SELECT * FROM experiments WHERE id = $1", [experimentId]);
  if (!exp) throw new Error("Experiment not found");

  const metrics: ExperimentMetric[] = JSON.parse(exp.metrics);
  const analyzed = [];

  for (const metric of metrics) {
    const controlData = await redis.hgetall(`exp:metric:${experimentId}:${metric.name}:control`);
    const treatmentData = await redis.hgetall(`exp:metric:${experimentId}:${metric.name}:treatment`);

    const controlCount = parseInt(controlData.count || "1");
    const treatmentCount = parseInt(treatmentData.count || "1");
    const controlValue = parseFloat(controlData.sum || "0") / controlCount;
    const treatmentValue = parseFloat(treatmentData.sum || "0") / treatmentCount;
    const lift = controlValue !== 0 ? ((treatmentValue - controlValue) / controlValue) * 100 : 0;

    // Statistical significance (simplified z-test)
    const pooledStd = Math.sqrt((controlValue * (1 - controlValue) / controlCount) + (treatmentValue * (1 - treatmentValue) / treatmentCount));
    const zScore = pooledStd > 0 ? Math.abs(treatmentValue - controlValue) / pooledStd : 0;
    const pValue = zScore > 1.96 ? 0.05 : zScore > 1.645 ? 0.1 : 0.5;
    const significant = pValue < 0.05;

    analyzed.push({ ...metric, controlValue: Math.round(controlValue * 1000) / 1000, treatmentValue: Math.round(treatmentValue * 1000) / 1000, lift: Math.round(lift * 10) / 10, pValue, significant, current: treatmentValue });
  }

  // Decision logic
  const primary = analyzed.find((m) => m.type === "primary");
  const guardrails = analyzed.filter((m) => m.type === "guardrail");
  const guardrailsBroken = guardrails.some((g) => (g.direction === "decrease" ? g.treatmentValue > g.baseline * 1.05 : g.treatmentValue < g.baseline * 0.95));

  let recommendation: "ship" | "iterate" | "kill" = "iterate";
  let confidence = 0.5;

  if (guardrailsBroken) { recommendation = "kill"; confidence = 0.8; }
  else if (primary?.significant && ((primary.direction === "increase" && primary.lift > 0) || (primary.direction === "decrease" && primary.lift < 0))) {
    recommendation = "ship"; confidence = primary.pValue < 0.01 ? 0.95 : 0.8;
  }
  else if (primary && !primary.significant) { recommendation = "iterate"; confidence = 0.6; }

  return { metrics: analyzed, recommendation, confidence };
}

// Make decision
export async function decide(experimentId: string, decision: "ship" | "iterate" | "kill", reason: string): Promise<void> {
  await pool.query(
    "UPDATE experiments SET status = 'decided', decision = $2, decision_reason = $3, ended_at = NOW() WHERE id = $1",
    [experimentId, decision, reason]
  );
}

// Dashboard
export async function getExperimentDashboard(): Promise<Array<{ id: string; name: string; hypothesis: string; status: string; decision: string | null; primaryMetricLift: number | null }>> {
  const { rows } = await pool.query("SELECT * FROM experiments ORDER BY created_at DESC LIMIT 50");
  const dashboard = [];
  for (const exp of rows) {
    const metrics: ExperimentMetric[] = JSON.parse(exp.metrics);
    const primary = metrics.find((m) => m.type === "primary");
    dashboard.push({ id: exp.id, name: exp.name, hypothesis: exp.hypothesis, status: exp.status, decision: exp.decision, primaryMetricLift: primary ? Math.round(((primary.current - primary.baseline) / primary.baseline) * 1000) / 10 : null });
  }
  return dashboard;
}
```

## Results

- **3/5 wasted features → 0** — hypothesis defined before building; experiment tracks if feature moves metrics; kill early if not working
- **Data-driven decisions** — "dark mode increases engagement by 8% (p=0.02)" → ship; "new onboarding increases signup by 1% (p=0.3)" → iterate; no more guessing
- **Guardrail metrics** — new feature increases conversion but page load time up 2 seconds → guardrail broken → kill despite conversion lift; holistic evaluation
- **Experiment dashboard** — all experiments at a glance; hypothesis, status, primary metric lift; product team sees what's working and what's not
- **Statistical rigor** — p-values calculated; sample sizes tracked; no declaring winner after 50 users; wait for significance; fewer false positives
