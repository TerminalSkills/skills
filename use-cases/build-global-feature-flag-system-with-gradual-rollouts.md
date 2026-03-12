---
title: Build a Global Feature Flag System with Gradual Rollouts
slug: build-global-feature-flag-system-with-gradual-rollouts
description: >
  Replace deploy-to-release coupling with a feature flag system that
  enables 1% canary releases, user targeting, A/B experiments, and
  instant kill switches — reducing deployment incidents by 85%.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
  - vitest
  - nextjs
category: DevOps & Infrastructure
tags:
  - feature-flags
  - gradual-rollout
  - canary-release
  - ab-testing
  - experimentation
  - release-management
---

# Build a Global Feature Flag System with Gradual Rollouts

## The Problem

Sam is VP of Engineering at a B2C fintech app with 800K monthly active users. They deploy 15 times per day, and every deploy is a potential incident. Last quarter, 3 out of 47 incidents were caused by new features failing in production — a new payment flow that crashed on older Android versions, a redesigned dashboard that increased API load 4x, and a notification change that sent 200K duplicate emails. Each incident required an emergency rollback, a 45-minute process that blocked all other deploys. Sam wants to decouple "deploying code" from "releasing features" — ship code anytime, release features gradually.

Sam needs:
- **Instant kill switch** — disable a feature in seconds without deploying
- **Gradual rollout** — release to 1%, then 5%, then 25%, then 100%
- **User targeting** — enable for internal users, beta testers, or specific segments
- **A/B experiments** — randomize users into variants and track metrics
- **Environment-aware** — different flags for staging vs production
- **Sub-5ms evaluation** — flag checks happen on every request, can't add latency

## Step 1: Flag Configuration Schema

```typescript
// src/flags/schema.ts
// Feature flag definition with targeting rules and rollout config

import { z } from 'zod';

export const FlagVariant = z.object({
  key: z.string(),
  value: z.unknown(),
  weight: z.number().min(0).max(100).default(0),  // percentage for gradual rollout
});

export const TargetRule = z.object({
  attribute: z.string(),           // e.g., "country", "plan", "userId"
  operator: z.enum(['eq', 'neq', 'in', 'not_in', 'gt', 'lt', 'contains', 'regex']),
  values: z.array(z.string()),
  variant: z.string(),             // which variant to serve
});

export const FeatureFlag = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_.-]*$/),
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  environment: z.enum(['production', 'staging', 'development', 'all']),
  variants: z.array(FlagVariant),
  defaultVariant: z.string(),      // variant to serve when no rules match
  targetRules: z.array(TargetRule),
  rolloutPercentage: z.number().min(0).max(100),
  stickiness: z.enum(['userId', 'sessionId', 'random']).default('userId'),
  killSwitch: z.boolean().default(false),  // true = force off regardless of rules
  createdBy: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tags: z.array(z.string()),
});

export type FeatureFlag = z.infer<typeof FeatureFlag>;

// Evaluation context — what we know about the current user/request
export const EvalContext = z.object({
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  plan: z.string().optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
  appVersion: z.string().optional(),
  environment: z.string(),
  customAttributes: z.record(z.string(), z.string()).default({}),
});

export type EvalContext = z.infer<typeof EvalContext>;
```

## Step 2: Flag Evaluation Engine

Evaluate flags in <1ms using deterministic hashing for sticky assignments.

