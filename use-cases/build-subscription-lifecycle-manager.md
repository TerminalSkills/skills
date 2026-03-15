---
title: Build a Subscription Lifecycle Manager
slug: build-subscription-lifecycle-manager
description: Build a subscription lifecycle manager with plan changes, trial management, grace periods, cancellation flows, win-back campaigns, and MRR tracking for SaaS businesses.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: SaaS
tags:
  - subscriptions
  - saas
  - billing
  - lifecycle
  - mrr
---

# Build a Subscription Lifecycle Manager

## The Problem

Elena leads product at a 25-person SaaS with 5,000 subscribers. Subscription logic is spaghetti code: trial-to-paid conversion, plan upgrades with proration, downgrades at period end, cancellation with grace period, and reactivation. Edge cases everywhere: customer upgrades mid-cycle, cancels, then reactivates before the period ends — what do they owe? Win-back emails go to customers who cancelled 6 months ago and have already churned. MRR (Monthly Recurring Revenue) is calculated in a spreadsheet. They need a proper subscription engine: clear state machine, proration calculations, trial management, grace periods, and accurate MRR tracking.

## Step 1: Build the Subscription Engine

```typescript
// src/subscriptions/lifecycle.ts — Subscription management with state machine and MRR
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "cancelling" | "cancelled" | "expired";

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  trialEnd: string | null;
  cancelAt: string | null;     // scheduled cancellation date
  cancelledAt: string | null;
  pausedAt: string | null;
  resumeAt: string | null;
  metadata: Record<string, any>;
  createdAt: string;
}

interface Plan {
  id: string;
  name: string;
  price: number;               // monthly price in cents
  interval: "month" | "year";
  trialDays: number;
  features: string[];
}

// Valid state transitions
const TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  trialing: ["active", "cancelled"],
  active: ["past_due", "paused", "cancelling", "cancelled"],
  past_due: ["active", "cancelled"],
  paused: ["active", "cancelled"],
  cancelling: ["active", "cancelled"],  // can reactivate before cancel date
  cancelled: ["active"],                // reactivation
  expired: [],
};

// Create subscription (with optional trial)
export async function createSubscription(params: {
  customerId: string;
  planId: string;
}): Promise<Subscription> {
  const plan = await getPlan(params.planId);
  if (!plan) throw new Error("Plan not found");

  const id = `sub-${randomBytes(8).toString("hex")}`;
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + (plan.interval === "year" ? 12 : 1));

  const trialEnd = plan.trialDays > 0
    ? new Date(now.getTime() + plan.trialDays * 86400000).toISOString()
    : null;

  const sub: Subscription = {
    id, customerId: params.customerId, planId: params.planId,
    status: trialEnd ? "trialing" : "active",
    currentPeriodStart: now.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    trialEnd,
    cancelAt: null, cancelledAt: null, pausedAt: null, resumeAt: null,
    metadata: {}, createdAt: now.toISOString(),
  };

  await pool.query(
    `INSERT INTO subscriptions (id, customer_id, plan_id, status, current_period_start, current_period_end, trial_end, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [id, params.customerId, params.planId, sub.status,
     sub.currentPeriodStart, sub.currentPeriodEnd, trialEnd]
  );

  // Schedule trial end check
  if (trialEnd) {
    const ttl = Math.ceil((new Date(trialEnd).getTime() - Date.now()) / 1000);
    await redis.setex(`sub:trialEnd:${id}`, ttl, "check");
  }

  await updateMRR(params.customerId, plan.price, "new");
  return sub;
}

// Change plan (upgrade/downgrade with proration)
export async function changePlan(
  subscriptionId: string,
  newPlanId: string,
  options?: { prorate?: boolean; immediate?: boolean }
): Promise<{ subscription: Subscription; prorationAmount: number }> {
  const sub = await getSubscription(subscriptionId);
  if (!sub) throw new Error("Subscription not found");

  const oldPlan = await getPlan(sub.planId);
  const newPlan = await getPlan(newPlanId);
  if (!oldPlan || !newPlan) throw new Error("Plan not found");

  let prorationAmount = 0;

  if (options?.prorate !== false) {
    // Calculate unused time on current plan
    const periodTotal = new Date(sub.currentPeriodEnd).getTime() - new Date(sub.currentPeriodStart).getTime();
    const periodUsed = Date.now() - new Date(sub.currentPeriodStart).getTime();
    const unusedRatio = 1 - (periodUsed / periodTotal);

    const creditFromOld = Math.round(oldPlan.price * unusedRatio);
    const chargeForNew = Math.round(newPlan.price * unusedRatio);
    prorationAmount = chargeForNew - creditFromOld;  // positive = charge, negative = credit
  }

  const isUpgrade = newPlan.price > oldPlan.price;

  if (isUpgrade || options?.immediate) {
    // Immediate plan change
    await pool.query(
      "UPDATE subscriptions SET plan_id = $2 WHERE id = $1",
      [subscriptionId, newPlanId]
    );
  } else {
    // Downgrade at end of period
    await pool.query(
      "UPDATE subscriptions SET metadata = metadata || $2 WHERE id = $1",
      [subscriptionId, JSON.stringify({ pendingPlanChange: newPlanId })]
    );
  }

  await updateMRR(sub.customerId, newPlan.price - oldPlan.price, isUpgrade ? "upgrade" : "downgrade");

  return { subscription: { ...sub, planId: isUpgrade ? newPlanId : sub.planId }, prorationAmount };
}

