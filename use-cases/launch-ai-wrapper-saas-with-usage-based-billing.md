---
title: Launch an AI Wrapper SaaS with Usage-Based Billing
slug: launch-ai-wrapper-saas-with-usage-based-billing
description: >-
  Build an AI SaaS with metered billing using Stripe for usage-based pricing, Upstash for rate limiting, Vercel AI SDK for streaming, and Clerk for auth.
skills: [stripe-billing, upstash, vercel-ai-sdk, clerk-auth]
category: business
tags: [ai-saas, usage-based-billing, metered-pricing, stripe, rate-limiting]
---

# Launch an AI Wrapper SaaS with Usage-Based Billing

Sami is a solo developer who built an AI writing assistant over a weekend. It rewrites marketing copy, generates product descriptions, and creates social media posts. Fifty beta users love it — now Sami needs to charge for it without going broke on OpenAI costs.

## The Problem

AI costs are variable and unpredictable. One user might generate 500 tokens per request while another pastes a 10,000-word document and generates 50,000 tokens. Flat-rate pricing either undercharges heavy users (Sami loses money) or overcharges light users (they churn). Sami needs usage-based billing where users pay for what they consume, matching how OpenAI charges Sami. The technical challenge is tracking tokens in real-time across concurrent users, enforcing rate limits, and reporting usage to Stripe accurately.

## The Solution

Combine Stripe metered billing for invoicing, Upstash Redis for real-time token tracking and rate limiting, Vercel AI SDK for streaming responses, and Clerk for user authentication. Install the skills:

```bash
npx terminal-skills install stripe-billing upstash vercel-ai-sdk clerk-auth
```

## Step-by-Step Walkthrough

### 1. Configure Metered Pricing in Stripe

Set up tiered pricing with an included token allowance and per-unit overage charges. Create a product with both a fixed base price and a metered price component:

```typescript
// One-time setup script
const meteredPrice = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  recurring: {
    interval: "month",
    usage_type: "metered",
    aggregate_usage: "sum",
  },
  billing_scheme: "tiered",
  tiers_mode: "graduated",
  tiers: [
    { up_to: 500, unit_amount: 0 },        // First 500K tokens included
    { up_to: "inf", unit_amount: 0.2 },     // $0.002 per 1K tokens over
  ],
  lookup_key: "pro_monthly_metered",
});
```

### 2. Track Token Usage in Real-Time with Upstash

Use Upstash Redis for atomic usage counters and sliding-window rate limiting. Every API call increments a period-scoped counter, and a hourly cron job reports accumulated usage to Stripe:

```typescript
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();
const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  prefix: "ratelimit:api",
});

export async function trackUsage(userId: string, tokens: number) {
  const periodKey = `usage:${userId}:${new Date().toISOString().slice(0, 7)}`;
  const current = await redis.incrby(periodKey, tokens);
  if (current === tokens) await redis.expire(periodKey, 60 * 60 * 24 * 35);
}

export async function reportUsageToStripe() {
  const users = await redis.smembers("active_users_this_period");
  for (const userId of users) {
    const usage = await getCurrentUsage(userId);
    const lastReported = (await redis.get<number>(`reported:${userId}`)) ?? 0;
    const delta = usage - lastReported;
    if (delta <= 0) continue;

    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity: Math.ceil(delta / 1000),
      timestamp: Math.floor(Date.now() / 1000),
      action: "increment",
    });
    await redis.set(`reported:${userId}`, usage);
  }
}
```

### 3. Build the AI Endpoint with Streaming and Usage Tracking

Wire together Clerk auth, rate limiting, usage limits, and Vercel AI SDK streaming. The `onFinish` callback tracks token consumption after each response completes:

```typescript
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return new Response("Rate limit exceeded", { status: 429 });
  }

  const currentUsage = await getCurrentUsage(userId);
  if (currentUsage >= limits.maxTokensPerMonth) {
    return new Response("Monthly limit reached", { status: 402 });
  }

  const { prompt, type } = await req.json();
  const result = streamText({
    model: openai("gpt-4o-mini"),
    prompt,
    onFinish: async ({ usage }) => {
      await trackUsage(userId, usage.promptTokens + usage.completionTokens);
    },
  });

  return result.toDataStreamResponse();
}
```

## Real-World Example

Sami launches CopyAI Pro with 50 beta users converting to paid plans at $20/month plus metered overage. Within the first week, Sami notices that 12 users consistently exceed the 500K included tokens — they are agencies generating copy for multiple clients. These heavy users generate an average $6.37/month in overage fees, which precisely covers the additional OpenAI costs they incur.

After 2 months, the results:

1. 182 paying users on Pro plan ($20/month base + metered overage)
2. MRR reached $4,800 ($3,640 base subscriptions + $1,160 metered overage)
3. Gross margin of 68% because OpenAI costs are tracked per user with no cross-subsidization
4. Churn rate of 4.2%, lower than flat-rate competitors since light users don't feel overcharged
5. P95 latency of 340ms to first token (Upstash rate limit check adds only 2ms)

## Related Skills

- [stripe-billing](../skills/stripe-billing/) — Metered pricing, subscription management, and webhook handling
- [upstash](../skills/upstash/) — Redis-based rate limiting and real-time usage counters
- [vercel-ai-sdk](../skills/vercel-ai-sdk/) — Streaming AI responses with token usage callbacks
- [clerk-auth](../skills/clerk-auth/) — User authentication and session management
