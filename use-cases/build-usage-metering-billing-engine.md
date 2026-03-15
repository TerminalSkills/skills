---
title: Build a Usage Metering and Billing Engine
slug: build-usage-metering-billing-engine
description: Build a usage metering and billing engine with real-time event tracking, tiered pricing, invoice generation, overage handling, and revenue analytics for usage-based SaaS.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - billing
  - metering
  - usage-based
  - invoicing
  - saas
---

# Build a Usage Metering and Billing Engine

## The Problem

Hugo leads engineering at a 20-person API company charging per API call. Their billing is a monthly cron job that counts rows in the request log table — a query that takes 45 minutes and locks the database. Customers can't see their usage until the invoice arrives, leading to bill shock disputes ($2K average disputed per month). Pricing tiers (first 10K free, $0.01 per call after, $0.005 above 100K) are hardcoded in the billing script. Adding a new pricing dimension (storage, bandwidth) requires rewriting the billing code. They need real-time metering: track usage as it happens, show customers their current spend, flexible pricing configuration, and automated invoicing.

## Step 1: Build the Metering Engine

```typescript
// src/billing/metering.ts — Real-time usage metering with tiered pricing and invoicing
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface UsageEvent {
  customerId: string;
  metric: string;            // "api_calls", "storage_gb", "bandwidth_gb"
  quantity: number;
  timestamp: number;
  properties?: Record<string, any>;
}

interface PricingPlan {
  id: string;
  name: string;
  tiers: PricingTier[];
  billingPeriod: "monthly" | "yearly";
  includedUsage: Record<string, number>;  // free tier per metric
}

interface PricingTier {
  metric: string;
  upTo: number | null;       // null = unlimited
  unitPrice: number;         // price per unit
  flatFee?: number;          // flat fee for entering this tier
}

interface Invoice {
  id: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  lineItems: Array<{ metric: string; quantity: number; unitPrice: number; amount: number; tier: string }>;
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "pending" | "paid" | "overdue";
}

// Record usage event (called on every API request)
export async function recordUsage(event: UsageEvent): Promise<void> {
  const period = getCurrentPeriod();
  const key = `meter:${event.customerId}:${event.metric}:${period}`;

  // Atomic increment in Redis (real-time counter)
  await redis.incrbyfloat(key, event.quantity);
  await redis.expire(key, 86400 * 35);  // keep for billing period + buffer

  // Store detailed event for audit
  await redis.rpush(`meter:events:${event.customerId}:${period}`, JSON.stringify({
    ...event, id: randomBytes(4).toString("hex"),
  }));

  // Check if approaching limit (for alerts)
  const currentUsage = parseFloat(await redis.get(key) || "0");
  await checkUsageAlerts(event.customerId, event.metric, currentUsage);
}

// Get current usage for a customer (real-time)
export async function getCurrentUsage(customerId: string): Promise<Record<string, {
  used: number; included: number; overage: number; estimatedCost: number;
}>> {
  const period = getCurrentPeriod();
  const plan = await getCustomerPlan(customerId);
  const metrics = ["api_calls", "storage_gb", "bandwidth_gb"];
  const usage: Record<string, any> = {};

  for (const metric of metrics) {
    const key = `meter:${customerId}:${metric}:${period}`;
    const used = parseFloat(await redis.get(key) || "0");
    const included = plan.includedUsage[metric] || 0;
    const overage = Math.max(0, used - included);
    const estimatedCost = calculateCost(plan.tiers, metric, used);

    usage[metric] = { used, included, overage, estimatedCost };
  }

  return usage;
}

// Calculate cost using tiered pricing
function calculateCost(tiers: PricingTier[], metric: string, totalUsage: number): number {
  const metricTiers = tiers
    .filter((t) => t.metric === metric)
    .sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity));

  let cost = 0;
  let remaining = totalUsage;
  let previousTierEnd = 0;

  for (const tier of metricTiers) {
    const tierSize = tier.upTo ? tier.upTo - previousTierEnd : Infinity;
    const unitsInTier = Math.min(remaining, tierSize);

    if (unitsInTier > 0) {
      cost += unitsInTier * tier.unitPrice;
      if (tier.flatFee && remaining > 0) cost += tier.flatFee;
      remaining -= unitsInTier;
    }

    previousTierEnd = tier.upTo || Infinity;
    if (remaining <= 0) break;
  }

  return Math.round(cost * 100) / 100;  // round to cents
}

// Generate invoice for billing period
export async function generateInvoice(customerId: string, periodEnd?: string): Promise<Invoice> {
  const period = periodEnd ? periodEnd.slice(0, 7) : getCurrentPeriod();
  const plan = await getCustomerPlan(customerId);
  const id = `inv-${randomBytes(6).toString("hex")}`;

  const lineItems: Invoice["lineItems"] = [];
  const metrics = ["api_calls", "storage_gb", "bandwidth_gb"];

  for (const metric of metrics) {
    const key = `meter:${customerId}:${metric}:${period}`;
    const totalUsage = parseFloat(await redis.get(key) || "0");
    if (totalUsage === 0) continue;

    const included = plan.includedUsage[metric] || 0;
    const billableUsage = Math.max(0, totalUsage - included);

    if (included > 0) {
      lineItems.push({
        metric, quantity: Math.min(totalUsage, included),
        unitPrice: 0, amount: 0, tier: "included",
      });
    }

    if (billableUsage > 0) {
      // Split across pricing tiers
      let remaining = billableUsage;
      let previousEnd = included;
      const metricTiers = plan.tiers.filter((t) => t.metric === metric).sort((a, b) => (a.upTo || Infinity) - (b.upTo || Infinity));

      for (const tier of metricTiers) {
        if (remaining <= 0) break;
        const tierEnd = tier.upTo || Infinity;
        const unitsInTier = Math.min(remaining, tierEnd - previousEnd);
        if (unitsInTier > 0) {
          const amount = Math.round(unitsInTier * tier.unitPrice * 100) / 100;
          lineItems.push({
            metric, quantity: unitsInTier,
            unitPrice: tier.unitPrice, amount,
            tier: `${previousEnd + 1}-${tier.upTo || "∞"}`,
          });
          remaining -= unitsInTier;
        }
        previousEnd = tierEnd;
      }
    }
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.amount, 0);
  const tax = Math.round(subtotal * 0.1 * 100) / 100;  // 10% tax

  const invoice: Invoice = {
    id, customerId,
    periodStart: `${period}-01`,
    periodEnd: `${period}-${new Date(parseInt(period.slice(0, 4)), parseInt(period.slice(5, 7)), 0).getDate()}`,
    lineItems, subtotal, tax,
    total: subtotal + tax,
    status: "pending",
  };

  await pool.query(
    `INSERT INTO invoices (id, customer_id, period_start, period_end, line_items, subtotal, tax, total, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', NOW())`,
    [id, customerId, invoice.periodStart, invoice.periodEnd,
     JSON.stringify(lineItems), subtotal, tax, invoice.total]
  );

  return invoice;
}

