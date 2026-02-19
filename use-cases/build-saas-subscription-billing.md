---
title: Build SaaS Subscription Billing with Stripe
slug: build-saas-subscription-billing
description: "Implement a complete subscription billing system with Stripe — pricing tiers, free trials, usage-based metering, upgrade/downgrade flows, dunning, and a customer billing portal."
skills: [stripe-billing]
category: business
tags: [stripe, billing, subscriptions, saas, payments, webhooks]
---

# Build SaaS Subscription Billing with Stripe

## The Problem

A B2B SaaS product has outgrown its "email us for pricing" approach. The founders manually send invoices, track payments in a spreadsheet, and handle upgrades/downgrades by editing database records. With 45 paying customers and 3 pricing tiers, this works. But they're launching self-serve signup next month, expecting 200+ customers within a quarter, and the manual process will collapse.

The billing requirements are specific: three tiers (Starter at $29/mo, Growth at $79/mo, Enterprise at $199/mo), annual billing with a 20% discount, 14-day free trials on Growth and Enterprise, usage-based overage charges for API calls above the plan limit, and a customer-facing portal where users manage their own payment methods and invoices. When a payment fails, the system should retry automatically and notify the customer — not require a founder to chase the invoice.

## The Solution

Use the **stripe-billing** skill to build a complete subscription lifecycle: product and price configuration, checkout sessions for signups, webhook handlers for real-time event processing, usage-based metering, and Stripe's hosted customer portal for self-service billing management.

## Step-by-Step Walkthrough

### Step 1: Configure Products and Prices

```text
Set up Stripe products and prices for a SaaS with 3 tiers: Starter ($29/mo), 
Growth ($79/mo), Enterprise ($199/mo). Each tier has monthly and annual billing 
(20% discount). Growth and Enterprise get 14-day free trials. Add usage-based 
pricing for API calls above the plan limit at $0.001 per call.
```

Products and prices are created once — either through the Stripe dashboard or the API. Using the API makes the configuration reproducible and version-controllable:

```typescript
// scripts/setup-stripe.ts — One-time product and price configuration

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

async function setupBilling() {
  // --- Starter Tier ---
  const starter = await stripe.products.create({
    name: 'Starter',
    description: 'For small teams getting started',
    metadata: {
      tier: 'starter',
      api_limit: '10000',  // 10K API calls/month included
    },
  });

  await stripe.prices.create({
    product: starter.id,
    unit_amount: 2900,  // $29.00 in cents
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier: 'starter', billing: 'monthly' },
  });

  await stripe.prices.create({
    product: starter.id,
    unit_amount: 27840,  // $278.40/year ($23.20/mo — 20% discount)
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { tier: 'starter', billing: 'annual' },
  });

  // --- Growth Tier ---
  const growth = await stripe.products.create({
    name: 'Growth',
    description: 'For growing teams with advanced needs',
    metadata: {
      tier: 'growth',
      api_limit: '100000',  // 100K API calls/month
    },
  });

  const growthMonthly = await stripe.prices.create({
    product: growth.id,
    unit_amount: 7900,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier: 'growth', billing: 'monthly' },
  });

  const growthAnnual = await stripe.prices.create({
    product: growth.id,
    unit_amount: 75840,  // $758.40/year ($63.20/mo)
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { tier: 'growth', billing: 'annual' },
  });

  // --- Enterprise Tier ---
  const enterprise = await stripe.products.create({
    name: 'Enterprise',
    description: 'For large teams with custom requirements',
    metadata: {
      tier: 'enterprise',
      api_limit: '1000000',  // 1M API calls/month
    },
  });

  await stripe.prices.create({
    product: enterprise.id,
    unit_amount: 19900,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { tier: 'enterprise', billing: 'monthly' },
  });

  await stripe.prices.create({
    product: enterprise.id,
    unit_amount: 191040,  // $1,910.40/year ($159.20/mo)
    currency: 'usd',
    recurring: { interval: 'year' },
    metadata: { tier: 'enterprise', billing: 'annual' },
  });

  // --- Usage-Based Overage Pricing ---
  // Charged per API call above the plan's included limit
  const overage = await stripe.products.create({
    name: 'API Overage',
    description: 'Per-call charge above plan limit',
  });

  await stripe.prices.create({
    product: overage.id,
    currency: 'usd',
    recurring: {
      interval: 'month',
      usage_type: 'metered',        // Charged based on reported usage
      aggregate_usage: 'sum',       // Sum all usage records in the period
    },
    unit_amount_decimal: '0.1',     // $0.001 per call (0.1 cents)
    metadata: { type: 'overage' },
  });

  console.log('Stripe billing configured');
  console.log(`Growth monthly: ${growthMonthly.id}`);
  console.log(`Growth annual: ${growthAnnual.id}`);
}

setupBilling();
```

### Step 2: Build the Checkout Flow

Stripe Checkout handles the entire payment UI — card forms, 3D Secure, Apple Pay, Google Pay. The app creates a session and redirects the customer:

