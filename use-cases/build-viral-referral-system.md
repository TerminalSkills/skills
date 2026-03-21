---
title: Build a Viral Referral Program with Reward Tiers
slug: build-viral-referral-system
description: "Add a viral referral loop to your SaaS — unique codes, share pages with OG images, tiered rewards (1 referral = 1 month free, 5 = forever free), fraud prevention, and Stripe reward automation."
skills: [stripe, prisma, resend]
category: growth
tags: [referral, viral, growth, stripe, rewards, fraud-prevention, saas]
---

# Build a Viral Referral Program with Reward Tiers

## The Problem

Your SaaS is growing — but 90% of that growth is coming from paid ads at $120 customer acquisition cost (CAC). You have 800 happy users. None of them are referring anyone because there's no mechanism for it, no incentive, and no easy share flow. Word of mouth is happening in Slack and Twitter but you're capturing none of it.

A well-designed referral program can bring CAC down to $20-30. The key ingredients: a reason to share (meaningful rewards), a frictionless share flow (one link, pre-written copy), and honest tracking so users see their progress. The hard part is fraud — your most "active" referrers will be creating fake accounts.

## The Solution

Use **Prisma** to store referral codes, track clicks and conversions, and manage reward state. Use **Stripe** to automate subscription credits and free month grants. Use **Resend** to notify referrers when they earn rewards and prompt them to share again.

## Step-by-Step Walkthrough

### Step 1: Database Schema

```text
Design a Prisma schema for a viral referral system. Include: ReferralCode 
(unique per user, click count, conversion count), ReferralConversion 
(links referrer to new user, tracks IP for fraud), and RewardGrant 
(tracks what rewards have been applied, status).
```

```prisma
// prisma/schema.prisma additions

model ReferralCode {
  id          String    @id @default(cuid())
  userId      String    @unique
  user        User      @relation(fields: [userId], references: [id])
  code        String    @unique

  clickCount       Int @default(0)
  conversionCount  Int @default(0) // Confirmed, paid conversions

  createdAt   DateTime  @default(now())
  conversions ReferralConversion[]
}

model ReferralConversion {
  id           String       @id @default(cuid())
  referralCode ReferralCode @relation(fields: [codeId], references: [id])
  codeId       String
  newUserId    String       @unique // One conversion per new user
  newUserEmail String
  clickIp      String       // IP used to click the referral link
  signupIp     String       // IP used to sign up (for fraud check)
  status       String       @default("pending") // pending | verified | rewarded | flagged
  rewardedAt   DateTime?
  createdAt    DateTime     @default(now())
}

model RewardGrant {
  id          String    @id @default(cuid())
  userId      String    // Referrer who earned the reward
  user        User      @relation(fields: [userId], references: [id])
  type        String    // "free_month" | "forever_free"
  reason      String    // "5_referrals" | "1_referral"
  appliedAt   DateTime?
  stripeNote  String?   // Stripe coupon or credit ID
  createdAt   DateTime  @default(now())
}
```

### Step 2: Generate Referral Codes

```typescript
// lib/referrals.ts — Generate and manage referral codes

import { prisma } from './prisma'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 8)

export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const existing = await prisma.referralCode.findUnique({ where: { userId } })
  if (existing) return existing.code

  const code = nanoid()
  await prisma.referralCode.create({ data: { userId, code } })
  return code
}

/** Track a referral link click — store IP for fraud detection later. */
export async function trackReferralClick(code: string, ip: string) {
  const ref = await prisma.referralCode.findUnique({ where: { code } })
  if (!ref) return

  await prisma.referralCode.update({
    where: { code },
    data: { clickCount: { increment: 1 } },
  })

  // Store click metadata in a short-lived session (cookie or Redis)
  // so we can associate the IP with the eventual signup
  return ref
}
```

### Step 3: Share Page with Pre-Written Copy and OG Image

