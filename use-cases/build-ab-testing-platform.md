---
title: Build an A/B Testing Platform
slug: build-ab-testing-platform
description: Build a server-side A/B testing platform with experiment management, statistical significance calculation, segment targeting, and a dashboard — enabling data-driven product decisions without third-party tools.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - nextjs
category: Full-Stack Development
tags:
  - ab-testing
  - experimentation
  - statistics
  - product
  - growth
---

# Build an A/B Testing Platform

## The Problem

Omar leads product at a 35-person SaaS. The team argues about design decisions based on opinions. "The green button will convert better" vs "no, blue is better." They tried Google Optimize but it's client-side (causes flicker), limited to UI changes, and doesn't work for backend experiments like pricing or algorithm changes. They need a server-side A/B testing platform that assigns users consistently, tracks conversions, calculates statistical significance, and tells them when they have a winner — so they make decisions based on data, not arguments.

## Step 1: Build the Experimentation Engine

```typescript
// src/experiments/engine.ts — Server-side A/B testing with statistics
import { createHash } from "node:crypto";
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface Experiment {
  id: string;
  name: string;
  description: string;
  status: "draft" | "running" | "paused" | "completed";
  variants: Variant[];
  targetSegment?: SegmentRule[];
  startedAt: string | null;
  endedAt: string | null;
  primaryMetric: string;
  minimumSampleSize: number;
}

interface Variant {
  id: string;
  name: string;
  weight: number;          // percentage (all must sum to 100)
  payload: Record<string, any>;
}

interface SegmentRule {
  attribute: string;
  operator: "eq" | "neq" | "in" | "gt" | "lt";
  value: any;
}

interface ExperimentResult {
  experimentId: string;
  variants: Array<{
    id: string;
    name: string;
    participants: number;
    conversions: number;
    conversionRate: number;
    improvement: number;       // vs control
    confidence: number;        // statistical significance (0-1)
    isWinner: boolean;
  }>;
  hasWinner: boolean;
  recommendedAction: string;
  totalParticipants: number;
  totalConversions: number;
}

// Assign user to experiment variant (deterministic)
export async function getVariant(
  experimentId: string,
  userId: string,
  userAttributes?: Record<string, any>
): Promise<{ variant: Variant; enrolled: boolean } | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment || experiment.status !== "running") return null;

  // Check segment targeting
  if (experiment.targetSegment?.length && userAttributes) {
    const matches = experiment.targetSegment.every((rule) => matchSegment(rule, userAttributes));
    if (!matches) return null;
  }

  // Check if user was already assigned
  const cached = await redis.hget(`exp:${experimentId}:assignments`, userId);
  if (cached) {
    const variant = experiment.variants.find((v) => v.id === cached);
    return variant ? { variant, enrolled: false } : null;
  }

  // Deterministic assignment using hash
  const hash = createHash("md5").update(`${experimentId}:${userId}`).digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  let cumulative = 0;
  let assignedVariant: Variant | null = null;

  for (const variant of experiment.variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      assignedVariant = variant;
      break;
    }
  }

  if (!assignedVariant) assignedVariant = experiment.variants[0];

  // Record assignment
  await redis.hset(`exp:${experimentId}:assignments`, userId, assignedVariant.id);
  await pool.query(
    `INSERT INTO experiment_assignments (experiment_id, user_id, variant_id, assigned_at)
     VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
    [experimentId, userId, assignedVariant.id]
  );

  // Increment participant count
  await redis.hincrby(`exp:${experimentId}:participants`, assignedVariant.id, 1);

  return { variant: assignedVariant, enrolled: true };
}

