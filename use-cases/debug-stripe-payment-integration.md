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

Payment integration bugs are uniquely stressful. A failed charge means lost revenue. A broken webhook means subscriptions silently stop renewing. Debugging requires cross-referencing Stripe Dashboard events, server logs, webhook payloads, and application code — often under pressure because real customers are affected right now. Most developers spend 2-4 hours tracing a single payment failure through the stack.

The worst failures are the silent ones. The charge succeeds in Stripe, the customer's card is debited, but your webhook handler crashes and the customer never gets access to what they paid for. From the customer's perspective, they paid and got nothing. From your perspective, everything looks fine until the support ticket arrives. And these bugs tend to cluster — if the webhook handler has a flaw, it's failing for every customer hitting that code path, not just one.

## The Solution

Using the **stripe-testing** skill to pull payment intent details, replay webhook events locally, and trace failures through server logs, combined with **api-tester** for verifying endpoint responses, a full diagnosis happens in minutes instead of hours. The key capability is webhook replay — instead of guessing what payload triggered the bug, you replay the exact event that failed and watch it crash in real time on your local machine.

## Step-by-Step Walkthrough

The debugging flow follows the payment: start with the customer, trace through Stripe, examine the webhook delivery, replay the failure locally, fix the code, and verify all payment paths work. Each step narrows the problem until the root cause is specific enough to fix in one commit.

### Step 1: Diagnose a Failed Payment

Start with the symptom — a customer reports their payment didn't go through:

```text
A customer says they were charged but didn't get access to the Pro plan. Their email is jane@example.com. Can you check what happened in Stripe?
```

### Step 2: Trace the Payment Through the Stack

The customer record in Stripe tells one side of the story. The webhook delivery log tells the other:

**Customer:** `cus_QrT9xWm` (jane@example.com)

| Payment Intent | Amount | Status | Date |
|---------------|--------|--------|------|
| `pi_3P1kR9...def5678` | $29.00 | succeeded | Jan 14 09:32 UTC |
| `pi_3P1kR9...def9012` | $29.00 | succeeded | Dec 14 10:15 UTC |

The charge succeeded. Jane's card was debited $29.00 on January 14. The Stripe side is clean — the payment intent status is `succeeded`, the charge went through, the receipt was sent. The problem is entirely downstream.

Checking webhook delivery for that payment intent reveals the break in the chain:

**Webhook event:** `checkout.session.completed`
**Delivery status:** Delivered
**Server response:** HTTP 500

There it is. Stripe delivered the webhook to your server, your server crashed while processing it, and Jane's Pro plan was never activated. She paid $29 and got nothing. Stripe will retry the webhook (up to 3 times over 24 hours), but if the bug is in the code, retries will fail the same way.

### Step 3: Replay the Webhook Locally

The Stripe Dashboard shows *that* the webhook failed but not *why*. The server returned a 500, but what error? What line of code? Replaying the exact webhook event against a local server exposes the actual crash:

```text
Can you replay that webhook against my local server so I can debug it?
```

The webhook gets forwarded to `localhost:3000/api/webhooks/stripe`:

```
Replayed: checkout.session.completed for pi_3P1kR9...def5678
Response: 500 Internal Server Error
```

The server logs reveal the bug immediately:

```
TypeError: Cannot read property 'subscription' of undefined
  at handleCheckoutComplete (src/webhooks/stripe.ts:47)
```

Line 47 accesses `session.subscription.id` without checking whether `subscription` exists. The `checkout.session.completed` event fires for both subscription checkouts and one-time purchases, but one-time purchases don't have a `subscription` field. Jane bought the Pro plan as a one-time annual purchase, not a monthly subscription — and the webhook handler assumed every checkout was a subscription.

This isn't a rare edge case. Every customer who made a one-time purchase since this code was deployed hit this crash. The only reason it wasn't caught sooner is that most customers buy monthly subscriptions — but the annual plan (a one-time payment at a discounted rate) has been failing silently for every buyer.

The fix is a type guard that handles both checkout modes. Instead of assuming every checkout is a subscription, check the session mode:

```javascript
if (session.mode === 'subscription' && session.subscription) {
  await provisionSubscription(session.subscription);
} else if (session.mode === 'payment') {
  await fulfillOneTimePayment(session);
}
```

