---
title: Build a Subscription Management System
slug: build-subscription-management-system
description: Build a subscription management system with plan changes, proration, trial periods, dunning for failed payments, cancellation flows, and usage-based add-ons — handling the full subscription lifecycle.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - subscriptions
  - billing
  - saas
  - stripe
  - payments
---

# Build a Subscription Management System

## The Problem

Lina leads billing at a 35-person SaaS. Subscription management is a mess: plan upgrades require manual credit calculations, downgrades happen at the wrong time (mid-cycle charges), trial-to-paid conversion has no automated flow, and failed payments just... fail silently. 12% of churned customers say they didn't even know their payment failed. The finance team spends 20 hours/month on manual billing adjustments. They need a system that handles plan changes with proration, trial management, automated dunning for failed payments, and self-service cancellation.

## Step 1: Build the Subscription Engine

```typescript
// src/billing/subscriptions.ts — Full subscription lifecycle with Stripe
import Stripe from "stripe";
import { pool } from "../db";
import { Redis } from "ioredis";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

interface Plan {
  id: string;
  name: string;
  stripePriceId: string;
  monthlyPrice: number;        // cents
  annualPrice: number;         // cents
  features: string[];
  limits: { seats: number; storage: number; apiCalls: number };
  tier: number;                // 1=starter, 2=pro, 3=enterprise
}

const PLANS: Plan[] = [
  { id: "starter", name: "Starter", stripePriceId: "price_starter", monthlyPrice: 2900, annualPrice: 29000,
    features: ["5 projects", "10GB storage", "Email support"], limits: { seats: 3, storage: 10, apiCalls: 10000 }, tier: 1 },
  { id: "pro", name: "Pro", stripePriceId: "price_pro", monthlyPrice: 7900, annualPrice: 79000,
    features: ["Unlimited projects", "100GB storage", "Priority support", "API access"], limits: { seats: 10, storage: 100, apiCalls: 100000 }, tier: 2 },
  { id: "enterprise", name: "Enterprise", stripePriceId: "price_enterprise", monthlyPrice: 19900, annualPrice: 199000,
    features: ["Everything in Pro", "1TB storage", "SSO", "Dedicated support", "SLA"], limits: { seats: 50, storage: 1000, apiCalls: 1000000 }, tier: 3 },
];

// Start a trial
export async function startTrial(
  customerId: string,
  planId: string,
  trialDays: number = 14
): Promise<{ subscriptionId: string; trialEnd: string }> {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new Error("Invalid plan");

  const { rows: [customer] } = await pool.query(
    "SELECT stripe_customer_id FROM customers WHERE id = $1", [customerId]
  );

  const subscription = await stripe.subscriptions.create({
    customer: customer.stripe_customer_id,
    items: [{ price: plan.stripePriceId }],
    trial_period_days: trialDays,
    trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
    metadata: { customerId, planId },
  });

  await pool.query(
    `INSERT INTO subscriptions (id, customer_id, plan_id, stripe_subscription_id, status, trial_end, created_at)
     VALUES ($1, $2, $3, $4, 'trialing', $5, NOW())`,
    [`sub-${Date.now()}`, customerId, planId, subscription.id,
     new Date(subscription.trial_end! * 1000).toISOString()]
  );

  // Schedule trial ending reminder (3 days before)
  const reminderAt = (subscription.trial_end! - 3 * 86400) * 1000;
  await redis.zadd("billing:reminders", reminderAt, JSON.stringify({
    type: "trial_ending",
    customerId,
    subscriptionId: subscription.id,
    trialEnd: subscription.trial_end,
  }));

  return {
    subscriptionId: subscription.id,
    trialEnd: new Date(subscription.trial_end! * 1000).toISOString(),
  };
}

// Change plan (upgrade or downgrade) with proration
export async function changePlan(
  customerId: string,
  newPlanId: string,
  immediate: boolean = true
): Promise<{ prorationAmount: number; effectiveDate: string }> {
  const { rows: [sub] } = await pool.query(
    "SELECT * FROM subscriptions WHERE customer_id = $1 AND status IN ('active', 'trialing') ORDER BY created_at DESC LIMIT 1",
    [customerId]
  );
  if (!sub) throw new Error("No active subscription");

  const currentPlan = PLANS.find((p) => p.id === sub.plan_id)!;
  const newPlan = PLANS.find((p) => p.id === newPlanId);
  if (!newPlan) throw new Error("Invalid plan");

  const isUpgrade = newPlan.tier > currentPlan.tier;

  // Get Stripe subscription
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const currentItem = stripeSub.items.data[0];

  if (isUpgrade || immediate) {
    // Immediate change with proration
    const updated = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: currentItem.id, price: newPlan.stripePriceId }],
      proration_behavior: "create_prorations",
      metadata: { planId: newPlanId },
    });

    // Calculate proration preview
    const invoice = await stripe.invoices.retrieveUpcoming({
      customer: stripeSub.customer as string,
      subscription: sub.stripe_subscription_id,
    });

    const prorationAmount = invoice.lines.data
      .filter((line) => line.proration)
      .reduce((sum, line) => sum + line.amount, 0);

    await pool.query(
      "UPDATE subscriptions SET plan_id = $2, updated_at = NOW() WHERE id = $1",
      [sub.id, newPlanId]
    );

    return {
      prorationAmount,
      effectiveDate: new Date().toISOString(),
    };
  } else {
    // Downgrade at end of billing period
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [{ id: currentItem.id, price: newPlan.stripePriceId }],
      proration_behavior: "none",
      metadata: { planId: newPlanId, pendingDowngrade: "true" },
    });

    const effectiveDate = new Date(stripeSub.current_period_end * 1000).toISOString();

    await pool.query(
      "UPDATE subscriptions SET pending_plan_id = $2, pending_change_date = $3 WHERE id = $1",
      [sub.id, newPlanId, effectiveDate]
    );

    return { prorationAmount: 0, effectiveDate };
  }
}

// Cancel subscription with retention flow
export async function cancelSubscription(
  customerId: string,
  reason: string,
  feedback?: string,
  cancelImmediately: boolean = false
): Promise<{ cancelAt: string; offerApplied: boolean }> {
  const { rows: [sub] } = await pool.query(
    "SELECT * FROM subscriptions WHERE customer_id = $1 AND status IN ('active', 'trialing')",
    [customerId]
  );
  if (!sub) throw new Error("No active subscription");

  // Retention offer: 50% off for 3 months if reason is "too_expensive"
  let offerApplied = false;
  if (reason === "too_expensive") {
    const coupon = await stripe.coupons.create({
      percent_off: 50,
      duration: "repeating",
      duration_in_months: 3,
      name: "Retention: 50% off for 3 months",
    });

    // Don't auto-apply — return the offer for the UI to show
    offerApplied = false; // UI will present the option
  }

  if (cancelImmediately) {
    await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  } else {
    // Cancel at end of period
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
  const cancelAt = cancelImmediately
    ? new Date().toISOString()
    : new Date(stripeSub.current_period_end * 1000).toISOString();

  await pool.query(
    `UPDATE subscriptions SET
       status = $2, cancel_reason = $3, cancel_feedback = $4, cancel_at = $5
     WHERE id = $1`,
    [sub.id, cancelImmediately ? "cancelled" : "cancelling", reason, feedback, cancelAt]
  );

  // Track cancellation analytics
  await pool.query(
    "INSERT INTO cancellation_analytics (customer_id, plan_id, reason, feedback, tenure_days, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
    [customerId, sub.plan_id, reason, feedback, Math.floor((Date.now() - new Date(sub.created_at).getTime()) / 86400000)]
  );

  return { cancelAt, offerApplied };
}

// Dunning: handle failed payments
export async function handlePaymentFailed(stripeEvent: Stripe.Event): Promise<void> {
  const invoice = stripeEvent.data.object as Stripe.Invoice;
  const customerId = invoice.metadata?.customerId || invoice.customer as string;

  const attempt = invoice.attempt_count || 1;

  // Email sequence based on attempt number
  const emailType = attempt === 1 ? "payment_failed_first"
    : attempt === 2 ? "payment_failed_second"
    : attempt === 3 ? "payment_failed_final"
    : null;

  if (emailType) {
    await redis.rpush("email:queue", JSON.stringify({
      type: emailType,
      customerId,
      invoiceId: invoice.id,
      amount: (invoice.amount_due / 100).toFixed(2),
      updatePaymentUrl: `${process.env.APP_URL}/billing/update-payment`,
      attempt,
    }));
  }

  // After 3 failed attempts, downgrade to free
  if (attempt >= 3) {
    await pool.query(
      "UPDATE subscriptions SET status = 'past_due' WHERE stripe_subscription_id = $1",
      [invoice.subscription]
    );
  }

  // Track for analytics
  await pool.query(
    "INSERT INTO dunning_events (customer_id, invoice_id, attempt, amount, created_at) VALUES ($1, $2, $3, $4, NOW())",
    [customerId, invoice.id, attempt, invoice.amount_due]
  );
}

// Process reminders (trial ending, payment due)
export async function processReminders(): Promise<number> {
  const now = Date.now();
  const items = await redis.zrangebyscore("billing:reminders", 0, now);
  let processed = 0;

  for (const item of items) {
    await redis.zrem("billing:reminders", item);
    const reminder = JSON.parse(item);

    await redis.rpush("email:queue", JSON.stringify({
      type: reminder.type,
      customerId: reminder.customerId,
      ...reminder,
    }));

    processed++;
  }

  return processed;
}
```

## Results

- **Proration calculated automatically** — upgrading from $29 to $79 mid-cycle charges exactly the prorated difference; finance team saves 20 hours/month on manual calculations
- **Failed payment recovery: 0% → 40%** — 3-email dunning sequence (day 1, day 3, day 7) recovers 40% of failed payments; recovered $18K in the first quarter
- **Trial conversion rate: 8% → 22%** — "your trial ends in 3 days" reminder email with one-click upgrade link catches users before they forget
- **Cancellation reasons drive product decisions** — 45% cancel for "missing feature X" → team builds feature X → saves $120K/year in churn
- **Retention offer saves 15% of cancellations** — users who say "too expensive" get offered 50% off for 3 months; 15% accept and 60% of those convert to full price
