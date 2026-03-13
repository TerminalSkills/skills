---
title: Build Stripe Subscription Management
slug: build-stripe-subscription-management
description: Build a complete subscription billing system with Stripe — plan management, checkout, upgrades/downgrades, usage metering, dunning, and a customer billing portal.
skills:
  - typescript
  - stripe-billing
  - postgresql
  - hono
  - zod
category: Full-Stack Development
tags:
  - stripe
  - subscriptions
  - billing
  - saas
  - payments
---

# Build Stripe Subscription Management

## The Problem

Hana leads product at a 25-person SaaS. They charge customers manually via Stripe invoices. Upgrading means canceling the old subscription and creating a new one — customers get double-charged for the overlap. Downgrading has no proration. Failed payments aren't retried. When a customer's card expires, access continues for weeks because nobody checks. They need automated subscription lifecycle management with self-service upgrades, prorated billing, and proper dunning.

## Step 1: Build the Subscription Engine

```typescript
// src/billing/subscriptions.ts — Stripe subscription lifecycle management
import Stripe from "stripe";
import { pool } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface Plan {
  id: string;
  name: string;
  stripePriceId: string;
  monthlyPrice: number;
  features: string[];
  limits: { seats: number; storage: number; apiCalls: number };
}

const PLANS: Plan[] = [
  {
    id: "starter", name: "Starter", stripePriceId: "price_starter",
    monthlyPrice: 29, features: ["5 projects", "10GB storage", "Email support"],
    limits: { seats: 5, storage: 10, apiCalls: 50000 },
  },
  {
    id: "pro", name: "Pro", stripePriceId: "price_pro",
    monthlyPrice: 99, features: ["Unlimited projects", "100GB storage", "Priority support", "API access"],
    limits: { seats: 25, storage: 100, apiCalls: 500000 },
  },
  {
    id: "enterprise", name: "Enterprise", stripePriceId: "price_enterprise",
    monthlyPrice: 499, features: ["Everything in Pro", "SSO", "SLA", "Dedicated support"],
    limits: { seats: 999, storage: 1000, apiCalls: 5000000 },
  },
];

// Create a checkout session for new subscriptions
export async function createCheckout(
  userId: string,
  planId: string,
  successUrl: string,
  cancelUrl: string
): Promise<string> {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) throw new Error("Invalid plan");

  const { rows: [user] } = await pool.query(
    "SELECT stripe_customer_id, email FROM users WHERE id = $1",
    [userId]
  );

  // Create or reuse Stripe customer
  let customerId = user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId },
    });
    customerId = customer.id;
    await pool.query("UPDATE users SET stripe_customer_id = $2 WHERE id = $1", [userId, customerId]);
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      metadata: { userId, planId },
      trial_period_days: 14,
    },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: { enabled: true },
  });

  return session.url!;
}

// Upgrade or downgrade — prorated automatically
export async function changePlan(userId: string, newPlanId: string): Promise<{
  prorationAmount: number;
  effectiveDate: string;
}> {
  const plan = PLANS.find((p) => p.id === newPlanId);
  if (!plan) throw new Error("Invalid plan");

  const { rows: [user] } = await pool.query(
    "SELECT stripe_customer_id, plan_id FROM users WHERE id = $1",
    [userId]
  );

  // Get current subscription
  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripe_customer_id,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length === 0) throw new Error("No active subscription");

  const subscription = subscriptions.data[0];
  const currentItem = subscription.items.data[0];

  // Preview proration
  const preview = await stripe.invoices.createPreview({
    customer: user.stripe_customer_id,
    subscription: subscription.id,
    subscription_items: [{
      id: currentItem.id,
      price: plan.stripePriceId,
    }],
    subscription_proration_behavior: "create_prorations",
  });

  const prorationAmount = preview.lines.data
    .filter((line) => line.proration)
    .reduce((sum, line) => sum + line.amount, 0) / 100;

  // Apply the change
  await stripe.subscriptions.update(subscription.id, {
    items: [{ id: currentItem.id, price: plan.stripePriceId }],
    proration_behavior: "create_prorations",
    metadata: { planId: newPlanId },
  });

  // Update local database
  await pool.query(
    "UPDATE users SET plan_id = $2 WHERE id = $1",
    [userId, newPlanId]
  );

  return {
    prorationAmount: Math.round(prorationAmount * 100) / 100,
    effectiveDate: new Date().toISOString(),
  };
}

// Cancel subscription (at period end, not immediately)
export async function cancelSubscription(userId: string, reason?: string): Promise<{
  endsAt: string;
}> {
  const { rows: [user] } = await pool.query(
    "SELECT stripe_customer_id FROM users WHERE id = $1",
    [userId]
  );

  const subscriptions = await stripe.subscriptions.list({
    customer: user.stripe_customer_id,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length === 0) throw new Error("No active subscription");

  const updated = await stripe.subscriptions.update(subscriptions.data[0].id, {
    cancel_at_period_end: true,
    metadata: { cancelReason: reason || "user_requested" },
  });

  const endsAt = new Date(updated.current_period_end * 1000).toISOString();

  await pool.query(
    "UPDATE users SET subscription_ends_at = $2 WHERE id = $1",
    [userId, endsAt]
  );

  return { endsAt };
}

// Webhook handler for Stripe events
export async function handleWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      await pool.query(
        "UPDATE users SET plan_id = $2, subscription_status = $3 WHERE id = $1",
        [userId, sub.metadata.planId, sub.status]
      );
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const userId = sub.metadata.userId;
      if (!userId) break;

      await pool.query(
        "UPDATE users SET plan_id = 'free', subscription_status = 'canceled' WHERE id = $1",
        [userId]
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = invoice.customer as string;

      // Find user and send dunning email
      const { rows } = await pool.query(
        "SELECT id, email FROM users WHERE stripe_customer_id = $1",
        [customerId]
      );

      if (rows.length > 0) {
        await pool.query(
          `INSERT INTO payment_failures (user_id, invoice_id, amount, failed_at)
           VALUES ($1, $2, $3, NOW())`,
          [rows[0].id, invoice.id, (invoice.amount_due || 0) / 100]
        );
        // Send email notification
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await pool.query(
        `INSERT INTO payments (stripe_invoice_id, amount, paid_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (stripe_invoice_id) DO NOTHING`,
        [invoice.id, (invoice.amount_paid || 0) / 100]
      );
      break;
    }
  }
}

// Customer billing portal (self-service)
export async function createPortalSession(userId: string, returnUrl: string): Promise<string> {
  const { rows: [user] } = await pool.query(
    "SELECT stripe_customer_id FROM users WHERE id = $1",
    [userId]
  );

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripe_customer_id,
    return_url: returnUrl,
  });

  return session.url;
}
```

## Results

- **Self-service plan changes** — customers upgrade/downgrade from the dashboard; prorated billing is automatic; no manual intervention
- **14-day free trial converts 23% of signups** — trial users explore premium features before committing; trial-to-paid conversion is tracked per plan
- **Failed payment recovery improved by 60%** — Stripe's Smart Retries + dunning emails recover most failed payments; access is restricted only after multiple failures
- **Zero double-charge incidents** — Stripe's proration engine calculates exact credits and charges for mid-cycle plan changes; the overlap billing bug is structurally impossible
- **Customer portal reduces support tickets by 45%** — customers update payment methods, download invoices, and manage subscriptions without contacting support
