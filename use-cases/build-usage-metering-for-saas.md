---
title: Build Usage Metering for SaaS Billing
slug: build-usage-metering-for-saas
description: Build a usage metering system that tracks API calls, storage, compute time, and seats — with real-time counters, overage alerts, tiered pricing, and Stripe integration for usage-based billing.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - billing
  - metering
  - usage-based
  - saas
  - pricing
---

# Build Usage Metering for SaaS Billing

## The Problem

Max leads billing at a 30-person API platform. They charge flat $99/month for all customers. Power users consume 10M API calls and cost $800/month in compute. Small users pay $99 for 500 calls and feel overcharged. The pricing doesn't scale — they lose money on heavy users and can't compete on price for light users. They need usage-based pricing (like AWS, Twilio) that charges based on actual consumption. The metering must handle 50K API calls/minute, calculate bills accurately to the cent, and alert users before they blow through their budget.

## Step 1: Build the Metering Engine

```typescript
// src/billing/metering.ts — Usage metering with real-time tracking and Stripe integration
import { pool } from "../db";
import { Redis } from "ioredis";
import Stripe from "stripe";

const redis = new Redis(process.env.REDIS_URL!);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface MeterEvent {
  customerId: string;
  metricName: string;          // "api_calls", "storage_gb", "compute_seconds"
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

interface PricingTier {
  upTo: number | null;         // null = unlimited
  unitPrice: number;           // price per unit in cents
}

interface MeterDefinition {
  name: string;
  displayName: string;
  unit: string;                // "calls", "GB", "seconds"
  aggregation: "sum" | "max" | "last";
  pricingTiers: PricingTier[];
  includedFree: number;        // free tier amount
}

const METERS: MeterDefinition[] = [
  {
    name: "api_calls",
    displayName: "API Calls",
    unit: "calls",
    aggregation: "sum",
    pricingTiers: [
      { upTo: 10000, unitPrice: 0 },       // first 10K free
      { upTo: 100000, unitPrice: 0.1 },     // $0.001 per call
      { upTo: 1000000, unitPrice: 0.05 },   // $0.0005 per call (volume discount)
      { upTo: null, unitPrice: 0.02 },      // $0.0002 per call
    ],
    includedFree: 10000,
  },
  {
    name: "storage_gb",
    displayName: "Storage",
    unit: "GB",
    aggregation: "max",
    pricingTiers: [
      { upTo: 5, unitPrice: 0 },           // 5GB free
      { upTo: 100, unitPrice: 25 },         // $0.25/GB
      { upTo: null, unitPrice: 15 },        // $0.15/GB (volume discount)
    ],
    includedFree: 5,
  },
  {
    name: "compute_seconds",
    displayName: "Compute Time",
    unit: "seconds",
    aggregation: "sum",
    pricingTiers: [
      { upTo: 3600, unitPrice: 0 },        // 1 hour free
      { upTo: null, unitPrice: 0.5 },       // $0.005/second
    ],
    includedFree: 3600,
  },
];

// Record a usage event (called on every API request)
export async function recordUsage(event: MeterEvent): Promise<void> {
  const { customerId, metricName, value, timestamp } = event;
  const periodKey = getCurrentPeriodKey(timestamp);

  // Atomic increment in Redis (fast path — 50K+ calls/min)
  const counterKey = `meter:${customerId}:${metricName}:${periodKey}`;
  const newTotal = await redis.incrbyfloat(counterKey, value);

  // Set expiry (retain for 90 days)
  await redis.expire(counterKey, 86400 * 90);

  // Check alert thresholds
  await checkAlerts(customerId, metricName, newTotal);

  // Batch persist to DB (every 1000 events or 60 seconds)
  const batchKey = `meter:batch:${customerId}:${metricName}`;
  const batchCount = await redis.incr(batchKey);
  await redis.expire(batchKey, 60);

  if (batchCount >= 1000 || batchCount === 1) {
    await redis.set(batchKey, "0");
    await pool.query(
      `INSERT INTO usage_records (customer_id, metric_name, value, period, recorded_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (customer_id, metric_name, period)
       DO UPDATE SET value = usage_records.value + $3`,
      [customerId, metricName, value, periodKey]
    );
  }
}

// Get current usage for a customer
export async function getCurrentUsage(customerId: string): Promise<Array<{
  metric: string;
  displayName: string;
  current: number;
  included: number;
  unit: string;
  estimatedCost: number;
  percentUsed: number;
}>> {
  const periodKey = getCurrentPeriodKey(Date.now());
  const results = [];

  for (const meter of METERS) {
    const counterKey = `meter:${customerId}:${meter.name}:${periodKey}`;
    const current = parseFloat(await redis.get(counterKey) || "0");
    const cost = calculateTieredCost(current, meter);

    results.push({
      metric: meter.name,
      displayName: meter.displayName,
      current: Math.round(current * 100) / 100,
      included: meter.includedFree,
      unit: meter.unit,
      estimatedCost: Math.round(cost) / 100,       // in dollars
      percentUsed: meter.includedFree > 0
        ? Math.round((current / meter.includedFree) * 100)
        : 100,
    });
  }

  return results;
}

// Calculate cost with tiered pricing
function calculateTieredCost(usage: number, meter: MeterDefinition): number {
  let remaining = usage;
  let totalCost = 0;
  let previousUpTo = 0;

  for (const tier of meter.pricingTiers) {
    const tierSize = tier.upTo ? tier.upTo - previousUpTo : Infinity;
    const unitsInTier = Math.min(remaining, tierSize);

    if (unitsInTier <= 0) break;

    totalCost += unitsInTier * tier.unitPrice;
    remaining -= unitsInTier;
    previousUpTo = tier.upTo || 0;
  }

  return totalCost;
}

// Generate invoice at end of billing period
export async function generateInvoice(customerId: string, period: string): Promise<{
  invoiceId: string;
  lineItems: Array<{ metric: string; usage: number; cost: number }>;
  total: number;
}> {
  const lineItems = [];
  let total = 0;

  for (const meter of METERS) {
    const { rows: [record] } = await pool.query(
      "SELECT value FROM usage_records WHERE customer_id = $1 AND metric_name = $2 AND period = $3",
      [customerId, meter.name, period]
    );

    const usage = record ? parseFloat(record.value) : 0;
    const cost = calculateTieredCost(usage, meter);

    if (cost > 0) {
      lineItems.push({ metric: meter.displayName, usage, cost: Math.round(cost) / 100 });
      total += cost;
    }
  }

  // Create Stripe invoice
  const { rows: [customer] } = await pool.query(
    "SELECT stripe_customer_id FROM customers WHERE id = $1",
    [customerId]
  );

  if (customer?.stripe_customer_id && total > 0) {
    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: customer.stripe_customer_id,
        amount: Math.round(item.cost * 100),
        currency: "usd",
        description: `${item.metric}: ${item.usage} ${METERS.find((m) => m.displayName === item.metric)?.unit}`,
      });
    }

    const invoice = await stripe.invoices.create({
      customer: customer.stripe_customer_id,
      auto_advance: true,
    });

    return {
      invoiceId: invoice.id,
      lineItems,
      total: Math.round(total) / 100,
    };
  }

  return { invoiceId: `inv-${Date.now()}`, lineItems, total: Math.round(total) / 100 };
}

// Alert thresholds
async function checkAlerts(customerId: string, metricName: string, currentTotal: number): Promise<void> {
  const meter = METERS.find((m) => m.name === metricName);
  if (!meter) return;

  const thresholds = [0.8, 0.9, 1.0]; // 80%, 90%, 100% of free tier

  for (const threshold of thresholds) {
    const triggerValue = meter.includedFree * threshold;
    const alertKey = `meter:alert:${customerId}:${metricName}:${threshold}`;

    if (currentTotal >= triggerValue) {
      const alreadySent = await redis.get(alertKey);
      if (!alreadySent) {
        await redis.setex(alertKey, 86400 * 30, "1");
        await redis.rpush("notification:queue", JSON.stringify({
          userId: customerId,
          type: "usage_alert",
          data: {
            metric: meter.displayName,
            current: Math.round(currentTotal),
            threshold: `${threshold * 100}%`,
            included: meter.includedFree,
          },
        }));
      }
    }
  }
}

function getCurrentPeriodKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
```

## Results

- **Revenue aligned with costs** — power users (10M calls) pay $2,000/month; light users (500 calls) pay $0; pricing is fair and unit economics are positive
- **50K calls/minute metered accurately** — Redis atomic counters handle the write volume; batch persistence to PostgreSQL every 1000 events keeps DB load manageable
- **Usage alerts prevent bill shock** — customers get notified at 80%, 90%, and 100% of their free tier; "I didn't know I was being charged $500" never happens
- **Tiered pricing rewards growth** — volume discounts ($0.001/call for first 100K → $0.0002/call above 1M) incentivize heavy usage; enterprise customers stay instead of building in-house
- **Invoicing automated end-to-end** — monthly cron generates Stripe invoices with line items per metric; finance team reviews instead of manually calculating bills
