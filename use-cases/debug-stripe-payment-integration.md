---
title: "Debug Stripe Payment Integration with AI"
slug: debug-stripe-payment-integration
description: "Diagnose and fix Stripe payment failures, webhook issues, and subscription bugs using an AI agent."
skills: [stripe-testing, api-tester]
category: development
tags: [stripe, payments, webhooks, debugging, testing]
---

# Debug Stripe Payment Integration with AI

## The Problem

Payment integration bugs are uniquely stressful. A failed charge means lost revenue. A broken webhook means subscriptions silently stop renewing. Debugging requires cross-referencing Stripe Dashboard events, server logs, webhook payloads, and application code — often under pressure because real customers are affected right now.

The worst failures are the silent ones. The charge succeeds in Stripe, the customer's card is debited, but your webhook handler crashes and the customer never gets access to what they paid for. From the customer's perspective, they paid and got nothing. From your perspective, everything looks fine until the support ticket arrives. And these bugs tend to cluster — if the webhook handler has a flaw, it's failing for every customer hitting that code path, not just one.

## The Solution

Using the **stripe-testing** skill to pull payment intent details, replay webhook events locally, and trace failures through server logs, combined with **api-tester** for verifying endpoint responses, a full diagnosis happens in minutes instead of hours. The key capability is webhook replay — instead of guessing what payload triggered the bug, you replay the exact event that failed and watch it crash in real time on your local machine.

## Step-by-Step Walkthrough

The debugging flow follows the payment: start with the customer, trace through Stripe, examine the webhook delivery, replay the failure locally, fix the code, and verify all payment paths work. Each step narrows the problem until the root cause is specific enough to fix in one commit.

### Step 1: Diagnose a Failed Payment

Start with the symptom, and give the agent a test-mode key in the environment (`export STRIPE_API_KEY=sk_test_...`, never in the prompt). To debug live data, ask the agent to explain which Dashboard pages to open instead of handing it a live key:

```text
A customer says they were charged but didn't get access to the Pro plan. Their email is jane@example.com. Can you check what happened in Stripe?
```

### Step 2: Trace the Payment Through the Stack

The customer record in Stripe tells one side of the story. The webhook delivery log tells the other. The agent retrieves the payment with the Stripe CLI (`stripe payment_intents retrieve pi_...`) and lists the recent events (`stripe events list --limit=10`):

| Payment Intent | Amount | Status | Date |
|---------------|--------|--------|------|
| `pi_3P1kR9...def5678` | $29.00 | succeeded | Jan 14 09:32 UTC |
| `pi_3P1kR9...def9012` | $29.00 | succeeded | Dec 14 10:15 UTC |

The charge succeeded, so the Stripe side is clean and the problem is downstream. In Dashboard, Developers, Webhooks, the delivery log for that event shows the break:

**Webhook event:** `checkout.session.completed`
**Delivery status:** Failed, HTTP 500 from your server

Stripe retries failed deliveries automatically: for up to three days with exponential backoff in live mode, and three times over a few hours in a sandbox. If the bug is in the code, every retry fails the same way, so a retry does not fix it.

### Step 3: Replay the Event Locally

The Dashboard shows that the webhook failed, not why. `stripe events resend <event_id> --webhook-endpoint=<we_id>` re-sends an event to a registered endpoint (up to 30 days after creation), but a local server is not a registered endpoint. To replay against localhost, save the stored event and send it to your own server with a correctly signed header:

```console
$ stripe events retrieve evt_1PtestAAAA > event.json
$ node replay.mjs event.json
500
```

`replay.mjs` is a ten-line script. It reads the saved payload, signs it with `stripe.webhooks.generateTestHeaderString({ payload, secret })` using your local `STRIPE_WEBHOOK_SECRET`, and POSTs it to `http://127.0.0.1:<port>/api/webhooks/stripe`. Signing matters: the handler rejects unsigned requests with 400, so an unsigned replay never reaches the buggy line. For brand-new events, `stripe listen --forward-to http://127.0.0.1:3000/api/webhooks/stripe` forwards live sandbox events with the CLI's own signing secret, and `stripe trigger checkout.session.completed` generates one.

The server log shows the crash:

```text
TypeError: Cannot read properties of null (reading 'id')
  at handleCheckoutComplete (src/webhooks/stripe.ts:47)
```

Line 47 reads `session.subscription.id`. A `checkout.session.completed` event fires for every Checkout mode, and for `mode: 'payment'` the `subscription` field is `null`. Jane bought the annual plan as a one-time payment, and the handler assumed every checkout was a subscription. Every annual buyer since the deploy hit the same crash.

