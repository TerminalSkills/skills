---
title: Build Stripe Connect Marketplace Payments
slug: build-stripe-connect-marketplace-payments
description: Build a marketplace payment system with Stripe Connect — handling seller onboarding, payment splits, platform fees, refunds, and payouts for a two-sided marketplace.
skills:
  - typescript
  - stripe-billing
  - postgresql
  - hono
  - zod
category: development
tags:
  - stripe-connect
  - marketplace
  - payments
  - split-payments
  - fintech
---

# Build Stripe Connect Marketplace Payments

## The Problem

Chen runs a 30-person freelance marketplace connecting designers with businesses. Currently, businesses pay the platform, and the platform manually transfers money to designers weekly via bank transfer. This creates cash flow issues, tax complications, and trust problems — designers wait 7-14 days for payment. Chargebacks hit the platform, not the seller. They need Stripe Connect to handle payment splits automatically: business pays → platform takes a 15% fee → designer receives 85% instantly.

## Step 1: Build Seller Onboarding

```typescript
// src/payments/connect.ts — Stripe Connect marketplace payments
import Stripe from "stripe";
import { pool } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Onboard a seller (designer) to Stripe Connect
export async function onboardSeller(sellerId: string, email: string, returnUrl: string): Promise<string> {
  // Create a Connected Account
  const account = await stripe.accounts.create({
    type: "express",                    // Stripe handles identity verification
    email,
    capabilities: {
      transfers: { requested: true },   // receive payouts
      card_payments: { requested: true },
    },
    metadata: { sellerId },
    business_type: "individual",
  });

  // Save account ID
  await pool.query(
    "UPDATE sellers SET stripe_account_id = $2, onboarding_status = 'pending' WHERE id = $1",
    [sellerId, account.id]
  );

  // Generate onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${returnUrl}?refresh=true`,
    return_url: `${returnUrl}?success=true`,
    type: "account_onboarding",
  });

  return accountLink.url;
}

// Check onboarding status
export async function checkOnboardingStatus(sellerId: string): Promise<{
  status: "pending" | "complete" | "restricted";
  payoutsEnabled: boolean;
  requiresAction: boolean;
}> {
  const { rows: [seller] } = await pool.query(
    "SELECT stripe_account_id FROM sellers WHERE id = $1", [sellerId]
  );

  const account = await stripe.accounts.retrieve(seller.stripe_account_id);

  const status = account.details_submitted ? "complete"
    : account.requirements?.currently_due?.length ? "restricted"
    : "pending";

  await pool.query(
    "UPDATE sellers SET onboarding_status = $2 WHERE id = $1",
    [sellerId, status]
  );

  return {
    status,
    payoutsEnabled: account.payouts_enabled || false,
    requiresAction: (account.requirements?.currently_due?.length || 0) > 0,
  };
}

// Create a payment with split
export async function createMarketplacePayment(
  buyerId: string,
  sellerId: string,
  amount: number,       // total amount in cents
  description: string,
  orderId: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const { rows: [seller] } = await pool.query(
    "SELECT stripe_account_id FROM sellers WHERE id = $1", [sellerId]
  );

  if (!seller?.stripe_account_id) {
    throw new Error("Seller has not completed Stripe onboarding");
  }

  const { rows: [buyer] } = await pool.query(
    "SELECT stripe_customer_id FROM users WHERE id = $1", [buyerId]
  );

  const platformFeePercent = 15;
  const platformFee = Math.round(amount * platformFeePercent / 100);

  // Create PaymentIntent with automatic transfer to seller
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "usd",
    customer: buyer?.stripe_customer_id || undefined,
    description,
    metadata: { orderId, buyerId, sellerId, platformFee: String(platformFee) },
    application_fee_amount: platformFee,  // platform keeps this
    transfer_data: {
      destination: seller.stripe_account_id,  // seller gets the rest
    },
    automatic_payment_methods: { enabled: true },
  });

  // Record payment
  await pool.query(
    `INSERT INTO payments (order_id, buyer_id, seller_id, amount, platform_fee, seller_amount, stripe_payment_intent_id, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())`,
    [orderId, buyerId, sellerId, amount, platformFee, amount - platformFee, paymentIntent.id]
  );

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

// Handle refunds (partial or full)
export async function refundPayment(
  paymentIntentId: string,
  amount?: number,
  reason?: string
): Promise<{ refundId: string; refundedAmount: number }> {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,              // partial refund; omit for full
    reverse_transfer: true,   // reverse the transfer to seller
    refund_application_fee: true,  // refund platform fee proportionally
    reason: reason as any || "requested_by_customer",
  });

  await pool.query(
    "UPDATE payments SET status = $2, refunded_amount = $3 WHERE stripe_payment_intent_id = $1",
    [paymentIntentId, amount ? "partially_refunded" : "refunded", refund.amount]
  );

  return { refundId: refund.id, refundedAmount: refund.amount / 100 };
}

// Webhook handler for Connect events
export async function handleConnectWebhook(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await pool.query(
        "UPDATE payments SET status = 'completed', completed_at = NOW() WHERE stripe_payment_intent_id = $1",
        [pi.id]
      );
      break;
    }

    case "account.updated": {
      const account = event.data.object as Stripe.Account;
      const sellerId = account.metadata?.sellerId;
      if (sellerId) {
        const status = account.details_submitted ? "complete" : "pending";
        await pool.query("UPDATE sellers SET onboarding_status = $2 WHERE id = $1", [sellerId, status]);
      }
      break;
    }

    case "transfer.paid": {
      const transfer = event.data.object as Stripe.Transfer;
      await pool.query(
        `INSERT INTO transfer_log (stripe_transfer_id, amount, destination, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [transfer.id, transfer.amount, transfer.destination]
      );
      break;
    }
  }
}

// Dashboard: seller earnings
export async function getSellerEarnings(sellerId: string): Promise<{
  totalEarned: number;
  pendingPayout: number;
  lastPayout: string | null;
  thisMonth: number;
}> {
  const { rows: [totals] } = await pool.query(
    `SELECT COALESCE(SUM(seller_amount), 0) as total,
            COALESCE(SUM(CASE WHEN created_at > date_trunc('month', NOW()) THEN seller_amount ELSE 0 END), 0) as this_month
     FROM payments WHERE seller_id = $1 AND status = 'completed'`,
    [sellerId]
  );

  const { rows: [seller] } = await pool.query(
    "SELECT stripe_account_id FROM sellers WHERE id = $1", [sellerId]
  );

  const balance = await stripe.balance.retrieve({ stripeAccount: seller.stripe_account_id });
  const pendingPayout = balance.pending.reduce((s, b) => s + b.amount, 0) / 100;

  return {
    totalEarned: totals.total / 100,
    pendingPayout,
    lastPayout: null,
    thisMonth: totals.this_month / 100,
  };
}
```

## Results

- **Designer payment time: 7-14 days → instant** — Stripe transfers funds to seller's bank account automatically after payment; no manual bank transfers
- **Platform earns 15% on every transaction** — application fee is deducted automatically; platform revenue tracked separately from seller payments
- **Refunds handled automatically** — refunding the buyer also reverses the seller's transfer and platform fee proportionally; no manual calculations
- **Seller onboarding in 5 minutes** — Stripe Express handles identity verification, bank account linking, and tax forms; the platform never touches sensitive financial data
- **Chargebacks go to the right party** — Stripe Connect routes disputes to the connected account (seller), not the platform; platform is protected from seller fraud
