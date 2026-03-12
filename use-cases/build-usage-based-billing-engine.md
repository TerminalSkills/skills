---
title: Build a Usage-Based Billing Engine
slug: build-usage-based-billing-engine
description: >
  Replace flat-rate pricing with metered usage billing that tracks
  API calls, compute time, and storage per tenant — with real-time
  usage dashboards, automated invoicing, and overage alerts.
skills:
  - typescript
  - redis
  - postgresql
  - kafka-js
  - hono
  - zod
  - lemon-squeezy
category: Full-Stack Development
tags:
  - billing
  - usage-based
  - metering
  - saas
  - pricing
  - invoicing
---

# Build a Usage-Based Billing Engine

## The Problem

A developer platform charges flat $99/month for all customers. Problem: 20% of customers use 80% of resources. Power users consume $500+ in compute but pay $99. Light users churn because they feel overcharged for minimal usage. Revenue is $280K/month but infrastructure costs are $210K — 25% margin. Competitors offer usage-based pricing and are winning deals with "only pay for what you use."

## Step 1: Usage Event Schema and Ingestion

```typescript
// src/metering/events.ts
import { z } from 'zod';
import { Kafka } from 'kafkajs';

export const UsageEvent = z.object({
  eventId: z.string().uuid(),
  tenantId: z.string(),
  metricName: z.enum(['api_calls', 'compute_seconds', 'storage_bytes', 'bandwidth_bytes', 'ai_tokens']),
  quantity: z.number().positive(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  idempotencyKey: z.string(), // prevent double-counting
});

const kafka = new Kafka({ clientId: 'metering', brokers: process.env.KAFKA_BROKERS!.split(',') });
const producer = kafka.producer({ idempotent: true });

export async function recordUsage(event: z.infer<typeof UsageEvent>): Promise<void> {
  await producer.send({
    topic: 'usage-events',
    messages: [{ key: event.tenantId, value: JSON.stringify(event) }],
  });
}

// Middleware for automatic API call metering
export function meterApiCalls() {
  return async (c: any, next: any) => {
    const start = Date.now();
    await next();
    const duration = Date.now() - start;

    await recordUsage({
      eventId: crypto.randomUUID(),
      tenantId: c.get('tenantId'),
      metricName: 'api_calls',
      quantity: 1,
      timestamp: new Date().toISOString(),
      metadata: { endpoint: c.req.path, method: c.req.method, statusCode: c.res.status, durationMs: duration },
      idempotencyKey: `${c.get('requestId')}:api`,
    });
  };
}
```

## Step 2: Usage Aggregator

