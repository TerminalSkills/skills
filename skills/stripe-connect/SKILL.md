---
name: stripe-connect
description: >-
  Build marketplace payments with Stripe Connect. Use when a user asks to build
  a marketplace with split payments, create a platform where sellers get paid,
  handle multi-party payments, set up seller onboarding, manage payouts to
  connected accounts, or build an Uber/Airbnb-style payment system.
license: Apache-2.0
compatibility: 'Node.js 14+, Python 3.6+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: payments
  tags:
    - stripe
    - connect
    - marketplace
    - payments
    - payouts
---

# Stripe Connect

## Overview

Stripe Connect enables marketplace and platform payments — splitting transactions between your platform and sellers/service providers. This skill covers account types (Standard, Express, Custom), seller onboarding, payment splits, transfers, payouts, and the platform fee model.

## Instructions

### Step 1: Setup

```bash
npm install stripe
```

```typescript
// lib/stripe.ts — Stripe client with Connect capabilities
import Stripe from 'stripe'
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
```

### Step 2: Onboard Sellers (Express Accounts)

```typescript
// lib/connect.ts — Create and onboard connected accounts
export async function createSellerAccount(email: string) {
  /** Create an Express connected account for a new seller. */
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  })

  // Generate onboarding link (Stripe-hosted KYC form)
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: 'https://myplatform.com/onboarding/refresh',
    return_url: 'https://myplatform.com/onboarding/complete',
    type: 'account_onboarding',
  })

  return { accountId: account.id, onboardingUrl: accountLink.url }
}
```

### Step 3: Create Payments with Platform Fee

```typescript
// lib/payments.ts — Charge customer, split between platform and seller
export async function createMarketplacePayment(
  amount: number,           // in cents
  sellerAccountId: string,
  platformFeePercent: number = 10
) {
  /** Create a payment intent with automatic platform fee split. */
  const platformFee = Math.round(amount * platformFeePercent / 100)

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    application_fee_amount: platformFee,    // platform keeps this
    transfer_data: {
      destination: sellerAccountId,          // seller gets the rest
    },
  })

  return paymentIntent
}

// Direct charge: charge on seller's account, take a fee
export async function directCharge(amount: number, sellerAccountId: string) {
  return stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    application_fee_amount: Math.round(amount * 0.1),
  }, {
    stripeAccount: sellerAccountId,    // charge on seller's account
  })
}
```

### Step 4: Manage Payouts

```typescript
// Check seller balance and payout status
export async function getSellerBalance(sellerAccountId: string) {
  return stripe.balance.retrieve({ stripeAccount: sellerAccountId })
}

// Trigger manual payout
export async function payoutSeller(sellerAccountId: string, amount: number) {
  return stripe.payouts.create({ amount, currency: 'usd' }, { stripeAccount: sellerAccountId })
}
```

## Examples

### Example 1: Build a freelancer marketplace
**User prompt:** "Build a marketplace where clients pay freelancers. The platform takes 15%. Freelancers need to go through identity verification."

The agent will create Express accounts for freelancers, implement onboarding flow, and set up payment intents with 15% application fee.

## Guidelines

- Use Express accounts for most marketplaces — Stripe handles identity verification and tax reporting.
- Always use `application_fee_amount` (not manual transfers) for platform fees — it's atomic and handles refunds correctly.
- Sellers receive payouts on Stripe's schedule (2-day rolling for US). Configure with `settings.payouts.schedule`.
- Handle the `account.updated` webhook to track onboarding status and compliance requirements.
