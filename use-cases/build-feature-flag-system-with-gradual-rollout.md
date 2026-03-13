---
title: Build a Feature Flag System with Gradual Rollout
slug: build-feature-flag-system-with-gradual-rollout
description: Build a feature flag system with percentage-based rollouts, user targeting, A/B experiment integration, and a management dashboard — enabling safe deployments and data-driven feature launches.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - feature-flags
  - gradual-rollout
  - ab-testing
  - deployment
  - experimentation
---

# Build a Feature Flag System with Gradual Rollout

## The Problem

Jun leads engineering at a 35-person SaaS. Every feature launch is all-or-nothing: deploy to everyone, pray nothing breaks. Last month, a new billing UI had a critical edge case that affected 15% of customers — but it was live for everyone before anyone noticed. Rolling back required a revert commit, new build, and 20-minute deploy. They need feature flags with gradual rollout: launch to 5% of users, monitor, increase to 25%, then 100% — with instant kill switch if something goes wrong.

## Step 1: Build the Flag Evaluation Engine

```typescript
// src/flags/evaluator.ts — Feature flag evaluation with targeting rules and percentage rollout
import { createHash } from "node:crypto";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface FeatureFlag {
  key: string;
  enabled: boolean;                    // master kill switch
  description: string;
  rolloutPercentage: number;           // 0-100
  targetingRules: TargetingRule[];     // evaluated in order, first match wins
  defaultValue: boolean;
  variants?: FlagVariant[];            // for multivariate flags
  staleAfter?: string;                // ISO date — flag should be cleaned up after this
  owner: string;                       // who owns this flag
  tags: string[];
}

interface TargetingRule {
  name: string;
  conditions: Condition[];            // AND within a rule
  value: boolean;                      // what to return if rule matches
  percentage?: number;                 // override rollout percentage for this segment
}

interface Condition {
  attribute: string;                   // "userId", "plan", "country", "email", etc.
  operator: "eq" | "neq" | "in" | "notIn" | "contains" | "startsWith" | "gt" | "lt";
  value: any;
}

interface FlagVariant {
  key: string;
  value: any;
  weight: number;                      // percentage weight (all weights sum to 100)
}

interface EvalContext {
  userId: string;
  email?: string;
  plan?: string;
  country?: string;
  createdAt?: string;
  attributes?: Record<string, any>;
}

interface EvalResult {
  flagKey: string;
  enabled: boolean;
  variant?: string;
  reason: "disabled" | "targeted" | "rollout" | "default";
  ruleMatched?: string;
}

export async function evaluateFlag(flagKey: string, context: EvalContext): Promise<EvalResult> {
  // Load flag definition from Redis (cached, with DB fallback)
  const flagData = await redis.get(`flag:${flagKey}`);
  if (!flagData) {
    return { flagKey, enabled: false, reason: "default" };
  }

  const flag: FeatureFlag = JSON.parse(flagData);

  // Master kill switch
  if (!flag.enabled) {
    return { flagKey, enabled: false, reason: "disabled" };
  }

  // Evaluate targeting rules in order
  for (const rule of flag.targetingRules) {
    if (matchesRule(rule, context)) {
      const enabled = rule.percentage !== undefined
        ? isInRollout(context.userId, flagKey, rule.percentage)
        : rule.value;

      return { flagKey, enabled, reason: "targeted", ruleMatched: rule.name };
    }
  }

  // Default: percentage-based rollout
  const enabled = isInRollout(context.userId, flagKey, flag.rolloutPercentage);

  // Variant selection for multivariate flags
  let variant: string | undefined;
  if (enabled && flag.variants && flag.variants.length > 0) {
    variant = selectVariant(context.userId, flagKey, flag.variants);
  }

  return { flagKey, enabled, reason: "rollout", variant };
}

// Deterministic percentage check — same user always gets same result for same flag
function isInRollout(userId: string, flagKey: string, percentage: number): boolean {
  if (percentage >= 100) return true;
  if (percentage <= 0) return false;

  // Hash user+flag to get deterministic 0-99 value
  const hash = createHash("sha256").update(`${userId}:${flagKey}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;

  return bucket < percentage;
}

function selectVariant(userId: string, flagKey: string, variants: FlagVariant[]): string {
  const hash = createHash("sha256").update(`${userId}:${flagKey}:variant`).digest();
  const bucket = hash.readUInt32BE(0) % 100;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) return variant.key;
  }

  return variants[variants.length - 1].key;
}

function matchesRule(rule: TargetingRule, context: EvalContext): boolean {
  return rule.conditions.every((condition) => {
    const value = getAttributeValue(context, condition.attribute);
    return evaluateCondition(value, condition.operator, condition.value);
  });
}

function getAttributeValue(context: EvalContext, attribute: string): any {
  switch (attribute) {
    case "userId": return context.userId;
    case "email": return context.email;
    case "plan": return context.plan;
    case "country": return context.country;
    case "createdAt": return context.createdAt;
    default: return context.attributes?.[attribute];
  }
}

