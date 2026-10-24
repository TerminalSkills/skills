---
title: Build SaaS Subscription Billing with Stripe
slug: build-saas-subscription-billing
description: "Implement a complete subscription billing system with Stripe — pricing tiers, free trials, usage-based metering, upgrade/downgrade flows, dunning, and a customer billing portal."
skills: [stripe-billing, auth-system-setup]
category: business
tags: [stripe, billing, subscriptions, saas, payments, webhooks]
---

# Build SaaS Subscription Billing with Stripe

## The Problem

A B2B SaaS product has outgrown its "email us for pricing" approach. The founders manually send invoices, track payments in a spreadsheet, and handle upgrades/downgrades by editing database records. With 45 paying customers and 3 pricing tiers, this works. But they're launching self-serve signup next month, expecting 200+ customers within a quarter, and the manual process will collapse.

The requirements: three tiers (Starter $29/mo, Growth $79/mo, Enterprise $199/mo), annual billing at a 20% discount, 14-day free trials on Growth and Enterprise, usage-based overage charges above the plan's API call limit, and a portal where users manage their own payment methods and invoices. Failed payments must be retried and the customer notified automatically.

## The Solution

Use the **stripe-billing** skill to build the subscription lifecycle: products and prices, Checkout for signups, webhook handlers for billing state, usage-based metering with Stripe Billing Meters, and the hosted customer portal. Use **auth-system-setup** so that billing calls belong to an authenticated user and plan checks run on the server.

The code uses `stripe` (Node SDK) v23, pinned to Stripe API version `2026-09-30.endive`. Install it with `npm install stripe` and keep `STRIPE_SECRET_KEY` (an `sk_test_...` key while developing) and `STRIPE_WEBHOOK_SECRET` in the environment.

## Step-by-Step Walkthrough

### Step 1: Configure Products, Prices and the Usage Meter

Products and prices are created once, by a script. Usage is reported as meter events: the older usage-record API (`subscriptionItems.createUsageRecord`, `aggregate_usage`) was removed in Stripe API version `2025-03-31.basil`, so a metered price must reference a meter.

```typescript
// scripts/setup-stripe.ts — one-time product, price and meter configuration
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const tiers = [
  { tier: 'starter', name: 'Starter', monthly: 2900, apiLimit: 10_000 }, { tier: 'growth', name: 'Growth', monthly: 7900, apiLimit: 100_000 },
  { tier: 'enterprise', name: 'Enterprise', monthly: 19900, apiLimit: 1_000_000 },
];

async function setupBilling() {
  for (const t of tiers) {
    const product = await stripe.products.create({
      name: t.name,
      metadata: { tier: t.tier, api_limit: String(t.apiLimit) },
    });
    const monthly = await stripe.prices.create({ product: product.id, unit_amount: t.monthly, currency: 'usd', recurring: { interval: 'month' } });
    const annual = await stripe.prices.create({
      product: product.id, unit_amount: Math.round(t.monthly * 12 * 0.8), currency: 'usd', recurring: { interval: 'year' }, // 20% off
    });
    console.log(t.tier, monthly.id, annual.id);
  }

  const meter = await stripe.billing.meters.create({
    display_name: 'API overage calls', event_name: 'api_overage_call',
    default_aggregation: { formula: 'sum' }, customer_mapping: { event_payload_key: 'stripe_customer_id', type: 'by_id' },
    value_settings: { event_payload_key: 'value' },
  });

  const overage = await stripe.products.create({ name: 'API Overage' });
  // One overage price per billing interval: items in a Checkout subscription must share an interval
  for (const interval of ['month', 'year'] as const) {
    const overagePrice = await stripe.prices.create({
      product: overage.id, currency: 'usd',
      recurring: { interval, usage_type: 'metered', meter: meter.id },
      unit_amount_decimal: Stripe.Decimal.from('0.1'), // $0.001 per call (0.1 cent)
    });
    console.log(`overage ${interval} price: ${overagePrice.id}`);
  }
}

setupBilling().catch(console.error);
```

Put the printed price IDs in environment variables (`GROWTH_MONTHLY_PRICE`, `OVERAGE_MONTHLY_PRICE`, `OVERAGE_ANNUAL_PRICE`, and so on). The annual prices come to $278.40, $758.40 and $1,910.40. Checkout cannot create subscriptions that mix billing intervals, so an annual plan gets the yearly overage price: its overage is invoiced once, at the end of the year.

### Step 2: Build the Checkout Flow

Checkout handles the payment UI (cards, 3D Secure, wallets). The server decides the trial length from the plan, never from the request body, so a client cannot give itself a free trial. Checkout in `subscription` mode always creates a customer, so do not pass `customer_creation` (it is only valid in `payment` and `setup` mode).

