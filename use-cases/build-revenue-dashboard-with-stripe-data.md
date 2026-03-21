---
title: "Build a Revenue Dashboard with Stripe Data"
description: "Stop checking Stripe 20 times a day. Build a real-time revenue dashboard — MRR, churn rate, LTV, cohort retention, and 3-month MRR forecast — powered by Stripe webhooks streaming into your own database."
skills: [stripe, prisma]
difficulty: intermediate
time_estimate: "7 hours"
tags: [stripe, dashboard, mrr, saas-metrics, analytics, churn, cohort, forecasting]
---

# Build a Revenue Dashboard with Stripe Data

You check Stripe's dashboard constantly, but it doesn't show you MRR trends, churn rate, cohort retention, or a forecast. You cobble numbers together in a spreadsheet every month. This builds the dashboard you actually want — live, in your own app.

## What You'll Build

- Stripe webhook listener → events stream into your DB
- Live metrics: MRR, ARR, churn rate, trial-to-paid conversion, LTV
- Charts: MRR growth over time, new vs expansion vs churned revenue
- Cohort table: monthly retention by signup cohort
- Forecasting: 3-month MRR projection based on current trends

## Architecture

```
Stripe sends webhooks → /api/webhooks/stripe
  → Parse events: subscription created/updated/deleted, invoice paid
  → Upsert into Subscription + RevenueEvent tables
  → Metrics computed on-demand from DB (or cached every hour)
  → Dashboard queries: MRR, churn, cohort, forecast
```

## Step 1: Prisma Schema

```prisma
model Subscription {
  id              String   @id // Stripe subscription ID
  customerId      String
  customer        Customer @relation(fields: [customerId], references: [id])
  status          String   // active | trialing | canceled | past_due | paused
  planId          String
  planName        String
  mrr             Float    // monthly recurring revenue in cents / 100
  interval        String   // month | year
  trialStart      DateTime?
  trialEnd        DateTime?
  startedAt       DateTime
  canceledAt      DateTime?
  currentPeriodEnd DateTime
  cancelAtPeriodEnd Boolean @default(false)
  updatedAt       DateTime @updatedAt
}

model Customer {
  id              String   @id // Stripe customer ID
  email           String
  name            String?
  firstSubAt      DateTime?
  subscriptions   Subscription[]
  invoices        Invoice[]
}

model Invoice {
  id           String   @id // Stripe invoice ID
  customerId   String
  customer     Customer @relation(fields: [customerId], references: [id])
  subscriptionId String?
  amountPaid   Float    // dollars
  status       String   // paid | open | void | uncollectible
  periodStart  DateTime
  periodEnd    DateTime
  paidAt       DateTime?
}

model RevenueSnapshot {
  id          String   @id @default(cuid())
  date        DateTime @unique // daily snapshot at midnight UTC
  mrr         Float
  arr         Float
  newMrr      Float    // from new subs
  expansionMrr Float   // from upgrades
  churnedMrr  Float    // from cancellations
  netNewMrr   Float
  activeCount Int
  trialCount  Int
  churnRate   Float    // monthly churn %
  createdAt   DateTime @default(now())
}
```

## Step 2: Stripe Webhook Handler

```typescript
// POST /api/webhooks/stripe
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Webhook signature invalid", { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case "invoice.paid":
      await recordInvoice(event.data.object as Stripe.Invoice);
      break;
    case "customer.created":
    case "customer.updated":
      await syncCustomer(event.data.object as Stripe.Customer);
      break;
  }

  return Response.json({ received: true });
}

async function syncSubscription(sub: Stripe.Subscription) {
  const plan = sub.items.data[0]?.plan;
  const unitAmount = plan?.amount ?? 0;
  const interval = plan?.interval ?? "month";
  const mrr = interval === "year"
    ? unitAmount / 12 / 100
    : unitAmount / 100;

  await prisma.subscription.upsert({
    where: { id: sub.id },
    update: {
      status: sub.status,
      mrr,
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    },
    create: {
      id: sub.id,
      customerId: sub.customer as string,
      status: sub.status,
      planId: plan?.id ?? "",
      planName: plan?.nickname ?? plan?.id ?? "Unknown",
      mrr,
      interval,
      trialStart: sub.trial_start ? new Date(sub.trial_start * 1000) : null,
      trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      startedAt: new Date(sub.created * 1000),
      canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
    },
  });
}
```

## Step 3: Compute Live Metrics

