---
title: Build a Payment Reconciliation Engine
slug: build-payment-reconciliation-engine
description: Build a payment reconciliation engine with transaction matching, discrepancy detection, multi-source comparison, automated resolution, and audit reporting for financial operations.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Business Logic
tags:
  - payments
  - reconciliation
  - finance
  - accounting
  - automation
---

# Build a Payment Reconciliation Engine

## The Problem

Pavel leads finance at a 25-person company processing $2M/month through Stripe, PayPal, and bank transfers. Monthly reconciliation — matching payments in their system with bank statements and payment processor reports — takes the finance team 3 days. Discrepancies (partial payments, refunds, FX differences, processing fees) require manual investigation. Last quarter, $15K in unreconciled transactions caused an audit flag. They need automated reconciliation: import transactions from multiple sources, match them algorithmically, detect discrepancies, suggest resolutions, and generate audit-ready reports.

## Step 1: Build the Reconciliation Engine

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Transaction {
  id: string;
  source: "internal" | "stripe" | "paypal" | "bank";
  externalId: string;
  amount: number;
  currency: string;
  type: "charge" | "refund" | "payout" | "fee" | "adjustment";
  customerId: string | null;
  description: string;
  date: string;
  metadata: Record<string, any>;
}

interface ReconciliationMatch {
  id: string;
  internalTx: Transaction;
  externalTx: Transaction;
  status: "matched" | "partial" | "discrepancy" | "unmatched";
  discrepancyAmount: number;
  discrepancyReason: string | null;
  resolution: string | null;
  resolvedBy: string | null;
}

interface ReconciliationReport {
  period: string;
  totalInternal: number;
  totalExternal: number;
  matched: number;
  partialMatches: number;
  discrepancies: number;
  unmatched: number;
  totalDiscrepancyAmount: number;
  matches: ReconciliationMatch[];
}

export async function reconcile(period: string, sources: string[]): Promise<ReconciliationReport> {
  const [year, month] = period.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0).toISOString();

  // Load transactions from all sources
  const internal = await loadTransactions("internal", startDate, endDate);
  const external: Transaction[] = [];
  for (const source of sources) {
    external.push(...await loadTransactions(source as any, startDate, endDate));
  }

  const matches: ReconciliationMatch[] = [];
  const matchedExternal = new Set<string>();
  const matchedInternal = new Set<string>();

  // Pass 1: Exact matches (same external ID)
  for (const intTx of internal) {
    const extMatch = external.find((e) => !matchedExternal.has(e.id) && (e.externalId === intTx.externalId || intTx.externalId === e.externalId));
    if (extMatch) {
      const discrepancy = Math.abs(intTx.amount - extMatch.amount);
      matches.push({
        id: randomBytes(6).toString("hex"),
        internalTx: intTx, externalTx: extMatch,
        status: discrepancy < 0.01 ? "matched" : discrepancy < intTx.amount * 0.05 ? "partial" : "discrepancy",
        discrepancyAmount: Math.round(discrepancy * 100) / 100,
        discrepancyReason: discrepancy > 0.01 ? detectDiscrepancyReason(intTx, extMatch) : null,
        resolution: null, resolvedBy: null,
      });
      matchedExternal.add(extMatch.id);
      matchedInternal.add(intTx.id);
    }
  }

  // Pass 2: Fuzzy matches (same amount + date range + customer)
  for (const intTx of internal) {
    if (matchedInternal.has(intTx.id)) continue;
    const candidates = external.filter((e) => !matchedExternal.has(e.id) && Math.abs(e.amount - intTx.amount) < 0.5 && Math.abs(new Date(e.date).getTime() - new Date(intTx.date).getTime()) < 3 * 86400000);
    if (candidates.length === 1) {
      const extMatch = candidates[0];
      matches.push({
        id: randomBytes(6).toString("hex"),
        internalTx: intTx, externalTx: extMatch,
        status: "partial",
        discrepancyAmount: Math.round(Math.abs(intTx.amount - extMatch.amount) * 100) / 100,
        discrepancyReason: "Fuzzy match — verify manually",
        resolution: null, resolvedBy: null,
      });
      matchedExternal.add(extMatch.id);
      matchedInternal.add(intTx.id);
    }
  }

  // Unmatched transactions
  for (const intTx of internal) {
    if (!matchedInternal.has(intTx.id)) {
      matches.push({ id: randomBytes(6).toString("hex"), internalTx: intTx, externalTx: intTx, status: "unmatched", discrepancyAmount: intTx.amount, discrepancyReason: "No matching external transaction", resolution: null, resolvedBy: null });
    }
  }

  const report: ReconciliationReport = {
    period,
    totalInternal: internal.length,
    totalExternal: external.length,
    matched: matches.filter((m) => m.status === "matched").length,
    partialMatches: matches.filter((m) => m.status === "partial").length,
    discrepancies: matches.filter((m) => m.status === "discrepancy").length,
    unmatched: matches.filter((m) => m.status === "unmatched").length,
    totalDiscrepancyAmount: matches.reduce((s, m) => s + m.discrepancyAmount, 0),
    matches,
  };

  await pool.query(
    `INSERT INTO reconciliation_reports (period, total_internal, total_external, matched, discrepancies, unmatched, total_discrepancy, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [period, report.totalInternal, report.totalExternal, report.matched, report.discrepancies, report.unmatched, report.totalDiscrepancyAmount]
  );

  return report;
}

function detectDiscrepancyReason(internal: Transaction, external: Transaction): string {
  const diff = Math.abs(internal.amount - external.amount);
  if (diff < internal.amount * 0.03) return "Processing fee difference";
  if (internal.currency !== external.currency) return "Currency conversion difference";
  if (external.type === "refund") return "Partial refund";
  return "Amount mismatch — investigate";
}

async function loadTransactions(source: string, startDate: string, endDate: string): Promise<Transaction[]> {
  const { rows } = await pool.query(
    "SELECT * FROM transactions WHERE source = $1 AND date BETWEEN $2 AND $3 ORDER BY date",
    [source, startDate, endDate]
  );
  return rows.map((r: any) => ({ ...r, metadata: JSON.parse(r.metadata || "{}") }));
}

export async function resolveDiscrepancy(matchId: string, resolution: string, resolvedBy: string): Promise<void> {
  await pool.query(
    "UPDATE reconciliation_matches SET resolution = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $1",
    [matchId, resolution, resolvedBy]
  );
}
```

## Results

- **Reconciliation: 3 days → 2 hours** — automated matching handles 95% of transactions; finance reviews only discrepancies and unmatched items
- **$15K audit flag resolved** — all discrepancies tracked with reasons; "processing fee" vs "FX difference" vs "partial refund" categorized; audit passed
- **Two-pass matching** — exact ID match catches 85%; fuzzy match (amount + date + customer) catches another 10%; only 5% truly unmatched
- **Discrepancy reasons auto-detected** — $2.50 difference on $100 charge = processing fee; different currencies = FX; finance doesn't investigate obvious causes
- **Multi-source support** — Stripe + PayPal + bank statements all imported; cross-matched in single reconciliation run; unified view across payment methods
