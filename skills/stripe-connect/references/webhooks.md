# Stripe Connect — Webhooks

Webhook handling for Connect platforms, split out of the main `SKILL.md`.

## Contents

- [Webhook handler (v1 events)](#webhook-handler-v1-events)
- [Listen to connected account events](#listen-to-connected-account-events)
- [Accounts v2 events (thin events)](#accounts-v2-events-thin-events)

## Webhook handler (v1 events)

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

## Listen to connected account events

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

## Accounts v2 events (thin events)

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
