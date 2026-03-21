---
title: "Build a Subscription Management Portal"
description: "Build a customer self-service billing portal — upgrade, downgrade, proration preview, PDF invoices, cancel flow with save attempt, and card management."
skills: [stripe, nextjs]
difficulty: intermediate
time_estimate: "5 hours"
tags: [stripe, billing, subscriptions, nextjs, invoices, portal, payments, saas]
---

# Build a Subscription Management Portal

## The Problem

80% of your billing support tickets are customers asking "can you downgrade my plan?" or "where's my invoice?". You're manually processing things that Stripe can handle automatically. Build a self-service portal and reclaim your support bandwidth.

**Goal:** Customers can upgrade, downgrade, see proration preview, download invoices, update their card, and cancel — without emailing you.

---

## Who This Is For

**SaaS founder** who wants to eliminate billing support tickets. You'll use Stripe's APIs to build a custom portal that matches your brand better than the hosted Stripe Customer Portal.

---

## Step 1: Stripe Setup

```bash
pnpm add stripe @stripe/stripe-js @stripe/react-stripe-js
```

```typescript
// lib/stripe.ts
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-04-10",
  typescript: true,
});

// Client-safe publishable key
export const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!;
```

---

## Step 2: Prisma Schema

```prisma
model User {
  id               String   @id @default(cuid())
  email            String   @unique
  name             String?
  stripeCustomerId String?  @unique
  subscriptions    Subscription[]
}

model Subscription {
  id                   String    @id @default(cuid())
  userId               String
  stripeSubId          String    @unique
  stripePriceId        String
  stripeProductId      String
  status               String    // active | canceled | past_due | trialing
  planName             String
  planInterval         String    // month | year
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean   @default(false)
  canceledAt           DateTime?
  trialEnd             DateTime?

  user User @relation(fields: [userId], references: [id])
}
```

---

## Step 3: Subscription Status Page

```tsx
// app/billing/page.tsx
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { PlanCard } from "./_components/plan-card";
import { InvoiceList } from "./_components/invoice-list";
import { PaymentMethod } from "./_components/payment-method";

export default async function BillingPage() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { subscriptions: true },
  });

  const subscription = user?.subscriptions.find((s) => s.status === "active");

  // Fetch upcoming invoice for proration display
  let upcomingInvoice = null;
  if (subscription && user?.stripeCustomerId) {
    upcomingInvoice = await stripe.invoices.retrieveUpcoming({
      customer: user.stripeCustomerId,
    });
  }

  // Fetch payment method
  const paymentMethods = user?.stripeCustomerId
    ? await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: "card",
      })
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-8 py-8">
      <h1 className="text-2xl font-bold">Billing & Subscription</h1>

      <PlanCard
        subscription={subscription}
        upcomingInvoice={upcomingInvoice}
      />

      <PaymentMethod
        methods={paymentMethods?.data ?? []}
        customerId={user?.stripeCustomerId}
      />

      <InvoiceList customerId={user?.stripeCustomerId} />
    </div>
  );
}
```

---

## Step 4: Plan Upgrade/Downgrade with Proration Preview

```typescript
// app/api/billing/preview-change/route.ts
import { stripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const { newPriceId } = await request.json();
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { subscriptions: { where: { status: "active" } } },
  });

  const sub = user?.subscriptions[0];
  if (!sub || !user?.stripeCustomerId) {
    return Response.json({ error: "No active subscription" }, { status: 400 });
  }

  // Preview what the proration will look like
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);
  const prorationDate = Math.floor(Date.now() / 1000);

  const preview = await stripe.invoices.retrieveUpcoming({
    customer: user.stripeCustomerId,
    subscription: sub.stripeSubId,
    subscription_items: [
      {
        id: stripeSub.items.data[0].id,
        price: newPriceId,
      },
    ],
    subscription_proration_date: prorationDate,
  });

  return Response.json({
    amountDue: preview.amount_due,
    currency: preview.currency,
    prorationDate,
    lines: preview.lines.data.map((line) => ({
      description: line.description,
      amount: line.amount,
    })),
  });
}
```

```typescript
// app/api/billing/change-plan/route.ts
export async function POST(request: Request) {
  const { newPriceId, prorationDate } = await request.json();
  const session = await auth();

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    include: { subscriptions: { where: { status: "active" } } },
  });

  const sub = user?.subscriptions[0];
  if (!sub) return Response.json({ error: "No subscription" }, { status: 400 });

  const stripeSub = await stripe.subscriptions.retrieve(sub.stripeSubId);

  // Apply the plan change with proration
  await stripe.subscriptions.update(sub.stripeSubId, {
    items: [{ id: stripeSub.items.data[0].id, price: newPriceId }],
    proration_date: prorationDate,
    proration_behavior: "always_invoice",
  });

  return Response.json({ ok: true });
}
```

