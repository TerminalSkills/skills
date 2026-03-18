---
name: stripe-connect
description: >-
  Build marketplace and platform payment flows with Stripe Connect. Use when:
  building two-sided marketplaces, splitting payments between buyers and sellers,
  onboarding sellers/providers to accept payments, handling platform fees and
  payouts, or managing connected accounts for a platform.
license: Apache-2.0
compatibility: "Requires Node.js 18+, Stripe account with Connect enabled"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: business
  tags: ["stripe", "stripe-connect", "marketplace", "payments", "platform"]
  use-cases:
    - "Onboard freelancers to accept payments on a service marketplace"
    - "Charge buyers and split payment between platform and seller"
    - "Create Express connected accounts with Stripe's hosted onboarding"
    - "Handle automatic payouts to sellers after service completion"
    - "Listen for Connect webhooks to track account and payment status"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Stripe Connect

## Overview

Stripe Connect enables platforms to route payments between buyers, sellers, and your platform. It handles regulatory compliance (KYC), payouts, and tax reporting for connected accounts.

**Account types:**
| Type | Onboarding | Branding | Best for |
|------|------------|----------|----------|
| **Express** | Stripe-hosted | Stripe UI | Marketplaces (recommended) |
| **Standard** | OAuth redirect | Seller's branding | Platforms where sellers have existing Stripe accounts |
| **Custom** | Fully custom | Your UI | Large platforms needing full control |

**Charge types:**
| Type | Who pays Stripe fees | Use when |
|------|---------------------|----------|
| Direct | Connected account | Seller wants full control |
| Destination | Platform | Platform manages UX |
| Separate charges + transfers | Platform | Complex routing |

## Setup

```bash
npm install stripe
```

```ts
// lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Platform account key (your Stripe account)
// Connected accounts are identified by their account ID
```

---

## Express Accounts (Recommended)

### 1. Create a connected account

```ts
// POST /api/sellers/onboard
import { stripe } from "@/lib/stripe";

export async function createExpressAccount(email: string) {
  const account = await stripe.accounts.create({
    type: "express",
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_type: "individual",
  });

  return account.id; // Store this as seller.stripeAccountId in your DB
}
```

### 2. Generate onboarding link

```ts
export async function createOnboardingLink(accountId: string, userId: string) {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.BASE_URL}/sellers/onboard/refresh?userId=${userId}`,
    return_url: `${process.env.BASE_URL}/sellers/onboard/complete?userId=${userId}`,
    type: "account_onboarding",
  });

  return accountLink.url; // Redirect seller here
}

// Full flow:
app.post("/api/sellers/onboard", async (req, res) => {
  const { email, userId } = req.body;
  const accountId = await createExpressAccount(email);

  // Save accountId to your DB
  await db.sellers.update(userId, { stripeAccountId: accountId });

  const url = await createOnboardingLink(accountId, userId);
  res.json({ url });
});
```

### 3. Check onboarding status

```ts
export async function isSellerOnboarded(accountId: string): Promise<boolean> {
  const account = await stripe.accounts.retrieve(accountId);
  return account.details_submitted && !account.requirements?.currently_due?.length;
}

app.get("/sellers/onboard/complete", async (req, res) => {
  const { userId } = req.query;
  const seller = await db.sellers.findById(userId);
  const onboarded = await isSellerOnboarded(seller.stripeAccountId);

  if (onboarded) {
    await db.sellers.update(userId, { status: "active" });
    res.redirect("/dashboard?onboarded=true");
  } else {
    // Seller didn't finish — show completion prompt
    res.redirect("/sellers/onboard/pending");
  }
});
```

---

## Charging Buyers

### Destination Charges (Platform collects, sends to seller)

```ts
// POST /api/payments/charge
export async function chargeWithDestination({
  amount,          // in cents
  currency = "usd",
  paymentMethodId,
  customerId,
  sellerAccountId,
  platformFeePercent = 15,
}: {
  amount: number;
  currency?: string;
  paymentMethodId: string;
  customerId: string;
  sellerAccountId: string;
  platformFeePercent?: number;
}) {
  const platformFee = Math.round(amount * (platformFeePercent / 100));

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency,
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: true,
    transfer_data: {
      destination: sellerAccountId, // Route net to seller
    },
    application_fee_amount: platformFee, // Platform keeps this
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });

  return paymentIntent;
}
```

### Direct Charges (Seller's Stripe account)

```ts
// Charge appears on seller's Stripe dashboard; platform gets fee
export async function directCharge({
  amount,
  paymentMethodId,
  sellerAccountId,
  platformFeePercent = 10,
}: {
  amount: number;
  paymentMethodId: string;
  sellerAccountId: string;
  platformFeePercent?: number;
}) {
  const platformFee = Math.round(amount * (platformFeePercent / 100));

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      application_fee_amount: platformFee,
    },
    {
      stripeAccount: sellerAccountId, // Create on behalf of seller
    }
  );

  return paymentIntent;
}
```

### Separate Charges + Transfers (most flexible)

```ts
// 1. Charge buyer on platform account
const paymentIntent = await stripe.paymentIntents.create({
  amount: 10000, // $100
  currency: "usd",
  payment_method: paymentMethodId,
  confirm: true,
});

