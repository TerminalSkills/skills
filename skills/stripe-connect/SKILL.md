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
  version: "1.2.0"
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

## Webhooks, Payouts, Refunds & OAuth

Detailed code lives in `references/` to keep this file short:

- **`references/webhooks.md`** — v1 Connect webhook handler (`account.updated`, `payment_intent.*`, `transfer.created`, `payout.paid`, `charge.dispute.created`), registering a `connect: true` endpoint, and Accounts v2 thin events (`v2.core.account[requirements].updated`).
- **`references/payouts-refunds-oauth.md`** — automatic vs instant payouts, seller balance, refunds with `refund_application_fee` + `reverse_transfer`, and the OAuth flow for Standard accounts (v1 only).

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
