---
name: stripe-testing
description: >-
  Test and debug Stripe payment integrations from the terminal with the Stripe CLI.
  Use when someone needs to verify webhook handling, simulate payment flows, debug
  failed charges, validate subscription lifecycle with test clocks, or troubleshoot
  Stripe API errors. Trigger words: stripe, payment testing, webhook debugging,
  stripe listen, stripe trigger, charge failed, subscription error, payment intent,
  checkout session, test clock.
license: Apache-2.0
compatibility: "Requires the Stripe CLI (install per https://docs.stripe.com/stripe-cli) and a Stripe test-mode secret key (sk_test_...)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["stripe", "payments", "webhooks", "testing", "debugging"]
  repository: "https://github.com/stripe/stripe-cli"
---

# Stripe Testing

## Overview

This skill helps you test and debug Stripe payment integrations end-to-end. It covers webhook forwarding and verification with `stripe listen`, event simulation with `stripe trigger`, charge failure diagnosis with test cards, and subscription lifecycle validation with test clocks.

The Stripe CLI sends requests to the sandbox by default. Only a command with `--live` touches live data, so test work never needs a live key.

## Instructions

### Setting Up the Test Environment

1. Verify the CLI is installed: `stripe version`
2. Authenticate once with `stripe login` (opens a browser pairing flow), or export a test key for the session: `export STRIPE_API_KEY=sk_test_...`. `STRIPE_API_KEY` overrides the stored login. The `--api-key` flag also works for a single command, but it leaves the key in shell history, so prefer the variable.
3. If no key is available, tell the user to create a restricted or secret test key in the Dashboard under Developers → API keys. Never ask for a live key.
4. In a separate terminal, forward webhooks to the app: `stripe listen --forward-to http://localhost:3000/api/webhooks/stripe`. The command prints a `whsec_...` signing secret. Put that value in the app's webhook secret environment variable (for example `STRIPE_WEBHOOK_SECRET`). The secret stays the same across restarts of `stripe listen`.

### Debugging Failed Charges

1. Ask for the payment intent ID or charge ID (starts with `pi_` or `ch_`).
2. Retrieve the object: `stripe payment_intents retrieve pi_...`. Read `last_payment_error`, which holds `code`, `decline_code` and `message`.
3. Reproduce the decline with a test card. The `decline_code` values below are the ones Stripe's testing page lists:
   - `generic_decline` (error `card_declined`) → `4000000000000002`
   - `insufficient_funds` (error `card_declined`) → `4000000000009995`
   - `expired_card` → `4000000000000069`
   - `incorrect_cvc` → `4000000000000127` (any three-digit CVC)
4. List recent events to see what Stripe sent: `stripe events list --limit=5`.

### Testing Webhook Handlers

1. List registered endpoints: `stripe webhook_endpoints list`.
2. Trigger a sample event while `stripe listen` runs: `stripe trigger payment_intent.succeeded`. Each trigger creates real sandbox objects, and it can cause other events too (a `payment_intent.succeeded` also fires `payment_intent.created`). `stripe trigger --help` lists every supported event.
3. Confirm the local server returned 200 and changed the right records.
4. Check that the handler verifies the signature with the Stripe SDK, for example `stripe.webhooks.constructEvent(rawBody, signature, endpointSecret)` in Node. It must use the raw request body, not parsed JSON.
5. Resend a stored event to test idempotency with `stripe events resend` (run `stripe help events resend` for its flags). Run it twice and check that no duplicate rows appear.
6. Common events to test:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### Validating Subscription Lifecycle with Test Clocks

Test clocks let you move a customer's billing time forward. The CLI has no dedicated `test_clocks` subcommand, so call the test-helper endpoints through `stripe post`, which takes the API path and `-d` form fields:

1. Create a clock frozen at the current time:
   ```
   stripe post /v1/test_helpers/test_clocks -d frozen_time=$(date +%s)
   ```
2. Create the customer on that clock, then subscribe the customer with a test payment method. The customer must be created with the clock ID set at creation time, so create the customer after the clock.
3. Advance the clock to the next billing point:
   ```
   stripe post /v1/test_helpers/test_clocks/clock_1Ab2Cd3EfGh4 -d frozen_time=1767225600
   ```
   Advancing returns immediately with status `advancing`. Poll `stripe get /v1/test_helpers/test_clocks/clock_1Ab2Cd3EfGh4` until the status is `ready`. Stripe rejects a target more than two billing intervals past the shortest subscription, and a clock that failed to advance stays in `internal_failure`.
4. Check the subscription status after each step: `trialing` → `active` → `past_due` → `canceled`, and confirm the matching webhooks arrived.

### Reading Server-Side Logs

1. Search the application logs for Stripe-related entries (`stripe`, `webhook`, `payment`).
2. Check for HTTP 4xx/5xx responses to webhook deliveries. The Dashboard → Developers → Webhooks page shows delivery attempts and failures.
3. Verify idempotency: a redelivered event must not create a second record.

## Examples

### Example 1: Debug a Failed Checkout

**User prompt:**
```
Our checkout is failing for some customers. The last failed payment intent is pi_3OxR2aKX8dVqS71m0abc1234. Can you figure out what's going wrong?
```

**Agent actions:**
```bash
stripe payment_intents retrieve pi_3OxR2aKX8dVqS71m0abc1234
```

**Agent output:**
```
Payment Intent pi_3OxR2aKX8dVqS71m0abc1234:
  Status: requires_payment_method
  Last error: card_declined (generic_decline)
  Amount: $49.00 USD
  Customer: cus_PqR7xYz

Analysis:
1. The card was declined with a generic decline — the issuing bank refused the charge
2. This is NOT a code issue — the bank rejected it, and the PI correctly moved to requires_payment_method
3. To reproduce in test mode, use card 4000000000000002

Recommendations:
- Ensure the frontend shows a clear "card declined" message and lets the customer retry with another card
- Offer alternative payment methods (Apple Pay, Google Pay, bank transfer)
- Confirm retry logic for `invoice.payment_failed` webhooks
```

### Example 2: Verify Webhook Handler Works

**User prompt:**
```
I just deployed a new webhook handler for subscription cancellations. Can you test it?
```

**Agent actions:**
```bash
# Terminal 1 (keep running)
stripe listen --forward-to http://localhost:3000/api/webhooks/stripe

# Terminal 2
stripe trigger customer.subscription.deleted
```

**Agent output:**
```
Ready! Your webhook signing secret is whsec_... (use it as STRIPE_WEBHOOK_SECRET)

Triggered: customer.subscription.deleted
  → Delivered to http://localhost:3000/api/webhooks/stripe [200] in 145ms

Verified:
✓ Webhook received and acknowledged with 200
✓ Signature verified with STRIPE_WEBHOOK_SECRET
✓ Event type matched the cancellation handler

Next steps:
- Check the database: is the subscription marked as canceled?
- Confirm the cancellation email was queued
- Resend the same event with `stripe events resend` to confirm the handler is idempotent
```

## Guidelines

- Use test-mode keys (`sk_test_`) only. The CLI runs against the sandbox unless `--live` is passed, and that flag should never be used during testing.
- Use Stripe's test card numbers rather than real card data.
- Test clocks are the way to test billing cycles; do not wait for real time to pass.
- Always verify webhook signature validation against the raw request body.
- Expect races: webhooks can arrive before the browser redirect completes, and can arrive out of order.
- Prefer `STRIPE_API_KEY` or `stripe login` over `--api-key`, which leaves the key in shell history.
- Do not leave `stripe listen` running after a session ends; it holds a connection to your account.
