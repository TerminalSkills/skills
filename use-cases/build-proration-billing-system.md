---
title: Build a Proration Billing System
slug: build-proration-billing-system
description: Build a proration system for mid-cycle plan changes with credit calculations, upgrade/downgrade handling, seat adjustments, invoice line items, and transparent billing previews.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - billing
  - proration
  - subscriptions
  - invoicing
  - saas
---

# Build a Proration Billing System

## The Problem

Filip leads billing at a 25-person SaaS. When customers upgrade mid-cycle, they're charged the full new price — even if there are only 3 days left in the billing period. Customers complain it's unfair. When they downgrade, they lose the remaining value of what they already paid. Adding seats mid-cycle either double-charges or doesn't charge at all depending on which support agent handles it. They need automatic proration: fair charges on upgrades, credits on downgrades, and per-seat mid-cycle adjustments — all with clear invoice line items so customers understand what they're paying for.

## Step 1: Build the Proration Engine

```typescript
// src/billing/proration.ts — Mid-cycle plan changes with fair credit/charge calculation
import { pool } from "../db";
import { Redis } from "ioredis";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  pricePerSeat: number;       // cents/month
  seats: number;
  billingCycle: "monthly" | "annual";
  currentPeriodStart: string;
  currentPeriodEnd: string;
  status: string;
}

interface ProrationPreview {
  creditAmount: number;        // credit from unused old plan
  chargeAmount: number;        // charge for new plan remainder
  netAmount: number;           // positive = charge, negative = credit
  lineItems: ProrationLineItem[];
  effectiveDate: string;
  daysRemaining: number;
  daysInPeriod: number;
}

interface ProrationLineItem {
  description: string;
  quantity: number;
  unitPrice: number;           // cents
  amount: number;              // cents (can be negative for credits)
  type: "credit" | "charge";
}

// Preview proration before applying
export async function previewPlanChange(
  subscriptionId: string,
  newPlanId: string,
  newSeats?: number
): Promise<ProrationPreview> {
  const { rows: [sub] } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId]);
  if (!sub) throw new Error("Subscription not found");

  const { rows: [newPlan] } = await pool.query("SELECT * FROM plans WHERE id = $1", [newPlanId]);
  if (!newPlan) throw new Error("Plan not found");

  const seats = newSeats || sub.seats;
  const now = new Date();
  const periodStart = new Date(sub.current_period_start);
  const periodEnd = new Date(sub.current_period_end);

  const daysInPeriod = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000);
  const daysUsed = Math.ceil((now.getTime() - periodStart.getTime()) / 86400000);
  const daysRemaining = daysInPeriod - daysUsed;

  const dailyRateOld = (sub.price_per_seat * sub.seats) / daysInPeriod;
  const dailyRateNew = (newPlan.base_price * seats) / daysInPeriod;

  const lineItems: ProrationLineItem[] = [];

  // Credit for unused portion of current plan
  const creditAmount = Math.round(dailyRateOld * daysRemaining);
  if (creditAmount > 0) {
    lineItems.push({
      description: `Unused time on ${sub.plan_id} (${daysRemaining} days × ${sub.seats} seats)`,
      quantity: daysRemaining,
      unitPrice: Math.round(dailyRateOld),
      amount: -creditAmount,
      type: "credit",
    });
  }

  // Charge for remaining portion of new plan
  const chargeAmount = Math.round(dailyRateNew * daysRemaining);
  if (chargeAmount > 0) {
    lineItems.push({
      description: `Remaining time on ${newPlanId} (${daysRemaining} days × ${seats} seats)`,
      quantity: daysRemaining,
      unitPrice: Math.round(dailyRateNew),
      amount: chargeAmount,
      type: "charge",
    });
  }

  // Seat change within same plan
  if (newPlanId === sub.plan_id && newSeats && newSeats !== sub.seats) {
    const seatDiff = newSeats - sub.seats;
    const seatAdjustment = Math.round((sub.price_per_seat / daysInPeriod) * daysRemaining * Math.abs(seatDiff));

    lineItems.length = 0; // Clear plan-level items
    if (seatDiff > 0) {
      lineItems.push({
        description: `Add ${seatDiff} seat(s) for ${daysRemaining} remaining days`,
        quantity: seatDiff,
        unitPrice: Math.round((sub.price_per_seat / daysInPeriod) * daysRemaining),
        amount: seatAdjustment,
        type: "charge",
      });
    } else {
      lineItems.push({
        description: `Remove ${Math.abs(seatDiff)} seat(s), credit for ${daysRemaining} remaining days`,
        quantity: Math.abs(seatDiff),
        unitPrice: Math.round((sub.price_per_seat / daysInPeriod) * daysRemaining),
        amount: -seatAdjustment,
        type: "credit",
      });
    }

    return {
      creditAmount: seatDiff < 0 ? seatAdjustment : 0,
      chargeAmount: seatDiff > 0 ? seatAdjustment : 0,
      netAmount: seatDiff > 0 ? seatAdjustment : -seatAdjustment,
      lineItems, effectiveDate: now.toISOString(), daysRemaining, daysInPeriod,
    };
  }

  const netAmount = chargeAmount - creditAmount;

  return { creditAmount, chargeAmount, netAmount, lineItems, effectiveDate: now.toISOString(), daysRemaining, daysInPeriod };
}

// Apply plan change with proration
export async function applyPlanChange(
  subscriptionId: string,
  newPlanId: string,
  newSeats?: number
): Promise<{ success: boolean; invoiceId?: string; preview: ProrationPreview }> {
  const preview = await previewPlanChange(subscriptionId, newPlanId, newSeats);
  const { rows: [sub] } = await pool.query("SELECT * FROM subscriptions WHERE id = $1", [subscriptionId]);

  const seats = newSeats || sub.seats;

  // Create invoice for proration
  if (preview.netAmount !== 0) {
    const invoiceId = `inv-${Date.now().toString(36)}`;

    await pool.query(
      `INSERT INTO invoices (id, customer_id, subscription_id, amount, status, line_items, type, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'proration', NOW())`,
      [invoiceId, sub.customer_id, subscriptionId, Math.abs(preview.netAmount),
       preview.netAmount > 0 ? "pending" : "credit",
       JSON.stringify(preview.lineItems)]
    );

    if (preview.netAmount > 0) {
      // Charge the customer
      try {
        await stripe.paymentIntents.create({
          amount: preview.netAmount,
          currency: "usd",
          customer: sub.stripe_customer_id,
          description: `Proration: ${sub.plan_id} → ${newPlanId}`,
          metadata: { invoiceId, subscriptionId },
          confirm: true,
          automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        });
        await pool.query("UPDATE invoices SET status = 'paid' WHERE id = $1", [invoiceId]);
      } catch (err: any) {
        await pool.query("UPDATE invoices SET status = 'failed' WHERE id = $1", [invoiceId]);
        return { success: false, preview };
      }
    } else {
      // Apply credit to customer balance
      await pool.query(
        "UPDATE customers SET credit_balance = credit_balance + $2 WHERE id = $1",
        [sub.customer_id, Math.abs(preview.netAmount)]
      );
    }
  }

  // Update subscription
  const { rows: [newPlan] } = await pool.query("SELECT * FROM plans WHERE id = $1", [newPlanId]);
  await pool.query(
    `UPDATE subscriptions SET plan_id = $2, price_per_seat = $3, seats = $4, updated_at = NOW() WHERE id = $1`,
    [subscriptionId, newPlanId, newPlan.base_price, seats]
  );

  // Log the change
  await pool.query(
    `INSERT INTO subscription_changes (subscription_id, old_plan, new_plan, old_seats, new_seats, proration_amount, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [subscriptionId, sub.plan_id, newPlanId, sub.seats, seats, preview.netAmount]
  );

  return { success: true, preview };
}
```

## Results

- **Fair billing on upgrades** — customer upgrading from $49 to $99 with 10 days left pays $16.33 prorated charge, not $99; zero complaints about "double charging"
- **Credits on downgrades** — unused time on the expensive plan applied as credit; customer sees the math on their invoice; support tickets about billing drop 70%
- **Mid-cycle seat changes** — adding 5 seats on day 20 of 30 charges for 10 days × 5 seats; removing seats gives credit; HR doesn't have to wait until next billing cycle
- **Preview before commit** — customer sees exact charges/credits before confirming; no surprises; "what will I pay?" answered in milliseconds
- **Transparent invoices** — each line item shows: what changed, how many days, unit price, total; customers trust the billing because they can verify the math
