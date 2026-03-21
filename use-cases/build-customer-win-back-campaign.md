---
title: "Build a Customer Win-Back Campaign"
description: "Re-engage churned users with a personalized automated campaign — identify churned segments, send a timed email sequence, offer Stripe discount codes, and track how many you win back."
skills: [stripe, resend, prisma]
difficulty: intermediate
time_estimate: "6 hours"
tags: [retention, churn, win-back, email, stripe, saas, automation, lifecycle]
---

# Build a Customer Win-Back Campaign

You lost customers. Some canceled because life got busy — not because your product is bad. A well-timed win-back sequence recovers 10–20% of them. The difference between doing it manually (never) and doing it automatically (always) is this system.

## What You'll Build

- Identify churned users: no activity for 30/60/90 days
- Segmentation: trial churn vs paid churn, feature adoption score
- Email sequence: day 0 "we miss you" → day 14 discount offer → day 30 breakup
- Personalization: reference last used features, account activity
- Stripe coupon automatically generated and embedded in email
- Win-back tracking: who came back, revenue recovered

## Architecture

```
Daily cron: scan for users with no activity in 30+ days
  → Segment: trial vs paid, adoption level
  → Enroll in win-back sequence (skip if already enrolled)
  → Day 0: "we miss you" email
  → Day 14: Stripe coupon generated → discount offer
  → Day 30: breakup email with final offer
  → User re-subscribes → mark won back, cancel sequence
```

## Step 1: Identify Churned Users

```prisma
model User {
  id                    String    @id @default(cuid())
  email                 String    @unique
  name                  String?
  stripeCustomerId      String?   @unique
  stripeSubscriptionId  String?
  subscriptionStatus    String?   // active | trialing | canceled | past_due
  trialEndedAt          DateTime?
  canceledAt            DateTime?
  lastActiveAt          DateTime?
  plan                  String?   // starter | pro | business
  featuresUsed          Json?     // { "feature_a": 5, "feature_b": 0 }
  winBackEnrollments    WinBackEnrollment[]
}

model WinBackEnrollment {
  id            String    @id @default(cuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id])
  segment       String    // trial_churn | paid_churn_low | paid_churn_high
  status        String    @default("active") // active | won_back | unsubscribed | completed
  currentStep   Int       @default(0)
  nextSendAt    DateTime?
  stripeCouponId String?
  enrolledAt    DateTime  @default(now())
  wonBackAt     DateTime?
  revenueRecovered Float?
  emails        WinBackEmail[]
  @@unique([userId]) // one active enrollment per user
}

model WinBackEmail {
  id           String   @id @default(cuid())
  enrollmentId String
  enrollment   WinBackEnrollment @relation(fields: [enrollmentId], references: [id])
  step         Int
  resendId     String   @unique
  subject      String
  sentAt       DateTime @default(now())
  openedAt     DateTime?
  clickedAt    DateTime?
}
```

## Step 2: Segmentation Logic

```typescript
// lib/churn-detector.ts
export type ChurnSegment = "trial_churn" | "paid_churn_low" | "paid_churn_high";

export function getChurnSegment(user: {
  subscriptionStatus: string | null;
  plan: string | null;
  featuresUsed: Record<string, number> | null;
  canceledAt: Date | null;
}): ChurnSegment | null {
  if (!["canceled", "trialing"].includes(user.subscriptionStatus ?? "")) return null;

  const totalActions = Object.values(user.featuresUsed ?? {}).reduce((a, b) => a + b, 0);

  if (user.subscriptionStatus === "trialing") return "trial_churn";
  if (totalActions < 10) return "paid_churn_low";    // low adoption, left quickly
  return "paid_churn_high";                           // used product, still churned
}

// Daily cron: find newly churned users to enroll
export async function findChurnedUsersToEnroll() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  return prisma.user.findMany({
    where: {
      subscriptionStatus: { in: ["canceled"] },
      canceledAt: { gte: thirtyDaysAgo, lte: new Date() },
      winBackEnrollments: { none: {} }, // not already enrolled
    },
  });
}
```

## Step 3: Stripe Coupon Generation

```typescript
// lib/stripe-winback.ts
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function createWinBackCoupon(params: {
  userId: string;
  segment: string;
  customerId: string;
}): Promise<string> {
  // Discount level by segment
  const discountPct = params.segment === "paid_churn_high" ? 40 : 20;

  const coupon = await stripe.coupons.create({
    percent_off: discountPct,
    duration: "once",
    redeem_by: Math.floor((Date.now() + 21 * 86400000) / 1000), // 21 day expiry
    metadata: {
      userId: params.userId,
      campaign: "win_back_2024",
      segment: params.segment,
    },
  });

  // Create a promotion code that's easy to use
  const promoCode = await stripe.promotionCodes.create({
    coupon: coupon.id,
    customer: params.customerId, // lock to this customer
    max_redemptions: 1,
  });

  return promoCode.code;
}
```

## Step 4: Email Sequence Templates

```typescript
// lib/winback-templates.ts
interface EmailContent { subject: string; html: string; text: string; }

export function getWinBackEmail(params: {
  step: number;
  name: string;
  segment: string;
  topFeature: string;
  couponCode?: string;
  reactivateUrl: string;
}): EmailContent {
  const { step, name, topFeature, couponCode, reactivateUrl } = params;

  if (step === 0) {
    return {
      subject: `${name}, we miss you at [Product]`,
      text: `Hey ${name},

Noticed you've been away for a bit. No sales pitch here — just wanted to check in.

