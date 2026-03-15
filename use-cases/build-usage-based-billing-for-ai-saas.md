---
title: Build Usage-Based Billing for an AI SaaS Product
slug: build-usage-based-billing-for-ai-saas
description: An AI SaaS startup implements usage-based billing where customers pay per API call, per token processed, and per compute minute — using Stripe metered subscriptions for billing, real-time usage tracking with Redis, cost attribution per customer, prepaid credit systems, and rate limiting that ties to billing tiers — solving the hardest problem in AI SaaS pricing.
skills: [stripe-billing, upstash, hono, prisma, zod, opentelemetry-js]
category: development
tags: [billing, usage-based, saas, ai, pricing, metered, stripe, credits]
---

# Build Usage-Based Billing for an AI SaaS Product

Ren runs an AI API product — customers send documents, the AI extracts structured data and returns JSON. The problem: flat monthly pricing doesn't work for AI products. Customers with 100 documents/month subsidize customers with 100,000 documents/month. The big customers are the expensive ones (more GPU time, more tokens), and flat pricing means losing money on them. Ren needs usage-based billing, but the implementation is surprisingly complex.

## Why AI SaaS Billing Is Hard

Unlike traditional SaaS where all users cost roughly the same, AI products have:

- **Variable cost per request**: A 1-page document costs $0.002 to process; a 50-page document costs $0.15
- **Unpredictable usage patterns**: A customer might send 10 docs today and 10,000 tomorrow
- **Multiple billing dimensions**: Per document, per page, per token, per compute minute
- **Real-time needs**: Customers need to see their usage in real-time; billing after the fact causes disputes
- **Cost pass-through**: If OpenAI raises prices, the billing must reflect it immediately
- **Prepaid credits**: Enterprise customers want to prepay for credits, not get surprise invoices

## Step 1: Usage Tracking in Real-Time

Every API call is metered immediately. Redis stores real-time counters; Postgres stores the permanent record:

```typescript
// lib/usage.ts — Real-time usage tracking
import { Redis } from "@upstash/redis";
import { PrismaClient } from "@prisma/client";

const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL!, token: process.env.UPSTASH_REDIS_TOKEN! });
const prisma = new PrismaClient();

interface UsageEvent {
  customerId: string;
  operation: "extract" | "classify" | "summarize";
  inputTokens: number;
  outputTokens: number;
  pages: number;
  computeMs: number;
  model: string;
  cost: number;                            // Our cost (OpenAI + compute)
}

async function recordUsage(event: UsageEvent) {
  const monthKey = new Date().toISOString().slice(0, 7);  // "2026-03"
  const dayKey = new Date().toISOString().slice(0, 10);    // "2026-03-12"

  // Real-time counters in Redis (for dashboard + rate limiting)
  const pipeline = redis.pipeline();
  pipeline.hincrby(`usage:${event.customerId}:${monthKey}`, "documents", 1);
  pipeline.hincrby(`usage:${event.customerId}:${monthKey}`, "pages", event.pages);
  pipeline.hincrby(`usage:${event.customerId}:${monthKey}`, "inputTokens", event.inputTokens);
  pipeline.hincrby(`usage:${event.customerId}:${monthKey}`, "outputTokens", event.outputTokens);
  pipeline.hincrbyfloat(`usage:${event.customerId}:${monthKey}`, "cost", event.cost);
  pipeline.hincrby(`usage:${event.customerId}:${dayKey}`, "documents", 1);
  pipeline.expire(`usage:${event.customerId}:${monthKey}`, 90 * 86400);  // Keep 90 days
  pipeline.expire(`usage:${event.customerId}:${dayKey}`, 7 * 86400);
  await pipeline.exec();

  // Permanent record in Postgres (for invoicing and audit)
  await prisma.usageEvent.create({
    data: {
      customerId: event.customerId,
      operation: event.operation,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      pages: event.pages,
      computeMs: event.computeMs,
      model: event.model,
      costUsd: event.cost,
      billingMonth: monthKey,
    },
  });

  // Check if customer is approaching limits
  await checkUsageLimits(event.customerId, monthKey);
}

// Calculate cost based on actual resource consumption
function calculateCost(event: Omit<UsageEvent, "cost">): number {
  const TOKEN_COST = {
    "gpt-4o": { input: 0.0000025, output: 0.00001 },      // Per token
    "gpt-4o-mini": { input: 0.00000015, output: 0.0000006 },
  };

  const modelCost = TOKEN_COST[event.model] || TOKEN_COST["gpt-4o-mini"];
  const llmCost = (event.inputTokens * modelCost.input) + (event.outputTokens * modelCost.output);
  const computeCost = event.computeMs * 0.000001;           // $0.001 per second of compute
  const margin = 1.4;                                       // 40% margin

  return (llmCost + computeCost) * margin;
}
```

## Step 2: Billing Tiers with Stripe Metered Subscriptions

