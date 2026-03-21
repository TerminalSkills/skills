---
title: Build a Product-Led Growth Loop
slug: build-product-led-growth-loop
description: Build a PLG engine for your SaaS — viral referral invites, usage-based freemium gates, in-app Stripe upgrades, activation tracking, and automated email nudges based on usage milestones.
skills:
  - stripe-billing
  - resend
  - posthog
difficulty: advanced
time_estimate: "10 hours"
category: business
tags:
  - plg
  - growth
  - stripe
  - referrals
  - freemium
  - saas
  - email
---

# Build a Product-Led Growth Loop

David's project management SaaS has 800 users. He's been doing outbound sales — demos, follow-ups, long procurement cycles. CAC is $1,200. He wants to switch: let the product sell itself. Free tier that converts, viral invites that grow the user base, usage-based upgrades that feel natural instead of pushy. Goal: cut CAC to $200 and double signups in 90 days.

## Step 1 — Viral Invite System with Referral Tracking

```typescript
// lib/referrals.ts — Generate unique referral links and track conversions.
// Every user gets a referral code. When they invite someone and that person
// converts to paid, the referrer gets credit (used for rewards or just analytics).

import { db } from "@/lib/db";
import { referrals, users } from "@/lib/schema";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: { referralCode: true },
  });

  if (user?.referralCode) return user.referralCode;

  const code = nanoid(8);                    // e.g., "aB3xK9mP"
  await db.update(users)
    .set({ referralCode: code })
    .where(eq(users.id, userId));

  return code;
}

export async function getReferralLink(userId: string): Promise<string> {
  const code = await getOrCreateReferralCode(userId);
  return `${process.env.NEXT_PUBLIC_APP_URL}/signup?ref=${code}`;
}

// Called during signup when ?ref= is present in the URL
export async function trackReferralSignup(
  newUserId: string,
  referralCode: string
): Promise<void> {
  const referrer = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.referralCode, referralCode),
    columns: { id: true },
  });

  if (!referrer) return;

  await db.insert(referrals).values({
    referrerId: referrer.id,
    referredUserId: newUserId,
    status: "signed_up",
    createdAt: new Date(),
  });
}

// Called when a referred user converts to paid
export async function trackReferralConversion(userId: string): Promise<void> {
  await db.update(referrals)
    .set({ status: "converted", convertedAt: new Date() })
    .where(eq(referrals.referredUserId, userId));
}
```

```tsx
// components/invite-modal.tsx — In-app invite flow.
// Users can invite teammates directly or share their referral link.

"use client";
import { useState } from "react";
import { getReferralLink } from "@/lib/referrals";

export function InviteModal({ userId }: { userId: string }) {
  const [emails, setEmails] = useState("");
  const [sending, setSending] = useState(false);
  const [referralLink, setReferralLink] = useState("");

  async function loadLink() {
    const link = await fetch("/api/referral-link").then(r => r.json());
    setReferralLink(link.url);
  }

  async function sendInvites() {
    setSending(true);
    const list = emails.split(",").map(e => e.trim()).filter(Boolean);
    await fetch("/api/invite", {
      method: "POST",
      body: JSON.stringify({ emails: list }),
    });
    setSending(false);
    setEmails("");
  }

  return (
    <div className="invite-modal">
      <h2>Invite your team</h2>

      <textarea
        placeholder="alice@company.com, bob@company.com"
        value={emails}
        onChange={e => setEmails(e.target.value)}
        rows={3}
      />
      <button onClick={sendInvites} disabled={sending}>
        {sending ? "Sending..." : "Send invites"}
      </button>

      <div className="divider">or share your link</div>
      <div className="referral-link">
        <input value={referralLink} readOnly onFocus={loadLink} />
        <button onClick={() => navigator.clipboard.writeText(referralLink)}>
          Copy
        </button>
      </div>
    </div>
  );
}
```

## Step 2 — Freemium Gates with Usage Tracking

```typescript
// lib/feature-gates.ts — Track usage and enforce freemium limits.
// Free tier: 3 projects, 10 tasks/project, no integrations.
// Pro: unlimited everything.

import { posthog } from "@/lib/posthog-server";
import { db } from "@/lib/db";

const FREE_LIMITS = {
  projects: 3,
  tasks_per_project: 10,
  integrations: 0,
  team_members: 1,
} as const;

type Feature = keyof typeof FREE_LIMITS;

interface GateResult {
  allowed: boolean;
  current: number;
  limit: number;
  feature: Feature;
}

export async function checkFeatureGate(
  userId: string,
  organizationId: string,
  feature: Feature,
  plan: "free" | "pro" | "enterprise"
): Promise<GateResult> {
  if (plan !== "free") {
    return { allowed: true, current: 0, limit: Infinity, feature };
  }

  const counts: Record<Feature, () => Promise<number>> = {
    projects: () => db.query.projects.count({ where: eq(projects.organizationId, organizationId) }),
    tasks_per_project: () => db.query.tasks.count({ where: eq(tasks.projectId, organizationId) }),
    integrations: () => db.query.integrations.count({ where: eq(integrations.organizationId, organizationId) }),
    team_members: () => db.query.memberships.count({ where: eq(memberships.organizationId, organizationId) }),
  };

  const current = await counts[feature]();
  const limit = FREE_LIMITS[feature];
  const allowed = current < limit;

  if (!allowed) {
    // Track the limit-hit event — this is a prime upgrade conversion opportunity
    posthog.capture({
      distinctId: userId,
      event: "feature_limit_hit",
      properties: {
        feature,
        current,
        limit,
        plan: "free",
      },
    });
  }

  return { allowed, current, limit, feature };
}
```

