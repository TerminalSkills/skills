---
name: stripe-billing
description: >-
  Stripe Billing is Stripe's subscription and invoicing product for SaaS:
  recurring plans, free trials, usage-based pricing with billing meters,
  proration, the hosted customer portal and webhook-driven lifecycle
  handling. Use when someone asks to "add subscriptions with Stripe", "bill
  per API call", "set up metered or usage-based billing", "add a free trial",
  "let customers manage their plan", or "fix createUsageRecord no longer
  working".
license: Apache-2.0
compatibility: "stripe-node 23 (Stripe API 2026-09-30.endive); metered billing needs Billing Meters (API 2025-03-31.basil or later). Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/stripe/stripe-node
  tags: "stripe, subscriptions, billing, metered, usage-based"
---

# Stripe Billing — SaaS Subscription & Usage-Based Billing

## Overview

Stripe Billing turns products and prices into subscriptions that renew, prorate, invoice and retry failed payments. This skill covers the server-side flow with the Node SDK: Checkout for sign-up, Billing Meters for usage, webhooks as the source of truth, and the customer portal for self-service.

Important change: the legacy usage-record API (`subscriptionItems.createUsageRecord`, prices with `usage_type: "metered"` and no meter, `aggregate_usage`, `billing_thresholds`) was removed in API version 2025-03-31.basil. Usage is now reported as **meter events** against a **meter** that the price references. Code written for `createUsageRecord` fails on current API versions.

## Instructions

```bash
npm install stripe
```

Keep the key in the environment (`STRIPE_SECRET_KEY`, `sk_test_...` while developing; restricted keys in production).

### Subscription Setup (flat price + metered price)

```typescript
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Create product + price
const product = await stripe.products.create({
  name: "Pro Plan",
  description: "Full access with API usage",
});

// Fixed recurring price
const monthlyPrice = await stripe.prices.create({
  product: product.id,
  unit_amount: 2900,                      // $29.00
  currency: "usd",
  recurring: { interval: "month" },
});

// Meter: what to count and how to aggregate it per billing period
const meter = await stripe.billing.meters.create({
  display_name: "API calls",
  event_name: "api_call",
  default_aggregation: { formula: "sum" },
  customer_mapping: { event_payload_key: "stripe_customer_id", type: "by_id" },
  value_settings: { event_payload_key: "value" },
});

// Usage-based price that references the meter
const apiPrice = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  recurring: { interval: "month", usage_type: "metered", meter: meter.id },
  billing_scheme: "tiered",
  tiers_mode: "graduated",
  tiers: [
    { up_to: 1000, unit_amount: 0 },                                   // First 1000 free
    { up_to: 10000, unit_amount_decimal: Stripe.Decimal.from("1") },   // 1 cent per call
    { up_to: "inf", unit_amount_decimal: Stripe.Decimal.from("0.5") }, // 0.5 cent per call
  ],
});

// Create checkout session
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer_email: user.email,
  metadata: { userId: user.id },          // session-level: the checkout.session.completed handler reads session.metadata
  line_items: [
    { price: monthlyPrice.id, quantity: 1 },
    { price: apiPrice.id },               // Metered — no quantity
  ],
  subscription_data: {
    trial_period_days: 14,        // add payment_method_collection: "if_required" on the session to skip the card
    metadata: { userId: user.id },        // copied to the Subscription object
  },
  success_url: "https://app.northwind.dev/billing/success?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://app.northwind.dev/billing/cancel",
});
// Redirect to session.url
```

### Usage Reporting

```typescript
// Report one unit of usage as a meter event (replaces createUsageRecord)
async function reportUsage(stripeCustomerId: string, value: number, requestId: string) {
  await stripe.billing.meterEvents.create({
    event_name: "api_call",                 // must match the meter's event_name
    payload: { stripe_customer_id: stripeCustomerId, value: String(value) },
    identifier: requestId,                  // dedupes retries of the same event
  });
}

// In your API middleware
app.use((req, res, next) => {
  res.on("finish", () => {
    if (req.user?.stripeCustomerId) {
      reportUsage(req.user.stripeCustomerId, 1, req.id).catch(console.error);
    }
  });
  next();
});
```

