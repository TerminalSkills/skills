---
title: Build a Subscription Analytics Dashboard (Your Own Baremetrics)
description: "Pull Stripe data and build an MRR dashboard — churn rate, LTV, cohort retention, MRR waterfall, and alerts. No $200/month Baremetrics required."
skills:
  - prisma
  - stripe-billing
difficulty: advanced
time_estimate: "16 hours"
tags: [analytics, mrr, stripe, saas-metrics, churn, cohort, dashboard, baremetrics]
---

# Build a Subscription Analytics Dashboard

## The Problem

You're running a SaaS at $8K MRR and you need answers: Which plans have the highest churn? What's the average LTV of a customer who starts on a trial vs. a paid plan? Which month's cohort retained the best?

Baremetrics costs $200/month. ChartMogul is $100/month. You have this data in Stripe — you just need to pull it, transform it, and visualize it. You'll build a dashboard that calculates MRR, ARR, churn rate, LTV, ARPU, a cohort retention table, and an MRR waterfall breakdown. Then you'll add alerts so you know when churn spikes or failed payments surge.

## Architecture

```
Stripe Events → Webhook → Event Store (DB) → Nightly Aggregation → Dashboard API → React Charts
```

Store raw Stripe events in PostgreSQL, compute metrics from those events, and cache results in aggregation tables. Never re-fetch from Stripe for dashboard queries — only on fresh events and manual syncs.

## Database Schema

```prisma
// prisma/schema.prisma

model StripeEvent {
  id        String   @id  // Stripe event ID (idempotency key)
  type      String
  data      Json
  processed Boolean  @default(false)
  createdAt DateTime @default(now())
  @@index([type, processed])
}

model CustomerMetrics {
  id               String   @id @default(cuid())
  stripeCustomerId String   @unique
  mrr              Float    @default(0)
  plan             String?
  status           String   @default("active")  // active, trialing, past_due, cancelled
  firstPaidAt      DateTime?
  cancelledAt      DateTime?
  ltv              Float    @default(0)
  cohort           String?  // "2024-01" — year-month of first payment
  updatedAt        DateTime @updatedAt
}

model MrrSnapshot {
  id          String   @id @default(cuid())
  date        DateTime @unique  // One snapshot per day
  mrr         Float
  newMrr      Float    @default(0)   // MRR from new customers
  expansionMrr Float   @default(0)   // Upgrades
  contractionMrr Float @default(0)  // Downgrades
  churnedMrr  Float    @default(0)   // Cancellations
  reactivatedMrr Float @default(0)
  activeCount Int      @default(0)
  newCount    Int      @default(0)
  churnedCount Int     @default(0)
  createdAt   DateTime @default(now())
}
```

## Step-by-Step Walkthrough

### Step 1: Sync Historical Stripe Data

```typescript
// scripts/sync-stripe-history.ts — One-time historical sync

import Stripe from 'stripe';
import { prisma } from '../lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function syncStripeHistory() {
  console.log('Syncing historical Stripe data...');

  // Pull all subscriptions (paginate through all)
  let startingAfter: string | undefined;
  let count = 0;

  do {
    const subs = await stripe.subscriptions.list({
      limit: 100,
      status: 'all',
      expand: ['data.customer', 'data.latest_invoice'],
      ...(startingAfter && { starting_after: startingAfter }),
    });

    for (const sub of subs.data) {
      const customer = sub.customer as Stripe.Customer;
      const mrr = calculateMRR(sub);

      await prisma.customerMetrics.upsert({
        where: { stripeCustomerId: customer.id },
        update: { mrr, plan: getPlan(sub), status: sub.status, updatedAt: new Date() },
        create: {
          stripeCustomerId: customer.id,
          mrr,
          plan: getPlan(sub),
          status: sub.status,
          firstPaidAt: sub.trial_end ? new Date(sub.trial_end * 1000) : new Date(sub.created * 1000),
          cohort: getCohort(sub),
        },
      });
    }

    count += subs.data.length;
    startingAfter = subs.has_more ? subs.data[subs.data.length - 1].id : undefined;
    console.log(`Synced ${count} subscriptions...`);
  } while (startingAfter);

  console.log(`Sync complete: ${count} subscriptions`);
}

/** Calculate monthly recurring revenue from a subscription. */
function calculateMRR(sub: Stripe.Subscription): number {
  if (sub.status !== 'active' && sub.status !== 'trialing') return 0;

  return sub.items.data.reduce((sum, item) => {
    const price = item.price;
    if (price.recurring?.usage_type === 'metered') return sum;
    const amount = (price.unit_amount || 0) / 100;
    if (price.recurring?.interval === 'year') return sum + amount / 12;
    if (price.recurring?.interval === 'quarter') return sum + amount / 3;
    return sum + amount;
  }, 0);
}

function getPlan(sub: Stripe.Subscription): string {
  return sub.items.data[0]?.price.nickname || sub.items.data[0]?.price.id || 'unknown';
}

function getCohort(sub: Stripe.Subscription): string {
  const d = new Date(sub.created * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
```