Last time you were here, you were using ${topFeature}. A lot has changed since then:
- [New feature 1 you'd care about]
- [New feature 2]
- [Performance improvement]

If timing was the issue, no worries. If something wasn't working — I'd love to hear it. Just reply.

— [Founder name]`,
      html: `<p>Hey ${name},</p><p>Noticed you've been away for a bit...</p>`,
    };
  }

  if (step === 1) {
    return {
      subject: `${params.discountPct ?? 30}% off to come back — yours until [date]`,
      text: `Hey ${name},

Still thinking about you. 

Here's the thing: we want you back enough to make it easy. Use code <strong>${couponCode}</strong> for ${params.segment === "paid_churn_high" ? "40%" : "20%"} off your first month back.

No strings. If it's still not right, that's okay.

→ Reactivate here: ${reactivateUrl}?coupon=${couponCode}

This code expires in 21 days.

— [Founder name]`,
      html: `<p>Hey ${name},</p>`,
    };
  }

  // Step 2: breakup
  return {
    subject: "Last email from us",
    text: `Hey ${name},

This is the last time I'll reach out — promise.

If you're open to it, coupon ${couponCode} still works for a few more days.

If not — no hard feelings. Would genuinely appreciate 30 seconds of feedback: why did you leave?

→ [1-click survey: price / missing feature / switched tool / just busy]

Thanks for trying [Product].

— [Founder name]`,
    html: `<p>Hey ${name},</p>`,
  };
}
```

## Step 5: Sequence Runner

```typescript
// lib/winback-runner.ts — called by daily cron
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY!);

const SEQUENCE = [
  { step: 0, delayDays: 0 },
  { step: 1, delayDays: 14 },
  { step: 2, delayDays: 30 },
];

export async function runWinBackSequence() {
  // 1. Enroll newly churned users
  const churned = await findChurnedUsersToEnroll();
  for (const user of churned) {
    const segment = getChurnSegment(user as any);
    if (!segment) continue;

    await prisma.winBackEnrollment.create({
      data: {
        userId: user.id,
        segment,
        nextSendAt: new Date(), // send first email now
      },
    });
  }

  // 2. Process due emails
  const due = await prisma.winBackEnrollment.findMany({
    where: { status: "active", nextSendAt: { lte: new Date() } },
    include: { user: true },
  });

  for (const enrollment of due) {
    const step = SEQUENCE[enrollment.currentStep];
    if (!step) continue;

    let couponCode = enrollment.stripeCouponId;
    if (step.step === 1 && !couponCode && enrollment.user.stripeCustomerId) {
      couponCode = await createWinBackCoupon({
        userId: enrollment.userId,
        segment: enrollment.segment,
        customerId: enrollment.user.stripeCustomerId,
      });
      await prisma.winBackEnrollment.update({
        where: { id: enrollment.id },
        data: { stripeCouponId: couponCode },
      });
    }

    const featuresUsed = (enrollment.user.featuresUsed as Record<string, number>) ?? {};
    const topFeature = Object.entries(featuresUsed).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "the dashboard";

    const email = getWinBackEmail({
      step: step.step,
      name: enrollment.user.name?.split(" ")[0] ?? "there",
      segment: enrollment.segment,
      topFeature,
      couponCode: couponCode ?? undefined,
      reactivateUrl: `${process.env.APP_URL}/reactivate`,
    });

    const { data } = await resend.emails.send({
      from: `${process.env.SENDER_NAME} <${process.env.SENDER_EMAIL}>`,
      to: enrollment.user.email,
      subject: email.subject,
      text: email.text,
    });

    const nextStep = SEQUENCE[enrollment.currentStep + 1];
    await prisma.$transaction([
      prisma.winBackEmail.create({
        data: { enrollmentId: enrollment.id, step: step.step, resendId: data!.id, subject: email.subject },
      }),
      prisma.winBackEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: enrollment.currentStep + 1,
          status: nextStep ? "active" : "completed",
          nextSendAt: nextStep ? new Date(Date.now() + nextStep.delayDays * 86400000) : null,
        },
      }),
    ]);
  }
}
```

## Step 6: Mark as Won Back via Stripe Webhook

```typescript
// POST /api/webhooks/stripe
if (event.type === "customer.subscription.created") {
  const sub = event.data.object as Stripe.Subscription;
  const user = await prisma.user.findUnique({
    where: { stripeCustomerId: sub.customer as string },
    include: { winBackEnrollments: { where: { status: "active" } } },
  });

  if (user?.winBackEnrollments.length) {
    await prisma.winBackEnrollment.update({
      where: { id: user.winBackEnrollments[0].id },
      data: { status: "won_back", wonBackAt: new Date() },
    });
  }
}
```

## Environment Variables

```bash
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
SENDER_EMAIL=founder@yourcompany.com
SENDER_NAME=Your Name
APP_URL=https://yourapp.com
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] Churn detector identifying users within 24h of cancel
- [ ] Segment logic tuned for your product usage patterns
- [ ] Stripe coupons generating with expiry dates
- [ ] Coupon locked to specific customer (no sharing)
- [ ] Day 0, 14, 30 emails drafted and reviewed
- [ ] Stripe webhook marking won_back on re-subscribe
- [ ] Dashboard: won-back count + revenue recovered this month

## What's Next

- Survey response analysis: AI clusters reasons for churn
- Adjust discount by revenue tier (high-value customers get bigger discount)
- Pause sequence if user re-engages with product (login event)
- Slack alert when a high-value churned customer opens the email
