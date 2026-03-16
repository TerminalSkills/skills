---
title: Build an API Monetization Platform
slug: build-api-monetization-platform
description: Build an API monetization platform with pricing plans, usage metering, billing integration, developer portal, free tier management, and revenue analytics for API-as-a-product businesses.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - api-monetization
  - billing
  - pricing
  - developer-portal
  - metering
---

# Build an API Monetization Platform

## The Problem

Oliver leads product at a 20-person company that built an internal API (geocoding, image recognition, text analysis). Other companies want access — potential $500K ARR. But there's no way to sell API access: no self-service signup, no pricing tiers, no usage metering, no billing, no rate limiting per plan. They'd need to manually create accounts, track usage in spreadsheets, and send invoices. They need a monetization platform: pricing plans with free tier, self-service signup, API key management, real-time usage metering, automated billing, and revenue dashboard.

## Step 1: Build the Monetization Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface PricingPlan { id: string; name: string; price: number; interval: "month" | "year"; includedCalls: number; overagePrice: number; rateLimit: number; features: string[]; trial: number; }
interface APICustomer { id: string; email: string; company: string; plan: string; apiKey: string; status: "trial" | "active" | "past_due" | "cancelled"; trialEndsAt: string | null; createdAt: string; }
interface UsageSummary { customerId: string; period: string; totalCalls: number; includedCalls: number; overageCalls: number; overageCost: number; totalCost: number; }

const PLANS: PricingPlan[] = [
  { id: "free", name: "Free", price: 0, interval: "month", includedCalls: 1000, overagePrice: 0, rateLimit: 10, features: ["Basic endpoints", "Community support"], trial: 0 },
  { id: "starter", name: "Starter", price: 49, interval: "month", includedCalls: 50000, overagePrice: 0.001, rateLimit: 100, features: ["All endpoints", "Email support", "Webhooks"], trial: 14 },
  { id: "pro", name: "Professional", price: 199, interval: "month", includedCalls: 500000, overagePrice: 0.0005, rateLimit: 500, features: ["All endpoints", "Priority support", "Webhooks", "SLA 99.9%", "Custom models"], trial: 14 },
  { id: "enterprise", name: "Enterprise", price: 999, interval: "month", includedCalls: 5000000, overagePrice: 0.0002, rateLimit: 2000, features: ["Everything in Pro", "Dedicated support", "SLA 99.99%", "On-premise option", "Custom endpoints"], trial: 30 },
];

