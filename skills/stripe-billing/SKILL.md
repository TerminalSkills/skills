---
name: stripe-billing
description: >-
  Build subscription billing with Stripe — products, prices, checkout sessions,
  subscriptions, invoices, usage-based metering, customer portal, coupons,
  webhooks, and dunning. Use when tasks involve SaaS billing, recurring payments,
  free trials, plan upgrades/downgrades, or usage-based pricing.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["stripe", "billing", "subscriptions", "payments", "saas"]
---

# Stripe Billing

Build complete subscription billing for SaaS applications — from checkout to cancellation.

## Setup

```bash
npm install stripe
```

```typescript
// stripe.ts — Client initialization
import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia',
});
```

## Products and Prices

Products represent what you sell. Prices represent how much and how often.

```typescript
// Create a product with monthly and annual pricing
const product = await stripe.products.create({
  name: 'Pro Plan',
  description: 'Full access with priority support',
  metadata: { tier: 'pro' },
});

// Monthly price
const monthly = await stripe.prices.create({
  product: product.id,
  unit_amount: 4900,        // $49.00 in cents
  currency: 'usd',
  recurring: { interval: 'month' },
});

// Annual price (20% discount)
const annual = await stripe.prices.create({
  product: product.id,
  unit_amount: 47040,       // $470.40/year ($39.20/mo)
  currency: 'usd',
  recurring: { interval: 'year' },
});

// Usage-based (metered) price
const metered = await stripe.prices.create({
  product: product.id,
  currency: 'usd',
  recurring: {
    interval: 'month',
    usage_type: 'metered',
    aggregate_usage: 'sum',  // Sum all usage records in the period
  },
  unit_amount_decimal: '0.5', // $0.005 per unit
});
```

## Checkout Sessions

Stripe Checkout handles the entire payment UI:

```typescript
/** Create a Checkout Session for a new subscription.
 *
 * @param priceId - Stripe price ID for the selected plan.
 * @param customerId - Existing Stripe customer (optional).
 * @param trialDays - Free trial period in days.
 * @param metadata - Custom metadata stored on the subscription.
 */
async function createCheckout(
  priceId: string,
  customerId?: string,
  trialDays?: number,
  metadata?: Record<string, string>,
): Promise<string> {
  const params: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/pricing`,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    tax_id_collection: { enabled: true },
    subscription_data: { metadata: metadata || {} },
  };

  if (customerId) {
    params.customer = customerId;
  }
  if (trialDays) {
    params.subscription_data!.trial_period_days = trialDays;
  }

  const session = await stripe.checkout.sessions.create(params);
  return session.url!;
}
```

## Subscription Management

### Retrieve and Update

```typescript
/** Get subscription with expanded price and product info. */
async function getSubscription(subId: string) {
  return stripe.subscriptions.retrieve(subId, {
    expand: ['items.data.price.product', 'latest_invoice'],
  });
}

/** Switch plan (upgrade or downgrade).
 *
 * @param subId - Current subscription ID.
 * @param newPriceId - Price ID of the target plan.
 * @param prorate - Whether to charge/credit the difference immediately.
 */
async function changePlan(subId: string, newPriceId: string, prorate = true) {
  const subscription = await stripe.subscriptions.retrieve(subId);
  const currentItem = subscription.items.data[0];

  return stripe.subscriptions.update(subId, {
    items: [{
      id: currentItem.id,
      price: newPriceId,
    }],
    proration_behavior: prorate ? 'create_prorations' : 'none',
  });
}
```

### Cancel

```typescript
/** Cancel at end of current period (customer keeps access until then). */
async function cancelAtPeriodEnd(subId: string) {
  return stripe.subscriptions.update(subId, {
    cancel_at_period_end: true,
  });
}

/** Cancel immediately with optional proration refund. */
async function cancelImmediately(subId: string) {
  return stripe.subscriptions.cancel(subId, {
    prorate: true,  // Refund unused time
  });
}

/** Reactivate a subscription that was set to cancel at period end. */
async function reactivate(subId: string) {
  return stripe.subscriptions.update(subId, {
    cancel_at_period_end: false,
  });
}
```

### Pause and Resume

```typescript
/** Pause a subscription (stop billing, optionally revoke access). */
async function pause(subId: string) {
  return stripe.subscriptions.update(subId, {
    pause_collection: {
      behavior: 'void',  // 'void' = skip invoices, 'keep_as_draft' = generate drafts
    },
  });
}

async function resume(subId: string) {
  return stripe.subscriptions.update(subId, {
    pause_collection: '',  // Empty string clears the pause
  });
}
```

## Usage-Based Metering

Report usage to Stripe for metered billing:

```typescript
/** Report usage for a metered subscription item.
 *
 * @param subscriptionItemId - The subscription item with metered pricing.
 * @param quantity - Number of units consumed.
 */
