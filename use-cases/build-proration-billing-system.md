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
category: development
tags:
  - billing
  - proration
  - subscriptions
  - invoicing
  - saas
---

# Build a Proration Billing System

## The Problem

Filip leads billing at a 25-person SaaS. When customers upgrade mid-cycle they are charged the full new price even with three days left in the period. When they downgrade they lose what they already paid for. Adding seats mid-cycle either double-charges or charges nothing, depending on which support agent handles it. He needs automatic proration: a charge for the extra value on upgrades, a credit on downgrades, per-seat adjustments, and invoice lines a customer can check with a calculator.

## The Solution

Keep the money math in one pure function that takes the billing period, the old plan and the new plan, and returns invoice lines in integer cents. A plan change and a seat change are the same calculation: credit the unused part of what the customer has, charge the remaining part of what they will have. Around it, a Hono API with Zod-validated requests previews and applies changes; PostgreSQL holds subscriptions and invoices; Redis blocks duplicate submissions; Stripe collects the charge.

## Step-by-Step Walkthrough

### Step 1: Tables

Prices are integer cents per seat per billing period. Subscriptions keep the Stripe customer and the saved card to charge.

```sql
CREATE TABLE plans (id text PRIMARY KEY, price_per_seat integer NOT NULL);
CREATE TABLE customers (id text PRIMARY KEY, credit_balance integer NOT NULL DEFAULT 0);
CREATE TABLE subscriptions (
  id text PRIMARY KEY, customer_id text REFERENCES customers(id),
  stripe_customer_id text, stripe_payment_method_id text,
  plan_id text REFERENCES plans(id), price_per_seat integer NOT NULL, seats integer NOT NULL,
  current_period_start timestamptz NOT NULL, current_period_end timestamptz NOT NULL);
CREATE TABLE invoices (
  id uuid PRIMARY KEY, customer_id text, subscription_id text,
  amount integer NOT NULL, type text NOT NULL, line_items jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now());
```

### Step 2: The proration function

The share of the period still ahead is measured to the millisecond, not in whole days, so a change at 09:00 and one at 17:00 are priced differently and a 28-day month needs no special case. Rounding happens once per line.

```typescript
// src/proration.ts — pure math: no database, no network, easy to test
export interface Line {
  description: string;
  quantity: number;     // seats
  amount: number;       // integer cents, negative = credit
}

export interface Preview {
  lines: Line[];
  netAmount: number;    // > 0 charge now, < 0 credit to balance
  remainingFraction: number;
}

interface Side { planId: string; pricePerSeat: number; seats: number } // price in cents per seat per period

export function prorate(
  periodStart: Date, periodEnd: Date, now: Date, from: Side, to: Side,
): Preview {
  const total = periodEnd.getTime() - periodStart.getTime();
  const left = Math.min(total, Math.max(0, periodEnd.getTime() - now.getTime()));
  const f = left / total; // share of the period still ahead, to the millisecond

  const credit = Math.round(from.pricePerSeat * from.seats * f);
  const charge = Math.round(to.pricePerSeat * to.seats * f);
  const pct = Math.round(f * 100);

  const lines: Line[] = [];
  if (credit) lines.push({ description: `Unused ${from.planId}, ${from.seats} seats x ${pct}% of period`, quantity: from.seats, amount: -credit });
  if (charge) lines.push({ description: `${to.planId}, ${to.seats} seats x ${pct}% of period`, quantity: to.seats, amount: charge });
  return { lines, netAmount: charge - credit, remainingFraction: f };
}
```

Run it for a 30-day period with 10 days left:

```console
$ npx tsx check.ts
starter 49.00 -> pro 99.00, 1 seat    net  1667  (charge $16.67)
pro 10 -> 15 seats at 10.00           net  1667  (charge $16.67)
pro 99.00 -> starter 49.00, 1 seat    net -1667  (credit $16.67)
```

An upgrade from $49 to $99 with a third of the period left costs $16.67, which is (99 - 49) / 3, and the matching downgrade returns the same amount as credit.

### Step 3: Apply the change safely

The function locks the subscription row, so two support agents cannot change one account at once. The Stripe charge carries an idempotency key derived from the client's `Idempotency-Key`, and a Redis `SET ... NX` on the same key rejects a double click before anything runs. If the card is declined Stripe throws, the transaction rolls back, the lock is released and the subscription stays on the old plan. If the failure comes after the card was charged, the lock stays, so a replay is refused and someone reconciles the charge by its `idempotencyKey` metadata instead of charging twice. A negative net amount becomes credit on the customer's balance.

