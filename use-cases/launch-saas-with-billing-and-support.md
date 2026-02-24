---
title: Launch a SaaS with Billing, Feature Flags, and Customer Support
slug: launch-saas-with-billing-and-support
description: >-
  Set up a complete SaaS operational stack: Paddle for subscription billing
  without tax headaches, LaunchDarkly for feature flags and gradual rollouts,
  Crisp for live chat customer support, Loops for email marketing, and Canny
  for product feedback.
skills:
  - paddle
  - launchdarkly
  - crisp
  - loops
  - canny
category: saas
tags:
  - saas
  - billing
  - payments
  - feature-flags
  - customer-support
---

# Launch a SaaS with Billing, Feature Flags, and Customer Support

Tomás has been building a project management tool for six months. The product works, early beta users love it, but he's been giving it away for free. Now it's time to turn it into a real business — charge money, support customers, and ship features safely. He's a solo founder, so every tool needs to be low-maintenance.

## Step 1: Subscription Billing with Paddle

Tomás chose Paddle over Stripe for one reason: tax compliance. As a merchant of record, Paddle handles VAT, sales tax, and invoicing in every country. Tomás doesn't need to register for VAT in the EU, collect sales tax in US states, or worry about invoicing requirements. Paddle sells on his behalf and sends him a single monthly payout.

```typescript
// lib/paddle.ts — Paddle billing integration
import { Paddle } from '@paddle/paddle-node-sdk'

const paddle = new Paddle(process.env.PADDLE_API_KEY!)

// Price IDs configured in Paddle dashboard
const PLANS = {
  starter: { priceId: 'pri_starter_monthly', seats: 5, price: 19 },
  pro: { priceId: 'pri_pro_monthly', seats: 20, price: 49 },
  business: { priceId: 'pri_business_monthly', seats: 100, price: 149 },
} as const
```

The checkout is a simple overlay — no separate payment page needed:

```tsx
// components/PricingCard.tsx — Paddle checkout trigger
'use client'

export function PricingCard({ plan, user }) {
  const handleSubscribe = () => {
    window.Paddle.Checkout.open({
      items: [{ priceId: plan.priceId, quantity: 1 }],
      customer: { email: user.email },
      customData: { userId: user.id, plan: plan.name },
      settings: {
        successUrl: '/dashboard?subscribed=true',
        theme: 'light',
      },
    })
  }

  return (
    <div className="border rounded-xl p-6">
      <h3 className="text-xl font-bold">{plan.name}</h3>
      <p className="text-3xl font-bold mt-2">${plan.price}<span className="text-sm text-gray-500">/mo</span></p>
      <p className="text-gray-600 mt-1">Up to {plan.seats} team members</p>
      <button onClick={handleSubscribe} className="mt-4 w-full bg-blue-600 text-white py-2 rounded-lg">
        Start Free Trial
      </button>
    </div>
  )
}
```

The webhook handler updates the database when Paddle confirms a subscription:

```typescript
// app/api/paddle/webhook/route.ts — Handle Paddle events
import { Paddle } from '@paddle/paddle-node-sdk'

const paddle = new Paddle(process.env.PADDLE_API_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const signature = req.headers.get('paddle-signature')!
  const event = paddle.webhooks.unmarshal(body, process.env.PADDLE_WEBHOOK_SECRET!, signature)

  switch (event.eventType) {
    case 'subscription.activated': {
      const { customerId, customData } = event.data
      await db.user.update({
        where: { id: customData.userId },
        data: {
          plan: customData.plan,
          paddleCustomerId: customerId,
          subscriptionId: event.data.id,
          trialEndsAt: null,
        },
      })
      // Trigger welcome email via Loops
      await trackLoopsEvent(customData.userId, 'subscription_activated', { plan: customData.plan })
      break
    }

    case 'subscription.canceled': {
      await db.user.update({
        where: { subscriptionId: event.data.id },
        data: { canceledAt: new Date(), cancelReason: event.data.cancelationReason },
      })
      await trackLoopsEvent(event.data.customData.userId, 'subscription_canceled')
      break
    }

    case 'subscription.past_due': {
      // Payment failed — send dunning email, restrict features
      await db.user.update({
        where: { subscriptionId: event.data.id },
        data: { paymentStatus: 'past_due' },
      })
      break
    }
  }

  return new Response('OK')
}
```

## Step 2: Feature Flags for Safe Rollouts

Tomás ships features behind flags. New features go to beta users first, then pro plan, then everyone. If something breaks, he flips a switch — no deployment needed.

```typescript
// lib/flags.ts — Feature flag helper
import * as LaunchDarkly from '@launchdarkly/node-server-sdk'

const ldClient = LaunchDarkly.init(process.env.LAUNCHDARKLY_SDK_KEY!)
await ldClient.waitForInitialization()

export async function checkFeature(flagKey: string, user: { id: string; plan: string; email: string }) {
  const context = {
    kind: 'user',
    key: user.id,
    email: user.email,
    custom: { plan: user.plan },
  }
  return ldClient.variation(flagKey, context, false)
}
```