async function reportUsage(subscriptionItemId: string, quantity: number) {
  return stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: Math.floor(Date.now() / 1000),
    action: 'increment',  // 'increment' adds to total; 'set' replaces it
  });
}

/** Get current period's usage summary. */
async function getUsageSummary(subscriptionItemId: string) {
  const records = await stripe.subscriptionItems.listUsageRecordSummaries(
    subscriptionItemId,
    { limit: 1 },
  );
  return records.data[0];  // { total_usage, period: { start, end } }
}
```

## Webhooks

Essential events to handle:

```typescript
/** Verify and parse a Stripe webhook event. */
function parseWebhook(body: Buffer, signature: string): Stripe.Event {
  return stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
}

// Critical events:
// checkout.session.completed     — New subscription created
// invoice.payment_succeeded      — Recurring payment succeeded
// invoice.payment_failed         — Payment failed (dunning starts)
// customer.subscription.updated  — Plan change, status change, trial ending
// customer.subscription.deleted  — Subscription fully cancelled
// customer.subscription.trial_will_end — 3 days before trial ends (send conversion email)
```

## Customer Portal

Stripe-hosted UI for self-service billing management:

```typescript
/** Create a portal session for a customer.
 *
 * @param customerId - Stripe customer ID.
 * @param returnUrl - Where to redirect after portal session.
 */
async function createPortalSession(customerId: string, returnUrl: string) {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}
```

Configure allowed actions at https://dashboard.stripe.com/settings/billing/portal.

## Coupons and Promotions

```typescript
// Percentage discount
const coupon = await stripe.coupons.create({
  percent_off: 25,
  duration: 'repeating',
  duration_in_months: 3,  // 25% off for first 3 months
  max_redemptions: 100,
});

// Fixed amount discount
await stripe.coupons.create({
  amount_off: 1000,       // $10 off
  currency: 'usd',
  duration: 'once',       // First invoice only
});

// Promotion code (customer-facing code string)
await stripe.promotionCodes.create({
  coupon: coupon.id,
  code: 'LAUNCH25',
  max_redemptions: 50,
  expires_at: Math.floor(Date.now() / 1000) + 30 * 86400, // 30 days
});
```

## Invoices

```typescript
/** Get all invoices for a customer. */
async function getInvoices(customerId: string) {
  return stripe.invoices.list({
    customer: customerId,
    limit: 12,
    expand: ['data.subscription'],
  });
}

/** Send a one-off invoice (not tied to a subscription). */
async function sendOneOffInvoice(customerId: string, amount: number, description: string) {
  const invoiceItem = await stripe.invoiceItems.create({
    customer: customerId,
    amount: amount * 100,  // Convert dollars to cents
    currency: 'usd',
    description,
  });

  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: true,  // Auto-finalize and send
  });

  return stripe.invoices.finalizeInvoice(invoice.id);
}
```

## Testing

```typescript
// Test card numbers
// 4242424242424242 — Succeeds
// 4000000000000341 — Attaching fails (card declined)
// 4000000000009995 — Charge fails (insufficient funds)
// 4000002500003155 — Requires 3D Secure authentication

// Test clock for simulating time progression (trials, renewals)
const clock = await stripe.testHelpers.testClocks.create({
  frozen_time: Math.floor(Date.now() / 1000),
});

// Create customer on the test clock
const customer = await stripe.customers.create({
  test_clock: clock.id,
  email: 'test@example.com',
});

// Advance time to end of trial
await stripe.testHelpers.testClocks.advance(clock.id, {
  frozen_time: Math.floor(Date.now() / 1000) + 14 * 86400,
});
```

## Guidelines

- **Webhook signature verification is mandatory** — without it, anyone can fake events to your endpoint
- **Handle webhooks idempotently** — Stripe may send the same event multiple times. Use `event.id` for deduplication.
- **Use metadata extensively** — store your user ID, plan name, and any app-specific data in subscription/customer metadata. It's the bridge between Stripe and your database.
- **Don't store card details** — let Stripe handle all payment information. Your server should never see raw card numbers.
- **Use Checkout for new subscriptions** — it handles PCI compliance, 3D Secure, and alternate payment methods with zero custom UI.
- **Customer Portal for self-service** — let Stripe host the payment method update form. Reduces your PCI scope.
- **Test with test clocks** — simulate trial endings, payment failures, and renewals without waiting days.
- **Webhooks are the source of truth** — don't assume a subscription is active because checkout succeeded. Wait for the webhook confirmation.
- **Dunning is automatic** — Stripe retries failed payments on a configurable schedule. Configure it at Settings → Billing → Subscriptions and emails.
