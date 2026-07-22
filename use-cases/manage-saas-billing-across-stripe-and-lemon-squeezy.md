---
title: "Manage SaaS Billing Across Stripe and Lemon Squeezy"
slug: manage-saas-billing-across-stripe-and-lemon-squeezy
description: "Set up dual billing infrastructure using Stripe for B2B subscriptions and Lemon Squeezy for individual purchases, with unified revenue reporting and tax compliance."
skills:
  - stripe-billing
  - lemon-squeezy
category: business
tags:
  - billing
  - saas
  - payments
  - revenue
---

# Manage SaaS Billing Across Stripe and Lemon Squeezy

## The Problem

A developer tools company sells both B2B team subscriptions and individual lifetime licenses. Stripe handles the B2B side well, but managing sales tax, VAT, and merchant-of-record obligations for 40+ countries is consuming the founder's weekends. Individual sales need a simpler checkout that handles global tax compliance automatically.

Running two disconnected billing systems means revenue data lives in two dashboards with no unified view. Last month, the founder spent 8 hours reconciling revenue numbers that did not match because refunds were processed on different timelines in each system.

## The Solution

Use the **stripe-billing** skill for B2B subscription management and the **lemon-squeezy** skill for individual purchases with built-in tax handling, then build a unified revenue pipeline that reconciles both sources into a single reporting view.

## Step-by-Step Walkthrough

### 1. Configure Stripe for B2B subscriptions

Set up Stripe products and pricing tiers for team plans:

> Create Stripe products for three B2B tiers: Team ($49/seat/month), Business ($39/seat/month, minimum 10 seats), and Enterprise (custom pricing, annual only). Enable Stripe Tax for US domestic transactions. Set up a customer portal so team admins can add seats, switch plans, and download invoices. Configure dunning to retry failed payments at 3, 5, and 7 days with email notifications.

Stripe handles B2B well because team accounts have predictable billing addresses and tax obligations. The customer portal eliminates most billing support tickets since admins can self-serve seat changes and payment method updates.

### 2. Set up Lemon Squeezy for individual sales

Configure Lemon Squeezy as merchant of record for global individual purchases:

> Create a Lemon Squeezy product for the individual lifetime license at $149 one-time and a monthly individual plan at $12/month. Enable the built-in checkout overlay for the marketing site. Configure the license key activation system to allow up to 3 device activations per purchase. Set up the Lemon Squeezy webhook endpoint to receive payment and subscription events.

Lemon Squeezy acts as merchant of record, meaning they handle VAT, GST, and sales tax calculation, collection, and remittance. This eliminates the need to register for tax in individual jurisdictions, which is the complexity that was consuming the founder's time.

### 3. Build webhook handlers for both platforms

Create a unified event processing layer that normalizes events from both billing systems:

> Build a webhook handler that receives Stripe events at /webhooks/stripe and Lemon Squeezy events at /webhooks/lemonsqueezy. On successful payment from either platform, update the user record in the database with their active plan, license key, and billing source. Map Stripe's "invoice.payment_succeeded" and Lemon Squeezy's "order_created" events to a common "payment_completed" internal event.

The key architectural decision is normalizing events into a common internal format. Your application code should never need to know whether a user paid through Stripe or Lemon Squeezy. A single "has_active_license" check works regardless of billing source.

### 4. Implement license key verification

Create a single API endpoint that validates access regardless of billing source:

> Build a /api/verify-license endpoint that accepts either a Stripe subscription ID or a Lemon Squeezy license key. For Stripe, check subscription status via the API. For Lemon Squeezy, validate the license key and check activation count. Return a unified response with plan tier, features enabled, and expiration date.

Cache verification results for 5 minutes to avoid hitting external APIs on every request. Invalidate the cache when webhook events indicate a status change such as cancellation, upgrade, or payment failure.

### 5. Generate unified revenue dashboard

Reconcile revenue from both platforms into a single weekly report:

> Pull this week's revenue from Stripe (subscriptions MRR, new signups, churned accounts, expansion revenue from seat additions) and Lemon Squeezy (one-time purchases, individual subscriptions, refunds). Combine into a single report showing total revenue, revenue by source, net new MRR, lifetime license count, and month-over-month growth rate. Output as a formatted summary suitable for the Monday team standup.

Track revenue by source to understand which channel is growing faster. If lifetime licenses outpace subscriptions, it may signal that customers prefer one-time pricing and the subscription tiers need adjustment.

## Real-World Example

The company launches the dual billing setup on a Monday. By Friday, Stripe has processed 12 new B2B team signups totaling $2,940 MRR, while Lemon Squeezy has handled 34 individual lifetime licenses at $149 each ($5,066) plus 19 monthly subscriptions ($228 MRR). The Lemon Squeezy checkout handles VAT for 8 EU customers and GST for 3 Australian purchases without the founder touching a tax form.

The unified dashboard shows $3,168 MRR across both platforms and $5,066 in one-time revenue. When a B2B customer emails asking to switch from individual to team, the support team deactivates the Lemon Squeezy license and creates a Stripe subscription in under five minutes. After the first month, the founder estimates they saved 15 hours of tax compliance work and avoided the $3,000 setup cost for a tax calculation service that Stripe alone would have required for global individual sales.