```typescript
// lib/metrics.ts
export async function getMrr(): Promise<number> {
  const result = await prisma.subscription.aggregate({
    where: { status: "active" },
    _sum: { mrr: true },
  });
  return result._sum.mrr ?? 0;
}

export async function getChurnRate(): Promise<number> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

  const [activeStart, churned] = await Promise.all([
    prisma.subscription.count({ where: { status: "active", startedAt: { lte: thirtyDaysAgo } } }),
    prisma.subscription.count({
      where: { status: "canceled", canceledAt: { gte: thirtyDaysAgo, lte: now } },
    }),
  ]);

  return activeStart > 0 ? (churned / activeStart) * 100 : 0;
}

export async function getLtv(): Promise<number> {
  const churnRate = await getChurnRate();
  const mrr = await getMrr();
  const activeCount = await prisma.subscription.count({ where: { status: "active" } });

  if (activeCount === 0 || churnRate === 0) return 0;
  const arpu = mrr / activeCount;
  return arpu / (churnRate / 100); // LTV = ARPU / monthly churn rate
}

export async function getMrrBreakdown(months = 12) {
  const snapshots = await prisma.revenueSnapshot.findMany({
    orderBy: { date: "asc" },
    take: months,
  });
  return snapshots;
}

// GET /api/metrics — all KPIs in one shot
export async function GET() {
  const [mrr, churnRate, ltv, activeCount, trialCount] = await Promise.all([
    getMrr(),
    getChurnRate(),
    getLtv(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "trialing" } }),
  ]);

  return Response.json({
    mrr,
    arr: mrr * 12,
    churnRate: Math.round(churnRate * 10) / 10,
    ltv: Math.round(ltv),
    activeCount,
    trialCount,
  });
}
```

## Step 4: Cohort Retention Table

```typescript
// lib/cohort.ts
export async function getCohortRetention() {
  // Group customers by signup month, track if still active each subsequent month
  const subs = await prisma.subscription.findMany({
    select: { startedAt: true, canceledAt: true, status: true },
    orderBy: { startedAt: "asc" },
  });

  const cohorts: Record<string, { started: number; retained: number[] }> = {};

  for (const sub of subs) {
    const cohortKey = sub.startedAt.toISOString().slice(0, 7); // "2024-01"
    if (!cohorts[cohortKey]) cohorts[cohortKey] = { started: 0, retained: [] };
    cohorts[cohortKey].started++;

    // For each subsequent month, check if still active
    const months = 12;
    for (let m = 0; m < months; m++) {
      const checkDate = new Date(sub.startedAt);
      checkDate.setMonth(checkDate.getMonth() + m);

      const stillActive =
        sub.canceledAt === null || sub.canceledAt > checkDate;
      if (!cohorts[cohortKey].retained[m]) cohorts[cohortKey].retained[m] = 0;
      if (stillActive) cohorts[cohortKey].retained[m]++;
    }
  }

  // Convert to percentages
  return Object.entries(cohorts).map(([month, data]) => ({
    month,
    started: data.started,
    retention: data.retained.map((r) => Math.round((r / data.started) * 100)),
  }));
}
```

## Step 5: MRR Forecast

```typescript
// lib/forecast.ts — simple linear regression on last 6 months of MRR
export async function getMrrForecast(monthsAhead = 3): Promise<number[]> {
  const snapshots = await prisma.revenueSnapshot.findMany({
    orderBy: { date: "desc" },
    take: 6,
    select: { date: true, mrr: true },
  });

  if (snapshots.length < 2) return [];

  const data = snapshots.reverse(); // oldest first
  const n = data.length;
  const x = data.map((_, i) => i);
  const y = data.map((s) => s.mrr);

  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;

  const slope =
    x.reduce((acc, xi, i) => acc + (xi - xMean) * (y[i] - yMean), 0) /
    x.reduce((acc, xi) => acc + Math.pow(xi - xMean, 2), 0);
  const intercept = yMean - slope * xMean;

  return Array.from({ length: monthsAhead }, (_, i) =>
    Math.max(0, intercept + slope * (n + i))
  );
}
```

## Step 6: Daily Snapshot Cron

```typescript
// Run daily at midnight: snapshot today's metrics into DB
export async function takeDailySnapshot() {
  const [mrr, churnRate, activeCount, trialCount] = await Promise.all([
    getMrr(), getChurnRate(),
    prisma.subscription.count({ where: { status: "active" } }),
    prisma.subscription.count({ where: { status: "trialing" } }),
  ]);

  await prisma.revenueSnapshot.upsert({
    where: { date: new Date(new Date().toDateString()) },
    update: { mrr, arr: mrr * 12, churnRate, activeCount, trialCount },
    create: {
      date: new Date(new Date().toDateString()),
      mrr, arr: mrr * 12, churnRate, activeCount, trialCount,
      newMrr: 0, expansionMrr: 0, churnedMrr: 0, netNewMrr: 0,
    },
  });
}
```

## Environment Variables

```bash
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] Stripe webhook endpoint registered + secret set
- [ ] Historical data backfill: sync past subscriptions via Stripe API
- [ ] Daily snapshot cron running
- [ ] MRR chart rendering with Chart.js or Recharts
- [ ] Cohort table formatted as color-coded heatmap
- [ ] Forecast displayed as dashed line on MRR chart
- [ ] Auth-protected dashboard route

## What's Next

- Plan breakdown: MRR by plan tier
- Revenue attribution: which acquisition channel drives best LTV
- Dunning analytics: how much revenue saved by payment recovery
- Slack daily digest: MRR and new subs at 9 AM