```typescript
// src/flags/evaluator.ts
// Evaluates feature flags with targeting, rollout, and sticky assignment

import { createHash } from 'crypto';
import type { FeatureFlag, EvalContext, TargetRule } from './schema';

export interface EvalResult {
  flagKey: string;
  variant: string;
  value: unknown;
  reason: 'kill_switch' | 'disabled' | 'target_match' | 'rollout' | 'default';
}

export function evaluateFlag(flag: FeatureFlag, context: EvalContext): EvalResult {
  // Kill switch overrides everything
  if (flag.killSwitch) {
    return {
      flagKey: flag.key,
      variant: flag.defaultVariant,
      value: getVariantValue(flag, flag.defaultVariant),
      reason: 'kill_switch',
    };
  }

  // Disabled flag
  if (!flag.enabled) {
    return {
      flagKey: flag.key,
      variant: flag.defaultVariant,
      value: getVariantValue(flag, flag.defaultVariant),
      reason: 'disabled',
    };
  }

  // Environment check
  if (flag.environment !== 'all' && flag.environment !== context.environment) {
    return {
      flagKey: flag.key,
      variant: flag.defaultVariant,
      value: getVariantValue(flag, flag.defaultVariant),
      reason: 'disabled',
    };
  }

  // Check targeting rules (first match wins)
  for (const rule of flag.targetRules) {
    if (matchesRule(rule, context)) {
      return {
        flagKey: flag.key,
        variant: rule.variant,
        value: getVariantValue(flag, rule.variant),
        reason: 'target_match',
      };
    }
  }

  // Percentage rollout with deterministic hashing
  if (flag.rolloutPercentage < 100) {
    const stickyKey = getStickyKey(flag, context);
    const hash = hashToPercentage(flag.key, stickyKey);

    if (hash > flag.rolloutPercentage) {
      return {
        flagKey: flag.key,
        variant: flag.defaultVariant,
        value: getVariantValue(flag, flag.defaultVariant),
        reason: 'rollout',
      };
    }
  }

  // Weighted variant selection (for A/B experiments)
  if (flag.variants.length > 1) {
    const stickyKey = getStickyKey(flag, context);
    const variant = selectWeightedVariant(flag, stickyKey);
    return {
      flagKey: flag.key,
      variant: variant.key,
      value: variant.value,
      reason: 'rollout',
    };
  }

  // Default: first non-default variant (the "on" state)
  const onVariant = flag.variants.find(v => v.key !== flag.defaultVariant) ?? flag.variants[0];
  return {
    flagKey: flag.key,
    variant: onVariant.key,
    value: onVariant.value,
    reason: 'default',
  };
}

function matchesRule(rule: TargetRule, context: EvalContext): boolean {
  const attrValue = getAttributeValue(rule.attribute, context);
  if (attrValue === undefined) return false;

  switch (rule.operator) {
    case 'eq': return rule.values.includes(attrValue);
    case 'neq': return !rule.values.includes(attrValue);
    case 'in': return rule.values.includes(attrValue);
    case 'not_in': return !rule.values.includes(attrValue);
    case 'contains': return rule.values.some(v => attrValue.includes(v));
    case 'gt': return Number(attrValue) > Number(rule.values[0]);
    case 'lt': return Number(attrValue) < Number(rule.values[0]);
    case 'regex': return new RegExp(rule.values[0]).test(attrValue);
    default: return false;
  }
}

function getAttributeValue(attribute: string, context: EvalContext): string | undefined {
  switch (attribute) {
    case 'userId': return context.userId;
    case 'email': return context.email;
    case 'country': return context.country;
    case 'plan': return context.plan;
    case 'platform': return context.platform;
    case 'appVersion': return context.appVersion;
    default: return context.customAttributes[attribute];
  }
}

// Deterministic hash: same user always gets same bucket
function hashToPercentage(flagKey: string, stickyKey: string): number {
  const hash = createHash('md5').update(`${flagKey}:${stickyKey}`).digest();
  // Use first 4 bytes as unsigned int, mod 100
  return (hash.readUInt32BE(0) % 10000) / 100;  // 2 decimal precision
}

function getStickyKey(flag: FeatureFlag, context: EvalContext): string {
  switch (flag.stickiness) {
    case 'userId': return context.userId ?? context.sessionId ?? 'anon';
    case 'sessionId': return context.sessionId ?? context.userId ?? 'anon';
    case 'random': return Math.random().toString();
  }
}

function selectWeightedVariant(flag: FeatureFlag, stickyKey: string): { key: string; value: unknown } {
  const hash = hashToPercentage(flag.key + ':variant', stickyKey);
  let cumulative = 0;
  for (const variant of flag.variants) {
    cumulative += variant.weight;
    if (hash < cumulative) return variant;
  }
  return flag.variants[flag.variants.length - 1];
}

function getVariantValue(flag: FeatureFlag, variantKey: string): unknown {
  return flag.variants.find(v => v.key === variantKey)?.value ?? null;
}
```

## Step 3: Flag Store with Local Cache

Server-side SDK that caches flags locally and refreshes via SSE stream.

```typescript
// src/sdk/flag-client.ts
// Server-side SDK: evaluates flags locally with streaming updates

import { evaluateFlag, type EvalResult } from '../flags/evaluator';
import type { FeatureFlag, EvalContext } from '../flags/schema';
import { EventSource } from 'eventsource';

export class FlagClient {
  private flags = new Map<string, FeatureFlag>();
  private environment: string;
  private ready = false;
  private readyPromise: Promise<void>;

  constructor(config: { apiUrl: string; apiKey: string; environment: string }) {
    this.environment = config.environment;

    // Initial fetch + streaming updates
    this.readyPromise = this.initialize(config.apiUrl, config.apiKey);
  }

  private async initialize(apiUrl: string, apiKey: string): Promise<void> {
    // Fetch all flags
    const response = await fetch(`${apiUrl}/v1/flags`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const flags = await response.json() as FeatureFlag[];
    for (const flag of flags) {
      this.flags.set(flag.key, flag);
    }
    this.ready = true;

    // Stream updates via SSE
    const es = new EventSource(`${apiUrl}/v1/flags/stream`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    } as any);

    es.addEventListener('flag_updated', (event: any) => {
      const flag = JSON.parse(event.data) as FeatureFlag;
      this.flags.set(flag.key, flag);
    });

    es.addEventListener('flag_deleted', (event: any) => {
      const { key } = JSON.parse(event.data);
      this.flags.delete(key);
    });
  }

  async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  evaluate(flagKey: string, context: Partial<EvalContext>): EvalResult {
    const flag = this.flags.get(flagKey);
    if (!flag) {
      return {
        flagKey, variant: 'control',
        value: false, reason: 'disabled',
      };
    }

    return evaluateFlag(flag, {
      environment: this.environment,
      customAttributes: {},
      ...context,
    });
  }

  // Convenience: boolean flag check
  isEnabled(flagKey: string, context: Partial<EvalContext>): boolean {
    const result = this.evaluate(flagKey, context);
    return result.value === true || result.variant !== 'control';
  }

  // Get variant value (for multivariate flags)
  getVariant<T>(flagKey: string, context: Partial<EvalContext>, defaultValue: T): T {
    const result = this.evaluate(flagKey, context);
    return (result.value as T) ?? defaultValue;
  }
}
```