```typescript
// src/billing/checkout.ts — Create Stripe Checkout sessions for new subscriptions

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

interface CheckoutParams {
  priceId: string;        // Stripe price ID for the selected plan
  customerId?: string;    // Existing Stripe customer (for upgrades)
  userId: string;         // Your app's user ID (stored in subscription metadata)
  trialDays?: number;     // Free trial length (0 for Starter, 14 for Growth/Enterprise)
  overagePriceId: string; // Metered price for API overage
}

/** Create a Checkout Session for a new subscription.
 *
 * Returns the session URL — redirect the customer there.
 * Stripe handles the payment form, 3D Secure, and receipt.
 */
async function createCheckoutSession(params: CheckoutParams): Promise<string> {
  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [
      { price: params.priceId, quantity: 1 },
      { price: params.overagePriceId },  // Metered price — no quantity (tracked via usage records)
    ],
    success_url: `${process.env.APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.APP_URL}/pricing`,
    subscription_data: {
      metadata: { userId: params.userId },  // Link subscription to your user
    },
    allow_promotion_codes: true,  // Accept coupon codes
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },  // Collect VAT/tax IDs for B2B
  };

  // Add free trial for Growth and Enterprise
  if (params.trialDays && params.trialDays > 0) {
    sessionConfig.subscription_data!.trial_period_days = params.trialDays;
  }

  // Use existing customer if upgrading
  if (params.customerId) {
    sessionConfig.customer = params.customerId;
  } else {
    sessionConfig.customer_creation = 'always';
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return session.url!;
}

// API endpoint
app.post('/api/billing/checkout', async (req, res) => {
  const { priceId, trialDays } = req.body;
  const user = req.user;  // From auth middleware

  const url = await createCheckoutSession({
    priceId,
    userId: user.id,
    customerId: user.stripeCustomerId || undefined,
    trialDays: trialDays || 0,
    overagePriceId: process.env.STRIPE_OVERAGE_PRICE_ID!,
  });

  res.json({ url });
});
```

### Step 3: Handle Webhooks

Webhooks are the backbone of Stripe integration. Every subscription event — creation, payment, failure, cancellation — arrives as a webhook. The handler updates your database to reflect the current billing state:

```typescript
// src/billing/webhooks.ts — Stripe webhook handler for subscription lifecycle events

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature']!;
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed');
    return res.status(400).send('Signature mismatch');
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      // New subscription created via Checkout
      const session = event.data.object as Stripe.Checkout.Session;
      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const userId = subscription.metadata.userId;

      await db.users.update(userId, {
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: subscription.id,
        plan: getPlanFromPrice(subscription.items.data[0].price.id),
        billingStatus: subscription.status,  // 'active', 'trialing', etc.
        trialEndsAt: subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      });
      break;
    }

    case 'invoice.payment_succeeded': {
      // Recurring payment succeeded — extend access
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata.userId;
        await db.users.update(userId, {
          billingStatus: 'active',
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        });
      }
      break;
    }

    case 'invoice.payment_failed': {
      // Payment failed — Stripe retries automatically (dunning)
      // Notify the customer to update their payment method
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.subscription) {
        const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
        const userId = sub.metadata.userId;
        await db.users.update(userId, { billingStatus: 'past_due' });
        await sendEmail(userId, 'payment-failed', {
          updatePaymentUrl: `${process.env.APP_URL}/billing`,
          amountDue: (invoice.amount_due / 100).toFixed(2),
        });
      }
      break;
    }

    case 'customer.subscription.updated': {
      // Plan change (upgrade/downgrade) or status change
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.userId;
      await db.users.update(userId, {
        plan: getPlanFromPrice(subscription.items.data[0].price.id),
        billingStatus: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      });
      break;
    }

    case 'customer.subscription.deleted': {
      // Subscription cancelled and period ended — revoke access
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.userId;
      await db.users.update(userId, {
        plan: 'free',
        billingStatus: 'cancelled',
        stripeSubscriptionId: null,
      });
      break;
    }
  }

  res.json({ received: true });
});

/** Map Stripe price IDs to plan names. */
function getPlanFromPrice(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STARTER_MONTHLY_PRICE!]: 'starter',
    [process.env.STARTER_ANNUAL_PRICE!]: 'starter',
    [process.env.GROWTH_MONTHLY_PRICE!]: 'growth',
    [process.env.GROWTH_ANNUAL_PRICE!]: 'growth',
    [process.env.ENTERPRISE_MONTHLY_PRICE!]: 'enterprise',
    [process.env.ENTERPRISE_ANNUAL_PRICE!]: 'enterprise',
  };
  return priceMap[priceId] || 'unknown';
}
```

### Step 4: Implement Usage-Based Metering

API calls above the plan limit are tracked via Stripe's Usage Records API. An API middleware counts calls, and a background job reports usage to Stripe:

