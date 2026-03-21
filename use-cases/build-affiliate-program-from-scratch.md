---
title: Build an Affiliate Program from Scratch
description: "Build a complete affiliate/referral program — unique tracking links, conversion attribution, affiliate dashboard, and payouts via Stripe Connect."
skills:
  - prisma
  - stripe-billing
difficulty: advanced
time_estimate: "20 hours"
tags: [affiliate, referral, stripe-connect, prisma, tracking, payouts, fraud-detection]
---

# Build an Affiliate Program from Scratch

## The Problem

You're running a SaaS at $5K MRR. You've tried paid ads — too expensive. Content marketing takes months. But your best customers keep telling other people about your product. You want to reward that: give affiliates a unique link, track conversions, and automatically pay 20% recurring commission on every customer they refer.

You need a real affiliate platform, not just a referral link. Affiliates need a dashboard to see their clicks, conversions, and pending commissions. Payouts should go out automatically on the 1st of each month via Stripe Connect (so you don't send wire transfers manually).

## Database Schema

```prisma
// prisma/schema.prisma

model Affiliate {
  id            String        @id @default(cuid())
  userId        String        @unique  // Link to your app's User table
  code          String        @unique  // e.g. "JOHN-X7K2"
  stripeConnectId String?               // Stripe Express account ID for payouts
  commissionPct  Float        @default(20)  // 20% recurring
  status        String        @default("pending")  // pending, active, suspended
  clicks        Int           @default(0)
  conversions   Referral[]
  payouts       Payout[]
  createdAt     DateTime      @default(now())
}

model Referral {
  id          String    @id @default(cuid())
  affiliate   Affiliate @relation(fields: [affiliateId], references: [id])
  affiliateId String
  referredUserId String  // The user who signed up
  status      String    @default("trial")  // trial, paid, churned
  mrr         Float     @default(0)        // Current MRR from this customer
  totalEarned Float     @default(0)        // Lifetime commission earned
  commissions Commission[]
  createdAt   DateTime  @default(now())
}

model Commission {
  id          String   @id @default(cuid())
  referral    Referral @relation(fields: [referralId], references: [id])
  referralId  String
  amount      Float    // Commission amount in USD
  status      String   @default("pending")  // pending, paid
  invoiceId   String?  // Stripe invoice that triggered this
  paidAt      DateTime?
  createdAt   DateTime @default(now())
}

model Payout {
  id          String    @id @default(cuid())
  affiliate   Affiliate @relation(fields: [affiliateId], references: [id])
  affiliateId String
  amount      Float
  status      String    @default("processing")  // processing, paid, failed
  stripeTransferId String?
  createdAt   DateTime  @default(now())
}
```

## Step-by-Step Walkthrough

### Step 1: Generate Unique Referral Links

```typescript
// lib/affiliates.ts — Generate and track referral codes

import { prisma } from './prisma';
import { nanoid } from 'nanoid';

/** Create an affiliate account for a user. */
export async function createAffiliate(userId: string, userName: string): Promise<string> {
  // Collision-resistant code: "JOHN-X7K2"
  const initials = userName.toUpperCase().slice(0, 4).replace(/\s+/g, '');
  const suffix = nanoid(4).toUpperCase();
  const code = `${initials}-${suffix}`;

  await prisma.affiliate.create({
    data: { userId, code, status: 'active' },
  });

  return code;
}

/** Generate a referral URL for a given code. */
export function getReferralUrl(code: string, page = ''): string {
  return `${process.env.NEXT_PUBLIC_URL}${page}?ref=${code}`;
}
```

### Step 2: Cookie-Based Attribution Tracking

```typescript
// middleware.ts — Capture referral code from URL and set cookie

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const ref = request.nextUrl.searchParams.get('ref');

  if (ref) {
    // Set cookie for 30 days — persists through multi-page journeys
    response.cookies.set('ref_code', ref, {
      maxAge: 30 * 24 * 60 * 60,
      httpOnly: true,
      sameSite: 'lax',
    });
    // Also store IP to detect fraud later
    response.cookies.set('ref_ip', request.ip || '', { maxAge: 30 * 24 * 60 * 60, httpOnly: true });
  }

  return response;
}

export const config = { matcher: ['/((?!api|_next|favicon).*)'] };
```

### Step 3: Track Signup Conversion

```typescript
// app/api/auth/signup/route.ts (or wherever users sign up)
// After user is created, check for referral cookie

import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function attributeReferral(newUserId: string, userIP: string) {
  const cookieStore = cookies();
  const refCode = cookieStore.get('ref_code')?.value;
  const refIP = cookieStore.get('ref_ip')?.value;

  if (!refCode) return;

  const affiliate = await prisma.affiliate.findUnique({ where: { code: refCode } });
  if (!affiliate || affiliate.status !== 'active') return;

  // Fraud check: same IP as affiliate's referral visit
  if (refIP === userIP) {
    console.warn(`[AFFILIATE] Suspicious: same IP signup for code ${refCode}`);
    return; // Skip — likely self-referral
  }

  // Check if user was already referred (prevent double attribution)
  const existing = await prisma.referral.findFirst({ where: { referredUserId: newUserId } });
  if (existing) return;

  await prisma.referral.create({
    data: {
      affiliateId: affiliate.id,
      referredUserId: newUserId,
      status: 'trial',
    },
  });

  // Increment affiliate click-to-conversion
  await prisma.affiliate.update({
    where: { id: affiliate.id },
    data: { conversions: { increment: 1 } },
  });
}
```

### Step 4: Track Revenue Conversions via Stripe Webhooks

```typescript
// app/api/webhooks/stripe/route.ts — Commission tracking on payments

import { prisma } from '@/lib/prisma';

// Called when a referred user makes a successful payment
export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  const sub = await stripe.subscriptions.retrieve(invoice.subscription as string);
  const userId = sub.metadata.userId;

  // Find referral for this user
  const referral = await prisma.referral.findFirst({
    where: { referredUserId: userId },
    include: { affiliate: true },
  });
  if (!referral) return;

  const mrr = invoice.amount_paid / 100;  // Convert cents to dollars
  const commission = mrr * (referral.affiliate.commissionPct / 100);

  // Update referral status
  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: 'paid',
      mrr,
      totalEarned: { increment: commission },
    },
  });

  // Record commission
  await prisma.commission.create({
    data: {
      referralId: referral.id,
      amount: commission,
      status: 'pending',
      invoiceId: invoice.id,
    },
  });
}

// Called when a referred user churns
export async function handleSubscriptionCancelled(sub: Stripe.Subscription) {
  const userId = sub.metadata.userId;
  const referral = await prisma.referral.findFirst({ where: { referredUserId: userId } });
  if (referral) {
    await prisma.referral.update({ where: { id: referral.id }, data: { status: 'churned', mrr: 0 } });
  }
}
```

### Step 5: Monthly Payouts via Stripe Connect

```typescript
// scripts/run-monthly-payouts.ts — Runs on the 1st of each month (cron job)

import { prisma } from '../lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const MIN_PAYOUT_THRESHOLD = 25;  // $25 minimum payout

export async function runMonthlyPayouts() {
  // Find all affiliates with pending commissions
  const affiliatesWithCommissions = await prisma.affiliate.findMany({
    where: {
      status: 'active',
      stripeConnectId: { not: null },
      conversions: {
        some: {
          commissions: { some: { status: 'pending' } },
        },
      },
    },
    include: {
      conversions: {
        include: {
          commissions: { where: { status: 'pending' } },
        },
      },
    },
  });

  for (const affiliate of affiliatesWithCommissions) {
    const pendingCommissions = affiliate.conversions.flatMap(r => r.commissions);
    const totalAmount = pendingCommissions.reduce((sum, c) => sum + c.amount, 0);

    if (totalAmount < MIN_PAYOUT_THRESHOLD) {
      console.log(`Skipping ${affiliate.code}: $${totalAmount.toFixed(2)} below threshold`);
      continue;
    }

    try {
      // Transfer to affiliate's Stripe Connect account
      const transfer = await stripe.transfers.create({
        amount: Math.floor(totalAmount * 100),  // Convert to cents
        currency: 'usd',
        destination: affiliate.stripeConnectId!,
        description: `Affiliate commission — ${new Date().toLocaleDateString('en', { month: 'long', year: 'numeric' })}`,
      });

      // Mark commissions as paid
      const commissionIds = pendingCommissions.map(c => c.id);
      await prisma.commission.updateMany({
        where: { id: { in: commissionIds } },
        data: { status: 'paid', paidAt: new Date() },
      });

      // Record payout
      await prisma.payout.create({
        data: {
          affiliateId: affiliate.id,
          amount: totalAmount,
          status: 'paid',
          stripeTransferId: transfer.id,
        },
      });

      console.log(`Paid ${affiliate.code}: $${totalAmount.toFixed(2)} via ${transfer.id}`);
    } catch (err) {
      console.error(`Failed payout for ${affiliate.code}:`, err);
      await prisma.payout.create({
        data: { affiliateId: affiliate.id, amount: totalAmount, status: 'failed' },
      });
    }
  }
}
```

### Step 6: Affiliate Dashboard

```tsx
// app/affiliate/dashboard/page.tsx — Affiliate performance dashboard

import { auth } from '@clerk/nextjs';
import { prisma } from '@/lib/prisma';

export default async function AffiliateDashboard() {
  const { userId } = auth();
  const affiliate = await prisma.affiliate.findUnique({
    where: { userId: userId! },
    include: {
      conversions: { include: { commissions: true } },
      payouts: { orderBy: { createdAt: 'desc' }, take: 12 },
    },
  });

  if (!affiliate) return <p>You're not an affiliate yet. <a href="/affiliate/join">Apply here</a></p>;

  const pendingCommission = affiliate.conversions
    .flatMap(r => r.commissions)
    .filter(c => c.status === 'pending')
    .reduce((sum, c) => sum + c.amount, 0);

  const totalEarned = affiliate.conversions.reduce((sum, r) => sum + r.totalEarned, 0);
  const activeReferrals = affiliate.conversions.filter(r => r.status === 'paid').length;
  const referralUrl = `${process.env.NEXT_PUBLIC_URL}?ref=${affiliate.code}`;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold">Affiliate Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Referral link', value: referralUrl, copyable: true },
          { label: 'Active referrals', value: activeReferrals },
          { label: 'Pending commission', value: `$${pendingCommission.toFixed(2)}` },
          { label: 'Total earned', value: `$${totalEarned.toFixed(2)}` },
        ].map(stat => (
          <div key={stat.label} className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className="font-bold text-lg truncate">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Referrals */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Your referrals</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left">
            <th className="py-2">Referred at</th>
            <th>Status</th>
            <th>MRR</th>
            <th>Earned</th>
          </tr></thead>
          <tbody>
            {affiliate.conversions.map(ref => (
              <tr key={ref.id} className="border-b">
                <td className="py-2">{ref.createdAt.toLocaleDateString()}</td>
                <td><span className={`px-2 py-0.5 rounded text-xs ${ref.status === 'paid' ? 'bg-green-100 text-green-800' : 'bg-gray-100'}`}>{ref.status}</span></td>
                <td>${ref.mrr.toFixed(2)}/mo</td>
                <td>${ref.totalEarned.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

## Fraud Detection Checklist

- **Same-IP filter:** Don't attribute referrals from the same IP as the affiliate's visit
- **Minimum payout threshold:** $25 prevents cash-out abuse with tiny fake signups
- **30-day cookie window:** Referrals only count within 30 days of clicking the link
- **Trial-to-paid requirement:** Don't pay commission until the referred user pays (not just signs up)
- **Stripe chargeback monitoring:** Claw back commissions if the referred customer disputes their payment
- **Manual review queue:** Flag affiliates with conversion rates >30% (suspiciously high)

## Related Skills

- [prisma](../skills/prisma/) — Schema design, commission tracking queries
- [stripe-billing](../skills/stripe-billing/) — Stripe Connect for affiliate payouts, webhook events