```tsx
// app/referral/[code]/page.tsx — Public share/landing page for referral links

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { trackReferralClick } from '@/lib/referrals'

export async function generateMetadata({ params }: { params: { code: string } }) {
  const ref = await prisma.referralCode.findUnique({
    where: { code: params.code },
    include: { user: { select: { name: true } } },
  })
  if (!ref) return {}

  return {
    title: `${ref.user.name} invited you to [App Name]`,
    description: 'Join and get your first month free when you sign up with this link.',
    openGraph: {
      images: [`/api/og/referral?code=${params.code}&name=${encodeURIComponent(ref.user.name)}`],
    },
  }
}

export default async function ReferralPage({ params }: { params: { code: string } }) {
  const ref = await prisma.referralCode.findUnique({
    where: { code: params.code },
    include: { user: { select: { name: true, avatarUrl: true } } },
  })
  if (!ref) notFound()

  // Track the click server-side
  const headersList = headers()
  const ip = headersList.get('x-forwarded-for') || 'unknown'
  await trackReferralClick(params.code, ip)

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 to-indigo-900 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl p-10 max-w-lg w-full text-center shadow-2xl">
        {ref.user.avatarUrl && (
          <img src={ref.user.avatarUrl} alt="" className="w-16 h-16 rounded-full mx-auto mb-4" />
        )}
        <p className="text-slate-500 text-sm mb-2">Your friend <strong>{ref.user.name}</strong> invites you to</p>
        <h1 className="text-3xl font-bold mb-4">[App Name]</h1>

        <div className="bg-violet-50 rounded-xl p-4 mb-6">
          <p className="text-violet-700 font-semibold">🎁 Sign up with this link and get</p>
          <p className="text-2xl font-bold text-violet-900 mt-1">Your first month free</p>
        </div>

        <a
          href={`/signup?ref=${params.code}`}
          className="block w-full py-4 bg-violet-600 hover:bg-violet-500 text-white 
                     font-semibold rounded-xl text-lg transition-colors"
        >
          Claim my free month →
        </a>
        <p className="text-xs text-slate-400 mt-4">No credit card required to start.</p>
      </div>
    </div>
  )
}
```

### Step 4: Track Conversions and Detect Fraud

```typescript
// lib/referrals.ts — Record a conversion when referred user completes signup and pays

export async function recordConversion({
  referralCode, newUserId, newUserEmail, signupIp
}: {
  referralCode: string; newUserId: string; newUserEmail: string; signupIp: string
}) {
  const ref = await prisma.referralCode.findUnique({ where: { code: referralCode } })
  if (!ref) return

  // Simple fraud checks
  const flags: string[] = []

  // 1. Same IP as referrer's recent click?
  const sameIpConversion = await prisma.referralConversion.findFirst({
    where: { clickIp: signupIp, codeId: ref.id }
  })
  if (sameIpConversion) flags.push('same_ip')

  // 2. Email domain matches a temp-mail provider?
  const tempMailDomains = ['mailinator.com', 'guerrillamail.com', 'throwam.com', 'yopmail.com']
  const emailDomain = newUserEmail.split('@')[1]
  if (tempMailDomains.includes(emailDomain)) flags.push('temp_email')

  const status = flags.length > 0 ? 'flagged' : 'pending'

  await prisma.referralConversion.create({
    data: {
      codeId: ref.id,
      newUserId,
      newUserEmail,
      clickIp: signupIp, // Approximation — ideally stored from click session
      signupIp,
      status,
    },
  })

  if (flags.length > 0) {
    console.warn(`Referral conversion flagged: ${flags.join(', ')} — userId: ${newUserId}`)
  }
}

/** Verify a conversion after the new user makes their first payment. */
export async function verifyAndReward(newUserId: string) {
  const conversion = await prisma.referralConversion.findUnique({
    where: { newUserId },
    include: { referralCode: { include: { user: true } } },
  })
  if (!conversion || conversion.status !== 'pending') return

  await prisma.referralConversion.update({
    where: { id: conversion.id },
    data: { status: 'verified', rewardedAt: new Date() },
  })

  // Update referrer's conversion count
  const newCount = await prisma.referralConversion.count({
    where: { codeId: conversion.codeId, status: 'verified' }
  })

  await prisma.referralCode.update({
    where: { id: conversion.codeId },
    data: { conversionCount: newCount },
  })

  // Apply reward tiers
  await applyRewardTier(conversion.referralCode.userId, newCount)
}
```

### Step 5: Reward Tiers and Stripe Automation