---

## Step 5: Invoice History with PDF Download

```typescript
// app/api/billing/invoices/route.ts
import { stripe } from "@/lib/stripe";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) return Response.json({ invoices: [] });

  const invoices = await stripe.invoices.list({
    customer: user.stripeCustomerId,
    limit: 24,
  });

  return Response.json({
    invoices: invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      created: inv.created,
      pdfUrl: inv.invoice_pdf,
      hostedUrl: inv.hosted_invoice_url,
    })),
  });
}
```

```tsx
// app/billing/_components/invoice-list.tsx
"use client";

import { useEffect, useState } from "react";

type Invoice = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  currency: string;
  created: number;
  pdfUrl: string | null;
};

export function InvoiceList({ customerId }: { customerId?: string | null }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    fetch("/api/billing/invoices")
      .then((r) => r.json())
      .then((d) => setInvoices(d.invoices));
  }, []);

  return (
    <div className="rounded-xl border">
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold">Invoice History</h2>
      </div>
      <div className="divide-y">
        {invoices.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between px-6 py-4">
            <div>
              <p className="font-medium">{inv.number ?? inv.id}</p>
              <p className="text-sm text-gray-500">
                {new Date(inv.created * 1000).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium">
                {(inv.amountPaid / 100).toFixed(2)} {inv.currency.toUpperCase()}
              </span>
              {inv.pdfUrl && (
                <a
                  href={inv.pdfUrl}
                  target="_blank"
                  className="text-sm text-indigo-600 hover:underline"
                >
                  Download PDF
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Step 6: Cancel Flow with Save Attempt

```tsx
// app/billing/_components/cancel-flow.tsx
"use client";

import { useState } from "react";

type Step = "confirm" | "save-attempt" | "canceled";

export function CancelFlow({ subscriptionId }: { subscriptionId: string }) {
  const [step, setStep] = useState<Step>("confirm");
  const [loading, setLoading] = useState(false);

  async function acceptDiscount() {
    setLoading(true);
    await fetch("/api/billing/apply-discount", { method: "POST" });
    setLoading(false);
    // redirect to billing page with success message
  }

  async function confirmCancel() {
    setLoading(true);
    await fetch("/api/billing/cancel", { method: "POST" });
    setLoading(false);
    setStep("canceled");
  }

  if (step === "save-attempt") {
    return (
      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 space-y-4">
        <h3 className="font-semibold text-lg">Wait — before you go</h3>
        <p className="text-gray-600">
          We'd like to offer you <strong>30% off for the next 3 months</strong>.
          No strings attached.
        </p>
        <div className="flex gap-3">
          <button
            onClick={acceptDiscount}
            disabled={loading}
            className="btn-primary"
          >
            Apply discount & stay
          </button>
          <button
            onClick={confirmCancel}
            disabled={loading}
            className="btn-ghost text-red-600"
          >
            Cancel anyway
          </button>
        </div>
      </div>
    );
  }

  if (step === "canceled") {
    return (
      <p className="text-gray-600">
        Your subscription has been canceled. You'll retain access until{" "}
        <strong>end of billing period</strong>.
      </p>
    );
  }

  return (
    <button
      onClick={() => setStep("save-attempt")}
      className="text-sm text-red-600 hover:underline"
    >
      Cancel subscription
    </button>
  );
}
```

---

## Step 7: Webhook Handler (Keep DB in Sync)

```typescript
// app/api/stripe/webhook/route.ts
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubId: sub.id },
        data: {
          status: sub.status,
          cancelAtPeriodEnd: sub.cancel_at_period_end,
          canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : null,
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        },
      });
      break;
    }
  }

  return Response.json({ received: true });
}
```

---

## Result

- ✅ Plan upgrade/downgrade with live proration preview
- ✅ Invoice history with one-click PDF download
- ✅ Cancel flow with save attempt (discount offer)
- ✅ Payment method management via Stripe Elements
- ✅ Webhook handler keeps local DB in sync
- ✅ Zero billing support tickets for common operations

**Payoff:** Customers handle their own billing 24/7. Your support team focuses on real problems instead of plan changes.
