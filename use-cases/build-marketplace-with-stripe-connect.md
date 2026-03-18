---
title: "Build a Two-Sided Marketplace with Stripe Connect"
slug: build-marketplace-with-stripe-connect
description: "Launch a freelance or service marketplace where buyers pay and sellers get paid automatically — with platform fees, instant payouts, and dispute handling via Stripe Connect."
skills:
  - stripe-connect
category: business
difficulty: intermediate
time_estimate: "4-6 hours"
tags: [stripe, stripe-connect, marketplace, payments, platform, saas]
---

# Build a Two-Sided Marketplace with Stripe Connect

## The Problem

Sofia is building a freelance marketplace — clients post jobs, freelancers complete them, and the platform takes a 10% fee. She needs: secure seller onboarding, split payments at checkout, automatic payouts, and dispute handling. Building this from scratch would take weeks. Stripe Connect handles it all.

## What You'll Build

- Seller onboarding with Stripe Express accounts
- Checkout flow that splits payment (seller + platform fee)
- Webhook handling for payment events
- Payout management for sellers
- Refund and dispute handling

## Step 1: Install & Configure

```bash
npm install stripe
```

```typescript
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});
```

## Step 2: Onboard Sellers (Express Accounts)

Express accounts are the easiest — Stripe hosts the onboarding UI.

```typescript
// POST /api/sellers/onboard
async function createSellerAccount(sellerId: string) {
  // Create Connected Account
  const account = await stripe.accounts.create({
    type: "express",
    country: "US",
    capabilities: {
      transfers: { requested: true },
    },
    business_type: "individual",
  });

  // Save account ID to your DB
  await db.users.update({
    where: { id: sellerId },
    data: { stripeAccountId: account.id },
  });

  // Generate onboarding link
  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.APP_URL}/sellers/onboard?retry=true`,
    return_url: `${process.env.APP_URL}/sellers/dashboard`,
    type: "account_onboarding",
  });

  return accountLink.url; // Redirect seller here
}

// Check onboarding status
async function isSellerOnboarded(stripeAccountId: string): Promise<boolean> {
  const account = await stripe.accounts.retrieve(stripeAccountId);
  return account.charges_enabled && account.payouts_enabled;
}
```

## Step 3: Create Checkout with Platform Fee

Use Payment Intents with `application_fee_amount` and `transfer_data`.

```typescript
// POST /api/orders/checkout
async function createCheckout(order: {
  amount: number;      // in cents
  sellerId: string;
  jobTitle: string;
  buyerEmail: string;
}) {
  const seller = await db.users.findUnique({ where: { id: order.sellerId } });

  if (!seller?.stripeAccountId) {
    throw new Error("Seller not onboarded with Stripe");
  }

  const platformFeePercent = 0.10; // 10%
  const platformFee = Math.round(order.amount * platformFeePercent);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: order.amount,
    currency: "usd",
    application_fee_amount: platformFee,
    transfer_data: {
      destination: seller.stripeAccountId,
    },
    metadata: {
      jobTitle: order.jobTitle,
      sellerId: order.sellerId,
    },
    receipt_email: order.buyerEmail,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}
```

## Step 4: Frontend Checkout

```typescript
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!);

function CheckoutForm({ clientSecret }: { clientSecret: string }) {
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/orders/success`,
      },
    });

    if (error) console.error(error.message);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button type="submit">Pay Now</button>
    </form>
  );
}

export function Checkout({ clientSecret }: { clientSecret: string }) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm clientSecret={clientSecret} />
    </Elements>
  );
}
```

## Step 5: Webhook Handling

```typescript
// POST /api/webhooks/stripe
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    return new Response("Webhook signature failed", { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await db.orders.update({
        where: { paymentIntentId: pi.id },
        data: { status: "paid", paidAt: new Date() },
      });
      await notifySeller(pi.metadata.sellerId, "New order paid!");
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await db.orders.update({
        where: { paymentIntentId: pi.id },
        data: { status: "failed" },
      });
      break;
    }

    case "account.updated": {
      // Seller onboarding completed
      const account = event.data.object as Stripe.Account;
      if (account.charges_enabled) {
        await db.users.update({
          where: { stripeAccountId: account.id },
          data: { sellerStatus: "active" },
        });
      }
      break;
    }

    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      await handleDispute(dispute);
      break;
    }
  }

  return new Response("OK");
}
```

## Step 6: Seller Dashboard — Payout Info

```typescript
async function getSellerDashboardLink(stripeAccountId: string): Promise<string> {
  const loginLink = await stripe.accounts.createLoginLink(stripeAccountId);
  return loginLink.url; // Redirect seller to Stripe Express dashboard
}

async function getSellerBalance(stripeAccountId: string) {
  const balance = await stripe.balance.retrieve({
    stripeAccount: stripeAccountId,
  });

  return {
    available: balance.available[0]?.amount ?? 0,
    pending: balance.pending[0]?.amount ?? 0,
  };
}
```

## Step 7: Handle Refunds

```typescript
async function refundOrder(paymentIntentId: string, reason: string) {
  // Reverse the transfer first
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
    reverse_transfer: true,      // Claws back from seller
    refund_application_fee: true, // Refund platform fee too
  });

  await db.orders.update({
    where: { paymentIntentId },
    data: { status: "refunded", refundReason: reason },
  });

  return refund;
}
```

## Key Tips

- Use **Express accounts** for most marketplaces — fastest onboarding
- Set `transfer_data.destination` for automatic splits at payment time
- Store `stripeAccountId` on your seller model — you'll use it constantly
- Test with Stripe's test onboarding: use `000000000` for SSN, `0000` for zip
- Enable webhook signing locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
