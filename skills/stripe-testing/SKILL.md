---
name: stripe-testing
description: >-
  Test and debug Stripe payment integrations. Use when someone needs to verify
  webhook handling, simulate payment flows, debug failed charges, validate
  subscription lifecycle, or troubleshoot Stripe API errors. Trigger words:
  stripe, payment testing, webhook debugging, charge failed, subscription error,
  payment intent, checkout session.
license: Apache-2.0
compatibility: "Requires Stripe CLI installed (brew install stripe/stripe-cli/stripe) and a Stripe test API key"
metadata:
  author: carlos
  version: "1.0.0"
  category: development
  tags: ["stripe", "payments", "webhooks", "testing", "debugging"]
---

# Stripe Testing

## Overview

This skill helps you test and debug Stripe payment integrations end-to-end. It covers webhook verification, payment flow simulation using Stripe CLI and test mode, charge failure diagnosis, and subscription lifecycle validation.

## Instructions

### Setting Up the Test Environment

1. Verify Stripe CLI is installed: `stripe --version`
2. Check for a test API key in environment variables (`STRIPE_SECRET_KEY` starting with `sk_test_`)
3. If no key is found, instruct the user to set one from the Stripe Dashboard → Developers → API keys
4. Run `stripe listen --forward-to localhost:<port>/webhooks/stripe` to forward webhooks locally

### Debugging Failed Charges

1. Ask for the payment intent ID or charge ID (starts with `pi_` or `ch_`)
2. Retrieve details: `stripe payment_intents retrieve <id> --api-key $STRIPE_SECRET_KEY`
3. Check the `last_payment_error` field for the decline reason
4. Common decline codes and fixes:
   - `card_declined` → Use test card `4000000000000002` to reproduce
   - `insufficient_funds` → Test with `4000000000009995`
   - `expired_card` → Test with `4000000000000069`
   - `incorrect_cvc` → Test with `4000000000000127`
5. Check the Events tab: `stripe events list --limit 5 --api-key $STRIPE_SECRET_KEY`

### Testing Webhook Handlers

1. List registered webhook endpoints: `stripe webhook_endpoints list --api-key $STRIPE_SECRET_KEY`
2. Trigger a specific event: `stripe trigger <event_type>` (e.g., `stripe trigger payment_intent.succeeded`)
3. Verify the local server received and processed the event correctly
4. Check webhook signature verification in the handler code — look for `stripe.webhooks.constructEvent()`
5. Common webhook events to test:
   - `checkout.session.completed`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`

### Validating Subscription Lifecycle

1. Create a test customer: `stripe customers create --name "Test User" --email test@example.com --api-key $STRIPE_SECRET_KEY`
2. Create a subscription with a test clock for time simulation:
   ```
   stripe test_clocks create --frozen-time $(date +%s) --api-key $STRIPE_SECRET_KEY
   ```
3. Advance the test clock to simulate billing cycles:
   ```
   stripe test_clocks advance <clock_id> --frozen-time <future_timestamp> --api-key $STRIPE_SECRET_KEY
   ```
4. Verify subscription status transitions: `trialing` → `active` → `past_due` → `canceled`

### Reading Server-Side Logs

1. Search the application logs for Stripe-related entries (look for `stripe`, `webhook`, `payment`)
2. Check for HTTP 4xx/5xx responses to Stripe webhook deliveries
3. Verify idempotency — duplicate webhook deliveries should not create duplicate records

## Examples

### Example 1: Debug a Failed Checkout

**User prompt:**
```
Our checkout is failing for some customers. The last failed payment intent is pi_3OxR2aKX8dVqS71m0abc1234. Can you figure out what's going wrong?
```

**Agent actions:**
```bash
stripe payment_intents retrieve pi_3OxR2aKX8dVqS71m0abc1234 --api-key $STRIPE_SECRET_KEY
```

**Agent output:**
```
Payment Intent pi_3OxR2aKX8dVqS71m0abc1234:
  Status: requires_payment_method
  Last error: card_declined (generic_decline)
  Amount: $49.00 USD
  Customer: cus_PqR7xYz

Analysis:
1. The card was declined with a generic decline — this means the issuing bank refused it
2. This is NOT a code issue — the customer's bank rejected the charge
3. Your error handling looks correct — the PI moved to requires_payment_method

Recommendations:
- Ensure your frontend shows a clear "card declined" message
- Offer alternative payment methods (Apple Pay, Google Pay, bank transfer)
- Check if you have retry logic for `invoice.payment_failed` webhooks
```

### Example 2: Verify Webhook Handler Works

**User prompt:**
```
I just deployed a new webhook handler for subscription cancellations. Can you test it?
```

**Agent actions:**
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe &
stripe trigger customer.subscription.deleted
```

**Agent output:**
```
Webhook forwarding active on localhost:3000/api/webhooks/stripe

Triggered: customer.subscription.deleted
  → Delivered to localhost:3000/api/webhooks/stripe [200 OK] in 145ms

Verified:
✓ Webhook received and acknowledged with 200
✓ Signature verification passed (using whsec_ signing secret)
✓ Event type correctly matched to handler

Next steps:
- Check your database: was the subscription marked as canceled?
- Verify the customer received a cancellation email
- Test edge case: trigger it twice to confirm idempotency
```

## Guidelines

- Always use test mode keys (`sk_test_`) — never use live keys for testing
- Use Stripe's built-in test card numbers rather than real card data
- Test clocks are essential for subscription testing — they let you fast-forward time
- Always verify webhook signature validation is implemented correctly
- Check for race conditions: webhooks can arrive before the redirect completes
- Monitor the Stripe Dashboard → Developers → Webhooks for delivery failures
- Use `--api-key` flag explicitly rather than relying on environment to avoid mistakes
