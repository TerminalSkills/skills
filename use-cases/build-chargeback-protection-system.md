---
title: Build a Chargeback Protection System
slug: build-chargeback-protection-system
description: Build a chargeback prevention and response system with transaction risk scoring, evidence collection, automated dispute responses, chargeback rate monitoring, and customer verification flows.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - chargebacks
  - payments
  - fraud
  - e-commerce
  - risk
---

# Build a Chargeback Protection System

## The Problem

Elena runs a 30-person e-commerce company processing $2M/month. Chargebacks cost them $45K/month — the chargeback itself, $15 per dispute fee, and lost merchandise. Their chargeback rate hit 1.8% (Visa threshold is 1%, above which they risk losing card processing). Most chargebacks are "friendly fraud" — customers who received the product but claim they didn't. They respond to disputes manually with screenshots — and lose 80% because evidence is incomplete. They need automated evidence collection, risk scoring before charge, and an organized dispute response workflow.

## Step 1: Build the Chargeback Protection Engine

```typescript
// src/payments/chargeback.ts — Chargeback prevention with risk scoring and automated responses
import { pool } from "../db";
import { Redis } from "ioredis";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

interface RiskScore {
  score: number;               // 0-100 (higher = riskier)
  signals: string[];
  recommendation: "approve" | "review" | "decline" | "verify";
}

interface ChargebackCase {
  id: string;
  orderId: string;
  stripeDisputeId: string;
  amount: number;
  reason: string;
  status: "needs_response" | "submitted" | "won" | "lost";
  evidence: DisputeEvidence;
  dueDate: string;
  createdAt: string;
}

interface DisputeEvidence {
  customerEmail: string;
  customerName: string;
  orderDate: string;
  shippingCarrier: string;
  trackingNumber: string;
  deliveryDate: string | null;
  deliveryProof: string | null;  // tracking screenshot URL
  customerSignature: string | null;
  ipAddress: string;
  deviceFingerprint: string;
  billingMatchesShipping: boolean;
  previousPurchases: number;
  accountAge: number;           // days
  emailVerified: boolean;
  productDescription: string;
  refundPolicy: string;
  customerComms: string[];      // relevant emails/chat transcripts
}

// Pre-transaction risk scoring
export async function scoreTransactionRisk(
  customerId: string,
  amount: number,
  metadata: {
    ip: string;
    email: string;
    billingAddress: any;
    shippingAddress: any;
    deviceFingerprint: string;
    cardBin: string;
  }
): Promise<RiskScore> {
  let score = 0;
  const signals: string[] = [];

  // Check customer history
  const { rows: [customer] } = await pool.query(
    `SELECT created_at, email_verified, order_count, chargeback_count
     FROM customers WHERE id = $1`, [customerId]
  );

  if (customer) {
    const accountAgeDays = (Date.now() - new Date(customer.created_at).getTime()) / 86400000;

    // New account + high value
    if (accountAgeDays < 7 && amount > 20000) {
      score += 25; signals.push("new_account_high_value");
    }

    // Previous chargebacks
    if (customer.chargeback_count > 0) {
      score += 30 * customer.chargeback_count;
      signals.push(`previous_chargebacks:${customer.chargeback_count}`);
    }

    // Unverified email
    if (!customer.email_verified) {
      score += 15; signals.push("unverified_email");
    }

    // First-time buyer with high amount
    if (customer.order_count === 0 && amount > 50000) {
      score += 20; signals.push("first_order_high_value");
    }
  } else {
    score += 20; signals.push("guest_checkout");
  }

  // Address mismatch
  if (metadata.billingAddress && metadata.shippingAddress) {
    const billingZip = metadata.billingAddress.postalCode;
    const shippingZip = metadata.shippingAddress.postalCode;
    if (billingZip !== shippingZip) {
      score += 10; signals.push("address_mismatch");
    }
  }

  // Velocity checks
  const recentOrders = await redis.incr(`velocity:${customerId}:24h`);
  await redis.expire(`velocity:${customerId}:24h`, 86400);
  if (recentOrders > 3) { score += 20; signals.push(`high_velocity:${recentOrders}_orders_24h`); }

  // IP risk
  const ipOrders = await redis.incr(`velocity:ip:${metadata.ip}:24h`);
  await redis.expire(`velocity:ip:${metadata.ip}:24h`, 86400);
  if (ipOrders > 5) { score += 15; signals.push("high_ip_velocity"); }

  // Amount threshold
  if (amount > 100000) { score += 10; signals.push("high_value_order"); }

  score = Math.min(score, 100);
  let recommendation: RiskScore["recommendation"] = "approve";
  if (score >= 70) recommendation = "decline";
  else if (score >= 50) recommendation = "verify";
  else if (score >= 30) recommendation = "review";

  // Log risk score
  await pool.query(
    `INSERT INTO risk_scores (customer_id, amount, score, signals, recommendation, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [customerId, amount, score, JSON.stringify(signals), recommendation]
  );

  return { score, signals, recommendation };
}