### Step 2: Real-Time Updates via Stripe Webhooks

```typescript
// app/api/webhooks/stripe/route.ts — Keep metrics in sync

export async function POST(req: Request) {
  const event = await verifyStripeEvent(req);

  await prisma.stripeEvent.upsert({
    where: { id: event.id },
    update: {},
    create: { id: event.id, type: event.type, data: event.data.object as any },
  });

  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as Stripe.Invoice;
      if (!invoice.subscription) break;
      const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
      const mrr = calculateMRR(sub);
      await prisma.customerMetrics.update({
        where: { stripeCustomerId: invoice.customer as string },
        data: { mrr, status: 'active', ltv: { increment: invoice.amount_paid / 100 } },
      });
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.customerMetrics.update({
        where: { stripeCustomerId: sub.customer as string },
        data: { mrr: 0, status: 'cancelled', cancelledAt: new Date() },
      });
      break;
    }
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.customerMetrics.update({
        where: { stripeCustomerId: sub.customer as string },
        data: { mrr: calculateMRR(sub), plan: getPlan(sub), status: sub.status },
      });
      break;
    }
  }

  return Response.json({ received: true });
}
```

### Step 3: Calculate Key Metrics

```typescript
// lib/metrics.ts — Core SaaS metric calculations

import { prisma } from './prisma';

export async function getKeyMetrics() {
  const [active, churned, all] = await Promise.all([
    prisma.customerMetrics.aggregate({
      where: { status: { in: ['active', 'trialing'] } },
      _sum: { mrr: true },
      _count: true,
    }),
    prisma.customerMetrics.count({ where: { status: 'cancelled' } }),
    prisma.customerMetrics.count(),
  ]);

  const mrr = active._sum.mrr || 0;
  const activeCustomers = active._count;
  const arr = mrr * 12;
  const churnRate = all > 0 ? (churned / all) * 100 : 0;
  const arpu = activeCustomers > 0 ? mrr / activeCustomers : 0;

  // LTV = ARPU / Monthly Churn Rate
  const monthlyChurnPct = churnRate / 12;
  const ltv = monthlyChurnPct > 0 ? arpu / (monthlyChurnPct / 100) : arpu * 24;

  return { mrr, arr, activeCustomers, churnRate, arpu, ltv };
}

export async function getMrrWaterfall(months = 6) {
  const snapshots = await prisma.mrrSnapshot.findMany({
    orderBy: { date: 'desc' },
    take: months,
  });

  return snapshots.reverse().map(s => ({
    month: s.date.toLocaleDateString('en', { month: 'short', year: 'numeric' }),
    new: s.newMrr,
    expansion: s.expansionMrr,
    contraction: -s.contractionMrr,
    churned: -s.churnedMrr,
    reactivated: s.reactivatedMrr,
    net: s.newMrr + s.expansionMrr - s.contractionMrr - s.churnedMrr + s.reactivatedMrr,
  }));
}

export async function getCohortRetention() {
  // Group customers by cohort month and calculate retention per month
  const cohorts = await prisma.$queryRaw<Array<{
    cohort: string;
    month_offset: number;
    retained: number;
    cohort_size: number;
  }>>`
    WITH cohort_customers AS (
      SELECT
        cohort,
        COUNT(*) as cohort_size
      FROM "CustomerMetrics"
      WHERE cohort IS NOT NULL
      GROUP BY cohort
    ),
    retention AS (
      SELECT
        cm.cohort,
        EXTRACT(MONTH FROM AGE(
          CASE WHEN cm.status = 'cancelled' THEN cm."cancelledAt" ELSE NOW() END,
          cm."firstPaidAt"
        ))::int as month_offset,
        COUNT(*) as retained
      FROM "CustomerMetrics" cm
      WHERE cm."firstPaidAt" IS NOT NULL
      GROUP BY cm.cohort, month_offset
    )
    SELECT
      r.cohort,
      r.month_offset,
      r.retained,
      cc.cohort_size
    FROM retention r
    JOIN cohort_customers cc ON r.cohort = cc.cohort
    ORDER BY r.cohort, r.month_offset
  `;

  return cohorts;
}
```