## Step 4: Admin API for Flag Management

```typescript
// src/api/flags-admin.ts
// CRUD API for managing feature flags

import { Hono } from 'hono';
import { PrismaClient } from '@prisma/client';
import { Redis } from 'ioredis';
import { FeatureFlag } from '../flags/schema';

const app = new Hono();
const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL!);

// List all flags
app.get('/v1/flags', async (c) => {
  const flags = await prisma.featureFlag.findMany({
    orderBy: { updatedAt: 'desc' },
  });
  return c.json(flags);
});

// Create flag
app.post('/v1/flags', async (c) => {
  const body = await c.req.json();
  const parsed = FeatureFlag.parse(body);

  const flag = await prisma.featureFlag.create({
    data: parsed as any,
  });

  // Notify all SDKs via pub/sub
  await redis.publish('flag-updates', JSON.stringify({
    event: 'flag_updated', data: flag,
  }));

  // Audit log
  await prisma.flagAuditLog.create({
    data: {
      flagKey: flag.key,
      action: 'created',
      changedBy: c.req.header('x-user-id') ?? 'system',
      newValue: JSON.stringify(flag),
    },
  });

  return c.json(flag, 201);
});

// Update rollout percentage (most common operation)
app.patch('/v1/flags/:key/rollout', async (c) => {
  const key = c.req.param('key');
  const { percentage } = await c.req.json();

  const flag = await prisma.featureFlag.update({
    where: { key },
    data: {
      rolloutPercentage: percentage,
      updatedAt: new Date().toISOString(),
    },
  });

  await redis.publish('flag-updates', JSON.stringify({
    event: 'flag_updated', data: flag,
  }));

  await prisma.flagAuditLog.create({
    data: {
      flagKey: key,
      action: 'rollout_changed',
      changedBy: c.req.header('x-user-id') ?? 'system',
      newValue: JSON.stringify({ percentage }),
    },
  });

  return c.json(flag);
});

// Kill switch — emergency disable
app.post('/v1/flags/:key/kill', async (c) => {
  const key = c.req.param('key');

  const flag = await prisma.featureFlag.update({
    where: { key },
    data: { killSwitch: true, updatedAt: new Date().toISOString() },
  });

  await redis.publish('flag-updates', JSON.stringify({
    event: 'flag_updated', data: flag,
  }));

  return c.json({ killed: true, flag });
});

// SSE stream for SDK updates
app.get('/v1/flags/stream', async (c) => {
  const sub = new Redis(process.env.REDIS_URL!);

  return c.newResponse(
    new ReadableStream({
      start(controller) {
        sub.subscribe('flag-updates');
        sub.on('message', (_, message) => {
          const { event, data } = JSON.parse(message);
          controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        });
      },
      cancel() {
        sub.disconnect();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    }
  );
});

export default app;
```

## Step 5: Usage in Application Code

```typescript
// src/app/api/payments/route.ts
// Example: using feature flags in a payment flow

import { flagClient } from '@/lib/flag-client';

export async function POST(req: Request) {
  const { userId, amount, method } = await req.json();

  const context = { userId, plan: 'pro', platform: 'web' as const };

  // New payment flow behind a flag
  if (flagClient.isEnabled('new-payment-flow', context)) {
    return handleNewPaymentFlow(userId, amount, method);
  }

  // Existing payment flow
  return handleLegacyPaymentFlow(userId, amount, method);
}

// Multivariate: which checkout design performs better?
export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id') ?? '';
  const context = { userId };

  const checkoutVariant = flagClient.getVariant(
    'checkout-redesign',
    context,
    'control'  // default
  );

  // 'control' | 'variant_a' | 'variant_b'
  return Response.json({ checkoutVariant });
}
```

## Results

After 4 months of feature flag adoption:

- **Deployment incidents from new features**: dropped from 3/quarter to 0 (85% reduction overall)
- **Kill switch usage**: 7 times in 4 months — feature disabled in <3 seconds each time
- **Gradual rollout**: every new feature starts at 1% → 5% → 25% → 100% over 1-2 weeks
- **Rollback time**: 3 seconds (kill switch) vs 45 minutes (code rollback)
- **A/B experiments running**: 12 concurrent experiments measuring conversion, engagement, revenue
- **Flag evaluation latency**: 0.3ms average (local cache, no network calls)
- **Developer adoption**: 100% of new features use flags — it's in the PR template
- **Stale flag cleanup**: automated alerts for flags older than 90 days with 100% rollout
- **Email incident**: would have been prevented — new notification system would have been flagged at 1%, not 100%
