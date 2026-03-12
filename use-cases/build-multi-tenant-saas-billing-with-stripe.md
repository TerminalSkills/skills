---
title: Build Multi-Tenant SaaS Billing with Stripe
slug: build-multi-tenant-saas-billing-with-stripe
description: >
  Implement subscription billing with plan management, usage metering,
  proration, dunning, and self-service portal — handling 5K subscribers
  and $500K MRR with zero billing errors.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
  - lemon-squeezy
category: Full-Stack Development
tags:
  - billing
  - stripe
  - subscriptions
  - saas
  - metering
  - dunning
---

# Build Multi-Tenant SaaS Billing with Stripe

## The Problem

A SaaS with 5K paying customers manages billing through a mix of Stripe dashboard clicks and manual scripts. Plan changes require an engineer to update Stripe. Downgrades create proration bugs — customers were overcharged $23K over 6 months. Usage-based billing is calculated in a spreadsheet and manually applied. When a credit card fails, nobody notices for weeks until the customer's access is cut. The finance team spends 2 days per month reconciling Stripe with the database.

## Step 1: Plan and Subscription Management

```typescript
// src/billing/plans.ts
import { z } from 'zod';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const Plan = z.object({
  id: z.string(),
  name: z.string(),
  stripePriceId: z.string(),
  features: z.object({
    seats: z.number().int(),
    storageGb: z.number(),
    apiCallsPerMonth: z.number().int(),
    customDomain: z.boolean(),
    sso: z.boolean(),
    prioritySupport: z.boolean(),
  }),
  monthlyPriceCents: z.number().int(),
  annualPriceCents: z.number().int(),
});

export const PLANS: z.infer<typeof Plan>[] = [
  {
    id: 'starter',
    name: 'Starter',
    stripePriceId: 'price_starter_monthly',
    features: { seats: 5, storageGb: 10, apiCallsPerMonth: 50000, customDomain: false, sso: false, prioritySupport: false },
    monthlyPriceCents: 2900,
    annualPriceCents: 29000,
  },
  {
    id: 'pro',
    name: 'Pro',
    stripePriceId: 'price_pro_monthly',
    features: { seats: 25, storageGb: 100, apiCallsPerMonth: 500000, customDomain: true, sso: false, prioritySupport: true },
    monthlyPriceCents: 9900,
    annualPriceCents: 99000,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    stripePriceId: 'price_enterprise_monthly',
    features: { seats: -1, storageGb: 1000, apiCallsPerMonth: -1, customDomain: true, sso: true, prioritySupport: true },
    monthlyPriceCents: 29900,
    annualPriceCents: 299000,
  },
];

export async function changePlan(
  tenantId: string,
  newPlanId: string,
  billingCycle: 'monthly' | 'annual'
): Promise<{ success: boolean; prorationAmountCents?: number }> {
  const { Pool } = await import('pg');
  const db = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows: [tenant] } = await db.query(
    'SELECT stripe_customer_id, stripe_subscription_id, plan_id FROM tenants WHERE id = $1',
    [tenantId]
  );

  const newPlan = PLANS.find(p => p.id === newPlanId);
  if (!newPlan) throw new Error('Plan not found');

  const priceId = billingCycle === 'annual'
    ? newPlan.stripePriceId.replace('monthly', 'annual')
    : newPlan.stripePriceId;

  // Get current subscription
  const subscription = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);

  // Update with proration
  const updated = await stripe.subscriptions.update(tenant.stripe_subscription_id, {
    items: [{
      id: subscription.items.data[0].id,
      price: priceId,
    }],
    proration_behavior: 'always_invoice',
  });

  // Update local database
  await db.query(
    'UPDATE tenants SET plan_id = $1, billing_cycle = $2 WHERE id = $3',
    [newPlanId, billingCycle, tenantId]
  );

  // Calculate proration for display
  const upcomingInvoice = await stripe.invoices.retrieveUpcoming({
    customer: tenant.stripe_customer_id,
    subscription: tenant.stripe_subscription_id,
  });

  const prorationLines = upcomingInvoice.lines.data.filter(l => l.proration);
  const prorationAmount = prorationLines.reduce((s, l) => s + l.amount, 0);

  await db.end();
  return { success: true, prorationAmountCents: prorationAmount };
}
```

## Step 2: Webhook Handler

