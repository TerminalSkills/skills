---
name: stripe-billing
description: >-
  You are an expert in Stripe Billing, the complete billing platform for SaaS
  businesses. You help developers implement subscription management,
  usage-based billing, metered pricing, free trials, proration, invoicing,
  customer portal, and webhook-driven lifecycle management — building
  everything from simple monthly plans to complex per-seat + usage hybrid
  pricing.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - payments
    - subscriptions
    - saas
    - billing
    - metered
    - usage-based
---

# Stripe Billing — SaaS Subscription & Usage-Based Billing

You are an expert in Stripe Billing, the complete billing platform for SaaS businesses. You help developers implement subscription management, usage-based billing, metered pricing, free trials, proration, invoicing, customer portal, and webhook-driven lifecycle management — building everything from simple monthly plans to complex per-seat + usage hybrid pricing.

## Core Capabilities

### Subscription Setup

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

// Usage-based price (metered)
const apiPrice = await stripe.prices.create({
  product: product.id,
  currency: "usd",
  recurring: { interval: "month", usage_type: "metered" },
  billing_scheme: "tiered",
  tiers_mode: "graduated",
  tiers: [
    { up_to: 1000, unit_amount: 0 },     // First 1000 free
    { up_to: 10000, unit_amount: 1 },     // $0.01 per call (1K-10K)
    { up_to: "inf", unit_amount: 0.5 },   // $0.005 per call (10K+)
  ],
});

// Create checkout session
const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  customer_email: user.email,
  line_items: [
    { price: monthlyPrice.id, quantity: 1 },
    { price: apiPrice.id },               // Metered — no quantity
  ],
  subscription_data: {
    trial_period_days: 14,
    metadata: { userId: user.id },
  },
  success_url: "https://app.example.com/billing/success?session_id={CHECKOUT_SESSION_ID}",
  cancel_url: "https://app.example.com/billing/cancel",
});
// Redirect to session.url
```

### Usage Reporting

```typescript
// Report API usage for metered billing
async function reportUsage(subscriptionItemId: string, quantity: number) {
  await stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: Math.floor(Date.now() / 1000),
    action: "increment",                  // Adds to current period total
  });
}

// In your API middleware
app.use(async (req, res, next) => {
  next();
  // After response, report usage
  const user = req.user;
  if (user.stripeSubscriptionItemId) {
    await reportUsage(user.stripeSubscriptionItemId, 1);
  }
});
```

### Webhook Handler

```typescript
app.post("/api/webhooks/stripe", async (req, res) => {
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
    return_url: "https://app.example.com/settings",
  });
  res.json({ url: session.url });
});
// Customer can: change plan, update payment method, cancel, view invoices
```

## Installation

```bash
npm install stripe
```

## Best Practices

1. **Webhooks are truth** — Don't rely on checkout redirects alone; webhooks handle edge cases (failed payments, renewals)
2. **Customer portal** — Use Stripe's hosted portal for plan changes, cancellation, invoices; saves weeks of development
3. **Metered billing** — Report usage incrementally via `createUsageRecord`; Stripe aggregates and invoices at period end
4. **Trial periods** — Set `trial_period_days` on subscription; no payment collected until trial ends
5. **Proration** — Stripe auto-prorates when customers upgrade/downgrade mid-cycle; no manual calculations
6. **Idempotency keys** — Pass `idempotencyKey` on creates to prevent duplicate charges on retries
7. **Test mode** — Use `sk_test_` key for development; Stripe provides test card numbers for all scenarios
8. **Tax automation** — Enable Stripe Tax for automatic tax calculation and collection; handles global tax compliance