The fix branches on the session mode, and uses the ID that Stripe already gives as a string:

```javascript
if (session.mode === 'subscription' && session.subscription) {
  await provisionSubscription(session.subscription); // an ID string unless you expanded it
} else if (session.mode === 'payment' && session.payment_status === 'paid') {
  await fulfillOneTimePayment(session);
}
```

### Step 4: Verify the Handler and Its Security

Fixing one branch is not enough. Ask the agent to review the whole handler and replay every event type with the api-tester skill, asserting the status code for each:

```text
I applied the fix. Review the webhook handler for signature verification, idempotency and null handling, then replay each critical event against it.
```

The review checks four things:

| Check | What the agent looks for |
|-------|--------------------------|
| Signature | `stripe.webhooks.constructEvent(rawBody, header, secret)` on the **raw** body (`express.raw({ type: 'application/json' })`, not `express.json()`). It does the HMAC-SHA256 comparison in constant time and rejects timestamps older than 5 minutes. Never pass a tolerance of 0, which disables the check. |
| Idempotency | Stripe can deliver an event more than once and out of order. Store `event.id` under a unique constraint and return 200 for repeats, so a retry cannot double-fulfil an order. |
| Response timing | Return 2xx quickly, then do slow work in a queue. |
| API version | Since API version `2025-03-31.basil`, `invoice.subscription` no longer exists. Read `invoice.parent.subscription_details.subscription`. A handler written against the old shape reads `undefined` and silently skips dunning. |

The replay run, using one saved event per type, returns:

| Event | Scenario | Response |
|-------|----------|----------|
| `checkout.session.completed` | Subscription purchase | 200 |
| `checkout.session.completed` | One-time purchase | 200 |
| `invoice.paid` | Renewal | 200 |
| `invoice.payment_failed` | Card declined on renewal | 200 |
| `customer.subscription.deleted` | Cancellation | 200 |
| Any event | Wrong signature | 400 |

The review also flags `invoice.payment_failed`: it read `invoice.subscription`, which is `undefined` on current API versions, so the dunning email never queued. That is a silent failure, found before a customer complained.

### Step 5: Recover Affected Customers

Fixing the bug prevents future failures, but customers who already hit it paid and got nothing. The Dashboard delivery log for `checkout.session.completed` lists every event that returned 500 since the deploy. Cross-reference those sessions with your database, fulfil each order, then send an apology that confirms access is active. Resending the failed events with `stripe events resend <event_id> --webhook-endpoint=<we_id>` to your real endpoint also works, and idempotent handling from Step 4 makes it safe to run twice.

## Real-World Example

Marcus, a backend developer at a 12-person SaaS startup, gets a Slack alert on Monday morning: three customers report being charged but not receiving access to their paid features. The support queue is growing, and two of the three customers are on the startup's highest-tier plan.

He looks up the three customers in Stripe and cross-references with the webhook delivery log. All three had successful charges — Stripe shows `succeeded` — but their `checkout.session.completed` webhooks returned HTTP 500. The bug was deployed Friday afternoon in a "small refactor" of the webhook handler that nobody thought needed thorough testing because "it's just cleanup."

Marcus replays the failed events locally and sees the `TypeError` on line 47 immediately. The fix is a few lines. He replays one saved event per critical flow — subscription checkout, one-time checkout, renewal, failed payment, and cancellation — plus a bad-signature request, to make sure the fix doesn't break anything else. The review also catches the `invoice.payment_failed` handler reading the removed `invoice.subscription` field, which he fixes in the same commit.

He deploys the fix and manually triggers subscription provisioning for the three affected customers. Access restored within 30 minutes of the first report. Then he checks the webhook log for the full weekend window and finds two more customers who hit the same bug but hadn't reported it yet. They get provisioned too, along with a proactive apology email. Catching those two unreported cases turns what would have been more angry support tickets into positive customer interactions.

The Friday afternoon deploy is now Monday's cautionary tale, and it leads to two permanent changes. First, the team adds webhook integration tests to the CI pipeline — one test per webhook event type, each testing both the subscription and one-time payment paths — so null-safety regressions get caught before deployment. Second, they add a Slack alert that triggers whenever a webhook returns a non-200 status code, so failed webhooks surface in minutes instead of when a customer complains days later.

The CI tests and monitoring make a repeat of this class of bug unlikely to reach production again.