// Track a conversion event
export async function trackConversion(
  experimentId: string,
  userId: string,
  metricName: string,
  value: number = 1
): Promise<void> {
  // Get user's variant
  const variantId = await redis.hget(`exp:${experimentId}:assignments`, userId);
  if (!variantId) return;

  // Deduplicate conversions per user per metric
  const dedupeKey = `exp:${experimentId}:conv:${userId}:${metricName}`;
  const alreadyConverted = await redis.set(dedupeKey, "1", "EX", 86400 * 30, "NX");
  if (!alreadyConverted) return;

  await pool.query(
    `INSERT INTO experiment_conversions (experiment_id, user_id, variant_id, metric_name, value, converted_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [experimentId, userId, variantId, metricName, value]
  );

  await redis.hincrby(`exp:${experimentId}:conversions:${metricName}`, variantId, 1);
}

// Calculate results with statistical significance
export async function getResults(experimentId: string): Promise<ExperimentResult> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) throw new Error("Experiment not found");

  const { rows } = await pool.query(
    `SELECT
       a.variant_id,
       COUNT(DISTINCT a.user_id) as participants,
       COUNT(DISTINCT c.user_id) as conversions
     FROM experiment_assignments a
     LEFT JOIN experiment_conversions c
       ON a.experiment_id = c.experiment_id
       AND a.user_id = c.user_id
       AND a.variant_id = c.variant_id
       AND c.metric_name = $2
     WHERE a.experiment_id = $1
     GROUP BY a.variant_id`,
    [experimentId, experiment.primaryMetric]
  );

  // Find control variant (first one)
  const controlId = experiment.variants[0].id;
  const controlData = rows.find((r) => r.variant_id === controlId);
  const controlRate = controlData
    ? parseInt(controlData.conversions) / Math.max(parseInt(controlData.participants), 1)
    : 0;

  const variants = experiment.variants.map((v) => {
    const data = rows.find((r) => r.variant_id === v.id);
    const participants = data ? parseInt(data.participants) : 0;
    const conversions = data ? parseInt(data.conversions) : 0;
    const conversionRate = participants > 0 ? conversions / participants : 0;
    const improvement = controlRate > 0 ? ((conversionRate - controlRate) / controlRate) * 100 : 0;

    // Calculate statistical significance using Z-test
    const confidence = calculateSignificance(
      controlRate, parseInt(controlData?.participants || "0"),
      conversionRate, participants
    );

    return {
      id: v.id,
      name: v.name,
      participants,
      conversions,
      conversionRate: Math.round(conversionRate * 10000) / 100,
      improvement: Math.round(improvement * 10) / 10,
      confidence: Math.round(confidence * 1000) / 10,
      isWinner: v.id !== controlId && confidence >= 0.95 && conversionRate > controlRate,
    };
  });

  const hasWinner = variants.some((v) => v.isWinner);
  const totalParticipants = variants.reduce((s, v) => s + v.participants, 0);

  let recommendedAction = "Keep running — not enough data yet";
  if (hasWinner) {
    const winner = variants.find((v) => v.isWinner)!;
    recommendedAction = `Ship "${winner.name}" — ${winner.improvement}% improvement at ${winner.confidence}% confidence`;
  } else if (totalParticipants > experiment.minimumSampleSize * 2) {
    recommendedAction = "No significant difference — consider stopping the experiment";
  }

  return {
    experimentId,
    variants,
    hasWinner,
    recommendedAction,
    totalParticipants,
    totalConversions: variants.reduce((s, v) => s + v.conversions, 0),
  };
}

// Z-test for two proportions
function calculateSignificance(
  p1: number, n1: number,
  p2: number, n2: number
): number {
  if (n1 < 30 || n2 < 30) return 0;

  const p = (p1 * n1 + p2 * n2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;

  const z = Math.abs(p2 - p1) / se;

  // Approximate p-value from z-score
  const pValue = 2 * (1 - normalCDF(z));
  return 1 - pValue;
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327;
  const prob = d * Math.exp(-x * x / 2) * t *
    (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

async function getExperiment(id: string): Promise<Experiment | null> {
  const cached = await redis.get(`exp:${id}`);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query("SELECT * FROM experiments WHERE id = $1", [id]);
  if (rows.length === 0) return null;

  const exp: Experiment = {
    id: rows[0].id, name: rows[0].name, description: rows[0].description,
    status: rows[0].status, variants: rows[0].variants,
    targetSegment: rows[0].target_segment,
    startedAt: rows[0].started_at, endedAt: rows[0].ended_at,
    primaryMetric: rows[0].primary_metric,
    minimumSampleSize: rows[0].minimum_sample_size || 1000,
  };

  await redis.setex(`exp:${id}`, 60, JSON.stringify(exp));
  return exp;
}

function matchSegment(rule: SegmentRule, attrs: Record<string, any>): boolean {
  const value = attrs[rule.attribute];
  switch (rule.operator) {
    case "eq": return value === rule.value;
    case "neq": return value !== rule.value;
    case "in": return Array.isArray(rule.value) && rule.value.includes(value);
    case "gt": return Number(value) > Number(rule.value);
    case "lt": return Number(value) < Number(rule.value);
    default: return false;
  }
}
```

## Results

- **Pricing experiment increased revenue 23%** — tested $49 vs $59 vs $79 for Pro plan; $59 had the highest conversion rate with 99.2% confidence; shipped in 2 weeks
- **Green vs blue button debate resolved with data** — green button won with +8.3% conversion at 97% confidence; the team now runs experiments instead of arguing
- **Server-side: zero UI flicker** — variant assignment happens on the server before page render; users never see content shift
- **Segment targeting** — tested new checkout flow only for users on "pro" plan in US; reduced blast radius while gathering data
- **Automatic winner detection** — dashboard shows "Ship variant B" when confidence exceeds 95%; no manual statistics required
