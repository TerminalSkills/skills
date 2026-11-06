---
title: "Build a Two-Sided Marketplace with Stripe Connect"
slug: build-marketplace-with-stripe-connect
description: "Launch a freelance or service marketplace where buyers pay and sellers get paid automatically — with platform fees, automatic payouts, and dispute handling via Stripe Connect."
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

- Seller onboarding with Stripe Accounts v2 (Express dashboard)
- Checkout flow that splits payment (seller + platform fee)
- Webhook handling for payment events
- Seller Express dashboard link and balance lookup (payouts run on Stripe's automatic schedule)
- Refund and dispute handling

## Step 1: Install & Configure

```bash
npm install stripe
```

```typescript
import Stripe from "stripe";

// stripe-node 23 (Node 20+) pins its own API version, so omit apiVersion.
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
```

## Step 2: Onboard Sellers (Accounts v2)

The **Accounts v2 API** is Stripe's recommended path for new platforms. Instead of a
v1 account `type`, you assign **configurations**: `merchant` (accept payments) and
`recipient` (receive payouts). `dashboard: "express"` keeps Stripe's hosted onboarding UI.

```typescript
// POST /api/sellers/onboard
async function createSellerAccount(sellerId: string, email: string) {
  // Create a connected account (Accounts v2)
  const account = await stripe.v2.core.accounts.create({
    contact_email: email,
    display_name: email,
    dashboard: "express",
    identity: { country: "us", entity_type: "individual" },
    configuration: {
      merchant: { capabilities: { card_payments: { requested: true } } },
      recipient: {
        capabilities: { stripe_balance: { stripe_transfers: { requested: true } } },
      },
    },
    defaults: {
      currency: "usd",
      responsibilities: {
        fees_collector: "application",   // platform collects fees
        losses_collector: "application", // platform covers negative balances
      },
    },
  });

  // Save account ID to your DB
  await db.users.update({ where: { id: sellerId }, data: { stripeAccountId: account.id } });

  // Generate onboarding link (Account Links v2)
  const accountLink = await stripe.v2.core.accountLinks.create({
    account: account.id,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${process.env.APP_URL}/sellers/onboard?retry=true`,
        return_url: `${process.env.APP_URL}/sellers/dashboard`,
      },
    },
  });

  return accountLink.url; // Redirect seller here (link expires in ~10 min); Stripe collects what the account's configurations need
}

// Check onboarding status. v2 has no `currently_due` list: each open item is in
// requirements.entries with a minimum_deadline.status.
async function isSellerOnboarded(stripeAccountId: string): Promise<boolean> {
  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["requirements", "configuration.merchant"],
  });
  const blocking = (account.requirements?.entries ?? []).filter(
    (e) => e.awaiting_action_from === "user" && e.minimum_deadline.status !== "eventually_due",
  );
  const cardActive =
    account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
  return blocking.length === 0 && cardActive;
}
```

## Step 3: Create Checkout with Platform Fee

Use Payment Intents with `application_fee_amount` and `transfer_data` (a destination charge: the charge sits on your platform account and the net amount moves to the seller's `recipient` balance).

```typescript
// POST /api/orders/checkout
async function createCheckout(order: {
  orderId: string;     // your own order id, used as the idempotency key
  amount: number;      // in cents
  sellerId: string;
  jobTitle: string;
  buyerEmail: string;
}) {
  const seller = await db.users.findUnique({ where: { id: order.sellerId } });
  if (!seller?.stripeAccountId) throw new Error("Seller not onboarded with Stripe");

  const platformFee = Math.round(order.amount * 0.10); // 10% platform fee

  const paymentIntent = await stripe.paymentIntents.create({
    amount: order.amount,
    currency: "usd",
    application_fee_amount: platformFee,
    transfer_data: { destination: seller.stripeAccountId },
    metadata: { orderId: order.orderId, jobTitle: order.jobTitle, sellerId: order.sellerId },
    receipt_email: order.buyerEmail,
  }, { idempotencyKey: `checkout-${order.orderId}` }); // a retried request cannot create a second PaymentIntent

  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}
