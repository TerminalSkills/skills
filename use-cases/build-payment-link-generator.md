---
title: Build a Payment Link Generator
slug: build-payment-link-generator
description: Build a payment link system with customizable checkout pages, expiring links, partial payments, multi-currency support, branded receipts, and conversion analytics.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - payments
  - checkout
  - stripe
  - invoicing
  - e-commerce
---

# Build a Payment Link Generator

## The Problem

Marta runs a 15-person agency. Invoicing is manual: create PDF, email it, hope the client pays. 40% of invoices are paid late. Clients ask "can I pay by card?" but the agency only accepts wire transfers. They tried Stripe Payment Links but can't customize the page, track which links convert, set expiration dates, or allow partial payments for large projects. They need branded payment links they can send via email or embed in proposals — with tracking, expiry, and flexible payment options.

## Step 1: Build the Payment Link Engine

```typescript
// src/payments/links.ts — Payment links with branding, expiry, partial payments, and analytics
import { pool } from "../db";
import { Redis } from "ioredis";
import Stripe from "stripe";
import { createHash, randomBytes } from "node:crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const redis = new Redis(process.env.REDIS_URL!);

interface PaymentLink {
  id: string;
  shortCode: string;
  url: string;
  title: string;
  description: string;
  amount: number;              // cents
  currency: string;
  status: "active" | "paid" | "expired" | "cancelled";
  settings: {
    expiresAt: string | null;
    allowPartial: boolean;
    minPartialAmount: number;
    maxUses: number;           // 0 = single use
    collectAddress: boolean;
    collectPhone: boolean;
    customFields: Array<{ label: string; required: boolean }>;
    successUrl: string | null;
    successMessage: string;
    metadata: Record<string, string>;
  };
  branding: {
    companyName: string;
    logoUrl: string | null;
    accentColor: string;
    footerText: string;
  };
  payments: PaymentRecord[];
  totalPaid: number;
  remainingAmount: number;
  createdBy: string;
  createdAt: string;
}

interface PaymentRecord {
  id: string;
  amount: number;
  stripePaymentId: string;
  customerEmail: string;
  customerName: string;
  paidAt: string;
}

// Create payment link
export async function createPaymentLink(params: {
  title: string;
  description?: string;
  amount: number;
  currency?: string;
  expiresIn?: number;          // hours
  allowPartial?: boolean;
  minPartialAmount?: number;
  maxUses?: number;
  collectAddress?: boolean;
  customFields?: Array<{ label: string; required: boolean }>;
  successMessage?: string;
  branding?: Partial<PaymentLink["branding"]>;
  metadata?: Record<string, string>;
  createdBy: string;
}): Promise<PaymentLink> {
  const id = `pl-${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const shortCode = randomBytes(6).toString("base64url");

  const link: PaymentLink = {
    id,
    shortCode,
    url: `${process.env.APP_URL}/pay/${shortCode}`,
    title: params.title,
    description: params.description || "",
    amount: params.amount,
    currency: params.currency || "USD",
    status: "active",
    settings: {
      expiresAt: params.expiresIn ? new Date(Date.now() + params.expiresIn * 3600000).toISOString() : null,
      allowPartial: params.allowPartial || false,
      minPartialAmount: params.minPartialAmount || 500, // $5 minimum
      maxUses: params.maxUses || 1,
      collectAddress: params.collectAddress || false,
      collectPhone: false,
      customFields: params.customFields || [],
      successUrl: null,
      successMessage: params.successMessage || "Payment received. Thank you!",
      metadata: params.metadata || {},
    },
    branding: {
      companyName: params.branding?.companyName || process.env.COMPANY_NAME || "",
      logoUrl: params.branding?.logoUrl || null,
      accentColor: params.branding?.accentColor || "#228BE6",
      footerText: params.branding?.footerText || "",
    },
    payments: [],
    totalPaid: 0,
    remainingAmount: params.amount,
    createdBy: params.createdBy,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO payment_links (id, short_code, title, description, amount, currency, status, settings, branding, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, $8, $9, NOW())`,
    [id, shortCode, link.title, link.description, link.amount, link.currency,
     JSON.stringify(link.settings), JSON.stringify(link.branding), params.createdBy]
  );

  // Cache for fast lookup
  await redis.setex(`paylink:${shortCode}`, 86400 * 90, JSON.stringify(link));

  // Track view analytics
  await redis.hset(`paylink:stats:${id}`, { created: Date.now(), views: 0, payments: 0 });

  return link;
}

// Get payment link by short code (checkout page)
export async function getPaymentLink(shortCode: string, trackView: boolean = true): Promise<PaymentLink | null> {
  const cached = await redis.get(`paylink:${shortCode}`);
  let link: PaymentLink;

  if (cached) {
    link = JSON.parse(cached);
  } else {
    const { rows: [row] } = await pool.query("SELECT * FROM payment_links WHERE short_code = $1", [shortCode]);
    if (!row) return null;
    link = parsePaymentLink(row);
  }

  // Check expiry
  if (link.settings.expiresAt && new Date(link.settings.expiresAt) < new Date()) {
    if (link.status === "active") {
      link.status = "expired";
      await pool.query("UPDATE payment_links SET status = 'expired' WHERE id = $1", [link.id]);
      await redis.setex(`paylink:${shortCode}`, 86400, JSON.stringify(link));
    }
  }

  if (trackView) {
    await redis.hincrby(`paylink:stats:${link.id}`, "views", 1);
  }

  return link;
}

// Process payment for a link
export async function processPayment(
  shortCode: string,
  paymentMethodId: string,
  amount: number,
  customerInfo: { email: string; name: string; address?: any }
): Promise<{ success: boolean; error?: string; receiptUrl?: string }> {
  const link = await getPaymentLink(shortCode, false);
  if (!link) return { success: false, error: "Payment link not found" };
  if (link.status !== "active") return { success: false, error: `Payment link is ${link.status}` };

  // Validate amount
  const payableAmount = link.settings.allowPartial ? amount : link.remainingAmount;
  if (link.settings.allowPartial) {
    if (amount < link.settings.minPartialAmount) {
      return { success: false, error: `Minimum payment is $${(link.settings.minPartialAmount / 100).toFixed(2)}` };
    }
    if (amount > link.remainingAmount) {
      return { success: false, error: `Maximum payment is $${(link.remainingAmount / 100).toFixed(2)}` };
    }
  }

  // Create Stripe payment
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: payableAmount,
      currency: link.currency.toLowerCase(),
      payment_method: paymentMethodId,
      confirm: true,
      receipt_email: customerInfo.email,
      description: link.title,
      metadata: { paymentLinkId: link.id, ...link.settings.metadata },
      automatic_payment_methods: { enabled: true, allow_redirects: "never" },
    });

    if (paymentIntent.status !== "succeeded") {
      return { success: false, error: "Payment failed. Please try again." };
    }

    // Record payment
    const payment: PaymentRecord = {
      id: paymentIntent.id,
      amount: payableAmount,
      stripePaymentId: paymentIntent.id,
      customerEmail: customerInfo.email,
      customerName: customerInfo.name,
      paidAt: new Date().toISOString(),
    };

    link.payments.push(payment);
    link.totalPaid += payableAmount;
    link.remainingAmount = link.amount - link.totalPaid;

    // Check if fully paid
    if (link.remainingAmount <= 0) {
      link.status = "paid";
    }

    // Check usage limit
    if (link.settings.maxUses > 0 && link.payments.length >= link.settings.maxUses) {
      link.status = "paid";
    }

    await pool.query(
      `UPDATE payment_links SET status = $2, total_paid = $3, remaining_amount = $4 WHERE id = $1`,
      [link.id, link.status, link.totalPaid, link.remainingAmount]
    );

    await pool.query(
      `INSERT INTO payment_link_payments (link_id, stripe_payment_id, amount, customer_email, customer_name, paid_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [link.id, paymentIntent.id, payableAmount, customerInfo.email, customerInfo.name]
    );

    await redis.setex(`paylink:${shortCode}`, 86400 * 90, JSON.stringify(link));
    await redis.hincrby(`paylink:stats:${link.id}`, "payments", 1);

    return { success: true, receiptUrl: paymentIntent.charges?.data?.[0]?.receipt_url || undefined };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// Analytics
export async function getLinkAnalytics(linkId: string): Promise<{
  views: number; payments: number; conversionRate: number;
  totalCollected: number; averagePayment: number;
}> {
  const stats = await redis.hgetall(`paylink:stats:${linkId}`);
  const views = parseInt(stats.views || "0");
  const payments = parseInt(stats.payments || "0");

  const { rows: [totals] } = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) as total, COALESCE(AVG(amount), 0) as avg FROM payment_link_payments WHERE link_id = $1",
    [linkId]
  );

  return {
    views, payments,
    conversionRate: views > 0 ? (payments / views) * 100 : 0,
    totalCollected: parseInt(totals.total),
    averagePayment: Math.round(parseFloat(totals.avg)),
  };
}

function parsePaymentLink(row: any): PaymentLink {
  return { ...row, settings: JSON.parse(row.settings), branding: JSON.parse(row.branding), payments: [], totalPaid: row.total_paid || 0, remainingAmount: row.remaining_amount || row.amount };
}
```

## Results

- **Late payments: 40% → 12%** — clients pay by card in 2 clicks from the email; no bank transfers, no "I'll do it later"
- **Partial payments for large projects** — $50K project split into 3 milestones; client pays each link as work is delivered; no manual invoice tracking
- **Branded checkout** — agency logo and colors on the payment page; feels professional, not like a generic Stripe form
- **Link expiry prevents stale invoices** — 7-day expiry on quotes; creates urgency; expired links show "this offer has ended"
- **Conversion tracking** — "This link was viewed 15 times but never paid" tells the team to follow up; overall view-to-pay conversion is 68%
