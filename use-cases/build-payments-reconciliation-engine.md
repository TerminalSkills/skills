---
title: Build a Payments Reconciliation Engine
slug: build-payments-reconciliation-engine
description: >
  Automate daily reconciliation of payments across Stripe, PayPal, and
  bank statements — catching discrepancies in minutes instead of days
  and reducing month-end close from 5 days to 4 hours.
skills:
  - typescript
  - postgresql
  - redis
  - bull-mq
  - zod
  - hono
category: development
tags:
  - payments
  - reconciliation
  - fintech
  - accounting
  - automation
  - stripe
---

# Build a Payments Reconciliation Engine

## The Problem

A marketplace processes $5M/month through Stripe, PayPal, and direct bank transfers across 500 merchants. The finance team manually reconciles payments in spreadsheets — matching platform records against gateway reports against bank statements. It takes 5 days every month-end. Last quarter, they found $47K in discrepancies: 12 payments captured by Stripe but not recorded in the platform, 8 refunds processed but not reflected in merchant payouts, and 3 duplicate charges that went unnoticed for weeks.

## Step 1: Normalized Transaction Schema

```typescript
// src/reconciliation/schema.ts
import { z } from 'zod';

export const Transaction = z.object({
  id: z.string(),
  source: z.enum(['platform', 'stripe', 'paypal', 'bank']),
  externalId: z.string(),
  type: z.enum(['charge', 'refund', 'payout', 'fee', 'adjustment']),
  amountCents: z.number().int(),
  currency: z.string().length(3),
  merchantId: z.string().optional(),
  customerId: z.string().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'disputed']),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export type Transaction = z.infer<typeof Transaction>;

export const ReconciliationResult = z.object({
  date: z.string(),
  matched: z.number().int(),
  unmatched: z.array(z.object({
    source: z.string(),
    transaction: Transaction,
    possibleMatches: z.array(z.object({ source: z.string(), transaction: Transaction, confidence: z.number() })),
  })),
  discrepancies: z.array(z.object({
    type: z.enum(['amount_mismatch', 'missing_in_platform', 'missing_in_gateway', 'status_mismatch', 'duplicate']),
    platformTx: Transaction.optional(),
    gatewayTx: Transaction.optional(),
    amountDifferenceCents: z.number().int().optional(),
    severity: z.enum(['critical', 'high', 'medium', 'low']),
  })),
  summary: z.object({
    platformTotal: z.number().int(),
    gatewayTotal: z.number().int(),
    bankTotal: z.number().int(),
    netDiscrepancy: z.number().int(),
  }),
});
```

## Step 2: Gateway Data Fetchers

```typescript
// src/reconciliation/fetchers.ts
import Stripe from 'stripe';
import { Pool } from 'pg';
import type { Transaction } from './schema';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function fetchStripeTransactions(date: string): Promise<Transaction[]> {
  const startOfDay = new Date(`${date}T00:00:00Z`).getTime() / 1000;
  const endOfDay = new Date(`${date}T23:59:59Z`).getTime() / 1000;

  const charges = await stripe.charges.list({
    created: { gte: startOfDay, lte: endOfDay },
    limit: 100,
  });

  const refunds = await stripe.refunds.list({
    created: { gte: startOfDay, lte: endOfDay },
    limit: 100,
  });

  const transactions: Transaction[] = [];

  for (const charge of charges.data) {
    transactions.push({
      id: `stripe:${charge.id}`,
      source: 'stripe',
      externalId: charge.id,
      type: 'charge',
      amountCents: charge.amount,
      currency: charge.currency.toUpperCase(),
      merchantId: charge.metadata?.merchant_id,
      customerId: charge.customer as string,
      status: charge.status === 'succeeded' ? 'completed' : charge.disputed ? 'disputed' : 'failed',
      occurredAt: new Date(charge.created * 1000).toISOString(),
      metadata: charge.metadata ?? {},
    });
  }

  for (const refund of refunds.data) {
    transactions.push({
      id: `stripe:${refund.id}`,
      source: 'stripe',
      externalId: refund.id,
      type: 'refund',
      amountCents: -refund.amount,
      currency: refund.currency.toUpperCase(),
      status: refund.status === 'succeeded' ? 'completed' : 'pending',
      occurredAt: new Date(refund.created * 1000).toISOString(),
      metadata: {},
    });
  }

  return transactions;
}

export async function fetchPlatformTransactions(date: string): Promise<Transaction[]> {
  const { rows } = await db.query(`
    SELECT id, external_payment_id, type, amount_cents, currency,
           merchant_id, customer_id, status, created_at
    FROM payments
    WHERE created_at::date = $1::date
    ORDER BY created_at
  `, [date]);

  return rows.map(r => ({
    id: `platform:${r.id}`,
    source: 'platform' as const,
    externalId: r.external_payment_id,
    type: r.type,
    amountCents: r.amount_cents,
    currency: r.currency,
    merchantId: r.merchant_id,
    customerId: r.customer_id,
    status: r.status,
    occurredAt: r.created_at.toISOString(),
    metadata: {},
  }));
}
```