```

## Step 4: Frontend Checkout

```typescript
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!); // publishable key

function CheckoutForm() {
  const stripe = useStripe();
  const elements = useElements();

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/orders/success` },
    });
    if (error) console.error(error.message);
  };

  return (
    <form onSubmit={pay}>
      <PaymentElement />
      <button type="submit">Pay Now</button>
    </form>
  );
}

export const Checkout = ({ clientSecret }: { clientSecret: string }) => (
  <Elements stripe={stripePromise} options={{ clientSecret }}>
    <CheckoutForm />
  </Elements>
);
```

## Step 5: Webhook Handling

```typescript
// POST /api/webhooks/stripe
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return new Response("Webhook signature failed", { status: 400 });
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const pi = event.data.object as Stripe.PaymentIntent;
      // Stripe retries webhooks: only the first delivery flips the order and notifies
      const { count } = await db.orders.updateMany({
        where: { paymentIntentId: pi.id, status: { not: "paid" } },
        data: { status: "paid", paidAt: new Date() },
      });
      if (count > 0) await notifySeller(pi.metadata.sellerId, "New order paid!");
      break;
    }

    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      await db.orders.update({ where: { paymentIntentId: pi.id }, data: { status: "failed" } });
      break;
    }

    case "charge.dispute.created": {
      // Destination charges: the platform answers the dispute (and can reclaim from the seller)
      const dispute = event.data.object as Stripe.Dispute;
      await handleDispute(dispute);
      break;
    }
  }

  return new Response("OK");
}
```

Accounts v2 does not send `account.updated` to this endpoint. It sends *thin events* to an
**event destination** (Dashboard → Developers → Event destinations) with its own signing secret, so give it a second route:

```typescript
// POST /api/webhooks/stripe-v2
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature")!;
  let notification;
  try {
    notification = stripe.parseEventNotification(body, sig, process.env.STRIPE_V2_WEBHOOK_SECRET!);
  } catch {
    return new Response("Webhook signature failed", { status: 400 });
  }

  if (notification.type === "v2.core.account[requirements].updated") {
    const account = await notification.fetchRelatedObject(); // the full v2 Account
    const done = (account.requirements?.entries ?? []).every(
      (e) => e.awaiting_action_from !== "user" || e.minimum_deadline.status === "eventually_due",
    );
    await db.users.update({
      where: { stripeAccountId: account.id },
      data: { sellerStatus: done ? "active" : "onboarding" },
    });
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
  const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });

  return { available: balance.available[0]?.amount ?? 0, pending: balance.pending[0]?.amount ?? 0 };
}
```

## Step 7: Handle Refunds

```typescript
async function refundOrder(paymentIntentId: string, reason: string) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    reason: "requested_by_customer",
    reverse_transfer: true,      // Claws back from seller
    refund_application_fee: true, // Refund platform fee too
  });

  await db.orders.update({ where: { paymentIntentId }, data: { status: "refunded", refundReason: reason } });
  return refund;
}
```

## Key Tips

- Use **`dashboard: "express"`** (Accounts v2) for most marketplaces — Stripe hosts onboarding and the seller dashboard. Stay on Accounts v1 only for OAuth, the recipient service agreement (cross-border) or Treasury/Issuing
- Set `transfer_data.destination` for automatic splits at payment time
- Store `stripeAccountId` on your seller model — you'll use it constantly
- Test onboarding in test mode: SSN `000000000`, address line 1 `address_full_match` (see Stripe's Connect testing page); pay with card `4242 4242 4242 4242`
- Enable webhook signing locally with `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

## Related Skills

- **stripe-connect**: Accounts v2 onboarding, destination charges with `application_fee_amount`, Connect webhooks and refunds,
