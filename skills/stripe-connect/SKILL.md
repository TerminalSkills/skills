---
name: stripe-connect
description: >-
  Build marketplace and platform payment flows with Stripe Connect. Use when:
  building two-sided marketplaces, splitting payments between buyers and sellers,
  onboarding sellers/providers to accept payments, handling platform fees and
  payouts, or managing connected accounts for a platform.
license: Apache-2.0
compatibility: "Requires Node.js 20+ (stripe-node 23 dropped Node 18), Stripe account with Connect enabled"
metadata:
  author: terminal-skills
  version: "1.3.0"
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

> **Stay on Accounts v1 when you need** OAuth for Standard accounts, the recipient service agreement (cross-border), or Treasury / Issuing capabilities. Accounts v1 (`stripe.accounts.create({ type: "express" })`) remains supported, and v1 and v2 endpoints work on the same account (a new v1 account can take up to 10 minutes before v2 endpoints accept it). See the legacy note in step 1.

**Charge types** (the payment APIs are v1 and reference the connected account by id):
| Type | Who pays Stripe fees | Seller config needed | Use when |
|------|---------------------|----------------------|----------|
| Direct | Connected account | `merchant` | Seller wants full control |
| Destination | Platform | `recipient` | Platform manages UX |
| Separate charges + transfers | Platform | `recipient` | Complex routing |

## Instructions

### Setup

```bash
npm install stripe
```

```ts
// lib/stripe.ts
import Stripe from "stripe";

// stripe-node 23.x pins API version 2026-09-30.endive; omit apiVersion to use the pinned one.
// Pass apiVersion only when you must stay on an older version.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Platform account key (your Stripe account).
// Connected accounts are identified by their account ID (acct_...).
```


### Onboard Sellers (Accounts v2)

#### 1. Create a connected account

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

// Legacy (Accounts v1, still GA — use for the v1-only cases above):
//   const account = await stripe.accounts.create({
//     type: "express", email,
//     capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
//   });
```

#### 2. Generate onboarding link (Account Links v2)

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
```

#### 3. Check onboarding status

```ts
export async function isSellerOnboarded(accountId: string): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(accountId, {
    include: ["requirements", "configuration.merchant", "configuration.recipient"],
  });
  // v2 has no currently_due list: requirements.entries holds each open item with a
  // minimum_deadline.status of currently_due | eventually_due | past_due.
  const blocking = (account.requirements?.entries ?? []).filter(
    (e) => e.awaiting_action_from === "user" && e.minimum_deadline.status !== "eventually_due"
  );
  const cardActive =
    account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  return blocking.length === 0 && cardActive;
}
```

### Charging Buyers

> Destination charges and transfers require the seller's `recipient` configuration; direct charges require `merchant`. The PaymentIntents / Transfers APIs themselves are unchanged.

#### Destination Charges (Platform collects, sends to seller)

```ts
// POST /api/payments/charge — amount in cents
export async function chargeWithDestination(
  amount: number, paymentMethodId: string, customerId: string,
  sellerAccountId: string, platformFeePercent = 15,
) {
  return stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: customerId,
    payment_method: paymentMethodId,
    confirm: true,
    transfer_data: { destination: sellerAccountId }, // net goes to the seller
    application_fee_amount: Math.round(amount * (platformFeePercent / 100)), // platform keeps this
    automatic_payment_methods: { enabled: true, allow_redirects: "never" },
  });
}
```

#### Direct Charges (Seller's Stripe account)

```ts
// The charge appears on the seller's account; the platform gets the fee
export async function directCharge(
  amount: number, paymentMethodId: string, sellerAccountId: string, platformFeePercent = 10,
) {
  return stripe.paymentIntents.create(
    {
      amount,
      currency: "usd",
      payment_method: paymentMethodId,
      confirm: true,
      application_fee_amount: Math.round(amount * (platformFeePercent / 100)),
    },
    { stripeAccount: sellerAccountId }, // create on behalf of the seller
  );
}
```

#### Separate Charges + Transfers (most flexible)

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
  chargeId: string, // pi.latest_charge (a ch_... id, not the pi_ id)
  sellerAccountId: string,
  amount: number // amount to send seller (after platform fee)
) {
  const transfer = await stripe.transfers.create({
    amount,
    currency: "usd",
    destination: sellerAccountId,
    source_transaction: chargeId, // links the transfer to the original charge
  });
  return transfer;
}
```


### Webhooks, Payouts, Refunds & OAuth

Detailed code lives in `references/` to keep this file short:

- **`references/webhooks.md`** — v1 Connect webhook handler (`account.updated`, `payment_intent.*`, `transfer.created`, `payout.paid`, `charge.dispute.created`), registering a `connect: true` endpoint, and Accounts v2 thin events (`v2.core.account[requirements].updated`).
- **`references/payouts-refunds-oauth.md`** — automatic vs instant payouts, seller balance, refunds with `refund_application_fee` + `reverse_transfer`, and the OAuth flow for Standard accounts (v1 only).


### Testing

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

## Examples

### Example 1: Onboard a freelancer and take a 15% fee
Request: "Freelancers on our marketplace should get paid, we keep 15%."
1. `createSellerAccount("dana.ortiz@studio-ortiz.dev")` returns `acct_...`; store it on the seller row.
2. `createOnboardingLink(accountId, userId)` returns a Stripe-hosted URL; redirect the seller there.
3. After the return URL (and an `v2.core.account[requirements].updated` event), `isSellerOnboarded` becomes true; then `chargeWithDestination(12000, pmId, custId, accountId, 15)` charges $120.00 and creates a $18.00 application fee, with $102.00 (before Stripe fees) transferred to the seller.

### Example 2: Hold funds until the job is done
Request: "Charge the buyer now, pay the seller only after delivery."
Create the PaymentIntent on the platform with no `transfer_data`, keep `pi.latest_charge`, and after delivery call `payoutToSeller(chargeId, accountId, 8500)`. The transfer is tied to the charge via `source_transaction`, so it is paid out when the funds are available.

## Guidelines
- Use test-mode keys while developing (`sk_test_...`); never commit keys; load them from `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_V2_WEBHOOK_SECRET` (and `STRIPE_CLIENT_ID` for Standard OAuth).
- Verify webhook signatures on the raw body; use separate endpoints for v1 Connect events and v2 thin events.
- Amounts are integers in the smallest currency unit; compute the fee with `Math.round`.
- Never store card data; accept payment methods created with Stripe.js or Elements.
- Test cards: `4242 4242 4242 4242` succeeds, `4000 0025 6000 0001` asks for 3D Secure; trigger events locally with `stripe listen --forward-to localhost:3000/webhooks/stripe` and `stripe trigger payment_intent.succeeded`.
- Connect KYC rules differ by country; sellers may be restricted until requirements are met, so check capability status before charging.