```tsx
// components/upgrade-gate.tsx — Show upgrade prompt when user hits a limit.
// The nudge appears inline — no redirect, no full-page takeover.

"use client";

interface UpgradeGateProps {
  feature: string;
  limit: number;
  children: React.ReactNode;
  onUpgrade: () => void;
}

export function UpgradeGate({ feature, limit, children, onUpgrade }: UpgradeGateProps) {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm text-center">
          <div className="text-2xl mb-2">🔒</div>
          <h3 className="font-semibold text-lg">
            You've reached the {feature} limit
          </h3>
          <p className="text-gray-500 text-sm mt-1">
            Free plan includes {limit} {feature}. Upgrade to Pro for unlimited.
          </p>
          <button
            className="mt-4 w-full bg-indigo-600 text-white rounded-lg py-2 font-medium"
            onClick={onUpgrade}
          >
            Upgrade to Pro — $29/month
          </button>
          <p className="text-xs text-gray-400 mt-2">7-day free trial, cancel anytime</p>
        </div>
      </div>
    </div>
  );
}
```

## Step 3 — In-App Stripe Upgrade (No Redirect)

```typescript
// app/api/billing/upgrade/route.ts — Embedded upgrade flow using Stripe Payment Element.
// User enters card details in-app. No redirect to Stripe Checkout.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { trackReferralConversion } from "@/lib/referrals";
import posthog from "@/lib/posthog-server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { priceId, paymentMethodId } = await request.json();

  // Get or create Stripe customer
  let customerId = session.user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      metadata: { userId: session.user.id },
    });
    customerId = customer.id;
  }

  // Attach payment method and create subscription
  await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });

  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    default_payment_method: paymentMethodId,
    trial_period_days: 7,
    expand: ["latest_invoice.payment_intent"],
    metadata: { userId: session.user.id },
  });

  // Track conversion in PostHog
  posthog.capture({
    distinctId: session.user.id,
    event: "subscription_started",
    properties: {
      plan: "pro",
      trial: true,
      mrr: 29,
    },
  });

  // Credit the referrer if this user was referred
  await trackReferralConversion(session.user.id);

  return NextResponse.json({ subscriptionId: subscription.id });
}
```

## Step 4 — Activation Tracking and Email Sequences

```typescript
// lib/activation.ts — Track "aha moment" events and trigger email sequences.
// The aha moment for David's app: "invited a teammate AND created 3+ tasks"

import posthog from "@/lib/posthog-server";
import { resend } from "@/lib/resend";
import { db } from "@/lib/db";

const AHA_CRITERIA = {
  tasks_created: 3,
  teammates_invited: 1,
} as const;

export async function checkActivation(userId: string, organizationId: string) {
  const [taskCount, inviteCount] = await Promise.all([
    db.query.tasks.count({ where: eq(tasks.createdBy, userId) }),
    db.query.referrals.count({ where: eq(referrals.referrerId, userId) }),
  ]);

  const activated =
    taskCount >= AHA_CRITERIA.tasks_created &&
    inviteCount >= AHA_CRITERIA.teammates_invited;

  if (activated) {
    posthog.capture({
      distinctId: userId,
      event: "user_activated",
      properties: { tasks_created: taskCount, teammates_invited: inviteCount },
    });

    // Trigger Day 1 activation email
    await sendActivationEmail(userId);
  }
}

async function sendActivationEmail(userId: string) {
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
  });

  await resend.emails.send({
    from: "David <david@projectapp.io>",
    to: user!.email,
    subject: "You're getting the most out of ProjectApp 🚀",
    react: ActivationEmail({ name: user!.name }),
  });
}

// Usage milestone email: fires when user creates 10th task
export async function onTaskCreated(userId: string, taskCount: number) {
  if (taskCount === 10) {
    posthog.capture({ distinctId: userId, event: "milestone_10_tasks" });
    // Trigger "power user" email — mention Pro features they're missing
    await sendMilestoneEmail(userId, "10_tasks");
  }

  if (taskCount === 50) {
    posthog.capture({ distinctId: userId, event: "milestone_50_tasks" });
    await sendMilestoneEmail(userId, "50_tasks");
  }
}
```

## Results

David switched from sales-led to PLG over 6 weeks. At month 3:

- **CAC dropped from $1,200 to $180** — most conversions now happen without David involved. Users upgrade when they hit the project limit or when a teammate they invited converts.
- **Signups up 2.4x** — the viral invite loop drives 35% of new signups. Average Pro user has invited 2.1 teammates; 40% of those invitees sign up.
- **Free-to-paid conversion: 11%** — users who hit the project limit and see the inline upgrade gate convert at 3x the rate of users who see a pricing page.
- **Activation rate at 62%** — up from ~30% before the aha moment tracking. The Day 3 email to users who've created tasks but not invited anyone recovers 18% of at-risk users.
- **Referral attribution revealed** — PostHog showed that referred users have 40% higher LTV than direct signups. David now offers referrers a $20 credit per conversion.
