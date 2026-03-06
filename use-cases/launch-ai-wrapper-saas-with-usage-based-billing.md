---
title: Launch an AI Wrapper SaaS with Usage-Based Billing
slug: launch-ai-wrapper-saas-with-usage-based-billing
description: Build and launch an AI-powered SaaS product with metered usage billing using Stripe's usage-based pricing, Upstash for rate limiting and token tracking, and Vercel AI SDK for streaming responses — handling the complete flow from user signup to invoice generation for an AI writing assistant processing 2M+ tokens per day.
skills: [stripe, upstash, vercel-ai-sdk, clerk]
category: SaaS & Billing
tags: [ai-saas, usage-based-billing, metered-pricing, stripe, rate-limiting, tokens]
---

# Launch an AI Wrapper SaaS with Usage-Based Billing

Sami is a solo developer who built an AI writing assistant over a weekend. It rewrites marketing copy, generates product descriptions, and creates social media posts. The prototype works — 50 beta users love it. Now Sami needs to charge for it without going broke on OpenAI costs.

The challenge: AI costs are variable. One user might generate 500 tokens per request, another might paste a 10,000-word document and generate 50,000 tokens. Flat-rate pricing either undercharges heavy users (Sami loses money) or overcharges light users (they churn). Usage-based billing solves this — users pay for what they consume, just like Sami pays OpenAI.

## Step 1: Metered Pricing in Stripe

Sami sets up three plans: Free (10K tokens/month), Pro ($20/month + $0.002/1K tokens over 500K), and Team ($50/month + $0.0015/1K tokens over 2M). The base subscription covers fixed costs; the metered component scales with usage.

```typescript
// src/lib/stripe/setup-products.ts — One-time product setup
// Run this script once to create Stripe products and prices

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function setupProducts() {
  // Create the product
  const product = await stripe.products.create({
    name: "CopyAI Pro",
    description: "AI-powered marketing copy generator",
  });

  // Base subscription price (fixed monthly)
  const basePrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 2000,                    // $20.00/month
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: "pro_monthly_base",
  });

  // Metered price for token usage above included amount
  const meteredPrice = await stripe.prices.create({
    product: product.id,
    currency: "usd",
    recurring: {
      interval: "month",
      usage_type: "metered",              // Report usage, bill at end of period
      aggregate_usage: "sum",             // Sum all usage records in the period
    },
    billing_scheme: "tiered",
    tiers_mode: "graduated",              // Each tier applies to its range only
    tiers: [
      {
        up_to: 500,                       // First 500K tokens included (units = 1K tokens)
        unit_amount: 0,                   // Free — included in base price
      },
      {
        up_to: "inf",                     // Everything above 500K
        unit_amount: 0.2,                 // $0.002 per 1K tokens ($0.0002 per unit of 100 tokens)
      },
    ],
    lookup_key: "pro_monthly_metered",
  });

  console.log(`Product: ${product.id}`);
  console.log(`Base price: ${basePrice.id}`);
  console.log(`Metered price: ${meteredPrice.id}`);
}
```

## Step 2: Token Tracking with Upstash Redis

Every API call tracks token usage in real-time. Upstash Redis gives sub-millisecond reads for rate limit checks and atomic increments for usage counters — critical when 200 users hit the API concurrently.