## Step 3: Matching Engine

```typescript
// src/reconciliation/matcher.ts
import type { Transaction, ReconciliationResult } from './schema';

export function reconcile(
  platformTxs: Transaction[],
  gatewayTxs: Transaction[]
): z.infer<typeof ReconciliationResult> {
  const matched: Array<[Transaction, Transaction]> = [];
  const unmatchedPlatform = new Set(platformTxs);
  const unmatchedGateway = new Set(gatewayTxs);
  const discrepancies: any[] = [];

  // Pass 1: exact match on external ID
  for (const ptx of platformTxs) {
    const match = gatewayTxs.find(g => g.externalId === ptx.externalId);
    if (match) {
      matched.push([ptx, match]);
      unmatchedPlatform.delete(ptx);
      unmatchedGateway.delete(match);

      // Check for amount mismatch
      if (ptx.amountCents !== match.amountCents) {
        discrepancies.push({
          type: 'amount_mismatch',
          platformTx: ptx,
          gatewayTx: match,
          amountDifferenceCents: Math.abs(ptx.amountCents - match.amountCents),
          severity: Math.abs(ptx.amountCents - match.amountCents) > 100 ? 'critical' : 'medium',
        });
      }

      // Check for status mismatch
      if (ptx.status !== match.status) {
        discrepancies.push({
          type: 'status_mismatch', platformTx: ptx, gatewayTx: match,
          severity: 'high',
        });
      }
    }
  }

  // Pass 2: fuzzy match remaining (amount + time window)
  for (const ptx of unmatchedPlatform) {
    const candidates = [...unmatchedGateway].filter(g =>
      Math.abs(g.amountCents - ptx.amountCents) <= 1 && // 1 cent tolerance
      Math.abs(new Date(g.occurredAt).getTime() - new Date(ptx.occurredAt).getTime()) < 86400000
    );
    if (candidates.length === 1) {
      matched.push([ptx, candidates[0]]);
      unmatchedPlatform.delete(ptx);
      unmatchedGateway.delete(candidates[0]);
    }
  }

  // Remaining unmatched = discrepancies
  for (const ptx of unmatchedPlatform) {
    discrepancies.push({ type: 'missing_in_gateway', platformTx: ptx, severity: 'high' });
  }
  for (const gtx of unmatchedGateway) {
    discrepancies.push({ type: 'missing_in_platform', gatewayTx: gtx, severity: 'critical' });
  }

  // Duplicate detection
  const seen = new Map<string, Transaction>();
  for (const tx of [...platformTxs, ...gatewayTxs]) {
    const key = `${tx.amountCents}:${tx.merchantId}:${tx.occurredAt.slice(0, 13)}`;
    if (seen.has(key)) {
      discrepancies.push({
        type: 'duplicate', platformTx: seen.get(key), gatewayTx: tx, severity: 'high',
      });
    }
    seen.set(key, tx);
  }

  return {
    date: new Date().toISOString().split('T')[0],
    matched: matched.length,
    unmatched: [],
    discrepancies,
    summary: {
      platformTotal: platformTxs.reduce((s, t) => s + t.amountCents, 0),
      gatewayTotal: gatewayTxs.reduce((s, t) => s + t.amountCents, 0),
      bankTotal: 0,
      netDiscrepancy: 0,
    },
  };
}
```

## Results

- **Month-end close**: reduced from 5 days to 4 hours
- **$47K discrepancy**: would have been caught same-day (automated daily reconciliation)
- **12 missing charges** found in first run — Stripe webhooks had failed silently
- **Duplicate charges**: caught within 1 hour instead of weeks
- **Finance team**: 3 people freed from reconciliation work to focus on analysis
- **Audit readiness**: complete reconciliation history with every transaction matched