```typescript
// src/billing/checkout.ts — create Checkout Sessions for new subscriptions
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

type Entry = { plan: string; trialDays: number; overage: string };
const monthly = (plan: string): Entry => ({ plan, trialDays: plan === 'starter' ? 0 : 14, overage: process.env.OVERAGE_MONTHLY_PRICE! });
const annual = (plan: string): Entry => ({ ...monthly(plan), overage: process.env.OVERAGE_ANNUAL_PRICE! });
const PRICES: Record<string, Entry> = {
  [process.env.STARTER_MONTHLY_PRICE!]: monthly('starter'),
  [process.env.STARTER_ANNUAL_PRICE!]: annual('starter'),
  [process.env.GROWTH_MONTHLY_PRICE!]: monthly('growth'),
  [process.env.GROWTH_ANNUAL_PRICE!]: annual('growth'),
  [process.env.ENTERPRISE_MONTHLY_PRICE!]: monthly('enterprise'),
  [process.env.ENTERPRISE_ANNUAL_PRICE!]: annual('enterprise'),
};

export function planFromPrice(priceId: string): string {
  return PRICES[priceId]?.plan ?? 'unknown';
}

export async function createCheckoutSession(
  userId: string,
  priceId: string,
  stripeCustomerId?: string,
): Promise<string> {
  const entry = PRICES[priceId]; // server-side catalogue: the client never chooses the trial
  if (!entry) throw new Error('Unknown price');
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }, { price: entry.overage }], // metered: no quantity
    success_url: `${process.env.APP_URL}/billing/success`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    metadata: { userId },
    subscription_data: {
      metadata: { userId }, // copied onto the Subscription object
      ...(entry.trialDays > 0 ? { trial_period_days: entry.trialDays } : {}),
    },
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true }, // VAT / tax IDs for B2B
    ...(stripeCustomerId ? { customer: stripeCustomerId, customer_update: { name: 'auto' as const } } : {}),
  });
  return session.url!;
}
```

Expose it behind your auth middleware, which supplies `req.user` (this is where `auth-system-setup` comes in): `app.post('/api/billing/checkout', requireAuth, ...)` returns `{ url: await createCheckoutSession(req.user.id, req.body.priceId, req.user.stripeCustomerId) }`.

### Step 3: Handle Webhooks

Webhooks are the source of truth for billing state. Verify the signature against the raw body and make handlers idempotent, because Stripe can deliver an event twice. Since API version `2025-03-31.basil`, `current_period_end` lives on each subscription item, and an invoice's subscription is under `invoice.parent.subscription_details`.

```typescript
// src/billing/webhooks.ts — subscription lifecycle events
import express from 'express';
import Stripe from 'stripe';
import { planFromPrice } from './checkout';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function syncSubscription(sub: Stripe.Subscription) {
  const item = sub.items.data.find((i) => i.price.recurring?.usage_type !== 'metered')!;
  await db.users.update(sub.metadata.userId, {
    stripeSubscriptionId: sub.id,
    plan: planFromPrice(item.price.id),
    billingStatus: sub.status, // 'trialing', 'active', 'past_due', ...
    trialEndsAt: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  });
}

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature']!, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch { return res.status(400).send('Signature mismatch'); }
  if (await db.processedEvents.exists(event.id)) return res.json({ received: true });

  switch (event.type) {
    case 'checkout.session.completed': {
      const cs = event.data.object as Stripe.Checkout.Session;
      await db.users.update(cs.metadata!.userId, { stripeCustomerId: cs.customer as string });
      await syncSubscription(await stripe.subscriptions.retrieve(cs.subscription as string));
      break;
    }
    case 'customer.subscription.updated': // upgrade, downgrade, trial end, status change
      await syncSubscription(event.data.object as Stripe.Subscription);
      break;
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.parent?.subscription_details?.subscription;
      const sub = await stripe.subscriptions.retrieve(typeof subId === 'string' ? subId : subId!.id);
      await db.users.update(sub.metadata.userId, { billingStatus: 'past_due' });
      await sendEmail(sub.metadata.userId, 'payment-failed', { amountDue: invoice.amount_due / 100 });
      break;
    }
    case 'customer.subscription.deleted':
      await db.users.update((event.data.object as Stripe.Subscription).metadata.userId, { plan: 'free', billingStatus: 'canceled' });
  }
  await db.processedEvents.add(event.id);
  res.json({ received: true });
});
```

Locally, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (Stripe CLI) forwards events and prints the signing secret for `STRIPE_WEBHOOK_SECRET`.

**Dunning.** Failed subscription payments are retried by Stripe Billing. Turn on Smart Retries under Billing > Revenue recovery > Retries (the recommended default is 8 tries within 2 weeks) and enable the customer emails you want there. `invoice.payment_failed` fires on each failed attempt, and `attempt_count` says which one. Stripe does not retry hard declines; those customers need a new payment method.

### Step 4: Implement Usage-Based Metering

API calls above the plan limit are reported as meter events. A middleware counts calls, and a background job reports only the overage. The `identifier` makes a retried event a no-op instead of a double charge.

