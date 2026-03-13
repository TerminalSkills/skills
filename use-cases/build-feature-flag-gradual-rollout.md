---
title: Build Feature Flag Gradual Rollouts
slug: build-feature-flag-gradual-rollout
description: Build a feature flag system with percentage-based rollouts, user targeting, A/B testing integration, and a management UI — enabling safe deployments with instant kill switches.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - feature-flags
  - rollouts
  - deployment
  - ab-testing
  - devops
---

# Build Feature Flag Gradual Rollouts

## The Problem

Petra leads engineering at a 35-person fintech. They deploy to production once a week because every deploy is risky — last month a new payment flow broke for 15% of users and took 4 hours to roll back. The team wants to deploy daily but needs a safety net: release features to 1% of users first, monitor for errors, then gradually increase. If something breaks, kill the feature instantly without redeploying. They also want to A/B test pricing pages and target beta features to specific customer segments.

## Step 1: Build the Feature Flag Engine

```typescript
// src/flags/flag-engine.ts — Feature flag evaluation with targeting and rollouts
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface Flag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number;       // 0-100
  targetingRules: TargetingRule[];
  variants: Variant[];             // for A/B tests
  defaultVariant: string;
  killSwitch: boolean;             // emergency off
  updatedAt: string;
}

interface TargetingRule {
  attribute: string;               // "plan", "country", "userId"
  operator: "eq" | "neq" | "in" | "contains" | "gt" | "lt";
  value: string | string[] | number;
  variant?: string;                // serve this variant to matching users
}

interface Variant {
  key: string;                     // "control", "variant_a", "variant_b"
  weight: number;                  // percentage weight (all must sum to 100)
  payload: Record<string, any>;    // arbitrary config
}

interface EvalContext {
  userId: string;
  plan?: string;
  country?: string;
  email?: string;
  attributes?: Record<string, any>;
}

interface FlagResult {
  enabled: boolean;
  variant: string;
  payload: Record<string, any>;
  reason: "kill_switch" | "disabled" | "targeting" | "rollout" | "default";
}

// Evaluate a flag for a user
export async function evaluateFlag(flagKey: string, context: EvalContext): Promise<FlagResult> {
  const flag = await getFlag(flagKey);
  if (!flag) return { enabled: false, variant: "control", payload: {}, reason: "disabled" };

  // Kill switch overrides everything
  if (flag.killSwitch) {
    return { enabled: false, variant: "control", payload: {}, reason: "kill_switch" };
  }

  // Global enabled check
  if (!flag.enabled) {
    return { enabled: false, variant: flag.defaultVariant, payload: {}, reason: "disabled" };
  }

  // Check targeting rules (first match wins)
  for (const rule of flag.targetingRules) {
    if (matchesRule(rule, context)) {
      const variant = rule.variant || flag.variants[0]?.key || "enabled";
      const variantData = flag.variants.find((v) => v.key === variant);
      return {
        enabled: true,
        variant,
        payload: variantData?.payload || {},
        reason: "targeting",
      };
    }
  }

  // Percentage rollout — deterministic hash based on userId + flagKey
  const hash = createHash("md5")
    .update(`${context.userId}:${flagKey}`)
    .digest("hex");
  const bucket = parseInt(hash.slice(0, 8), 16) % 100;

  if (bucket >= flag.rolloutPercentage) {
    return { enabled: false, variant: flag.defaultVariant, payload: {}, reason: "rollout" };
  }

  // Determine variant using weighted distribution
  if (flag.variants.length > 1) {
    let cumulative = 0;
    const variantBucket = parseInt(hash.slice(8, 16), 16) % 100;

    for (const variant of flag.variants) {
      cumulative += variant.weight;
      if (variantBucket < cumulative) {
        return { enabled: true, variant: variant.key, payload: variant.payload, reason: "rollout" };
      }
    }
  }

  const defaultVariant = flag.variants[0];
  return {
    enabled: true,
    variant: defaultVariant?.key || "enabled",
    payload: defaultVariant?.payload || {},
    reason: "default",
  };
}

function matchesRule(rule: TargetingRule, context: EvalContext): boolean {
  const value = rule.attribute === "userId" ? context.userId
    : rule.attribute === "plan" ? context.plan
    : rule.attribute === "country" ? context.country
    : rule.attribute === "email" ? context.email
    : context.attributes?.[rule.attribute];

  switch (rule.operator) {
    case "eq": return value === rule.value;
    case "neq": return value !== rule.value;
    case "in": return Array.isArray(rule.value) && rule.value.includes(String(value));
    case "contains": return String(value || "").includes(String(rule.value));
    case "gt": return Number(value) > Number(rule.value);
    case "lt": return Number(value) < Number(rule.value);
    default: return false;
  }
}

// Cache flags in Redis for fast evaluation
async function getFlag(key: string): Promise<Flag | null> {
  const cached = await redis.get(`flag:${key}`);
  if (cached) return JSON.parse(cached);

  const { rows } = await pool.query("SELECT * FROM feature_flags WHERE key = $1", [key]);
  if (rows.length === 0) return null;

  const flag: Flag = {
    key: rows[0].key,
    name: rows[0].name,
    description: rows[0].description,
    enabled: rows[0].enabled,
    rolloutPercentage: rows[0].rollout_percentage,
    targetingRules: rows[0].targeting_rules || [],
    variants: rows[0].variants || [],
    defaultVariant: rows[0].default_variant || "control",
    killSwitch: rows[0].kill_switch,
    updatedAt: rows[0].updated_at,
  };

  await redis.setex(`flag:${key}`, 30, JSON.stringify(flag));
  return flag;
}

// Update rollout percentage
export async function setRollout(flagKey: string, percentage: number, actor: string): Promise<void> {
  await pool.query(
    "UPDATE feature_flags SET rollout_percentage = $2, updated_at = NOW() WHERE key = $1",
    [flagKey, Math.max(0, Math.min(100, percentage))]
  );
  await redis.del(`flag:${flagKey}`);

  // Audit log
  await pool.query(
    "INSERT INTO flag_audit_log (flag_key, action, value, actor, created_at) VALUES ($1, 'rollout_change', $2, $3, NOW())",
    [flagKey, String(percentage), actor]
  );
}

// Emergency kill switch
export async function killFlag(flagKey: string, actor: string): Promise<void> {
  await pool.query(
    "UPDATE feature_flags SET kill_switch = true, updated_at = NOW() WHERE key = $1",
    [flagKey]
  );
  await redis.del(`flag:${flagKey}`);

  await pool.query(
    "INSERT INTO flag_audit_log (flag_key, action, value, actor, created_at) VALUES ($1, 'kill_switch', 'on', $2, NOW())",
    [flagKey, actor]
  );
}
```

## Results

- **Deploy frequency: weekly → daily** — features ship behind flags; risky features roll out to 1% first; if error rate stays flat, roll to 10%, 50%, 100% over days
- **Incident recovery: 4 hours → 3 seconds** — kill switch disables a broken feature instantly; no rollback, no redeploy, no downtime
- **A/B test conversion lift: +12%** — pricing page variants tested with 50/50 split; the winning variant increased trial-to-paid conversion by 12%
- **Beta features to enterprise customers only** — targeting rules serve new features to `plan=enterprise` users; other customers see the stable version
- **Deterministic bucketing** — the same user always sees the same variant; no flickering between control and treatment across page reloads
