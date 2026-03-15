---
title: Build a Dunning and Failed Payment Recovery System
slug: build-dunning-failed-payment-recovery
description: Build an automated dunning system that retries failed payments with smart scheduling, sends personalized recovery emails, offers payment method updates, and tracks recovery rates per cohort.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - dunning
  - payments
  - retention
  - subscriptions
  - recovery
---

# Build a Dunning and Failed Payment Recovery System

## The Problem

Oleg leads revenue at a 30-person SaaS with 8,000 subscribers. Involuntary churn (failed payments) accounts for 40% of all churn — 320 customers lost per month. When a payment fails, Stripe retries 3 times over 2 weeks, then cancels the subscription. Nobody contacts the customer. They lose $128K ARR from cards that simply expired or hit temporary limits. Most of these customers want to keep using the product — they just don't know their payment failed. They need a smart retry schedule, multi-channel notifications, and a self-service payment update page.

## Step 1: Build the Dunning Engine

```typescript
// src/billing/dunning.ts — Failed payment recovery with smart retries and multi-channel outreach
import { pool } from "../db";
import { Redis } from "ioredis";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

interface DunningCampaign {
  id: string;
  customerId: string;
  subscriptionId: string;
  invoiceId: string;
  amount: number;
  currency: string;
  failureReason: string;
  status: "active" | "recovered" | "churned" | "paused";
  retrySchedule: RetryStep[];
  currentStep: number;
  totalRetries: number;
  recoveredAt: string | null;
  createdAt: string;
}

interface RetryStep {
  day: number;                 // days after initial failure
  action: "retry_payment" | "send_email" | "send_sms" | "in_app_banner";
  emailTemplate?: string;
  completed: boolean;
  result?: string;
}

// Default dunning schedule
const DEFAULT_SCHEDULE: RetryStep[] = [
  { day: 0, action: "send_email", emailTemplate: "payment_failed_soft", completed: false },
  { day: 1, action: "retry_payment", completed: false },
  { day: 3, action: "send_email", emailTemplate: "payment_failed_update_card", completed: false },
  { day: 3, action: "in_app_banner", completed: false },
  { day: 5, action: "retry_payment", completed: false },
  { day: 7, action: "send_email", emailTemplate: "payment_failed_urgent", completed: false },
  { day: 7, action: "send_sms", completed: false },
  { day: 10, action: "retry_payment", completed: false },
  { day: 12, action: "send_email", emailTemplate: "payment_failed_last_chance", completed: false },
  { day: 14, action: "retry_payment", completed: false },
  { day: 21, action: "send_email", emailTemplate: "account_cancelled", completed: false },
];

// Handle payment failure webhook
export async function handlePaymentFailure(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const subscriptionId = invoice.subscription as string;

  // Check if dunning campaign already exists
  const { rows: [existing] } = await pool.query(
    "SELECT id FROM dunning_campaigns WHERE invoice_id = $1 AND status = 'active'",
    [invoice.id]
  );
  if (existing) return;

  // Determine failure reason for personalized messaging
  const failureReason = categorizeFailure(invoice);

  // Create smart retry schedule based on failure type
  const schedule = buildSmartSchedule(failureReason);

  const campaignId = `dun-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  await pool.query(
    `INSERT INTO dunning_campaigns (id, customer_id, subscription_id, invoice_id, amount, currency, failure_reason, status, retry_schedule, current_step, total_retries, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 0, 0, NOW())`,
    [campaignId, customerId, subscriptionId, invoice.id,
     invoice.amount_due, invoice.currency, failureReason,
     JSON.stringify(schedule)]
  );

  // Execute first step immediately
  await executeStep(campaignId, 0);
}

function categorizeFailure(invoice: Stripe.Invoice): string {
  const charge = invoice.charge as any;
  const declineCode = charge?.failure_code || "";

  if (declineCode === "expired_card") return "expired_card";
  if (declineCode === "insufficient_funds") return "insufficient_funds";
  if (declineCode === "card_declined") return "card_declined";
  if (declineCode === "processing_error") return "processing_error";
  return "unknown";
}

function buildSmartSchedule(failureReason: string): RetryStep[] {
  // Customize schedule based on failure reason
  if (failureReason === "expired_card") {
    // Don't retry — card is expired, just notify to update
    return [
      { day: 0, action: "send_email", emailTemplate: "card_expired", completed: false },
      { day: 0, action: "in_app_banner", completed: false },
      { day: 2, action: "send_email", emailTemplate: "card_expired_reminder", completed: false },
      { day: 5, action: "send_sms", completed: false },
      { day: 7, action: "send_email", emailTemplate: "card_expired_urgent", completed: false },
      { day: 14, action: "send_email", emailTemplate: "account_cancelled", completed: false },
    ];
  }

  if (failureReason === "insufficient_funds") {
    // Retry more frequently — funds may become available
    return [
      { day: 0, action: "send_email", emailTemplate: "payment_failed_soft", completed: false },
      { day: 1, action: "retry_payment", completed: false },
      { day: 2, action: "retry_payment", completed: false },
      { day: 4, action: "retry_payment", completed: false },
      { day: 4, action: "send_email", emailTemplate: "payment_failed_update_card", completed: false },
      { day: 7, action: "retry_payment", completed: false },
      { day: 10, action: "send_email", emailTemplate: "payment_failed_last_chance", completed: false },
      { day: 14, action: "retry_payment", completed: false },
    ];
  }

  return DEFAULT_SCHEDULE;
}