One line of code — an `if` statement. That's the entire fix. But finding it took replaying the exact webhook payload against a local server. Without replay capability, the debugging process would be: read the Stripe docs, guess which field is null, add logging, deploy, wait for another failure, read the new logs. That cycle takes 2-3 iterations and 2-4 hours.

### Step 4: Verify the Fix Across All Webhook Flows

One bug fixed, but the same coding pattern — accessing optional fields without null checks — might exist in other webhook handlers. A Stripe integration typically handles 5-10 different event types, and each one needs to work correctly or customers lose money, access, or both. Testing one handler isn't enough.

```text
I applied the fix. Can you test all the critical webhook flows?
```

Five critical events tested against `localhost:3000`:

| Event | Scenario | Response | Result |
|-------|----------|----------|--------|
| `checkout.session.completed` | Subscription purchase | 200 OK | Subscription created correctly |
| `checkout.session.completed` | One-time purchase | 200 OK | Order fulfilled correctly |
| `invoice.payment_succeeded` | Monthly renewal | 200 OK | Receipt sent to customer |
| `invoice.payment_failed` | Card declined on renewal | 200 OK | Dunning email queued |
| `customer.subscription.deleted` | Customer cancels | 200 OK | Access revoked, data retained |

All five handlers respond correctly. The null check fix resolved the one-time payment crash without breaking subscription flows.

But the test run also flags a preventive issue: the `invoice.payment_failed` handler on line 83 has the same assumption about subscription presence. It accesses `invoice.subscription` directly without a guard. It hasn't crashed yet — every failed invoice so far has been for a subscription — but the first time a one-time invoice fails (a refund, a dispute, a corrected charge), the same TypeError will crash that handler too. Fixing it now costs 30 seconds. Fixing it after a customer complaint costs an hour of debugging and another apology email.

### Step 5: Recover Affected Customers

Fixing the bug prevents future failures, but what about customers who already hit the bug? The deployment went out Friday afternoon and the bug was found Monday morning — that's an entire weekend of potentially failed provisioning.

The Stripe webhook delivery log is the source of truth. Every `checkout.session.completed` event that returned HTTP 500 since Friday represents a customer who paid but was never provisioned. Each one represents a customer who was charged but never provisioned. The list gets cross-referenced with the application database to identify which customers are missing their paid features.

For each affected customer, the subscription or order fulfillment gets triggered manually, and an automated email goes out acknowledging the delay and offering a small credit for the inconvenience. The entire recovery — identifying affected customers, provisioning their access, and sending notification emails — happens within 30 minutes of finding the bug.

This recovery step matters as much as the fix itself. Customers who were charged and received nothing will churn if nobody reaches out. Proactive communication — "we found the issue, your access is now active, here's a credit" — turns a churn risk into a loyalty moment.

## Real-World Example

Marcus, a backend developer at a 12-person SaaS startup, gets a Slack alert on Monday morning: three customers report being charged but not receiving access to their paid features. The support queue is growing, and two of the three customers are on the startup's highest-tier plan.

He looks up the three customers in Stripe and cross-references with the webhook delivery log. All three had successful charges — Stripe shows `succeeded` — but their `checkout.session.completed` webhooks returned HTTP 500. The bug was deployed Friday afternoon in a "small refactor" of the webhook handler that nobody thought needed thorough testing because "it's just cleanup."

Marcus replays the failed webhooks locally and sees the `TypeError` on line 47 immediately. The one-line fix takes 30 seconds. He tests all five critical webhook flows — subscription checkout, one-time checkout, renewal, failed payment, and cancellation — to make sure the fix doesn't break anything else. The preventive fix on line 83 takes another 30 seconds.

He deploys the fix and manually triggers subscription provisioning for the three affected customers. Access restored within 30 minutes of the first report. Then he checks the webhook log for the full weekend window and finds two more customers who hit the same bug but hadn't reported it yet. They get provisioned too, along with a proactive apology email. Catching those two unreported cases turns what would have been more angry support tickets into positive customer interactions.

The Friday afternoon deploy is now Monday's cautionary tale, and it leads to two permanent changes. First, the team adds webhook integration tests to the CI pipeline — one test per webhook event type, each testing both the subscription and one-time payment paths — so null-safety regressions get caught before deployment. Second, they add a Slack alert that triggers whenever a webhook returns a non-200 status code, so failed webhooks surface in minutes instead of when a customer complains days later.

The total fix took 30 minutes from first report to full resolution. The CI tests and monitoring ensure the same class of bug never makes it to production again.