```typescript
// src/billing/metering.ts — Track and report API usage to Stripe

import Stripe from 'stripe';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// In-memory counter, flushed to Stripe every 5 minutes
// Production: use Redis for multi-instance accuracy
const usageCounters = new Map<string, number>();

/** Middleware: count API calls per customer. */
function trackUsage(req: any, res: any, next: any) {
  const userId = req.user?.id;
  if (userId) {
    usageCounters.set(userId, (usageCounters.get(userId) || 0) + 1);
  }
  next();
}

/** Flush usage to Stripe. Runs every 5 minutes via setInterval.
 *
 *  Only reports usage above the plan's included limit.
 *  Stripe accumulates usage records and charges at the end of the billing period.
 */
async function flushUsageToStripe() {
  for (const [userId, callCount] of usageCounters) {
    if (callCount === 0) continue;

    const user = await db.users.findById(userId);
    if (!user?.stripeSubscriptionId) continue;

    // Get the plan's included limit
    const planLimits: Record<string, number> = {
      starter: 10000,
      growth: 100000,
      enterprise: 1000000,
    };
    const limit = planLimits[user.plan] || 0;

    // Get current period's total usage from your tracking
    const periodUsage = await db.apiUsage.getPeriodTotal(userId);
    const newTotal = periodUsage + callCount;

    // Only report overage to Stripe
    if (newTotal > limit) {
      const overageCount = Math.min(callCount, newTotal - limit);

      // Find the metered subscription item
      const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
      const meteredItem = subscription.items.data.find(
        item => item.price.recurring?.usage_type === 'metered'
      );

      if (meteredItem) {
        await stripe.subscriptionItems.createUsageRecord(meteredItem.id, {
          quantity: overageCount,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment',
        });
      }
    }

    // Track in your database regardless
    await db.apiUsage.increment(userId, callCount);
  }

  usageCounters.clear();
}

// Run every 5 minutes
setInterval(flushUsageToStripe, 5 * 60 * 1000);

export { trackUsage };
```

### Step 5: Customer Billing Portal

Stripe's Customer Portal lets users manage subscriptions, update payment methods, view invoices, and cancel — with zero custom UI:

```typescript
// src/billing/portal.ts — Stripe Customer Portal for self-service billing

/** Create a portal session — redirect the customer to manage their billing. */
app.post('/api/billing/portal', async (req, res) => {
  const user = req.user;

  if (!user.stripeCustomerId) {
    return res.status(400).json({ error: 'No billing account' });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL}/settings/billing`,
  });

  res.json({ url: session.url });
});
```

Configure the portal at https://dashboard.stripe.com/settings/billing/portal:

- Allow plan switching between tiers
- Allow cancellation (with optional survey)
- Show invoice history
- Allow payment method updates
- Show usage information

### Step 6: Enforce Plan Limits in the API

```typescript
// src/middleware/plan-guard.ts — Enforce features and limits by plan

const PLAN_FEATURES: Record<string, { apiLimit: number; features: string[] }> = {
  free: { apiLimit: 100, features: [] },
  starter: { apiLimit: 10000, features: ['api-access', 'email-support'] },
  growth: { apiLimit: 100000, features: ['api-access', 'email-support', 'priority-support', 'webhooks', 'custom-domain'] },
  enterprise: { apiLimit: 1000000, features: ['api-access', 'email-support', 'priority-support', 'webhooks', 'custom-domain', 'sso', 'audit-log', 'sla'] },
};

/** Middleware: check if the user's plan includes a required feature. */
function requireFeature(feature: string) {
  return (req: any, res: any, next: any) => {
    const plan = req.user?.plan || 'free';
    const planConfig = PLAN_FEATURES[plan];

    if (!planConfig?.features.includes(feature)) {
      return res.status(403).json({
        error: 'Feature not available on your plan',
        requiredPlan: Object.entries(PLAN_FEATURES)
          .find(([_, cfg]) => cfg.features.includes(feature))?.[0],
        upgradeUrl: `${process.env.APP_URL}/pricing`,
      });
    }
    next();
  };
}

// Usage
app.post('/api/webhooks/configure', requireFeature('webhooks'), async (req, res) => {
  // Only Growth and Enterprise can configure webhooks
});

app.get('/api/audit-log', requireFeature('audit-log'), async (req, res) => {
  // Enterprise only
});
```

## Real-World Example

The founders set up Stripe billing on a Monday. Products and prices take 15 minutes via the setup script. The checkout flow goes live on Wednesday after testing with Stripe's test mode and `4242 4242 4242 4242` test cards. The first self-serve signup happens Thursday — a Growth plan with a 14-day trial, no founder involvement required.

By the end of the first month of self-serve, 47 new customers have signed up: 28 on Starter ($812/mo), 14 on Growth ($1,106/mo), and 5 on Enterprise ($995/mo). Three payment failures were handled automatically by Stripe's dunning system — retry after 3 days, retry after 5 days, then notify customer. Two of the three recovered without any manual intervention. The portal handles 15 plan changes (8 upgrades, 7 switches between monthly and annual) without a single support ticket.

The overage metering adds $340 in the first month from two Growth customers who exceeded their 100K API call limit. Before metered billing, the founders would have either eaten the cost or sent an awkward email asking for more money. Now it's automatic, transparent, and on the invoice.

## Related Skills

- [stripe-billing](../skills/stripe-billing/) -- Stripe API deep dive for subscriptions, invoicing, and metering
- [auth-system-setup](../skills/auth-system-setup/) -- Connect billing to authentication and authorization
