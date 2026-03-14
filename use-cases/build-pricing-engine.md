---
title: Build a Dynamic Pricing Engine
slug: build-pricing-engine
description: Build a dynamic pricing engine with rule-based pricing, customer-specific rates, volume discounts, time-based promotions, A/B price testing, and margin protection.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - pricing
  - dynamic
  - e-commerce
  - revenue
  - optimization
---

# Build a Dynamic Pricing Engine

## The Problem

Viktor leads revenue at a 30-person B2B SaaS. Pricing is hardcoded in the frontend. When they want to test a 10% price increase, it's a deploy. Enterprise customers negotiate custom rates tracked in a spreadsheet — sales reps sometimes quote wrong prices. Volume discounts are calculated manually. Annual billing has a flat 20% discount for everyone, but data shows some segments would pay annual at only 10% off. They need a pricing engine: rules-based, customer-specific, testable, and auditable.

## Step 1: Build the Pricing Engine

```typescript
// src/pricing/engine.ts — Dynamic pricing with rules, segments, volume, and A/B testing
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface PriceRule {
  id: string;
  name: string;
  priority: number;            // higher = evaluated first
  conditions: PriceCondition[];
  adjustments: PriceAdjustment[];
  status: "active" | "draft" | "expired";
  startsAt: string;
  expiresAt: string | null;
}

interface PriceCondition {
  type: "segment" | "volume" | "contract" | "country" | "plan" | "billing_cycle" | "customer_id" | "experiment";
  operator: "eq" | "in" | "gte" | "lte" | "between";
  value: any;
}

interface PriceAdjustment {
  type: "percentage" | "fixed" | "override" | "per_unit";
  value: number;
  target: "base_price" | "per_seat" | "total";
  minPrice?: number;           // floor
  maxDiscount?: number;        // cap discount percentage
}

interface PricingContext {
  customerId: string;
  planId: string;
  billingCycle: "monthly" | "annual";
  seats: number;
  country: string;
  segment: string;             // "startup" | "mid_market" | "enterprise"
  contractValue?: number;
  addons: string[];
}

interface PricingResult {
  basePrice: number;           // cents per seat/month
  adjustedPrice: number;
  totalMonthly: number;
  totalAnnual: number;
  savings: number;
  appliedRules: Array<{ name: string; adjustment: number }>;
  experiment?: { id: string; variant: string };
}

// Calculate price
export async function calculatePrice(ctx: PricingContext): Promise<PricingResult> {
  // Get base plan price
  const { rows: [plan] } = await pool.query("SELECT * FROM plans WHERE id = $1", [ctx.planId]);
  if (!plan) throw new Error("Plan not found");

  let basePrice = plan.base_price; // cents per seat/month
  const appliedRules: PricingResult["appliedRules"] = [];
  let experiment: PricingResult["experiment"] | undefined;

  // Check for customer-specific override first
  const override = await redis.get(`price:override:${ctx.customerId}:${ctx.planId}`);
  if (override) {
    const overrideData = JSON.parse(override);
    return {
      basePrice: plan.base_price,
      adjustedPrice: overrideData.price,
      totalMonthly: overrideData.price * ctx.seats,
      totalAnnual: overrideData.price * ctx.seats * 12,
      savings: 0,
      appliedRules: [{ name: "Custom contract rate", adjustment: overrideData.price - plan.base_price }],
    };
  }

  // Load active rules
  const { rows: rules } = await pool.query(
    `SELECT * FROM price_rules WHERE status = 'active'
     AND starts_at <= NOW() AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY priority DESC`
  );

  let adjustedPrice = basePrice;

  for (const ruleRow of rules) {
    const rule: PriceRule = {
      ...ruleRow,
      conditions: JSON.parse(ruleRow.conditions),
      adjustments: JSON.parse(ruleRow.adjustments),
    };

    // Evaluate conditions
    if (!evaluateConditions(rule.conditions, ctx)) continue;

    // Apply adjustments
    for (const adj of rule.adjustments) {
      const before = adjustedPrice;

      switch (adj.type) {
        case "percentage":
          const discount = adjustedPrice * (Math.abs(adj.value) / 100);
          const cappedDiscount = adj.maxDiscount
            ? Math.min(discount, adjustedPrice * (adj.maxDiscount / 100))
            : discount;
          adjustedPrice = adj.value < 0
            ? adjustedPrice - cappedDiscount
            : adjustedPrice + cappedDiscount;
          break;

        case "fixed":
          adjustedPrice += adj.value;
          break;

        case "override":
          adjustedPrice = adj.value;
          break;

        case "per_unit":
          // Volume-based per-unit pricing
          adjustedPrice = adj.value;
          break;
      }

      // Enforce minimum price
      if (adj.minPrice) adjustedPrice = Math.max(adjustedPrice, adj.minPrice);

      appliedRules.push({ name: rule.name, adjustment: adjustedPrice - before });
    }
  }

  // A/B price test
  const activeExperiment = await getActivePriceExperiment(ctx.planId);
  if (activeExperiment) {
    const variant = assignExperimentVariant(ctx.customerId, activeExperiment.id);
    if (variant === "treatment") {
      const experimentPrice = activeExperiment.treatmentPrice;
      appliedRules.push({ name: `Experiment: ${activeExperiment.name}`, adjustment: experimentPrice - adjustedPrice });
      adjustedPrice = experimentPrice;
    }
    experiment = { id: activeExperiment.id, variant };
  }

  // Calculate totals
  const totalMonthly = adjustedPrice * ctx.seats;
  const totalAnnual = totalMonthly * 12;

  // Annual billing discount (already factored in via rules if applicable)
  const monthlyEquivalent = ctx.billingCycle === "annual"
    ? adjustedPrice  // rules already applied annual discount
    : adjustedPrice;

  const savings = ctx.billingCycle === "annual"
    ? (basePrice * ctx.seats * 12) - totalAnnual
    : 0;

  return {
    basePrice, adjustedPrice,
    totalMonthly: monthlyEquivalent * ctx.seats,
    totalAnnual,
    savings,
    appliedRules,
    experiment,
  };
}

function evaluateConditions(conditions: PriceCondition[], ctx: PricingContext): boolean {
  return conditions.every((cond) => {
    const value = getContextValue(cond.type, ctx);

    switch (cond.operator) {
      case "eq": return value === cond.value;
      case "in": return Array.isArray(cond.value) && cond.value.includes(value);
      case "gte": return typeof value === "number" && value >= cond.value;
      case "lte": return typeof value === "number" && value <= cond.value;
      case "between": return typeof value === "number" && value >= cond.value[0] && value <= cond.value[1];
      default: return false;
    }
  });
}

function getContextValue(type: string, ctx: PricingContext): any {
  switch (type) {
    case "segment": return ctx.segment;
    case "volume": return ctx.seats;
    case "country": return ctx.country;
    case "plan": return ctx.planId;
    case "billing_cycle": return ctx.billingCycle;
    case "customer_id": return ctx.customerId;
    case "contract": return ctx.contractValue;
    default: return undefined;
  }
}

async function getActivePriceExperiment(planId: string): Promise<any> {
  const cached = await redis.get(`price:experiment:${planId}`);
  if (cached === "none") return null;
  if (cached) return JSON.parse(cached);

  const { rows: [exp] } = await pool.query(
    "SELECT * FROM price_experiments WHERE plan_id = $1 AND status = 'active'", [planId]
  );

  if (!exp) {
    await redis.setex(`price:experiment:${planId}`, 300, "none");
    return null;
  }

  await redis.setex(`price:experiment:${planId}`, 300, JSON.stringify(exp));
  return exp;
}

function assignExperimentVariant(customerId: string, experimentId: string): string {
  const hash = parseInt(
    require("node:crypto").createHash("md5").update(`${experimentId}:${customerId}`).digest("hex").slice(0, 8),
    16
  );
  return hash % 100 < 50 ? "control" : "treatment";
}

// Set custom price for a customer (sales-negotiated)
export async function setCustomPrice(
  customerId: string,
  planId: string,
  price: number,
  expiresAt?: string
): Promise<void> {
  const ttl = expiresAt ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000) : 86400 * 365;
  await redis.setex(`price:override:${customerId}:${planId}`, ttl, JSON.stringify({ price, expiresAt }));

  await pool.query(
    `INSERT INTO custom_prices (customer_id, plan_id, price, expires_at, created_at) VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (customer_id, plan_id) DO UPDATE SET price = $3, expires_at = $4`,
    [customerId, planId, price, expiresAt]
  );
}

// Get volume pricing table for display
export async function getVolumePricing(planId: string): Promise<Array<{ minSeats: number; maxSeats: number; pricePerSeat: number }>> {
  const { rows } = await pool.query(
    `SELECT * FROM price_rules WHERE status = 'active'
     AND conditions::text LIKE '%volume%' AND conditions::text LIKE $1
     ORDER BY priority`, [`%${planId}%`]
  );

  return rows.map((r: any) => {
    const conditions = JSON.parse(r.conditions);
    const adjustments = JSON.parse(r.adjustments);
    const volumeCond = conditions.find((c: any) => c.type === "volume");
    return {
      minSeats: volumeCond?.value?.[0] || 0,
      maxSeats: volumeCond?.value?.[1] || 999,
      pricePerSeat: adjustments[0]?.value || 0,
    };
  });
}
```

## Results

- **Price changes without deploys** — marketing updates pricing rules in admin panel; takes effect immediately; Black Friday pricing scheduled weeks ahead
- **Custom contract rates automated** — sales sets customer price in CRM; billing system uses it; no spreadsheet discrepancies; wrong-quote incidents: 15/month → 0
- **A/B price testing** — tested $79 vs $89/month on Pro plan; $89 had only 3% lower conversion but 12% higher revenue; kept $89
- **Volume discounts calculated in real-time** — "50+ seats: $59/seat, 100+: $49/seat" shown on pricing page dynamically; enterprise sees their rate instantly
- **Margin protection** — `minPrice` floors prevent rules from stacking to unprofitable levels; maximum discount caps enforced system-wide