```typescript
// src/billing.ts — apply a plan or seat change: lock, charge, record
import { randomUUID } from "node:crypto";
import pg from "pg";
import Stripe from "stripe";
import { Redis } from "ioredis";
import { z } from "zod";
import { prorate } from "./proration.ts";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");

export const ChangeRequest = z.object({
  subscriptionId: z.string().min(1),
  newPlanId: z.string().min(1),
  newSeats: z.number().int().min(1).max(10_000).optional(),
});
export type ChangeRequest = z.infer<typeof ChangeRequest>;

export async function applyChange(req: ChangeRequest, idempotencyKey: string, dryRun = false) {
  // The same client retry must not charge twice.
  let charged = false;
  if (!dryRun && !(await redis.set(`proration:${idempotencyKey}`, "1", "EX", 3600, "NX"))) {
    throw new Error("Duplicate request");
  }
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { rows: [sub] } = await db.query(
      "SELECT * FROM subscriptions WHERE id = $1 FOR UPDATE", [req.subscriptionId]);
    const { rows: [plan] } = await db.query("SELECT * FROM plans WHERE id = $1", [req.newPlanId]);
    if (!sub || !plan) throw new Error("Unknown subscription or plan");

    const seats = req.newSeats ?? sub.seats;
    const preview = prorate(
      new Date(sub.current_period_start), new Date(sub.current_period_end), new Date(),
      { planId: sub.plan_id, pricePerSeat: sub.price_per_seat, seats: sub.seats },
      { planId: plan.id, pricePerSeat: plan.price_per_seat, seats },
    );
    if (dryRun) { await db.query("ROLLBACK"); return { preview }; }

    const invoiceId = randomUUID();
    // The client key is the unit of work: a replay of it can never create a second charge.
    if (preview.netAmount > 0) {
      // Off-session charge of the customer's saved default card.
      await stripe.paymentIntents.create({
        amount: preview.netAmount, currency: "usd",
        customer: sub.stripe_customer_id,
        payment_method: sub.stripe_payment_method_id,
        off_session: true, confirm: true,
        description: `Proration ${sub.plan_id} -> ${plan.id}`,
        metadata: { idempotencyKey, subscriptionId: sub.id },
      }, { idempotencyKey: `proration-${idempotencyKey}` });
      charged = true;
    } else if (preview.netAmount < 0) {
      await db.query("UPDATE customers SET credit_balance = credit_balance + $2 WHERE id = $1",
        [sub.customer_id, -preview.netAmount]);
    }
    await db.query(
      `INSERT INTO invoices (id, customer_id, subscription_id, amount, type, line_items)
       VALUES ($1, $2, $3, $4, 'proration', $5)`,
      [invoiceId, sub.customer_id, sub.id, preview.netAmount, JSON.stringify(preview.lines)]);
    await db.query(
      "UPDATE subscriptions SET plan_id = $2, price_per_seat = $3, seats = $4 WHERE id = $1",
      [sub.id, plan.id, plan.price_per_seat, seats]);
    await db.query("COMMIT");
    return { invoiceId, preview };
  } catch (err) {
    await db.query("ROLLBACK");
    if (!charged) await redis.del(`proration:${idempotencyKey}`); // not charged: the client may retry
    throw err;
  } finally {
    db.release();
  }
}
```

### Step 4: Expose preview and apply

The preview runs the same code in a transaction that is rolled back, so what the customer sees is what they will pay.

```typescript
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import Stripe from "stripe";
import { ChangeRequest, applyChange } from "./billing.ts";

const app = new Hono();

// Duplicate submit -> 409, declined card -> 402; anything else is logged and hidden from the client.
app.onError((err, c) => {
  if (err.message === "Duplicate request") return c.json({ error: err.message }, 409);
  if (err instanceof Stripe.errors.StripeCardError) return c.json({ error: err.message }, 402);
  console.error(err);
  return c.json({ error: "Could not apply the change" }, 500);
});

app.post("/changes/preview", zValidator("json", ChangeRequest), async (c) =>
  c.json((await applyChange(c.req.valid("json"), "preview", true)).preview));

app.post("/changes", zValidator("json", ChangeRequest), async (c) => {
  const key = c.req.header("idempotency-key");
  if (!key) return c.json({ error: "Idempotency-Key header required" }, 400);
  return c.json(await applyChange(c.req.valid("json"), key));
});

serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 3000 });
```

## Real-World Example

On the 22nd of a 31-day month, a customer with 10 Pro seats at $10 per seat adds 5. The preview shows a credit of $32.26 for the unused 10 seats and a charge of $48.39 for 15 seats, a net charge of $16.13, and nothing is billed until the customer confirms. The same day another account moves from Pro to Starter and receives credit on its balance. Support stops answering "why was I charged this?" by hand, because each invoice line names the plan, the seat count and the share of the period.

## Related Skills

- [typescript](/skills/typescript) - strict types for money amounts and request bodies
- [redis](/skills/redis) - the idempotency lock
- [postgresql](/skills/postgresql) - row locks, transactions and the schema
- [hono](/skills/hono) - the preview and apply endpoints
- [zod](/skills/zod) - request validation