```typescript
// lib/rewards.ts — Stripe-based reward fulfillment

import Stripe from 'stripe'
import { prisma } from './prisma'
import { sendRewardEmail } from './referral-emails'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function applyRewardTier(referrerId: string, totalConversions: number) {
  const user = await prisma.user.findUnique({ where: { id: referrerId } })
  if (!user?.stripeCustomerId) return

  // Tier 1: 1 verified referral → 1 month free (one-time)
  if (totalConversions === 1) {
    const alreadyGranted = await prisma.rewardGrant.findFirst({
      where: { userId: referrerId, type: 'free_month' }
    })
    if (alreadyGranted) return

    // Add credit to Stripe customer balance ($79 = one Growth month)
    await stripe.customers.createBalanceTransaction(user.stripeCustomerId, {
      amount: -7900, // Negative = credit
      currency: 'usd',
      description: 'Referral reward: 1 free month',
    })

    await prisma.rewardGrant.create({
      data: { userId: referrerId, type: 'free_month', reason: '1_referral', appliedAt: new Date() }
    })
    await sendRewardEmail(referrerId, 'free_month', { creditsApplied: '$79' })
  }

  // Tier 2: 5 verified referrals → forever free (lifetime discount coupon)
  if (totalConversions === 5) {
    const alreadyGranted = await prisma.rewardGrant.findFirst({
      where: { userId: referrerId, type: 'forever_free' }
    })
    if (alreadyGranted) return

    // Create a 100% forever coupon and attach to customer
    const coupon = await stripe.coupons.create({
      percent_off: 100,
      duration: 'forever',
      name: 'Referral Champion — Forever Free',
    })

    if (user.stripeSubscriptionId) {
      await stripe.subscriptions.update(user.stripeSubscriptionId, {
        coupon: coupon.id,
      })
    }

    await prisma.rewardGrant.create({
      data: {
        userId: referrerId, type: 'forever_free', reason: '5_referrals',
        appliedAt: new Date(), stripeNote: coupon.id
      }
    })
    await sendRewardEmail(referrerId, 'forever_free', {})
  }
}
```

### Step 6: Referral Dashboard for Users

```tsx
// app/dashboard/referrals/page.tsx — User-facing referral stats and share widget

import { prisma } from '@/lib/prisma'
import { getOrCreateReferralCode } from '@/lib/referrals'

export default async function ReferralDashboard({ userId }: { userId: string }) {
  const code = await getOrCreateReferralCode(userId)
  const ref = await prisma.referralCode.findUnique({
    where: { code },
    include: {
      conversions: { where: { status: 'verified' }, orderBy: { createdAt: 'desc' } }
    }
  })
  const rewards = await prisma.rewardGrant.findMany({ where: { userId } })
  const referralUrl = `${process.env.NEXT_PUBLIC_APP_URL}/referral/${code}`

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Refer friends, earn rewards</h1>

      {/* Reward tiers */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[
          { refs: 1, reward: '1 month free', earned: rewards.some(r => r.type === 'free_month') },
          { refs: 5, reward: 'Forever free', earned: rewards.some(r => r.type === 'forever_free') },
        ].map(tier => (
          <div key={tier.refs}
            className={`p-4 rounded-xl border-2 ${tier.earned ? 'border-green-400 bg-green-50' : 'border-slate-200'}`}>
            <p className="text-sm text-slate-500">{tier.refs} referral{tier.refs > 1 ? 's' : ''}</p>
            <p className="font-bold text-lg">{tier.reward}</p>
            {tier.earned && <p className="text-green-600 text-sm mt-1">✓ Earned!</p>}
          </div>
        ))}
      </div>

      {/* Share link */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6">
        <p className="text-sm font-medium text-slate-700 mb-2">
          Your referral link — {ref?.conversionCount || 0} conversions so far
        </p>
        <div className="flex gap-2">
          <input readOnly value={referralUrl}
            className="flex-1 text-sm bg-white border rounded-lg px-3 py-2" />
          <button onClick={() => navigator.clipboard.writeText(referralUrl)}
            className="px-4 py-2 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-400">
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
```

## Real-World Example

A B2C SaaS founder (project management tool, $19/mo) adds this referral system in one sprint. Within 60 days, 15% of new signups come through referral links. Three users hit the 5-referral tier and get lifetime accounts — they become the loudest advocates on Twitter. The paid CAC drops from $95 to $41. Two flagged conversions (same-IP signups) are reviewed manually and rejected. The fraud detection isn't perfect but catches the obvious cases without blocking legitimate referrals.

## Related Skills

- [stripe](../skills/stripe/) — Customer balance credits, coupons, and subscription management
- [prisma](../skills/prisma/) — Relational data modeling for referrals and rewards
- [resend](../skills/resend/) — Reward notification and referral invite emails