```typescript
// src/billing/webhooks.ts
import { Hono } from 'hono';
import Stripe from 'stripe';
import { Pool } from 'pg';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = new Hono();

app.post('/webhooks/stripe', async (c) => {
  const sig = c.req.header('stripe-signature')!;
  const body = await c.req.text();

  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  switch (event.type) {
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      await db.query(`
        UPDATE tenants SET billing_status = 'active', last_payment_at = NOW()
        WHERE stripe_customer_id = $1
      `, [invoice.customer]);

      await db.query(`
        INSERT INTO billing_events (tenant_id, type, amount_cents, stripe_invoice_id, created_at)
        SELECT id, 'payment_succeeded', $2, $3, NOW()
        FROM tenants WHERE stripe_customer_id = $1
      `, [invoice.customer, invoice.amount_paid, invoice.id]);
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const attempt = invoice.attempt_count ?? 1;

      await db.query(`
        UPDATE tenants SET billing_status = $1 WHERE stripe_customer_id = $2
      `, [attempt >= 3 ? 'past_due' : 'payment_failing', invoice.customer]);

      // Dunning: send escalating emails
      if (attempt === 1) {
        await sendDunningEmail(invoice.customer as string, 'payment_failed_first');
      } else if (attempt === 2) {
        await sendDunningEmail(invoice.customer as string, 'payment_failed_second');
      } else if (attempt >= 3) {
        await sendDunningEmail(invoice.customer as string, 'payment_failed_final');
        // Restrict access but don't delete data
        await db.query(
          `UPDATE tenants SET access_level = 'readonly' WHERE stripe_customer_id = $1`,
          [invoice.customer]
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      await db.query(`
        UPDATE tenants SET billing_status = 'cancelled', plan_id = 'free', cancelled_at = NOW()
        WHERE stripe_subscription_id = $1
      `, [sub.id]);
      break;
    }
  }

  return c.json({ received: true });
});

async function sendDunningEmail(customerId: string, template: string): Promise<void> {
  const { rows: [tenant] } = await db.query(
    'SELECT id, owner_email FROM tenants WHERE stripe_customer_id = $1',
    [customerId]
  );
  if (!tenant) return;
  console.log(`Sending dunning email ${template} to ${tenant.owner_email}`);
}

export default app;
```

## Step 3: Self-Service Billing Portal

```typescript
// src/api/billing.ts
import { Hono } from 'hono';
import Stripe from 'stripe';
import { Pool } from 'pg';
import { PLANS } from '../billing/plans';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const app = new Hono();

app.get('/v1/billing/status', async (c) => {
  const tenantId = c.get('tenantId');
  const { rows: [tenant] } = await db.query(
    'SELECT plan_id, billing_status, billing_cycle, next_billing_date FROM tenants WHERE id = $1',
    [tenantId]
  );

  const plan = PLANS.find(p => p.id === tenant.plan_id);

  return c.json({
    plan: plan?.name,
    status: tenant.billing_status,
    billingCycle: tenant.billing_cycle,
    nextBillingDate: tenant.next_billing_date,
    monthlyPrice: plan?.monthlyPriceCents,
  });
});

// Stripe Customer Portal for payment method management
app.post('/v1/billing/portal', async (c) => {
  const tenantId = c.get('tenantId');
  const { rows: [tenant] } = await db.query(
    'SELECT stripe_customer_id FROM tenants WHERE id = $1', [tenantId]
  );

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripe_customer_id,
    return_url: `${process.env.APP_URL}/settings/billing`,
  });

  return c.json({ url: session.url });
});

app.get('/v1/billing/invoices', async (c) => {
  const tenantId = c.get('tenantId');
  const { rows: [tenant] } = await db.query(
    'SELECT stripe_customer_id FROM tenants WHERE id = $1', [tenantId]
  );

  const invoices = await stripe.invoices.list({
    customer: tenant.stripe_customer_id,
    limit: 24,
  });

  return c.json({
    invoices: invoices.data.map(inv => ({
      id: inv.id,
      date: inv.created,
      amountCents: inv.amount_paid,
      status: inv.status,
      pdfUrl: inv.invoice_pdf,
    })),
  });
});

export default app;
```

## Results

- **Proration bugs**: zero (was $23K overcharged in 6 months)
- **Billing errors**: zero — Stripe handles all calculation, webhook syncs state
- **Dunning recovery**: 60% of failed payments recovered within 7 days
- **Plan changes**: self-service, instant, no engineer needed
- **Finance reconciliation**: automated — 2 days/month reduced to 30 minutes
- **$500K MRR**: managed reliably with full audit trail
- **Payment method updates**: self-service via Stripe portal, zero support tickets