```typescript
// middleware/features.ts — Gate features by plan and flag
export async function canAccessFeature(userId: string, feature: string) {
  const user = await db.user.findUnique({ where: { id: userId } })

  // Plan-based gating
  const planFeatures = {
    starter: ['projects', 'tasks', 'basic-reports'],
    pro: ['projects', 'tasks', 'basic-reports', 'gantt', 'time-tracking', 'integrations'],
    business: ['projects', 'tasks', 'basic-reports', 'gantt', 'time-tracking', 'integrations', 'custom-fields', 'audit-log', 'sso'],
  }

  if (!planFeatures[user.plan]?.includes(feature)) return false

  // Feature flag check (for gradual rollouts)
  const flagEnabled = await checkFeature(`feature-${feature}`, user)
  return flagEnabled
}
```

Tomás uses this pattern for every new feature. Last week he shipped a Gantt chart view — first to 10 internal testers, then 50 beta users who opted in, then all Pro users. A bug appeared at 50 users that never showed in testing. He disabled the flag in 3 seconds, fixed the bug overnight, and re-enabled the next morning. Zero downtime, zero angry customers.

## Step 3: Customer Support with Crisp

For support, Tomás uses Crisp. The free tier handles two operators (himself and a part-time support person) with unlimited conversations.

```tsx
// components/Support.tsx — Crisp chat with user context
'use client'
import { useEffect } from 'react'
import { useUser } from '@/hooks/useUser'

export function SupportChat() {
  const { user } = useUser()

  useEffect(() => {
    window.$crisp = []
    window.CRISP_WEBSITE_ID = process.env.NEXT_PUBLIC_CRISP_ID!

    const s = document.createElement('script')
    s.src = 'https://client.crisp.chat/l.js'
    s.async = true
    document.head.appendChild(s)

    // Pass user context to support agents
    if (user) {
      window.$crisp.push(['set', 'user:email', [user.email]])
      window.$crisp.push(['set', 'user:nickname', [user.name]])
      window.$crisp.push(['set', 'session:data', [
        ['plan', user.plan],
        ['mrr', String(user.mrr)],
        ['signup_date', user.createdAt],
        ['projects_count', String(user.projectsCount)],
      ]])
    }
  }, [user])

  return null
}
```

When a support conversation starts, the agent immediately sees the user's plan, MRR, and usage — no "what's your email?" back-and-forth.

## Step 4: Email Marketing with Loops

Loops handles both transactional emails (welcome, invoice, password reset) and marketing sequences (onboarding drip, upgrade nudges, churn prevention).

```typescript
// lib/loops.ts — Email events and transactional sends
const LOOPS_KEY = process.env.LOOPS_API_KEY!

export async function trackLoopsEvent(userId: string, event: string, data?: Record<string, any>) {
  const user = await db.user.findUnique({ where: { id: userId } })
  await fetch('https://app.loops.so/api/v1/events/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOOPS_KEY}` },
    body: JSON.stringify({
      email: user.email,
      eventName: event,
      eventProperties: data,
    }),
  })
}

// Automation triggers configured in Loops dashboard:
// 1. "user_signed_up" → Welcome email → Wait 1 day → Onboarding tips → Wait 3 days → "How's it going?"
// 2. "trial_ending_soon" → Upgrade reminder with pricing
// 3. "subscription_canceled" → Win-back sequence (discount offer after 7 days)
```

## Step 5: Product Feedback with Canny

Tomás embeds a feedback widget so users can request features and vote on what matters most.

```tsx
// components/FeedbackWidget.tsx — Canny feedback integration
export function FeedbackButton() {
  useEffect(() => {
    if (window.Canny) {
      window.Canny('identify', {
        appID: process.env.NEXT_PUBLIC_CANNY_APP_ID,
        user: {
          id: currentUser.id,
          email: currentUser.email,
          name: currentUser.name,
          customFields: { plan: currentUser.plan, mrr: currentUser.mrr },
        },
      })
    }
  }, [])

  return (
    <button data-canny-link data-board-token="your-board-token"
      className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
      💡 Request Feature
    </button>
  )
}
```

The custom fields are key — Tomás can filter feedback by plan and see that the top-requested feature from paying customers (custom fields, 47 votes from Pro/Business users) is different from the top-requested feature overall (dark mode, 120 votes mostly from free users). This changes his roadmap priorities entirely.

## Results

Tomás launches billing on a Monday. By Friday, 23 users have subscribed — $847 MRR. Paddle handled customers from 8 countries without Tomás thinking about tax once. The onboarding email sequence (Loops) converts 34% of signups to active users within a week. Crisp's chat widget catches three potential churns — users who were confused about a feature and would have left without asking. The Canny board already has 89 feature requests with clear vote counts, giving Tomás a data-driven roadmap for the next quarter. Total cost of the operational stack: $0/month (all free tiers), scaling to ~$100/month as the product grows.
