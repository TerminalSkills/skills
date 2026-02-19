---
title: Add Authentication and Billing to a SaaS App
slug: add-auth-and-billing-to-saas-app
description: Add Google/GitHub OAuth login, role-based access, and Stripe subscription billing to a Next.js SaaS app — with webhook-driven plan management, customer portal, and usage-based metering.
skills:
  - authjs
  - stripe
  - nextjs
  - neon
category: SaaS
tags:
  - authentication
  - billing
  - subscriptions
  - oauth
  - saas
---

# Add Authentication and Billing to a SaaS App

Farah built an AI writing assistant as a side project. It works — 300 users signed up via a waitlist. Now she needs to turn it into a business: free tier (10 generations/day), Pro tier ($19/month, 100 generations/day), and Team tier ($49/month, unlimited + collaboration). She wants auth and billing running by the end of the week so she can open signups and start charging.

## Step 1 — Set Up Auth.js with OAuth and Database Sessions

Auth.js handles the entire OAuth flow: redirect to Google/GitHub, handle the callback, create the user in the database, and set the session cookie. Database sessions (not JWT) because Farah needs to revoke sessions when users downgrade or get banned.

```typescript
// src/lib/auth.ts — Auth.js v5 configuration.
// Database sessions store in Neon PostgreSQL.
// The session callback adds plan info so every page knows the user's tier.

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/lib/db";
import { users, accounts, sessions, verificationTokens } from "@/lib/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],

  session: { strategy: "database" },   // Server-side sessions, revocable

  pages: {
    signIn: "/login",                   // Custom login page
  },

  callbacks: {
    // Add user's plan and Stripe customer ID to the session
    async session({ session, user }) {
      const dbUser = await db.query.users.findFirst({
        where: (u, { eq }) => eq(u.id, user.id),
        columns: {
          id: true,
          plan: true,
          stripeCustomerId: true,
          dailyGenerations: true,
          dailyGenerationsReset: true,
        },
      });

      if (dbUser) {
        session.user.id = dbUser.id;
        session.user.plan = dbUser.plan;
        session.user.stripeCustomerId = dbUser.stripeCustomerId;
        session.user.dailyGenerations = dbUser.dailyGenerations;
      }

      return session;
    },
  },
});
```

```typescript
// src/lib/schema.ts — Database schema with auth + billing fields.
// Auth.js tables (users, accounts, sessions) + custom billing fields.

import {
  pgTable, text, timestamp, integer, boolean, primaryKey,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique().notNull(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),

  // Billing fields
  plan: text("plan").notNull().default("free"),          // "free", "pro", "team"
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripePriceId: text("stripe_price_id"),
  stripeCurrentPeriodEnd: timestamp("stripe_current_period_end"),

  // Usage tracking
  dailyGenerations: integer("daily_generations").notNull().default(0),
  dailyGenerationsReset: timestamp("daily_generations_reset")
    .notNull()
    .$defaultFn(() => new Date()),

  createdAt: timestamp("created_at").defaultNow(),
});

// Auth.js required tables
export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
}, (table) => ({
  pk: primaryKey({ columns: [table.provider, table.providerAccountId] }),
}));

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.identifier, table.token] }),
}));
```

## Step 2 — Integrate Stripe Checkout for Subscriptions

When a user clicks "Upgrade to Pro," create a Stripe Checkout session and redirect them. Stripe handles the payment UI, 3D Secure, tax calculation, and receipt — the app just needs to know which plan the user is on.

```typescript
// src/app/api/billing/checkout/route.ts — Create Stripe Checkout session.
// The user clicks "Upgrade" → this creates a Checkout session → redirects to Stripe.
// After payment, Stripe sends a webhook → we update the user's plan.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

const PRICES = {
  pro_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
  pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID!,
  team_monthly: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!,
  team_yearly: process.env.STRIPE_TEAM_YEARLY_PRICE_ID!,
} as const;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { priceKey } = await request.json();
  const priceId = PRICES[priceKey as keyof typeof PRICES];
  if (!priceId) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  // Get or create Stripe customer
  let stripeCustomerId = session.user.stripeCustomerId;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.user.email!,
      name: session.user.name || undefined,
      metadata: { userId: session.user.id },
    });
    stripeCustomerId = customer.id;

    await db.update(users)
      .set({ stripeCustomerId: customer.id })
      .where(eq(users.id, session.user.id));
  }

  // Create Checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
    subscription_data: {
      metadata: { userId: session.user.id },
      trial_period_days: 7,              // 7-day free trial for all plans
    },
    allow_promotion_codes: true,         // Let users enter discount codes
    tax_id_collection: { enabled: true }, // Collect VAT/tax ID from businesses
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

```typescript
// src/app/api/billing/portal/route.ts — Customer portal for managing subscription.
// Users can update payment method, switch plans, cancel — all hosted by Stripe.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