// Self-service signup
export async function signup(params: { email: string; company: string; planId: string }): Promise<{ customer: APICustomer; apiKey: string }> {
  const plan = PLANS.find((p) => p.id === params.planId);
  if (!plan) throw new Error("Invalid plan");

  const id = `cust-${randomBytes(6).toString("hex")}`;
  const rawKey = randomBytes(32).toString("hex");
  const apiKey = `sk_${params.planId === "free" ? "test" : "live"}_${rawKey}`;
  const lookupHash = createHash("sha256").update(apiKey).digest("hex");
  const trialEndsAt = plan.trial > 0 ? new Date(Date.now() + plan.trial * 86400000).toISOString() : null;

  const customer: APICustomer = { id, email: params.email, company: params.company, plan: params.planId, apiKey: `sk_...${rawKey.slice(-8)}`, status: plan.trial > 0 ? "trial" : "active", trialEndsAt, createdAt: new Date().toISOString() };

  await pool.query(
    `INSERT INTO api_customers (id, email, company, plan_id, api_key_hash, status, trial_ends_at, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, params.email, params.company, params.planId, lookupHash, customer.status, trialEndsAt]
  );

  // Store key config in Redis for fast auth
  await redis.setex(`apikey:${lookupHash}`, 86400 * 30, JSON.stringify({ customerId: id, plan: params.planId, rateLimit: plan.rateLimit, status: customer.status }));

  await redis.rpush("notification:queue", JSON.stringify({ type: "api_signup", email: params.email, company: params.company, plan: plan.name }));

  return { customer, apiKey };
}

// Meter API usage
export async function meterUsage(customerId: string): Promise<{ allowed: boolean; remaining: number }> {
  const period = new Date().toISOString().slice(0, 7);
  const key = `usage:${customerId}:${period}`;
  const current = await redis.incr(key);
  if (current === 1) await redis.expire(key, 86400 * 35);

  const { rows: [customer] } = await pool.query("SELECT plan_id FROM api_customers WHERE id = $1", [customerId]);
  const plan = PLANS.find((p) => p.id === customer?.plan_id) || PLANS[0];

  if (plan.price === 0 && current > plan.includedCalls) return { allowed: false, remaining: 0 };
  return { allowed: true, remaining: Math.max(0, plan.includedCalls - current) };
}

// Generate usage summary and invoice
export async function generateInvoice(customerId: string, period?: string): Promise<UsageSummary> {
  const month = period || new Date().toISOString().slice(0, 7);
  const totalCalls = parseInt(await redis.get(`usage:${customerId}:${month}`) || "0");

  const { rows: [customer] } = await pool.query("SELECT plan_id FROM api_customers WHERE id = $1", [customerId]);
  const plan = PLANS.find((p) => p.id === customer?.plan_id) || PLANS[0];

  const overageCalls = Math.max(0, totalCalls - plan.includedCalls);
  const overageCost = overageCalls * plan.overagePrice;
  const totalCost = plan.price + overageCost;

  const summary: UsageSummary = { customerId, period: month, totalCalls, includedCalls: plan.includedCalls, overageCalls, overageCost: Math.round(overageCost * 100) / 100, totalCost: Math.round(totalCost * 100) / 100 };

  await pool.query(
    `INSERT INTO api_invoices (customer_id, period, total_calls, overage_calls, overage_cost, total_cost, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW()) ON CONFLICT (customer_id, period) DO UPDATE SET total_calls = $3, overage_calls = $4, overage_cost = $5, total_cost = $6`,
    [customerId, month, totalCalls, overageCalls, summary.overageCost, summary.totalCost]
  );

  return summary;
}

// Revenue dashboard
export async function getRevenueDashboard(): Promise<{ mrr: number; customers: number; callsThisMonth: number; topCustomers: Array<{ company: string; plan: string; calls: number; revenue: number }> }> {
  const { rows: customers } = await pool.query("SELECT * FROM api_customers WHERE status IN ('active', 'trial')");
  let mrr = 0;
  const month = new Date().toISOString().slice(0, 7);
  let totalCalls = 0;
  const topCustomers: any[] = [];

  for (const customer of customers) {
    const plan = PLANS.find((p) => p.id === customer.plan_id) || PLANS[0];
    mrr += plan.price;
    const calls = parseInt(await redis.get(`usage:${customer.id}:${month}`) || "0");
    totalCalls += calls;
    topCustomers.push({ company: customer.company, plan: plan.name, calls, revenue: plan.price });
  }

  return { mrr, customers: customers.length, callsThisMonth: totalCalls, topCustomers: topCustomers.sort((a, b) => b.calls - a.calls).slice(0, 10) };
}

// Middleware: authenticate + meter + rate limit
export function apiMonetizationMiddleware() {
  return async (c: any, next: any) => {
    const apiKey = c.req.header("Authorization")?.replace("Bearer ", "") || c.req.header("X-API-Key");
    if (!apiKey) return c.json({ error: "API key required" }, 401);

    const lookupHash = createHash("sha256").update(apiKey).digest("hex");
    const config = await redis.get(`apikey:${lookupHash}`);
    if (!config) return c.json({ error: "Invalid API key" }, 401);

    const { customerId, plan, rateLimit, status } = JSON.parse(config);
    if (status === "cancelled") return c.json({ error: "Account cancelled" }, 403);

    // Rate limit
    const rlKey = `rl:${customerId}:${Math.floor(Date.now() / 60000)}`;
    const count = await redis.incr(rlKey);
    if (count === 1) await redis.expire(rlKey, 120);
    if (count > rateLimit) { c.header("Retry-After", "60"); return c.json({ error: "Rate limit exceeded" }, 429); }

    // Meter usage
    const { allowed, remaining } = await meterUsage(customerId);
    c.header("X-RateLimit-Remaining", String(remaining));
    if (!allowed) return c.json({ error: "Monthly quota exceeded. Upgrade your plan." }, 429);

    c.set("customerId", customerId);
    c.set("plan", plan);
    await next();
  };
}
```

## Results

- **$0 → $500K ARR potential** — self-service signup → API key in 30 seconds; free tier → upgrade path; no manual account creation
- **Usage-based pricing** — 50K calls included in Starter; overage at $0.001/call; customers pay for what they use; predictable for them, fair for us
- **Rate limiting per plan** — free: 10/min, starter: 100/min, pro: 500/min; abuse prevented; fair access for all tiers
- **Revenue dashboard** — MRR, top customers, usage trends; see which plans sell, which customers grow; data-driven pricing decisions
- **Automated billing** — usage metered in Redis; monthly invoice generated; overage calculated; no spreadsheets; no manual invoicing