### Step 4: Dashboard UI with Recharts

```tsx
// app/metrics/page.tsx — Analytics dashboard

import { getKeyMetrics, getMrrWaterfall, getCohortRetention } from '@/lib/metrics';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default async function MetricsDashboard() {
  const [metrics, waterfall, cohort] = await Promise.all([
    getKeyMetrics(),
    getMrrWaterfall(6),
    getCohortRetention(),
  ]);

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold">Subscription Analytics</h1>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: 'MRR', value: `$${metrics.mrr.toLocaleString('en', { maximumFractionDigits: 0 })}` },
          { label: 'ARR', value: `$${metrics.arr.toLocaleString('en', { maximumFractionDigits: 0 })}` },
          { label: 'Active customers', value: metrics.activeCustomers },
          { label: 'Churn rate', value: `${metrics.churnRate.toFixed(1)}%` },
          { label: 'ARPU', value: `$${metrics.arpu.toFixed(0)}` },
          { label: 'LTV', value: `$${metrics.ltv.toFixed(0)}` },
        ].map(m => (
          <div key={m.label} className="bg-white border rounded-xl p-4 text-center">
            <p className="text-sm text-gray-500">{m.label}</p>
            <p className="text-2xl font-black mt-1">{m.value}</p>
          </div>
        ))}
      </div>

      {/* MRR Waterfall */}
      <div className="bg-white border rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-4">MRR Movement</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={waterfall}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value: number) => [`$${Math.abs(value).toFixed(0)}`, '']} />
            <Bar dataKey="new" name="New MRR" fill="#22c55e" stackId="a" />
            <Bar dataKey="expansion" name="Expansion" fill="#86efac" stackId="a" />
            <Bar dataKey="reactivated" name="Reactivated" fill="#bef264" stackId="a" />
            <Bar dataKey="contraction" name="Contraction" fill="#fca5a5" stackId="b" />
            <Bar dataKey="churned" name="Churned" fill="#ef4444" stackId="b" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cohort Retention Table */}
      <div className="bg-white border rounded-xl p-6 overflow-x-auto">
        <h2 className="text-lg font-semibold mb-4">Cohort Retention</h2>
        <CohortTable data={cohort} />
      </div>
    </div>
  );
}
```

### Step 5: Churn Alerts

```typescript
// lib/alerts.ts — Spike detection and notifications

export async function checkAlertsAndNotify() {
  const today = await prisma.mrrSnapshot.findFirst({ orderBy: { date: 'desc' } });
  const yesterday = await prisma.mrrSnapshot.findFirst({
    orderBy: { date: 'desc' },
    skip: 1,
  });

  if (!today || !yesterday) return;

  const churnSpike = today.churnedMrr > yesterday.churnedMrr * 2 && today.churnedMrr > 200;
  const failedPaymentSurge = today.churnedCount > yesterday.churnedCount * 1.5;

  if (churnSpike) {
    await sendSlackAlert(`🚨 Churn spike detected: $${today.churnedMrr.toFixed(0)} churned today (was $${yesterday.churnedMrr.toFixed(0)} yesterday)`);
  }
  if (failedPaymentSurge) {
    await sendSlackAlert(`⚠️ Failed payment surge: ${today.churnedCount} customers churned today vs. ${yesterday.churnedCount} yesterday`);
  }
}

async function sendSlackAlert(message: string) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    body: JSON.stringify({ text: message }),
  });
}
```

## Cost Comparison

| Tool | Cost |
|------|------|
| Baremetrics | $199/month |
| ChartMogul | $100/month |
| **This build** | **$0** (your infra only) |

The only real limitation: no investor-ready PDF reports and no automated bookkeeping integrations. For everything else — MRR, churn, cohorts, LTV — this does the job.

## Related Skills

- [stripe-billing](../skills/stripe-billing/) — Stripe API, subscription events, usage records
- [prisma](../skills/prisma/) — Schema design, complex cohort queries