```typescript
// lib/billing.ts — Stripe integration for usage-based billing
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Pricing tiers
const TIERS = {
  starter: {
    basePrice: 0,                          // Free tier
    includedDocuments: 100,
    perDocumentAfterIncluded: 0.10,
    perPageAfterIncluded: 0.02,
    rateLimit: 10,                         // requests/minute
  },
  pro: {
    basePrice: 4900,                       // $49/month base
    includedDocuments: 2000,
    perDocumentAfterIncluded: 0.05,
    perPageAfterIncluded: 0.01,
    rateLimit: 100,
  },
  enterprise: {
    basePrice: 29900,                      // $299/month base
    includedDocuments: 20000,
    perDocumentAfterIncluded: 0.02,
    perPageAfterIncluded: 0.005,
    rateLimit: 1000,
  },
};

// Report usage to Stripe at end of billing period
async function reportUsageToStripe(customerId: string) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: { subscription: true },
  });

  const monthKey = new Date().toISOString().slice(0, 7);
  const usage = await redis.hgetall(`usage:${customerId}:${monthKey}`);
  const tier = TIERS[customer.plan];

  // Calculate overage
  const totalDocs = parseInt(usage.documents || "0");
  const totalPages = parseInt(usage.pages || "0");
  const overageDocs = Math.max(0, totalDocs - tier.includedDocuments);
  const overagePages = Math.max(0, totalPages - (tier.includedDocuments * 5));  // ~5 pages per doc included

  if (overageDocs > 0) {
    await stripe.subscriptionItems.createUsageRecord(
      customer.subscription.stripeDocumentItemId,
      { quantity: overageDocs, timestamp: Math.floor(Date.now() / 1000), action: "set" },
    );
  }

  if (overagePages > 0) {
    await stripe.subscriptionItems.createUsageRecord(
      customer.subscription.stripePageItemId,
      { quantity: overagePages, timestamp: Math.floor(Date.now() / 1000), action: "set" },
    );
  }
}
```

## Step 3: Prepaid Credits for Enterprise

Enterprise customers don't want surprise invoices. They prepay for credits and draw down:

```typescript
// lib/credits.ts — Prepaid credit system
async function deductCredits(customerId: string, cost: number): Promise<{ allowed: boolean; remaining: number }> {
  // Atomic deduction in Redis (prevents overdraft in concurrent requests)
  const remaining = await redis.incrbyfloat(`credits:${customerId}`, -cost);

  if (remaining < 0) {
    // Overdraft — refund the deduction
    await redis.incrbyfloat(`credits:${customerId}`, cost);

    // Check if they have auto-refill enabled
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (customer.autoRefillEnabled && customer.autoRefillThreshold > remaining + cost) {
      await purchaseCredits(customerId, customer.autoRefillAmount);
      // Retry deduction
      const newRemaining = await redis.incrbyfloat(`credits:${customerId}`, -cost);
      return { allowed: newRemaining >= 0, remaining: Math.max(0, newRemaining) };
    }

    return { allowed: false, remaining: 0 };
  }

  // Alert when credits running low
  if (remaining < 10) {
    await sendLowCreditAlert(customerId, remaining);
  }

  return { allowed: true, remaining };
}
```

## Step 4: Rate Limiting Tied to Billing

```typescript
// middleware/rate-limit.ts — Rate limits that respect billing tiers
async function rateLimitMiddleware(c: any, next: () => Promise<void>) {
  const customer = c.get("customer");
  const tier = TIERS[customer.plan];

  const minuteKey = `ratelimit:${customer.id}:${Math.floor(Date.now() / 60000)}`;
  const count = await redis.incr(minuteKey);
  if (count === 1) await redis.expire(minuteKey, 60);

  if (count > tier.rateLimit) {
    return c.json({
      error: "Rate limit exceeded",
      limit: tier.rateLimit,
      retryAfter: 60 - (Date.now() / 1000 % 60),
      upgrade: customer.plan !== "enterprise" ? "Upgrade for higher limits: https://docs.example.com/pricing" : undefined,
    }, 429);
  }

  c.header("X-RateLimit-Limit", String(tier.rateLimit));
  c.header("X-RateLimit-Remaining", String(tier.rateLimit - count));

  await next();
}
```

## Step 5: Usage Dashboard API

```typescript
// api/usage.ts — Real-time usage dashboard for customers
app.get("/api/usage", async (c) => {
  const customer = c.get("customer");
  const monthKey = new Date().toISOString().slice(0, 7);

  const usage = await redis.hgetall(`usage:${customer.id}:${monthKey}`);
  const tier = TIERS[customer.plan];

  const documents = parseInt(usage?.documents || "0");
  const pages = parseInt(usage?.pages || "0");
  const cost = parseFloat(usage?.cost || "0");

  return c.json({
    period: monthKey,
    plan: customer.plan,
    usage: {
      documents: { used: documents, included: tier.includedDocuments, overage: Math.max(0, documents - tier.includedDocuments) },
      pages: { used: pages },
      tokens: { input: parseInt(usage?.inputTokens || "0"), output: parseInt(usage?.outputTokens || "0") },
    },
    billing: {
      baseCharge: tier.basePrice / 100,
      overageCharge: calculateOverageCharge(documents, pages, tier),
      estimatedTotal: tier.basePrice / 100 + calculateOverageCharge(documents, pages, tier),
    },
    limits: {
      rateLimit: `${tier.rateLimit} requests/minute`,
      usageLimit: customer.plan === "starter" ? `${tier.includedDocuments} documents/month` : "Unlimited (overage billed)",
    },
    credits: customer.prepaidCredits ? { remaining: await redis.get(`credits:${customer.id}`) } : undefined,
  });
});
```

## Results

After 6 months of usage-based billing:

- **Revenue per customer**: Average increased 2.3x; heavy users now pay their fair share
- **Customer acquisition**: Free tier converts 18% to paid (was 8% with flat pricing); lower barrier
- **Gross margin**: Improved from 45% to 62%; cost pass-through means no more subsidizing heavy users
- **Billing disputes**: 2 in 6 months (both resolved by showing usage logs); real-time dashboard prevents surprises
- **Enterprise deals**: 4 prepaid credit deals ($10K-$50K); enterprises love predictable spending
- **Churn**: Decreased 30% for paid customers; they only pay for what they use, no "am I getting my money's worth?"
- **Rate limiting**: Zero abuse incidents; rate limits tied to tier prevent crypto miners from exploiting free tier
- **Usage visibility**: 85% of customers check the dashboard weekly; transparency builds trust