```typescript
// src/lib/usage/token-tracker.ts — Real-time token usage tracking
import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import Stripe from "stripe";

const redis = Redis.fromEnv();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Rate limiter: 60 requests per minute per user
const rateLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
  prefix: "ratelimit:api",
});

interface UsageRecord {
  userId: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  endpoint: string;
  timestamp: number;
}

export async function trackUsage(record: UsageRecord): Promise<void> {
  const totalTokens = record.inputTokens + record.outputTokens;
  const periodKey = getPeriodKey(record.userId);  // "usage:user_xxx:2026-03"

  // Atomic increment — safe under concurrent requests
  const currentUsage = await redis.incrby(periodKey, totalTokens);

  // Set expiry on first write (auto-cleanup after billing period)
  if (currentUsage === totalTokens) {
    await redis.expire(periodKey, 60 * 60 * 24 * 35);  // 35 days
  }

  // Store detailed record for analytics (last 1000 per user)
  await redis.lpush(`usage:detail:${record.userId}`, JSON.stringify(record));
  await redis.ltrim(`usage:detail:${record.userId}`, 0, 999);
}

export async function getCurrentUsage(userId: string): Promise<number> {
  const periodKey = getPeriodKey(userId);
  return (await redis.get<number>(periodKey)) ?? 0;
}

export async function checkRateLimit(userId: string): Promise<{
  allowed: boolean;
  remaining: number;
  reset: number;
}> {
  const { success, remaining, reset } = await rateLimiter.limit(userId);
  return { allowed: success, remaining, reset };
}

// Report accumulated usage to Stripe (runs every hour via cron)
export async function reportUsageToStripe(): Promise<void> {
  const users = await redis.smembers("active_users_this_period");

  for (const userId of users) {
    const usage = await getCurrentUsage(userId);
    const lastReported = await redis.get<number>(`reported:${userId}`) ?? 0;
    const delta = usage - lastReported;

    if (delta <= 0) continue;

    // Find user's Stripe subscription item for metered price
    const subscriptionItemId = await getMeteredSubscriptionItem(userId);
    if (!subscriptionItemId) continue;

    // Report usage to Stripe in units of 1K tokens
    await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
      quantity: Math.ceil(delta / 1000),   // Round up to nearest 1K
      timestamp: Math.floor(Date.now() / 1000),
      action: "increment",
    });

    await redis.set(`reported:${userId}`, usage);
  }
}

function getPeriodKey(userId: string): string {
  const now = new Date();
  return `usage:${userId}:${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
```

## Step 3: AI Endpoint with Streaming and Usage Tracking

The API endpoint streams AI responses to the user while tracking every token consumed. The Vercel AI SDK handles streaming; the usage middleware wraps every call with rate limiting and token counting.

```typescript
// src/app/api/generate/route.ts — Main AI generation endpoint
import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { auth } from "@clerk/nextjs/server";
import { trackUsage, checkRateLimit, getCurrentUsage } from "@/lib/usage/token-tracker";
import { getUserPlan, getPlanLimits } from "@/lib/plans";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  // Rate limit check
  const rateCheck = await checkRateLimit(userId);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({
      error: "Rate limit exceeded",
      retryAfter: rateCheck.reset,
    }), {
      status: 429,
      headers: { "Retry-After": String(rateCheck.reset) },
    });
  }

  // Usage limit check
  const plan = await getUserPlan(userId);
  const limits = getPlanLimits(plan);
  const currentUsage = await getCurrentUsage(userId);

  if (currentUsage >= limits.maxTokensPerMonth) {
    return new Response(JSON.stringify({
      error: "Monthly token limit reached",
      currentUsage,
      limit: limits.maxTokensPerMonth,
      upgradeUrl: "/pricing",
    }), { status: 402 });
  }

  const { prompt, type } = await req.json();

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: getSystemPrompt(type),
    prompt,
    maxTokens: Math.min(limits.maxTokensPerRequest, 4000),

    // Track usage after generation completes
    onFinish: async ({ usage }) => {
      await trackUsage({
        userId,
        inputTokens: usage.promptTokens,
        outputTokens: usage.completionTokens,
        model: "gpt-4o-mini",
        endpoint: "generate",
        timestamp: Date.now(),
      });
    },
  });

  // Stream response with usage headers
  return result.toDataStreamResponse({
    headers: {
      "X-Usage-Current": String(currentUsage),
      "X-Usage-Limit": String(limits.maxTokensPerMonth),
      "X-RateLimit-Remaining": String(rateCheck.remaining),
    },
  });
}
```

## Step 4: User-Facing Usage Dashboard

Users need to see how much they've consumed and what they'll be billed. The dashboard shows real-time usage, historical trends, and cost projections.

```tsx
// src/app/dashboard/usage/page.tsx
import { getCurrentUsage } from "@/lib/usage/token-tracker";
import { getUserPlan, getPlanLimits, calculateCost } from "@/lib/plans";

export default async function UsagePage() {
  const { userId } = await auth();
  const usage = await getCurrentUsage(userId!);
  const plan = await getUserPlan(userId!);
  const limits = getPlanLimits(plan);

  const usagePercent = (usage / limits.maxTokensPerMonth) * 100;
  const projectedCost = calculateCost(plan, usage);
  const daysLeft = getDaysLeftInPeriod();
  const projectedEndOfMonth = (usage / (30 - daysLeft)) * 30;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Usage & Billing</h1>

      {/* Usage bar */}
      <div className="rounded-lg border p-6">
        <div className="flex justify-between text-sm">
          <span>{(usage / 1000).toFixed(0)}K tokens used</span>
          <span>{(limits.maxTokensPerMonth / 1000).toFixed(0)}K limit</span>
        </div>
        <div className="mt-2 h-3 rounded-full bg-gray-100">
          <div
            className={`h-3 rounded-full transition-all ${
              usagePercent > 90 ? "bg-red-500" : usagePercent > 70 ? "bg-yellow-500" : "bg-indigo-500"
            }`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Projected end of month: {(projectedEndOfMonth / 1000).toFixed(0)}K tokens
          (~${projectedCost.toFixed(2)})
        </p>
      </div>
    </div>
  );
}
```

## Results After Launch

Sami launches with 50 beta users converting to paid. Within 2 months:
- **182 paying users** (Pro plan: $20/month + metered overage)
- **MRR: $4,800** ($3,640 base + $1,160 metered overage)
- **Gross margin: 68%** (OpenAI costs tracked precisely per user — no subsidizing heavy users)
- **Average overage per user**: $6.37/month (users who go over included tokens)
- **Churn rate: 4.2%** (lower than flat-rate competitors — light users don't feel overcharged)
- **P95 latency: 340ms** to first token (Upstash rate limit check: 2ms, rest is OpenAI)