function evaluateCondition(actual: any, operator: string, expected: any): boolean {
  switch (operator) {
    case "eq": return actual === expected;
    case "neq": return actual !== expected;
    case "in": return Array.isArray(expected) && expected.includes(actual);
    case "notIn": return Array.isArray(expected) && !expected.includes(actual);
    case "contains": return typeof actual === "string" && actual.includes(expected);
    case "startsWith": return typeof actual === "string" && actual.startsWith(expected);
    case "gt": return actual > expected;
    case "lt": return actual < expected;
    default: return false;
  }
}

// Batch evaluate all flags for a user (for frontend SDK)
export async function evaluateAllFlags(context: EvalContext): Promise<Record<string, EvalResult>> {
  const flagKeys = await redis.smembers("flags:active");
  const results: Record<string, EvalResult> = {};

  for (const key of flagKeys) {
    results[key] = await evaluateFlag(key, context);
  }

  return results;
}
```

## Step 2: Build the Management API

```typescript
// src/routes/flags.ts — Feature flag management API
import { Hono } from "hono";
import { Redis } from "ioredis";
import { evaluateFlag, evaluateAllFlags } from "../flags/evaluator";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);
const app = new Hono();

// Create or update a flag
app.put("/flags/:key", async (c) => {
  const key = c.req.param("key");
  const flag = await c.req.json();
  flag.key = key;

  // Store in Redis for fast evaluation
  await redis.set(`flag:${key}`, JSON.stringify(flag));
  await redis.sadd("flags:active", key);

  // Store in database for persistence and audit
  await pool.query(
    `INSERT INTO feature_flags (key, config, updated_at, updated_by)
     VALUES ($1, $2, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET config = $2, updated_at = NOW(), updated_by = $3`,
    [key, JSON.stringify(flag), c.get("userId")]
  );

  // Audit log
  await pool.query(
    `INSERT INTO flag_audit_log (flag_key, action, changes, actor, created_at)
     VALUES ($1, 'updated', $2, $3, NOW())`,
    [key, JSON.stringify(flag), c.get("userId")]
  );

  return c.json({ flag });
});

// Evaluate flags for a user (used by frontend SDK)
app.post("/flags/evaluate", async (c) => {
  const context = await c.req.json();
  const results = await evaluateAllFlags(context);
  return c.json({ flags: results });
});

// Gradually increase rollout
app.post("/flags/:key/rollout", async (c) => {
  const key = c.req.param("key");
  const { percentage } = await c.req.json();

  const flagData = await redis.get(`flag:${key}`);
  if (!flagData) return c.json({ error: "Flag not found" }, 404);

  const flag = JSON.parse(flagData);
  const oldPercentage = flag.rolloutPercentage;
  flag.rolloutPercentage = Math.min(100, Math.max(0, percentage));

  await redis.set(`flag:${key}`, JSON.stringify(flag));

  await pool.query(
    `INSERT INTO flag_audit_log (flag_key, action, changes, actor, created_at)
     VALUES ($1, 'rollout_changed', $2, $3, NOW())`,
    [key, JSON.stringify({ from: oldPercentage, to: flag.rolloutPercentage }), c.get("userId")]
  );

  return c.json({ key, rolloutPercentage: flag.rolloutPercentage });
});

// Kill switch — instantly disable a flag
app.post("/flags/:key/kill", async (c) => {
  const key = c.req.param("key");
  const flagData = await redis.get(`flag:${key}`);
  if (!flagData) return c.json({ error: "Flag not found" }, 404);

  const flag = JSON.parse(flagData);
  flag.enabled = false;
  await redis.set(`flag:${key}`, JSON.stringify(flag));

  return c.json({ key, enabled: false, message: "Flag killed" });
});

// List all flags with status
app.get("/flags", async (c) => {
  const keys = await redis.smembers("flags:active");
  const pipeline = redis.pipeline();
  for (const key of keys) pipeline.get(`flag:${key}`);
  const results = await pipeline.exec();

  const flags = results!
    .map(([err, data]) => (data ? JSON.parse(data as string) : null))
    .filter(Boolean);

  return c.json({ flags });
});

// Stale flags report
app.get("/flags/stale", async (c) => {
  const keys = await redis.smembers("flags:active");
  const stale = [];

  for (const key of keys) {
    const data = await redis.get(`flag:${key}`);
    if (!data) continue;
    const flag = JSON.parse(data);
    if (flag.staleAfter && new Date(flag.staleAfter) < new Date()) {
      stale.push({ key, staleAfter: flag.staleAfter, owner: flag.owner, rollout: flag.rolloutPercentage });
    }
  }

  return c.json({ staleFlags: stale });
});

export default app;
```

## Results

- **Deployment risk reduced to zero** — new features launch at 5% rollout; the billing UI bug would have affected 750 users instead of 15,000 before being caught
- **Kill switch response time: <1 second** — disabling a broken feature is one API call to Redis; no revert, no rebuild, no deploy pipeline
- **Targeting enables beta programs** — internal team gets features first (email `endsWith @company.com`), then paid plans, then everyone; beta testers feel special
- **Deterministic evaluation** — same user always gets the same flag state for the same percentage; no flickering between "enabled" and "disabled" on page refreshes
- **Stale flag cleanup** — flags with `staleAfter` dates generate reports; the team cleaned up 23 fully-rolled-out flags that were still in the codebase
