# Stripe Connect — Payouts, Refunds & OAuth

Money-movement and Standard-account OAuth flows, split out of the main `SKILL.md`.

## Contents

- [Payouts](#payouts)
- [Refunds](#refunds)
- [OAuth for Standard Accounts](#oauth-for-standard-accounts)

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