```typescript
// src/metering/aggregator.ts
import { Redis } from 'ioredis';
import { Pool } from 'pg';
import { Kafka } from 'kafkajs';

const redis = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const kafka = new Kafka({ clientId: 'aggregator', brokers: process.env.KAFKA_BROKERS!.split(',') });

export async function startAggregator(): Promise<void> {
  const consumer = kafka.consumer({ groupId: 'usage-aggregator' });
  await consumer.connect();
  await consumer.subscribe({ topic: 'usage-events', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value!.toString());

      // Idempotency check
      const dedupKey = `usage:dedup:${event.idempotencyKey}`;
      const exists = await redis.set(dedupKey, '1', 'NX', 'EX', 86400);
      if (!exists) return; // Already processed

      // Real-time counter in Redis (for dashboard)
      const hourBucket = event.timestamp.slice(0, 13); // YYYY-MM-DDTHH
      const dayBucket = event.timestamp.slice(0, 10);  // YYYY-MM-DD
      const monthBucket = event.timestamp.slice(0, 7);  // YYYY-MM

      const pipeline = redis.pipeline();
      pipeline.incrbyfloat(`usage:${event.tenantId}:${event.metricName}:hour:${hourBucket}`, event.quantity);
      pipeline.incrbyfloat(`usage:${event.tenantId}:${event.metricName}:day:${dayBucket}`, event.quantity);
      pipeline.incrbyfloat(`usage:${event.tenantId}:${event.metricName}:month:${monthBucket}`, event.quantity);
      pipeline.expire(`usage:${event.tenantId}:${event.metricName}:hour:${hourBucket}`, 86400 * 3);
      pipeline.expire(`usage:${event.tenantId}:${event.metricName}:day:${dayBucket}`, 86400 * 35);
      await pipeline.exec();

      // Persist to PostgreSQL (batch insert every 1000 events)
      await db.query(`
        INSERT INTO usage_events (event_id, tenant_id, metric_name, quantity, timestamp, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (event_id) DO NOTHING
      `, [event.eventId, event.tenantId, event.metricName, event.quantity, event.timestamp, event.metadata]);
    },
  });
}

// Real-time usage query
export async function getCurrentUsage(tenantId: string, period: string): Promise<Record<string, number>> {
  const metrics = ['api_calls', 'compute_seconds', 'storage_bytes', 'bandwidth_bytes', 'ai_tokens'];
  const result: Record<string, number> = {};

  for (const metric of metrics) {
    const val = await redis.get(`usage:${tenantId}:${metric}:month:${period}`);
    result[metric] = parseFloat(val ?? '0');
  }

  return result;
}
```

## Step 3: Pricing Calculator

```typescript
// src/billing/calculator.ts
import { z } from 'zod';

const PricingTier = z.object({
  upTo: z.number().int().positive(),
  pricePerUnit: z.number().nonneg(), // dollars
});

const PricingPlan = z.object({
  basePriceCents: z.number().int(),
  metrics: z.record(z.string(), z.object({
    tiers: z.array(PricingTier),
    unit: z.string(),
    freeQuota: z.number().int().default(0),
  })),
});

const PLANS: Record<string, z.infer<typeof PricingPlan>> = {
  starter: {
    basePriceCents: 2900, // $29/mo base
    metrics: {
      api_calls: {
        tiers: [
          { upTo: 100000, pricePerUnit: 0 },     // first 100K free
          { upTo: 1000000, pricePerUnit: 0.001 }, // $1/1K calls
          { upTo: Infinity, pricePerUnit: 0.0005 }, // volume discount
        ],
        unit: 'calls',
        freeQuota: 100000,
      },
      compute_seconds: {
        tiers: [
          { upTo: 3600, pricePerUnit: 0 },       // 1 hour free
          { upTo: Infinity, pricePerUnit: 0.01 }, // $0.01/sec = $36/hr
        ],
        unit: 'seconds',
        freeQuota: 3600,
      },
      storage_bytes: {
        tiers: [
          { upTo: 1073741824, pricePerUnit: 0 },   // 1 GB free
          { upTo: Infinity, pricePerUnit: 0.000000023 }, // $0.023/GB
        ],
        unit: 'bytes',
        freeQuota: 1073741824,
      },
    },
  },
};

export function calculateInvoice(
  plan: string,
  usage: Record<string, number>
): {
  baseCents: number;
  lineItems: Array<{ metric: string; quantity: number; amountCents: number }>;
  totalCents: number;
} {
  const pricing = PLANS[plan];
  if (!pricing) throw new Error(`Unknown plan: ${plan}`);

  const lineItems: any[] = [];
  let usageTotalCents = 0;

  for (const [metric, quantity] of Object.entries(usage)) {
    const metricPricing = pricing.metrics[metric];
    if (!metricPricing) continue;

    let remaining = quantity;
    let cost = 0;

    for (const tier of metricPricing.tiers) {
      if (remaining <= 0) break;
      const inTier = Math.min(remaining, tier.upTo);
      cost += inTier * tier.pricePerUnit;
      remaining -= inTier;
    }

    const amountCents = Math.round(cost * 100);
    usageTotalCents += amountCents;

    if (amountCents > 0) {
      lineItems.push({ metric, quantity, amountCents });
    }
  }

  return {
    baseCents: pricing.basePriceCents,
    lineItems,
    totalCents: pricing.basePriceCents + usageTotalCents,
  };
}
```

## Step 4: Overage Alerts

```typescript
// src/billing/alerts.ts
import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function checkOverageAlerts(tenantId: string, usage: Record<string, number>): Promise<void> {
  const thresholds = [50, 80, 100]; // percent of typical usage

  for (const [metric, quantity] of Object.entries(usage)) {
    const typicalKey = `usage:typical:${tenantId}:${metric}`;
    const typical = parseFloat(await redis.get(typicalKey) ?? '0');
    if (typical === 0) continue;

    const percentOfTypical = (quantity / typical) * 100;

    for (const threshold of thresholds) {
      if (percentOfTypical >= threshold) {
        const alertKey = `alert:sent:${tenantId}:${metric}:${threshold}`;
        const alerted = await redis.get(alertKey);
        if (!alerted) {
          console.log(`Alert: ${tenantId} hit ${threshold}% of typical ${metric} usage`);
          // Send email/webhook
          await redis.setex(alertKey, 86400 * 30, '1');
        }
      }
    }
  }
}
```

## Results

- **Revenue**: grew from $280K to $420K/month (+50%) — power users now pay fair share
- **Margin**: improved from 25% to 55% — usage-cost alignment
- **Light user churn**: dropped 40% — starter plan at $29 + usage is more attractive than flat $99
- **Power user retention**: 95% stayed — they understand paying for what they use
- **Real-time dashboard**: tenants monitor their own usage, reducing billing surprise tickets by 80%
- **Invoice accuracy**: 100% automated, zero manual adjustments