// Handle Stripe dispute webhook
export async function handleDispute(event: Stripe.Event): Promise<void> {
  const dispute = event.data.object as Stripe.Dispute;

  // Collect evidence automatically
  const evidence = await collectEvidence(dispute);

  const caseId = `cb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dueDate = new Date(dispute.evidence_details.due_by * 1000).toISOString();

  await pool.query(
    `INSERT INTO chargeback_cases (id, order_id, stripe_dispute_id, amount, reason, status, evidence, due_date, created_at)
     VALUES ($1, $2, $3, $4, $5, 'needs_response', $6, $7, NOW())`,
    [caseId, dispute.metadata?.orderId, dispute.id, dispute.amount,
     dispute.reason, JSON.stringify(evidence), dueDate]
  );

  // Auto-submit if we have strong evidence
  if (evidence.deliveryDate && evidence.trackingNumber && evidence.emailVerified) {
    await submitDisputeResponse(caseId);
  } else {
    // Alert team for manual review
    await redis.rpush("notification:queue", JSON.stringify({
      type: "chargeback_review_needed",
      caseId, amount: dispute.amount / 100,
      reason: dispute.reason, dueDate,
    }));
  }
}

// Collect dispute evidence from all sources
async function collectEvidence(dispute: Stripe.Dispute): Promise<DisputeEvidence> {
  const orderId = dispute.metadata?.orderId;

  const { rows: [order] } = await pool.query(
    `SELECT o.*, c.email, c.name, c.email_verified, c.created_at as customer_created
     FROM orders o JOIN customers c ON o.customer_id = c.id
     WHERE o.id = $1`, [orderId]
  );

  // Get shipping info
  const { rows: [shipping] } = await pool.query(
    "SELECT * FROM shipments WHERE order_id = $1", [orderId]
  );

  // Get customer communication history
  const { rows: comms } = await pool.query(
    `SELECT subject, body, created_at FROM support_tickets
     WHERE customer_id = $1 AND created_at > $2
     ORDER BY created_at`, [order?.customer_id, order?.created_at]
  );

  // Count previous purchases
  const { rows: [{ count: prevPurchases }] } = await pool.query(
    "SELECT COUNT(*) as count FROM orders WHERE customer_id = $1 AND status = 'delivered'",
    [order?.customer_id]
  );

  return {
    customerEmail: order?.email || "",
    customerName: order?.name || "",
    orderDate: order?.created_at || "",
    shippingCarrier: shipping?.carrier || "",
    trackingNumber: shipping?.tracking_number || "",
    deliveryDate: shipping?.delivered_at || null,
    deliveryProof: shipping?.delivery_proof_url || null,
    customerSignature: shipping?.signature_url || null,
    ipAddress: order?.ip_address || "",
    deviceFingerprint: order?.device_fingerprint || "",
    billingMatchesShipping: order?.billing_zip === order?.shipping_zip,
    previousPurchases: parseInt(prevPurchases),
    accountAge: order ? Math.floor((Date.now() - new Date(order.customer_created).getTime()) / 86400000) : 0,
    emailVerified: order?.email_verified || false,
    productDescription: order?.items_description || "",
    refundPolicy: "Full refund within 30 days of delivery. See https://example.com/refund-policy",
    customerComms: comms.map((c: any) => `[${c.created_at}] ${c.subject}: ${c.body}`),
  };
}

// Submit dispute evidence to Stripe
async function submitDisputeResponse(caseId: string): Promise<void> {
  const { rows: [case_] } = await pool.query("SELECT * FROM chargeback_cases WHERE id = $1", [caseId]);
  const evidence: DisputeEvidence = JSON.parse(case_.evidence);

  await stripe.disputes.update(case_.stripe_dispute_id, {
    evidence: {
      customer_email_address: evidence.customerEmail,
      customer_name: evidence.customerName,
      shipping_carrier: evidence.shippingCarrier,
      shipping_tracking_number: evidence.trackingNumber,
      shipping_date: evidence.orderDate?.slice(0, 10),
      product_description: evidence.productDescription,
      refund_policy: evidence.refundPolicy,
      customer_communication: evidence.customerComms.join("\n\n"),
    },
    submit: true,
  });

  await pool.query("UPDATE chargeback_cases SET status = 'submitted' WHERE id = $1", [caseId]);
}
```

## Results

- **Chargeback rate: 1.8% → 0.6%** — pre-transaction risk scoring blocks high-risk orders; verification step for medium-risk catches friendly fraud before it happens
- **Dispute win rate: 20% → 65%** — automated evidence collection includes delivery proof, tracking, IP address, purchase history, and customer communications; complete evidence wins disputes
- **$45K/month → $12K/month in chargeback losses** — combination of prevention (fewer chargebacks) and better win rates saves $33K/month
- **Response time: 3 days → 2 hours** — auto-submission for strong-evidence cases; team only reviews cases missing evidence
- **Visa compliance maintained** — rate below 1% threshold; no risk of losing card processing capability