```typescript
// src/billing/metering.ts — count API calls and report overage to Stripe
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const PLAN_LIMITS: Record<string, number> = { starter: 10_000, growth: 100_000, enterprise: 1_000_000 };

// In-memory counter; use Redis with several instances
let counters = new Map<string, number>();

export function trackUsage(req: any, _res: any, next: () => void) {
  const id = req.user?.id;
  if (id) counters.set(id, (counters.get(id) ?? 0) + 1);
  next();
}

async function flushUsageToStripe() {
  const batch = counters; counters = new Map();
  const windowId = Math.floor(Date.now() / 300_000);

  for (const [userId, calls] of batch) {
    try {
      const user = await db.users.findById(userId);
      if (!user?.stripeCustomerId) continue;
      const before: number = await db.apiUsage.getPeriodTotal(userId);
      await db.apiUsage.increment(userId, calls);

      const limit = PLAN_LIMITS[user.plan] ?? 0;
      const overage = Math.max(0, Math.min(calls, before + calls - limit));
      if (overage > 0) {
        await stripe.billing.meterEvents.create({
          event_name: 'api_overage_call', // must match the meter's event_name
          payload: { stripe_customer_id: user.stripeCustomerId, value: String(overage) },
          identifier: `${userId}-${windowId}`,
        });
      }
    } catch (err) { console.error('usage flush failed', userId, err); }
  }
}

setInterval(flushUsageToStripe, 5 * 60 * 1000);
```

### Step 5: Customer Billing Portal

Stripe's customer portal lets users update payment methods, view invoices and cancel, with no custom UI. Configure it once in the Dashboard under Settings > Billing > Customer portal (invoice history, payment method updates, cancellation), then create a session per request:

```typescript
// src/billing/portal.ts — redirect the customer to the hosted portal
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
app.post('/api/billing/portal', requireAuth, async (req, res) => {
  const session = await stripe.billingPortal.sessions.create({ customer: req.user.stripeCustomerId, return_url: `${process.env.APP_URL}/settings/billing` });
  res.json({ url: session.url });
});
```

The portal cannot switch plans for this subscription: Stripe documents that a customer can only cancel, not update, a subscription that has multiple products, usage-based billing or a trial. Because every subscription here carries the metered overage item, plan changes go through your own endpoint, which swaps the price on the base item and leaves the overage item alone (same-interval changes only, so the items keep matching intervals):

```typescript
// src/billing/change-plan.ts — upgrade or downgrade from your own UI
app.post('/api/billing/change-plan', requireAuth, async (req, res) => {
  const sub = await stripe.subscriptions.retrieve(req.user.stripeSubscriptionId);
  const base = sub.items.data.find((i) => i.price.recurring?.usage_type !== 'metered')!;
  const next = await stripe.prices.retrieve(req.body.priceId);
  if (planFromPrice(next.id) === 'unknown' || next.recurring?.interval !== base.price.recurring?.interval) {
    return res.status(400).json({ error: 'Choose a plan with the same billing interval' });
  }
  await stripe.subscriptions.update(sub.id, {
    items: [{ id: base.id, price: req.body.priceId }],
    proration_behavior: 'create_prorations',
  });
  res.json({ ok: true }); // the database is updated by customer.subscription.updated
});
```

The resulting `customer.subscription.updated` event is handled in Step 3.

### Step 6: Enforce Plan Limits in the API

Read the plan from your database (kept in sync by the webhook), never from the client:

```typescript
// src/middleware/plan-guard.ts — feature gating by plan, on the server
const PLAN_FEATURES: Record<string, string[]> = {
  starter: ['api-access'], growth: ['api-access', 'webhooks'], enterprise: ['api-access', 'webhooks', 'sso', 'audit-log'],
};
export const requireFeature = (feature: string) => (req: any, res: any, next: () => void) =>
  PLAN_FEATURES[req.user?.plan]?.includes(feature) ? next() : res.status(403).json({ error: 'Upgrade required' });

app.get('/api/audit-log', requireAuth, requireFeature('audit-log'), auditLogHandler);
```

## Real-World Example

The founders run the setup script on a Monday and test the checkout flow in test mode with the `4242 4242 4242 4242` card and the Stripe CLI forwarding webhooks. The first self-serve signup, a Growth plan with a 14-day trial, arrives on Thursday without founder involvement.

In this example team's first month, 47 customers sign up: 28 on Starter, 14 on Growth and 5 on Enterprise. Failed payments go through Smart Retries and the webhook's "payment failed" email; the founders only look at hard declines. Plan changes go through the app's change-plan endpoint and reach the database through `customer.subscription.updated`; the portal handles cards, invoices and cancellation. Two Growth customers exceed the 100K call limit, and the overage appears as its own invoice line instead of an awkward email.

## Related Skills

- [stripe-billing](../skills/stripe-billing/) -- Stripe API for subscriptions, billing meters, webhooks and the customer portal
- [auth-system-setup](../skills/auth-system-setup/) -- Authenticated users and server-side plan checks that billing depends on
