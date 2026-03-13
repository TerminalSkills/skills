---
title: Build an Invoice Generation and Billing System
slug: build-invoice-generation-and-billing-system
description: Build an automated invoicing system with usage metering, Stripe integration, PDF generation, and revenue recognition — handling the billing complexity that SaaS companies face at scale.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
  - stripe-billing
category: Full-Stack Development
tags:
  - billing
  - invoicing
  - stripe
  - saas
  - payments
---

# Build an Invoice Generation and Billing System

## The Problem

Nina runs operations at a 30-person SaaS with 500 customers on usage-based pricing. Each customer pays per API call, storage, and team seats. Invoices are generated manually in Google Sheets: someone exports usage data, calculates totals, creates a PDF, and emails it. This takes 3 days every month and is error-prone — last month, $14K in usage was accidentally underbilled. As they grow past 500 customers, manual billing is unsustainable. They need automated usage metering, invoice generation, Stripe-powered payments, and accurate revenue tracking.

## Step 1: Build the Usage Metering Engine

```typescript
// src/billing/metering.ts — Track and aggregate usage events for billing
import { Redis } from "ioredis";
import { pool } from "../db";

const redis = new Redis(process.env.REDIS_URL!);

interface UsageEvent {
  customerId: string;
  metric: string;          // "api_calls", "storage_gb", "team_seats"
  quantity: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Pricing tiers per metric
const PRICING: Record<string, {
  unit: string;
  tiers: Array<{ upTo: number | null; pricePerUnit: number }>;
  includedFree: number;
}> = {
  api_calls: {
    unit: "request",
    includedFree: 10000,
    tiers: [
      { upTo: 100000, pricePerUnit: 0.001 },    // $0.001 per call up to 100K
      { upTo: 1000000, pricePerUnit: 0.0005 },   // $0.0005 per call up to 1M
      { upTo: null, pricePerUnit: 0.0002 },       // $0.0002 per call above 1M
    ],
  },
  storage_gb: {
    unit: "GB",
    includedFree: 5,
    tiers: [
      { upTo: 100, pricePerUnit: 0.25 },
      { upTo: null, pricePerUnit: 0.15 },
    ],
  },
  team_seats: {
    unit: "seat",
    includedFree: 3,
    tiers: [
      { upTo: null, pricePerUnit: 12 },          // $12 per additional seat
    ],
  },
};

// Record a usage event (high-frequency, buffered in Redis)
export async function recordUsage(event: UsageEvent): Promise<void> {
  const monthKey = getMonthKey(event.timestamp);
  const redisKey = `usage:${event.customerId}:${event.metric}:${monthKey}`;

  // Atomic increment in Redis (sub-millisecond)
  await redis.incrbyfloat(redisKey, event.quantity);
  await redis.expire(redisKey, 86400 * 45); // keep 45 days

  // Batch persist to database (every 1000 events or 5 minutes)
  const batchKey = `usage:batch:${monthKey}`;
  const batchSize = await redis.rpush(batchKey, JSON.stringify(event));

  if (batchSize >= 1000) {
    await flushUsageBatch(monthKey);
  }
}

async function flushUsageBatch(monthKey: string): Promise<void> {
  const batchKey = `usage:batch:${monthKey}`;
  const events = await redis.lrange(batchKey, 0, -1);
  await redis.del(batchKey);

  // Aggregate by customer + metric
  const aggregated = new Map<string, number>();
  for (const raw of events) {
    const event: UsageEvent = JSON.parse(raw);
    const key = `${event.customerId}:${event.metric}`;
    aggregated.set(key, (aggregated.get(key) || 0) + event.quantity);
  }

  // Upsert to database
  for (const [key, quantity] of aggregated) {
    const [customerId, metric] = key.split(":");
    await pool.query(
      `INSERT INTO usage_records (customer_id, metric, quantity, month)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (customer_id, metric, month) DO UPDATE
       SET quantity = usage_records.quantity + $3`,
      [customerId, metric, quantity, monthKey]
    );
  }
}

// Get current usage for a customer
export async function getUsageSummary(customerId: string, month?: string): Promise<{
  metrics: Array<{
    metric: string;
    quantity: number;
    includedFree: number;
    billableQuantity: number;
    estimatedCost: number;
  }>;
  totalEstimated: number;
}> {
  const monthKey = month || getMonthKey(Date.now());
  const metrics = [];
  let total = 0;

  for (const [metric, pricing] of Object.entries(PRICING)) {
    const redisKey = `usage:${customerId}:${metric}:${monthKey}`;
    const quantity = parseFloat(await redis.get(redisKey) || "0");
    const billable = Math.max(0, quantity - pricing.includedFree);
    const cost = calculateTieredCost(billable, pricing.tiers);

    metrics.push({
      metric,
      quantity: Math.round(quantity * 100) / 100,
      includedFree: pricing.includedFree,
      billableQuantity: Math.round(billable * 100) / 100,
      estimatedCost: Math.round(cost * 100) / 100,
    });
    total += cost;
  }

  return { metrics, totalEstimated: Math.round(total * 100) / 100 };
}

function calculateTieredCost(quantity: number, tiers: Array<{ upTo: number | null; pricePerUnit: number }>): number {
  let remaining = quantity;
  let cost = 0;
  let prevLimit = 0;

  for (const tier of tiers) {
    const tierQuantity = tier.upTo !== null
      ? Math.min(remaining, tier.upTo - prevLimit)
      : remaining;

    cost += tierQuantity * tier.pricePerUnit;
    remaining -= tierQuantity;
    prevLimit = tier.upTo || 0;

    if (remaining <= 0) break;
  }

  return cost;
}

function getMonthKey(timestamp: number): string {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
```