### Webhook Handler

```typescript
// Express: this route needs the RAW body (express.raw({ type: "application/json" })),
// not express.json(), or signature verification fails.
app.post("/api/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const event = stripe.webhooks.constructEvent(
    req.body, req.headers["stripe-signature"]!, process.env.STRIPE_WEBHOOK_SECRET!,
  );

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await db.users.update(session.metadata!.userId, {
        plan: "pro",
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: session.subscription as string,
      });
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      await db.invoices.create({
        userId: await getUserByStripeCustomer(invoice.customer as string),
        amount: invoice.amount_paid,
        pdfUrl: invoice.invoice_pdf,
      });
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db.users.update({ stripeSubscriptionId: sub.id }, { plan: "free" });
      break;
    }
    case "customer.subscription.trial_will_end": {   // sent 3 days before a trial ends
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      await sendPaymentFailedEmail(invoice.customer as string);
      break;
    }
  }

  res.json({ received: true });
});
```

### Customer Portal

```typescript
// Let customers manage their own subscription
app.post("/api/billing/portal", async (req, res) => {
  const session = await stripe.billingPortal.sessions.create({
    customer: req.user.stripeCustomerId,
    return_url: "https://app.northwind.dev/settings",
  });
  res.json({ url: session.url });
});
// Customer can: change plan, update payment method, cancel, view invoices
```

## Examples

### Example 1: Charge per API call after 1,000 free calls

**User prompt:** "Bill customers $29 a month plus per-call pricing, first 1000 calls free."

Run the Subscription Setup code once (it creates the product, the meter, the flat price and the tiered metered price), send customers to the Checkout session URL, and call `reportUsage()` per request. Result: the first invoice shows the $29 line and a usage line computed by Stripe from the summed meter events; usage in the Dashboard under Meters updates within minutes.

### Example 2: Migrate from createUsageRecord

**User prompt:** "createUsageRecord throws after we upgraded the Stripe library."

Create a meter whose `event_name` matches your usage, create a new price with `recurring.meter`, move subscriptions to that price (new subscription items), and replace each `createUsageRecord(itemId, {quantity})` with `billing.meterEvents.create({event_name, payload: {stripe_customer_id, value}})`. Usage is keyed by customer, not by subscription item.

## Guidelines

1. **Webhooks are truth** — Don't rely on checkout redirects alone; webhooks handle edge cases (failed payments, renewals)
2. **Customer portal** — Use Stripe's hosted portal for plan changes, cancellation, invoices; saves weeks of development
3. **Metered billing** — Report usage as meter events with a unique `identifier`; Stripe aggregates per the meter and invoices at period end. Meter events are asynchronous and customer-keyed
4. **Trial periods** — Set `trial_period_days` on subscription; the card is collected at sign-up by default (use `payment_method_collection: "if_required"` to skip it) and nothing is charged until the trial ends
5. **Proration** — Stripe auto-prorates when customers upgrade/downgrade mid-cycle; no manual calculations
6. **Idempotency keys** — Pass `idempotencyKey` on creates to prevent duplicate charges on retries
7. **Test mode** — Use `sk_test_` key for development; Stripe provides test card numbers for all scenarios
8. **Tax automation** — Enable Stripe Tax for automatic tax calculation and collection; handles global tax compliance
9. **SDK 23 decimals** — in stripe-node 23 sub-cent amounts use `Stripe.Decimal` (`unit_amount_decimal`). Pin the SDK major version and read the changelog before upgrading.
10. **Never trust the client** — verify webhook signatures with the raw request body and make handlers idempotent (events can be delivered more than once).
