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
  version: "1.1.0"
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

Stripe Connect routes payments between buyers, sellers, and your platform — handling regulatory compliance (KYC), payouts, and tax reporting for connected accounts.

This skill uses the **Accounts v2 API** (`/v2/core/accounts`), Stripe's recommended path for new Connect platforms. A v2 account is shaped by the **configurations** you assign to it instead of a v1 account *type* + flat capabilities:

| Configuration | Enables | Key capability |
|---------------|---------|----------------|
| **merchant** | Accept payments (direct charges) | `card_payments` |
| **recipient** | Receive transfers / destination payouts | `stripe_balance.stripe_transfers` |
| **customer** | Be billed as a customer (subscriptions, invoices) | `automatic_indirect_tax` |

Dashboard access is a separate `dashboard` field that replaces the old standard/express/custom *type*:

| `dashboard` | ≈ v1 type | Onboarding | Best for |
|-------------|-----------|------------|----------|
| `"express"` | Express | Stripe-hosted | Marketplaces (recommended) |
| `"full"` | Standard | Stripe-hosted / OAuth | Sellers wanting a full Stripe dashboard |
| `"none"` | Custom | Embedded / your UI | Platforms needing full control |

> **Accounts v2 requires opt-in registration** in the Dashboard (Connect settings). Accounts v1 (`stripe.accounts.create({ type: "express" })`) is still fully GA — see the legacy note in step 1 if you haven't registered.

**Charge types** (the payment APIs are v1 and reference the connected account by id):
| Type | Who pays Stripe fees | Seller config needed | Use when |
|------|---------------------|----------------------|----------|
| Direct | Connected account | `merchant` | Seller wants full control |
| Destination | Platform | `recipient` | Platform manages UX |
| Separate charges + transfers | Platform | `recipient` | Complex routing |

## Setup

```bash
npm install stripe
```

```ts
// lib/stripe.ts
import Stripe from "stripe";

// Accounts v2 needs the Stripe Node SDK >= 20.2.0 and a recent API version.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-05-27.dahlia",
});

// Platform account key (your Stripe account).
// Connected accounts are identified by their account ID (acct_...).
```

---

## Onboard Sellers (Accounts v2)

### 1. Create a connected account

Assign `merchant` (accept payments) and `recipient` (receive payouts/transfers). `dashboard: "express"` gives sellers Stripe's hosted Express dashboard.

```ts
// POST /api/sellers/onboard
import { stripe } from "@/lib/stripe";

export async function createSellerAccount(email: string) {
  const account = await stripe.v2.core.accounts.create({
    contact_email: email,
    display_name: email,
    dashboard: "express",
    identity: {
      country: "us",
      entity_type: "individual",
    },
    configuration: {
      merchant: {
        capabilities: { card_payments: { requested: true } },
      },
      recipient: {
        capabilities: {
          stripe_balance: { stripe_transfers: { requested: true } },
        },
      },
    },
    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "application",   // platform collects application fees
        losses_collector: "application", // platform covers negative balances (Express behavior)
      },
    },
  });

  return account.id; // acct_... — store as seller.stripeAccountId
}

// Legacy (Accounts v1, still GA — use if not registered for Accounts v2):
//   const account = await stripe.accounts.create({
//     type: "express", email,
//     capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
//   });
```

### 2. Generate onboarding link (Account Links v2)

```ts
export async function createOnboardingLink(accountId: string, userId: string) {
  const accountLink = await stripe.v2.core.accountLinks.create({
    account: accountId,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        configurations: ["merchant", "recipient"],
        refresh_url: `${process.env.BASE_URL}/sellers/onboard/refresh?userId=${userId}`,
        return_url: `${process.env.BASE_URL}/sellers/onboard/complete?userId=${userId}`,
      },
    },
  });

  return accountLink.url; // Redirect seller here (link expires in ~10 min)
}

// Full flow:
app.post("/api/sellers/onboard", async (req, res) => {
  const { email, userId } = req.body;
  const accountId = await createSellerAccount(email);

  // Save accountId to your DB
  await db.sellers.update(userId, { stripeAccountId: accountId });

  const url = await createOnboardingLink(accountId, userId);
  res.json({ url });
});
```

### 3. Check onboarding status

```ts
export async function isSellerOnboarded(accountId: string): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["requirements"],
  });
  // No outstanding requirements => onboarding complete
  return (account.requirements?.currently_due?.length ?? 0) === 0;
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

> Destination charges and transfers require the seller's `recipient` configuration; direct charges require `merchant`. The PaymentIntents / Transfers APIs themselves are unchanged.

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

By default, Stripe pays out to sellers on their payout schedule — no extra code needed. The schedule is configured on the connected account (its Express dashboard or the Accounts API).

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

### Accounts v2 events (thin events)

v2 accounts emit *thin events* to an **event destination** (configured in the Dashboard or via the API), not the classic v1 webhook. Listen for `v2.core.account[requirements].updated` to track onboarding:

```ts
// POST /webhooks/stripe/v2
app.post("/webhooks/stripe/v2", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"] as string;

  // Thin events carry only a reference to what changed (older SDKs: parseThinEvent)
  const notification = stripe.parseEventNotification(
    req.body, sig, process.env.STRIPE_V2_WEBHOOK_SECRET!
  );

  if (notification.type === "v2.core.account[requirements].updated") {
    const account = await notification.fetchRelatedObject(); // full v2 Account
    const done = (account.requirements?.currently_due?.length ?? 0) === 0;
    await db.sellers.update(
      { stripeAccountId: account.id },
      { status: done ? "active" : "onboarding" }
    );
  }

  res.json({ received: true });
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

> If you authenticate connected accounts with OAuth, keep using the v1 Accounts API — Accounts v2 does not replace the OAuth flow.

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
STRIPE_WEBHOOK_SECRET=whsec_...           # v1 webhook endpoint
STRIPE_V2_WEBHOOK_SECRET=whsec_...         # v2 event destination (Accounts v2)
STRIPE_CLIENT_ID=ca_...  # Only for Standard OAuth
BASE_URL=http://localhost:3000
```