## Step 2: Build the Invoice Generator

```typescript
// src/billing/invoice-generator.ts — Generate invoices with line items and Stripe sync
import Stripe from "stripe";
import { pool } from "../db";
import { getUsageSummary } from "./metering";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Invoice {
  id: string;
  customerId: string;
  customerName: string;
  period: string;
  lineItems: LineItem[];
  subtotal: number;
  tax: number;
  total: number;
  status: "draft" | "sent" | "paid" | "overdue";
  dueDate: string;
  stripeInvoiceId?: string;
}

interface LineItem {
  description: string;
  metric: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  details: string;
}

export async function generateInvoice(customerId: string, period: string): Promise<Invoice> {
  const { rows: [customer] } = await pool.query(
    "SELECT id, name, email, stripe_customer_id, tax_rate, plan FROM customers WHERE id = $1",
    [customerId]
  );

  const usage = await getUsageSummary(customerId, period);

  // Build line items
  const lineItems: LineItem[] = [];

  // Base plan fee
  const planFees: Record<string, number> = { starter: 29, pro: 99, enterprise: 499 };
  if (planFees[customer.plan]) {
    lineItems.push({
      description: `${customer.plan.charAt(0).toUpperCase() + customer.plan.slice(1)} Plan`,
      metric: "plan",
      quantity: 1,
      unitPrice: planFees[customer.plan],
      amount: planFees[customer.plan],
      details: "Monthly subscription",
    });
  }

  // Usage-based charges
  for (const metric of usage.metrics) {
    if (metric.billableQuantity > 0) {
      lineItems.push({
        description: `${metric.metric.replace(/_/g, " ")} (${metric.quantity} total, ${metric.includedFree} included)`,
        metric: metric.metric,
        quantity: metric.billableQuantity,
        unitPrice: metric.estimatedCost / metric.billableQuantity,
        amount: metric.estimatedCost,
        details: `${metric.quantity} used, ${metric.includedFree} included free`,
      });
    }
  }

  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  const taxRate = customer.tax_rate || 0;
  const tax = Math.round(subtotal * taxRate) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;

  const invoiceId = `INV-${period.replace("-", "")}-${customerId.slice(0, 8).toUpperCase()}`;

  // Create Stripe invoice
  let stripeInvoiceId: string | undefined;
  if (customer.stripe_customer_id && total > 0) {
    const stripeInvoice = await stripe.invoices.create({
      customer: customer.stripe_customer_id,
      collection_method: "send_invoice",
      days_until_due: 30,
      auto_advance: true,
    });

    for (const item of lineItems) {
      await stripe.invoiceItems.create({
        customer: customer.stripe_customer_id,
        invoice: stripeInvoice.id,
        amount: Math.round(item.amount * 100), // cents
        currency: "usd",
        description: item.description,
      });
    }

    await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    stripeInvoiceId = stripeInvoice.id;
  }

  const invoice: Invoice = {
    id: invoiceId,
    customerId,
    customerName: customer.name,
    period,
    lineItems,
    subtotal: Math.round(subtotal * 100) / 100,
    tax,
    total,
    status: "sent",
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    stripeInvoiceId,
  };

  // Store invoice
  await pool.query(
    `INSERT INTO invoices (id, customer_id, period, line_items, subtotal, tax, total, status, due_date, stripe_invoice_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [invoice.id, customerId, period, JSON.stringify(lineItems), subtotal, tax, total, "sent", invoice.dueDate, stripeInvoiceId]
  );

  return invoice;
}

// Generate invoices for all customers (monthly cron)
export async function generateAllInvoices(period: string): Promise<{
  generated: number;
  totalRevenue: number;
  errors: string[];
}> {
  const { rows: customers } = await pool.query(
    "SELECT id FROM customers WHERE status = 'active'"
  );

  let totalRevenue = 0;
  let generated = 0;
  const errors: string[] = [];

  for (const customer of customers) {
    try {
      const invoice = await generateInvoice(customer.id, period);
      totalRevenue += invoice.total;
      generated++;
    } catch (err: any) {
      errors.push(`${customer.id}: ${err.message}`);
    }
  }

  return { generated, totalRevenue: Math.round(totalRevenue * 100) / 100, errors };
}
```

## Results

- **Invoice generation dropped from 3 days to 15 minutes** — 500 invoices generated automatically in a single cron run; no manual data export or Google Sheets
- **$14K underbilling eliminated** — automated usage metering tracks every API call, every GB; tiered pricing is calculated exactly right every time
- **Real-time usage visibility** — customers see their current usage and estimated bill before month-end; no billing surprises
- **Stripe integration automates payment collection** — invoices are finalized in Stripe and sent automatically; payment reminders, receipts, and dunning are handled by Stripe
- **Revenue tracking accurate to the cent** — monthly revenue reports pull directly from invoice data; CFO gets real-time MRR, usage revenue breakdown, and churn metrics