// 2. Later: transfer to seller (e.g., after service delivered)
export async function payoutToSeller(
  paymentIntentId: string,
  sellerAccountId: string,
  amount: number // amount to send seller (after platform fee)
) {
  const transfer = await stripe.transfers.create({
    amount,
    currency: "usd",
    destination: sellerAccountId,
    source_transaction: paymentIntentId, // Links transfer to original charge
  });
  return transfer;
}
```

---

## Payouts

### Automatic payouts (default)

By default, Stripe automatically pays out to sellers based on their payout schedule. No extra code needed.

```ts
// Check payout schedule for a connected account
const account = await stripe.accounts.retrieve(sellerAccountId);
console.log(account.settings?.payouts?.schedule);
// { interval: "daily" | "weekly" | "monthly", ... }
```

### Manual / triggered payouts

```ts
// Trigger an instant payout (seller must have instant payouts enabled)
export async function triggerPayout(sellerAccountId: string, amount: number) {
  const payout = await stripe.payouts.create(
    {
      amount,
      currency: "usd",
      method: "instant", // or "standard"
    },
    {
      stripeAccount: sellerAccountId,
    }
  );
  return payout;
}
```

### Check seller balance

```ts
export async function getSellerBalance(sellerAccountId: string) {
  const balance = await stripe.balance.retrieve({
    stripeAccount: sellerAccountId,
  });

  return {
    available: balance.available[0]?.amount ?? 0,
    pending: balance.pending[0]?.amount ?? 0,
  };
}
```

---

## Webhooks for Connect

Connect webhooks can fire for your platform account or for events on connected accounts.

```ts
// POST /webhooks/stripe
import { stripe } from "@/lib/stripe";

app.post("/webhooks/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  // For Connect events, check event.account
  const connectedAccountId = (event as any).account as string | undefined;

  switch (event.type) {
    // Connected account completed onboarding
    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      if (account.details_submitted) {
        await db.sellers.update(
          { stripeAccountId: account.id },
          { status: "active" }
        );
      }
      break;
    }

    // Payment succeeded
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await db.orders.update(
        { stripePaymentIntentId: pi.id },
        { status: "paid" }
      );
      break;
    }

    // Payment failed
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await db.orders.update(
        { stripePaymentIntentId: pi.id },
        { status: "failed", failureReason: pi.last_payment_error?.message }
      );
      break;
    }

    // Transfer to seller completed
    case "transfer.created": {
      const transfer = event.data.object as Stripe.Transfer;
      console.log(`Transferred ${transfer.amount} to ${transfer.destination}`);
      break;
    }

    // Payout to seller's bank
    case "payout.paid": {
      const payout = event.data.object as Stripe.Payout;
      console.log(`Payout ${payout.id} paid to ${connectedAccountId}`);
      break;
    }

    // Dispute opened
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDispute(dispute);
      break;
    }
  }

  res.json({ received: true });
});
```

### Listen to connected account events

```ts
// To receive events from connected accounts, configure in Stripe Dashboard:
// Dashboard → Developers → Webhooks → Add endpoint
// Check "Listen to events on Connected accounts"

// Or via API:
const webhookEndpoint = await stripe.webhookEndpoints.create({
  url: "https://myapp.com/webhooks/stripe",
  enabled_events: [
    "account.updated",
    "payment_intent.succeeded",
    "payment_intent.payment_failed",
    "transfer.created",
    "payout.paid",
    "charge.dispute.created",
  ],
  connect: true, // Receive Connect events
});
```

---

## Refunds

```ts
// Refund a payment (from platform to buyer)
export async function refundPayment(
  paymentIntentId: string,
  amount?: number, // omit for full refund
  reason?: "duplicate" | "fraudulent" | "requested_by_customer"
) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amount && { amount }),
    ...(reason && { reason }),
    refund_application_fee: true, // Refund your platform fee too
    reverse_transfer: true,       // Reverse transfer to seller
  });
  return refund;
}
```

---

## OAuth for Standard Accounts

```ts
// 1. Redirect seller to Stripe OAuth
export function getStripeOAuthUrl(state: string) {
  return `https://connect.stripe.com/oauth/authorize?` +
    `response_type=code&client_id=${process.env.STRIPE_CLIENT_ID}` +
    `&scope=read_write&state=${state}`;
}

// 2. Handle OAuth callback
app.get("/auth/stripe/callback", async (req, res) => {
  const { code, state } = req.query;

  const response = await stripe.oauth.token({
    grant_type: "authorization_code",
    code: code as string,
  });

  const connectedAccountId = response.stripe_user_id!;
  // Save connectedAccountId to seller record
  res.redirect("/dashboard");
});
```

---

## Testing

```bash
# Use test mode keys (sk_test_...)
# Test card numbers:
# 4242 4242 4242 4242 — success
# 4000 0000 0000 9995 — insufficient funds
# 4000 0025 6000 0001 — requires authentication (3DS)

# Trigger webhooks locally:
stripe listen --forward-to localhost:3000/webhooks/stripe
stripe trigger payment_intent.succeeded
```

## Environment Variables

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CLIENT_ID=ca_...  # Only for Standard OAuth
BASE_URL=http://localhost:3000
```