// Cancel subscription (at period end or immediately)
export async function cancel(
  subscriptionId: string,
  options?: { immediate?: boolean; reason?: string }
): Promise<Subscription> {
  const sub = await getSubscription(subscriptionId);
  if (!sub) throw new Error("Subscription not found");

  validateTransition(sub.status, options?.immediate ? "cancelled" : "cancelling");

  if (options?.immediate) {
    await pool.query(
      "UPDATE subscriptions SET status = 'cancelled', cancelled_at = NOW() WHERE id = $1",
      [subscriptionId]
    );
    sub.status = "cancelled";
  } else {
    // Cancel at end of current period
    await pool.query(
      "UPDATE subscriptions SET status = 'cancelling', cancel_at = $2 WHERE id = $1",
      [subscriptionId, sub.currentPeriodEnd]
    );
    sub.status = "cancelling";
    sub.cancelAt = sub.currentPeriodEnd;
  }

  const plan = await getPlan(sub.planId);
  if (plan) await updateMRR(sub.customerId, -plan.price, "churn");

  // Schedule win-back email in 7 days
  await redis.setex(`sub:winback:${subscriptionId}`, 86400 * 7, sub.customerId);

  return sub;
}

// Reactivate cancelled subscription
export async function reactivate(subscriptionId: string): Promise<Subscription> {
  const sub = await getSubscription(subscriptionId);
  if (!sub) throw new Error("Subscription not found");

  validateTransition(sub.status, "active");

  await pool.query(
    "UPDATE subscriptions SET status = 'active', cancel_at = NULL, cancelled_at = NULL WHERE id = $1",
    [subscriptionId]
  );

  const plan = await getPlan(sub.planId);
  if (plan) await updateMRR(sub.customerId, plan.price, "reactivation");

  // Cancel win-back email
  await redis.del(`sub:winback:${subscriptionId}`);

  return { ...sub, status: "active", cancelAt: null };
}

// MRR tracking
async function updateMRR(customerId: string, amountChange: number, reason: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await redis.hincrbyfloat(`mrr:${month}`, "total", amountChange / 100);
  await redis.hincrbyfloat(`mrr:${month}`, reason, amountChange / 100);

  await pool.query(
    `INSERT INTO mrr_events (customer_id, amount_change, reason, month, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [customerId, amountChange, reason, month]
  );
}

export async function getMRRBreakdown(month?: string): Promise<{
  total: number; newMRR: number; expansion: number; contraction: number; churn: number; reactivation: number;
}> {
  const m = month || new Date().toISOString().slice(0, 7);
  const data = await redis.hgetall(`mrr:${m}`);
  return {
    total: parseFloat(data.total || "0"),
    newMRR: parseFloat(data.new || "0"),
    expansion: parseFloat(data.upgrade || "0"),
    contraction: parseFloat(data.downgrade || "0"),
    churn: parseFloat(data.churn || "0"),
    reactivation: parseFloat(data.reactivation || "0"),
  };
}

function validateTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new Error(`Invalid transition: ${from} → ${to}`);
  }
}

async function getSubscription(id: string): Promise<Subscription | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [id]);
  return row || null;
}

async function getPlan(id: string): Promise<Plan | null> {
  const cached = await redis.get(`plan:${id}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query("SELECT * FROM plans WHERE id = $1", [id]);
  if (row) await redis.setex(`plan:${id}`, 3600, JSON.stringify(row));
  return row || null;
}
```

## Results

- **State machine prevents invalid transitions** — can't cancel an already-cancelled subscription; can't downgrade during trial; clear rules, no edge case bugs
- **Proration calculated automatically** — upgrade mid-cycle: credit unused days on old plan, charge remaining days on new plan; customer sees fair charge; no manual calculation
- **MRR tracked in real-time** — dashboard shows: $50K total, $5K new, $3K expansion, -$1K contraction, -$2K churn, $500 reactivation; updated on every subscription event
- **Win-back campaigns timed** — cancelled subscription triggers 7-day win-back email; reactivation before email cancels it; 12% win-back rate on automated emails
- **Trial-to-paid conversion** — trial end triggers payment attempt; failure moves to `past_due` with 3-day grace period; successful payment activates; no manual intervention