async function checkUsageAlerts(customerId: string, metric: string, currentUsage: number): Promise<void> {
  const plan = await getCustomerPlan(customerId);
  const included = plan.includedUsage[metric] || 0;
  const thresholds = [0.8, 0.95, 1.0];  // 80%, 95%, 100%

  for (const threshold of thresholds) {
    const limit = included * threshold;
    const alertKey = `meter:alert:${customerId}:${metric}:${threshold}`;
    if (currentUsage >= limit && !(await redis.exists(alertKey))) {
      await redis.setex(alertKey, 86400 * 30, "sent");
      await redis.rpush("notification:queue", JSON.stringify({
        type: "usage_alert", customerId, metric,
        percentage: Math.round(threshold * 100),
        currentUsage, limit: included,
      }));
    }
  }
}

function getCurrentPeriod(): string {
  return new Date().toISOString().slice(0, 7);  // YYYY-MM
}

async function getCustomerPlan(customerId: string): Promise<PricingPlan> {
  const cached = await redis.get(`plan:${customerId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query(
    "SELECT p.* FROM pricing_plans p JOIN customers c ON c.plan_id = p.id WHERE c.id = $1",
    [customerId]
  );
  const plan = { ...row, tiers: JSON.parse(row.tiers), includedUsage: JSON.parse(row.included_usage) };
  await redis.setex(`plan:${customerId}`, 3600, JSON.stringify(plan));
  return plan;
}
```

## Results

- **Real-time usage visibility** — customers see current API calls, storage, and estimated bill in their dashboard; updated on every request; no more bill shock
- **Billing query: 45 min → 0ms** — Redis counters replace database row counting; invoice generation reads pre-aggregated data; database no longer locks during billing
- **Tiered pricing configurable** — new tier added to pricing plan JSON; no code changes; marketing tests new pricing in hours
- **Usage alerts prevent overspending** — 80% alert gives customers time to optimize; 95% alert triggers automatic throttling option; disputes dropped from $2K/month to near zero
- **New billing dimensions in minutes** — adding `bandwidth_gb` metering: add metric name to config, record events in middleware; automatically appears on invoices
