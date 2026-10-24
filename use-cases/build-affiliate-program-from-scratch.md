---
title: Build an Affiliate Program from Scratch
slug: build-affiliate-program-from-scratch
description: "Build a complete affiliate/referral program — unique tracking links, conversion attribution, affiliate dashboard, and payouts via Stripe Connect."
skills:
  - prisma
  - stripe-billing
category: business
difficulty: advanced
time_estimate: "20 hours"
tags: [affiliate, referral, stripe-connect, prisma, tracking, payouts, fraud-detection]
---

# Build an Affiliate Program from Scratch

## The Problem

You're running a SaaS at $5K MRR. Paid ads are too expensive and content marketing is slow, but your best customers already tell other people about the product. You want to give affiliates a unique link, track conversions, show them a dashboard, and pay 20% recurring commission each month through Stripe Connect instead of manual wire transfers.

## The Solution

Three small pieces: a **Prisma** schema for affiliates, referrals, commissions and payouts (money in integer cents); a first-touch referral cookie set by the Next.js proxy and turned into a `Referral` at signup; and **Stripe** webhooks that create one commission per paid invoice, plus a monthly job that pays commissions to affiliates' Connect Express accounts. The code was written against `prisma@7.10`, `stripe@23` and Next.js 16, and type-checks together.

Install with `npm install @prisma/client@7 @prisma/adapter-pg@7 pg stripe` and `npm install -D prisma@7`. The `prisma` CLI package's `latest` tag currently points at an 8.0 release candidate, so the major version is pinned to match the client.

## Step-by-Step Walkthrough

### Step 1: Schema