export async function POST() {
  const session = await auth();
  if (!session?.user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account" }, { status: 400 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: session.user.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

## Step 3 — Handle Webhooks for Plan Changes

Webhooks are the source of truth for billing state. Never trust the client — the webhook from Stripe confirms that payment actually went through.

```typescript
// src/app/api/webhooks/stripe/route.ts — Stripe webhook handler.
// This is the ONLY place where the user's plan changes in the database.
// Checkout success, plan changes, cancellations, payment failures — all here.

import { headers } from "next/headers";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

export async function POST(request: Request) {
  const body = await request.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature")!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed");
    return new Response("Invalid signature", { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const userId = subscription.metadata.userId;
      const priceId = subscription.items.data[0].price.id;

      await db.update(users).set({
        plan: getPlanFromPriceId(priceId),
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      }).where(eq(users.id, userId));

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.userId;
      const priceId = subscription.items.data[0].price.id;

      await db.update(users).set({
        plan: subscription.status === "active"
          ? getPlanFromPriceId(priceId)
          : "free",
        stripePriceId: priceId,
        stripeCurrentPeriodEnd: new Date(subscription.current_period_end * 1000),
      }).where(eq(users.id, userId));

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const userId = subscription.metadata.userId;

      await db.update(users).set({
        plan: "free",
        stripeSubscriptionId: null,
        stripePriceId: null,
        stripeCurrentPeriodEnd: null,
      }).where(eq(users.id, userId));

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      // Don't downgrade immediately — Stripe's dunning will retry
      // Send a notification to the user about the failed payment
      console.log(`Payment failed for customer ${invoice.customer}`);
      break;
    }
  }

  return new Response("OK", { status: 200 });
}

function getPlanFromPriceId(priceId: string): string {
  const priceMap: Record<string, string> = {
    [process.env.STRIPE_PRO_MONTHLY_PRICE_ID!]: "pro",
    [process.env.STRIPE_PRO_YEARLY_PRICE_ID!]: "pro",
    [process.env.STRIPE_TEAM_MONTHLY_PRICE_ID!]: "team",
    [process.env.STRIPE_TEAM_YEARLY_PRICE_ID!]: "team",
  };
  return priceMap[priceId] || "free";
}
```

## Step 4 — Enforce Usage Limits

```typescript
// src/lib/usage.ts — Usage tracking and limit enforcement.
// Called before every AI generation. Checks the user's plan limits
// and increments the daily counter.

import { db } from "@/lib/db";
import { users } from "@/lib/schema";
import { eq } from "drizzle-orm";

const PLAN_LIMITS: Record<string, number> = {
  free: 10,        // 10 generations/day
  pro: 100,        // 100 generations/day
  team: Infinity,  // Unlimited
};

interface UsageResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export async function checkAndIncrementUsage(userId: string): Promise<UsageResult> {
  const user = await db.query.users.findFirst({
    where: (u, { eq }) => eq(u.id, userId),
    columns: {
      plan: true,
      dailyGenerations: true,
      dailyGenerationsReset: true,
    },
  });

  if (!user) throw new Error("User not found");

  const limit = PLAN_LIMITS[user.plan] || PLAN_LIMITS.free;
  const now = new Date();
  const resetAt = new Date(user.dailyGenerationsReset);

  // Reset counter if it's a new day
  let currentCount = user.dailyGenerations;
  if (now.toDateString() !== resetAt.toDateString()) {
    currentCount = 0;
    await db.update(users).set({
      dailyGenerations: 0,
      dailyGenerationsReset: now,
    }).where(eq(users.id, userId));
  }

  if (currentCount >= limit) {
    return {
      allowed: false,
      remaining: 0,
      limit,
      resetAt: getNextMidnight(),
    };
  }

  // Increment counter
  await db.update(users).set({
    dailyGenerations: currentCount + 1,
  }).where(eq(users.id, userId));

  return {
    allowed: true,
    remaining: limit - currentCount - 1,
    limit,
    resetAt: getNextMidnight(),
  };
}

function getNextMidnight(): Date {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
}
```

```typescript
// src/app/api/generate/route.ts — AI generation endpoint with usage check.

import { auth } from "@/lib/auth";
import { checkAndIncrementUsage } from "@/lib/usage";
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Check usage before generating
  const usage = await checkAndIncrementUsage(session.user.id);
  if (!usage.allowed) {
    return Response.json({
      error: "Daily limit reached",
      remaining: 0,
      limit: usage.limit,
      resetAt: usage.resetAt.toISOString(),
      upgradeUrl: "/pricing",
    }, { status: 429 });
  }

  const { prompt } = await request.json();

  const result = streamText({
    model: openai("gpt-4o-mini"),
    prompt,
    maxTokens: session.user.plan === "free" ? 500 : 2000,
  });

  const response = result.toDataStreamResponse();
  response.headers.set("X-Usage-Remaining", String(usage.remaining));
  return response;
}
```

## Results

Farah launched paid plans on Monday. By the end of the first month:

- **Auth setup: 2 hours** — Auth.js with Google + GitHub OAuth, database sessions, custom login page. Users sign up in two clicks.
- **Billing setup: 4 hours** — Stripe Checkout, webhooks, customer portal, usage tracking. The entire billing flow is webhook-driven — no polling, no cron jobs.
- **Conversion: 8% of free users upgraded** to Pro within the first month (24 out of 300). Average revenue per user: $17/month (mix of monthly and yearly plans with 20% annual discount).
- **MRR: $408** in month one — not life-changing, but validates the pricing. The 7-day trial reduces friction: users experience Pro features before the first charge.
- **Support tickets about billing: 0** — Stripe's Customer Portal handles plan changes, payment updates, cancellations, and invoice downloads. Farah never touches billing operations.
- **Usage enforcement works** — free users see a "limit reached" modal with a one-click upgrade button. 40% of upgrades come from hitting the free tier limit — the paywall drives conversion.
- **Time to market: 6 hours total** from zero auth/billing to live paid subscriptions. The rest of the week was spent on the actual product features.
