---
title: "Build a Usage-Based Pricing Engine"
description: "Meter API calls, tokens, seats, and storage. Build a complete usage-based billing system with real-time aggregation, tiered pricing rules, and Stripe Meters API integration."
skills: [stripe, prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [billing, pricing, stripe, metering, api, saas, monetization]
---

# Build a Usage-Based Pricing Engine

Your API is growing. Flat-rate pricing is leaving money on the table — power users pay the same as light users. Usage-based pricing aligns cost with value: customers pay for what they consume, and you capture more revenue from heavy users without pricing out small ones.

## The Persona

You run an AI API platform. Customers call your `/completions` endpoint and you charge per 1,000 API calls. Some customers make 100 calls/month, others make 10 million. You need to meter every call, aggregate by billing period, apply tiered rates, and automatically charge via Stripe — without building a billing department.

## What You'll Build

- **Event ingestion pipeline** — capture usage events in real-time without blocking API responses
- **Aggregation engine** — sum events per customer per billing period
- **Pricing rules** — tiered, per-unit, flat + overage pricing models
- **Stripe Meters API** — push aggregated usage to Stripe for automated billing
- **Usage dashboard** — let customers see their consumption in real-time

## Architecture Overview

```
API Request → Usage Event → Queue → Aggregator → Stripe Meter
                                        ↓
                                   Prisma DB (source of truth)
                                        ↓
                                   Customer Dashboard
```

## Step 1: Schema with Prisma

```prisma
// schema.prisma
model UsageEvent {
  id          String   @id @default(cuid())
  customerId  String
  metricName  String   // "api_calls", "tokens", "storage_gb"
  quantity    Float
  timestamp   DateTime @default(now())
  metadata    Json?    // endpoint, model, region, etc.

  customer    Customer @relation(fields: [customerId], references: [id])

  @@index([customerId, metricName, timestamp])
}

model UsageAggregate {
  id             String   @id @default(cuid())
  customerId     String
  metricName     String
  periodStart    DateTime
  periodEnd      DateTime
  totalQuantity  Float    @default(0)
  lastSyncedAt   DateTime?

  customer       Customer @relation(fields: [customerId], references: [id])

  @@unique([customerId, metricName, periodStart])
}

model PricingTier {
  id          String  @id @default(cuid())
  metricName  String
  upTo        Float?  // null = unlimited (last tier)
  unitAmount  Float   // price per unit in cents
  flatAmount  Float   @default(0) // flat fee for this tier
}
```

## Step 2: Ingest Usage Events (Fire and Forget)

```typescript
// lib/usage.ts
import { prisma } from './prisma'

export async function ingestEvent(params: {
  customerId: string
  metricName: string
  quantity: number
  metadata?: Record<string, unknown>
}) {
  // Non-blocking — don't await in hot path
  prisma.usageEvent.create({
    data: {
      customerId: params.customerId,
      metricName: params.metricName,
      quantity: params.quantity,
      metadata: params.metadata,
    },
  }).catch(err => console.error('Usage ingest failed:', err))
}

// In your API handler:
export async function POST(req: Request) {
  const result = await callAIModel(req.body)

  // Fire and forget — never block the response
  ingestEvent({
    customerId: req.user.customerId,
    metricName: 'api_calls',
    quantity: 1,
    metadata: { endpoint: '/completions', tokens: result.tokenCount },
  })

  return Response.json(result)
}
```

## Step 3: Aggregation Worker

```typescript
// workers/aggregate-usage.ts
import { prisma } from '../lib/prisma'

export async function aggregateUsage(periodStart: Date, periodEnd: Date) {
  // Group raw events into period aggregates
  const events = await prisma.usageEvent.groupBy({
    by: ['customerId', 'metricName'],
    where: {
      timestamp: { gte: periodStart, lt: periodEnd },
    },
    _sum: { quantity: true },
  })

  for (const event of events) {
    await prisma.usageAggregate.upsert({
      where: {
        customerId_metricName_periodStart: {
          customerId: event.customerId,
          metricName: event.metricName,
          periodStart,
        },
      },
      update: { totalQuantity: event._sum.quantity ?? 0 },
      create: {
        customerId: event.customerId,
        metricName: event.metricName,
        periodStart,
        periodEnd,
        totalQuantity: event._sum.quantity ?? 0,
      },
    })
  }
}
```

## Step 4: Tiered Pricing Calculation

```typescript
// lib/pricing.ts
import { prisma } from './prisma'

export async function calculateCharge(
  customerId: string,
  metricName: string,
  quantity: number
): Promise<number> {
  const tiers = await prisma.pricingTier.findMany({
    where: { metricName },
    orderBy: { upTo: 'asc' },
  })

  let remaining = quantity
  let totalCharge = 0

  for (const tier of tiers) {
    if (remaining <= 0) break

    const tierLimit = tier.upTo ?? Infinity
    const consumed = tier.upTo
      ? Math.min(remaining, tierLimit)
      : remaining

    totalCharge += tier.flatAmount + consumed * tier.unitAmount
    remaining -= consumed
  }

  return totalCharge
}

// Example tiers for API calls:
// 0–10k calls: $0.002/call
// 10k–100k:    $0.0015/call
// 100k+:       $0.001/call
```

## Step 5: Push to Stripe Meters API

```typescript
// lib/stripe-meters.ts
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function reportUsageToStripe(params: {
  stripeSubscriptionItemId: string
  quantity: number
  timestamp: number
}) {
  await stripe.subscriptionItems.createUsageRecord(
    params.stripeSubscriptionItemId,
    {
      quantity: Math.ceil(params.quantity),
      timestamp: params.timestamp,
      action: 'set', // or 'increment'
    }
  )
}

// Sync at end of billing period
export async function syncPeriodUsage(customerId: string, periodEnd: Date) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { subscription: true },
  })

  const aggregate = await prisma.usageAggregate.findFirst({
    where: { customerId, metricName: 'api_calls' },
  })

  if (!aggregate || !customer?.subscription) return

  await reportUsageToStripe({
    stripeSubscriptionItemId: customer.subscription.stripeItemId,
    quantity: aggregate.totalQuantity,
    timestamp: Math.floor(periodEnd.getTime() / 1000),
  })

  await prisma.usageAggregate.update({
    where: { id: aggregate.id },
    data: { lastSyncedAt: new Date() },
  })
}
```

## Step 6: Real-Time Usage Dashboard

```typescript
// app/api/usage/current/route.ts
export async function GET(req: Request) {
  const customerId = req.user.customerId
  const now = new Date()
  const periodStart = startOfMonth(now)

  const [aggregate, charge] = await Promise.all([
    prisma.usageAggregate.findFirst({
      where: { customerId, metricName: 'api_calls', periodStart },
    }),
    calculateCharge(customerId, 'api_calls', aggregate?.totalQuantity ?? 0),
  ])

  return Response.json({
    currentUsage: aggregate?.totalQuantity ?? 0,
    estimatedCharge: charge,
    periodStart,
    periodEnd: endOfMonth(now),
    // Show how far into next tier
    nextTierAt: getNextTierThreshold('api_calls', aggregate?.totalQuantity ?? 0),
  })
}
```

## Pricing Models You Can Support

| Model | How | Example |
|-------|-----|---------|
| Per-unit | flat rate × quantity | $0.002 per API call |
| Tiered | different rates per bucket | first 10k cheap, then cheaper |
| Volume | lowest tier rate for all units | commit to 100k, get $0.001/call |
| Flat + overage | base fee + per-unit above limit | $99/mo + $0.001 per call over 50k |

## Deploy and Run

```bash
# Run aggregation worker every hour
npx ts-node workers/aggregate-usage.ts

# Or via cron
0 * * * * npx ts-node workers/aggregate-usage.ts >> /var/log/usage-agg.log 2>&1
```

## What's Next

- Add Stripe webhook handler for `invoice.upcoming` to sync usage before billing
- Build a spend alerts system: email when customer hits 80% of expected bill
- Add multi-metric support: tokens, storage GB, active seats in one dashboard
- Implement customer-facing usage export (CSV download)