Prisma 7 keeps the database URL out of the schema (it lives in `prisma.config.ts`), uses the `prisma-client` generator with an explicit output folder, and takes a driver adapter.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
datasource db {
  provider = "postgresql"
}
model Affiliate {
  id              String     @id @default(cuid())
  userId          String     @unique              // your app's user id
  code            String     @unique              // e.g. "JOHN-9F2C1A"
  stripeAccountId String?                         // Connect Express account (acct_...)
  commissionPct   Int        @default(20)
  status          String     @default("pending")  // pending | active | suspended
  referrals       Referral[]
  payouts         Payout[]
}
model Referral {
  id             String       @id @default(cuid())
  affiliate      Affiliate    @relation(fields: [affiliateId], references: [id])
  affiliateId    String
  referredUserId String       @unique              // first touch wins
  status         String       @default("trial")    // trial | paid | churned
  commissions    Commission[]
  createdAt      DateTime     @default(now())
}
model Commission {
  id              String   @id @default(cuid())
  referral        Referral @relation(fields: [referralId], references: [id])
  referralId      String
  amountCents     Int
  status          String   @default("pending")    // pending | paid | reversed
  invoiceId       String   @unique                // a retried webhook cannot pay twice
  paymentIntentId String?                         // finds the commission on refund or dispute
  payout          Payout?  @relation(fields: [payoutId], references: [id])
  payoutId        String?
  createdAt       DateTime @default(now())
}
model Payout {
  id               String       @id @default(cuid())
  affiliate        Affiliate    @relation(fields: [affiliateId], references: [id])
  affiliateId      String
  amountCents      Int
  status           String       @default("processing")  // processing | paid | failed
  stripeTransferId String?
  commissions      Commission[]
}
```

```typescript
// lib/prisma.ts (prisma.config.ts: defineConfig({ schema: "prisma/schema.prisma", datasource: { url: process.env.DATABASE_URL } }))
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaClient } from "../generated/prisma/client";
export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
```

Run `npx prisma migrate dev` to create the tables. Money is integer cents (no float rounding); `Commission.invoiceId` and `Referral.referredUserId` are unique, which is what makes the later steps safe to retry.

### Step 2: Generate referral links

The link is `${NEXT_PUBLIC_URL}/?ref=<code>`. Generate the code from random bytes so it cannot be guessed, and store it with the affiliate:

```typescript
// lib/affiliates.ts
const code = `${prefix.toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`; // e.g. JOHN-9F2C1A
await prisma.affiliate.create({ data: { userId, code, status: "active" } });
```

### Step 3: Cookie-based attribution

In Next.js 16 the `middleware.ts` convention is deprecated and renamed to `proxy.ts` (the exported function is `proxy`), and `request.ip` no longer exists. Matching a visitor's IP to the signup is also unreliable (shared offices, VPNs, mobile carriers), so the self-referral check below compares user ids instead.

```typescript
// proxy.ts
import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const ref = request.nextUrl.searchParams.get("ref");

  // First touch wins: do not overwrite an existing referral cookie
  if (ref && /^[A-Z0-9-]{4,20}$/i.test(ref) && !request.cookies.has("ref_code")) {
    response.cookies.set("ref_code", ref.toUpperCase(), {
      maxAge: 30 * 24 * 60 * 60, httpOnly: true, sameSite: "lax", path: "/", // 30-day window
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}

export const config = { matcher: ["/((?!api|_next|favicon.ico).*)"] };
```

### Step 4: Attribute the signup

Call this from your signup handler right after the user is created (`cookies()` is async in Next.js 15+):

```typescript
// lib/attribute.ts
import { cookies } from "next/headers";
import { prisma } from "./prisma";

export async function attributeReferral(newUserId: string): Promise<void> {
  const refCode = (await cookies()).get("ref_code")?.value;
  const affiliate = refCode ? await prisma.affiliate.findUnique({ where: { code: refCode } }) : null;
  if (!affiliate || affiliate.status !== "active" || affiliate.userId === newUserId) return; // also blocks self-referral

  // referredUserId is unique, so a second attribution for the same user is a no-op
  await prisma.referral.upsert({
    where: { referredUserId: newUserId },
    create: { affiliateId: affiliate.id, referredUserId: newUserId },
    update: {},
  });
}
```

### Step 5: Turn paid invoices into commissions

Use the stripe-billing skill's webhook pattern: verify the signature against the raw body, then act on `invoice.paid`. In current Stripe API versions the invoice no longer carries `subscription` or `charge` fields, so the handler maps the customer to your user with a lookup you already have (the Stripe customer id saved at checkout), and finds the payment through `invoicePayments`.

```typescript
// app/api/webhooks/stripe/route.ts
import type Stripe from "stripe";
import { Prisma } from "../../../../generated/prisma/client";
import { prisma } from "../../../../lib/prisma";
import { stripe } from "../../../../lib/stripe"; // new Stripe(process.env.STRIPE_SECRET_KEY!)
import { userIdForStripeCustomer } from "../../../../lib/billing-users"; // your own customer-to-user lookup

export async function POST(req: Request) {
  let event: Stripe.Event;
  try {
    // needs the raw body: req.text(), never req.json()
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  switch (event.type) {
    case "invoice.paid": {
      const invoice = event.data.object;
      if (!invoice.id || !invoice.customer || invoice.amount_paid <= 0) break;
      const userId = await userIdForStripeCustomer(typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id);
      const referral = userId && await prisma.referral.findUnique({
        where: { referredUserId: userId },
        include: { affiliate: true },
      });
      if (!referral) break;

      // Commission on what the customer paid, excluding tax
      const base = invoice.amount_paid - (invoice.total_taxes ?? []).reduce((s, t) => s + t.amount, 0);
      const amountCents = Math.floor(base * referral.affiliate.commissionPct / 100);
      const pi = (await stripe.invoicePayments.list({ invoice: invoice.id, limit: 1 })).data[0]?.payment.payment_intent;
      try {
        await prisma.$transaction([
          prisma.commission.create({
            data: { referralId: referral.id, amountCents, invoiceId: invoice.id, paymentIntentId: typeof pi === "string" ? pi : pi?.id },
          }),
          prisma.referral.update({ where: { id: referral.id }, data: { status: "paid" } }),
        ]);
      } catch (e) {
        // P2002 = this invoice was already processed (Stripe retried the event)
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e;
      }
      break;
    }
    case "charge.refunded":
    case "charge.dispute.created": {
      const pi = event.data.object.payment_intent;
      if (!pi) break;
      await prisma.commission.updateMany({
        where: { paymentIntentId: typeof pi === "string" ? pi : pi.id, status: "pending" },
        data: { status: "reversed" },
      });
      break;
    }
  }
  return new Response("ok");
}
```

### Step 6: Onboard affiliates and pay them monthly

Each affiliate gets a Connect Express account with the `transfers` capability and finishes Stripe-hosted onboarding (identity and bank details never touch your servers):

```typescript
// lib/connect.ts (inside startPayoutOnboarding, after loading the affiliate)
const account = await stripe.accounts.create({
  type: "express",
  capabilities: { transfers: { requested: true } },
  metadata: { affiliateId },
});
await prisma.affiliate.update({ where: { id: affiliateId }, data: { stripeAccountId: account.id } });
const link = await stripe.accountLinks.create({
  account: account.id,
  type: "account_onboarding",
  refresh_url: `${process.env.NEXT_PUBLIC_URL}/affiliate/payouts/refresh`,
  return_url: `${process.env.NEXT_PUBLIC_URL}/affiliate/dashboard`,
});
return link.url; // redirect the affiliate here; reuse the saved account on later visits
```

The payout job (run it from cron on the 1st) pays only commissions older than 30 days, so refunds and disputes are mostly settled first. It claims the commissions inside a `Payout` row before moving money and sends an idempotency key, so a crash or a second run cannot pay twice:

```typescript
// scripts/run-monthly-payouts.ts
const MIN_PAYOUT_CENTS = 2500; // $25 minimum
const HOLD_DAYS = 30;          // refund/dispute window before a commission is payable

export async function runMonthlyPayouts() {
  const cutoff = new Date(Date.now() - HOLD_DAYS * 24 * 60 * 60 * 1000);
  const affiliates = await prisma.affiliate.findMany({ where: { status: "active", stripeAccountId: { not: null } } });
  for (const affiliate of affiliates) {
    const due = await prisma.commission.findMany({
      where: { status: "pending", payoutId: null, createdAt: { lt: cutoff }, referral: { affiliateId: affiliate.id } },
    });
    const total = due.reduce((s, c) => s + c.amountCents, 0);
    if (total < MIN_PAYOUT_CENTS) continue;

    const payout = await prisma.payout.create({
      data: { affiliateId: affiliate.id, amountCents: total, commissions: { connect: due.map((c) => ({ id: c.id })) } },
    });
    try {
      const transfer = await stripe.transfers.create(
        { amount: total, currency: "usd", destination: affiliate.stripeAccountId!, transfer_group: `payout_${payout.id}` },
        { idempotencyKey: `payout_${payout.id}` },
      );
      await prisma.$transaction([
        prisma.payout.update({ where: { id: payout.id }, data: { status: "paid", stripeTransferId: transfer.id } }),
        prisma.commission.updateMany({ where: { payoutId: payout.id }, data: { status: "paid" } }),
      ]);
    } catch (err) {
      await prisma.payout.update({ where: { id: payout.id }, data: { status: "failed" } });
      await prisma.commission.updateMany({ where: { payoutId: payout.id }, data: { payoutId: null } });
      console.error(`Payout failed for ${affiliate.code}`, err);
    }
  }
}
```

Two Stripe rules: a transfer is taken from your platform account's **available balance** and fails if it exceeds it (a card payment's funds are not available immediately), and cross-border transfers are only supported between the US, Canada, the UK, the EEA and Switzerland, otherwise the affiliate's account must be in your platform's region. Check Stripe's Connect documentation before promising worldwide payouts.

### Step 7: Affiliate dashboard

The dashboard is a server component that asks the database for sums and counts instead of loading every row. Render the referral link, the counts, and a paginated referrals table (`take`/`skip` on `prisma.referral.findMany`):

```typescript
const [byStatus, activeReferrals] = await Promise.all([
  prisma.commission.groupBy({ by: ["status"], _sum: { amountCents: true }, where: { referral: { affiliateId: affiliate.id } } }),
  prisma.referral.count({ where: { affiliateId: affiliate.id, status: "paid" } }),
]);
const cents = (s: string) => byStatus.find((r) => r.status === s)?._sum.amountCents ?? 0; // pending, paid
```

## Fraud Detection Checklist

- **Self-referral:** reject when the affiliate's `userId` equals the new user (Step 4); review signups that share an email domain or payment fingerprint with the affiliate
- **Cash only:** commissions come from `invoice.paid`, never from signups or trials
- **Hold and threshold:** a 30-day hold and a $25 minimum keep refunded or disputed payments from being paid out; decide a clawback policy for commissions already paid
- **Review queue:** flag affiliates whose referrals refund or churn fast

## Real-World Example

Marta runs a $5K MRR invoicing tool and recruits 12 freelance accountants as affiliates. Four months in, 9 are active and 31 of their referred customers are paying on the $29 plan. Commission at 20% of $29 is $5.80 a month per customer, so the program costs about $180 a month for roughly $900 of attributed revenue. The first payout run skips three affiliates under the $25 minimum, pays six, and one transfer fails because the platform balance was short; its commissions return to `pending` and go out in the next run.

## Related Skills

- [prisma](../skills/prisma/) — Schema design, migrations and the aggregate queries behind the dashboard
- [stripe-billing](../skills/stripe-billing/) — Webhook verification, invoice events and the subscription lifecycle the commissions follow