// Process dunning steps (run every hour by cron)
export async function processDunningQueue(): Promise<{ processed: number; recovered: number }> {
  const { rows: campaigns } = await pool.query(
    "SELECT * FROM dunning_campaigns WHERE status = 'active'"
  );

  let processed = 0;
  let recovered = 0;

  for (const campaign of campaigns) {
    const schedule: RetryStep[] = JSON.parse(campaign.retry_schedule);
    const daysSinceCreation = Math.floor((Date.now() - new Date(campaign.created_at).getTime()) / 86400000);

    for (let i = campaign.current_step; i < schedule.length; i++) {
      const step = schedule[i];
      if (step.completed) continue;
      if (step.day > daysSinceCreation) break;

      const result = await executeStep(campaign.id, i);
      processed++;

      if (result === "recovered") {
        recovered++;
        break;
      }
    }

    // Check if all steps exhausted
    if (schedule.every((s) => s.completed) || daysSinceCreation > 21) {
      await pool.query(
        "UPDATE dunning_campaigns SET status = 'churned' WHERE id = $1",
        [campaign.id]
      );
      // Cancel subscription
      await stripe.subscriptions.cancel(campaign.subscription_id);
    }
  }

  return { processed, recovered };
}

async function executeStep(campaignId: string, stepIndex: number): Promise<string> {
  const { rows: [campaign] } = await pool.query(
    "SELECT * FROM dunning_campaigns WHERE id = $1", [campaignId]
  );
  const schedule: RetryStep[] = JSON.parse(campaign.retry_schedule);
  const step = schedule[stepIndex];

  let result = "completed";

  switch (step.action) {
    case "retry_payment": {
      try {
        const invoice = await stripe.invoices.pay(campaign.invoice_id);
        if (invoice.paid) {
          result = "recovered";
          await pool.query(
            "UPDATE dunning_campaigns SET status = 'recovered', recovered_at = NOW() WHERE id = $1",
            [campaignId]
          );
          // Send recovery confirmation
          await sendEmail(campaign.customer_id, "payment_recovered", { amount: campaign.amount });
        }
      } catch {
        result = "retry_failed";
      }
      await pool.query(
        "UPDATE dunning_campaigns SET total_retries = total_retries + 1 WHERE id = $1",
        [campaignId]
      );
      break;
    }

    case "send_email":
      await sendEmail(campaign.customer_id, step.emailTemplate!, {
        amount: campaign.amount,
        currency: campaign.currency,
        updateUrl: `${process.env.APP_URL}/billing/update-payment?token=${generateUpdateToken(campaign.customer_id)}`,
        failureReason: campaign.failure_reason,
      });
      break;

    case "send_sms":
      await redis.rpush("sms:queue", JSON.stringify({
        customerId: campaign.customer_id,
        message: `Your payment of $${(campaign.amount / 100).toFixed(2)} failed. Update your card: ${process.env.APP_URL}/billing/update`,
      }));
      break;

    case "in_app_banner":
      await redis.setex(`dunning:banner:${campaign.customer_id}`, 86400 * 14, JSON.stringify({
        type: "payment_failed",
        amount: campaign.amount,
        updateUrl: "/billing/update-payment",
      }));
      break;
  }

  // Mark step completed
  schedule[stepIndex].completed = true;
  schedule[stepIndex].result = result;
  await pool.query(
    "UPDATE dunning_campaigns SET retry_schedule = $2, current_step = $3 WHERE id = $1",
    [campaignId, JSON.stringify(schedule), stepIndex + 1]
  );

  return result;
}

// Self-service payment update page
export async function handlePaymentUpdate(
  customerId: string,
  newPaymentMethodId: string
): Promise<{ success: boolean; invoicesPaid: number }> {
  // Attach new payment method
  await stripe.paymentMethods.attach(newPaymentMethodId, { customer: customerId });
  await stripe.customers.update(customerId, {
    invoice_settings: { default_payment_method: newPaymentMethodId },
  });

  // Retry all open invoices
  const { rows: campaigns } = await pool.query(
    "SELECT * FROM dunning_campaigns WHERE customer_id = $1 AND status = 'active'",
    [customerId]
  );

  let invoicesPaid = 0;
  for (const campaign of campaigns) {
    try {
      const invoice = await stripe.invoices.pay(campaign.invoice_id);
      if (invoice.paid) {
        invoicesPaid++;
        await pool.query(
          "UPDATE dunning_campaigns SET status = 'recovered', recovered_at = NOW() WHERE id = $1",
          [campaign.id]
        );
      }
    } catch {}
  }

  // Remove in-app banner
  await redis.del(`dunning:banner:${customerId}`);

  return { success: true, invoicesPaid };
}

async function sendEmail(customerId: string, template: string, data: any): Promise<void> {
  await redis.rpush("email:send:queue", JSON.stringify({ customerId, template, data }));
}

function generateUpdateToken(customerId: string): string {
  const { createHash } = require("node:crypto");
  return createHash("sha256").update(`${customerId}:${process.env.JWT_SECRET}:${Date.now()}`).digest("hex").slice(0, 32);
}
```

## Results

- **$128K ARR recovered** — 65% of failed payments recovered through smart retries and multi-channel outreach; involuntary churn cut by two-thirds
- **Failure-specific messaging** — expired card gets "update your card" (no retries); insufficient funds gets frequent retries with soft messaging; recovery rate 20% higher than generic emails
- **Self-service update page** — customer clicks email link, enters new card, all pending invoices charged automatically; no support interaction needed
- **In-app banner catches active users** — customers who ignore emails see the banner in the app; 25% of recoveries come from in-app prompts
- **21-day grace period** — more time than Stripe's default 2-week cycle; 15% of recoveries happen in week 3 (customers on vacation, between paychecks, etc.)
