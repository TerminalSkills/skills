---
title: Build a Waitlist and Launch Page with Viral Referral
slug: build-waitlist-and-launch-page
description: "Launch a viral waitlist page before your product is ready — email capture, referral-powered position climbing, magic link confirmation, and drip invite emails for early access."
skills: [resend, prisma, nextjs]
category: growth
tags: [waitlist, launch, referral, email, nextjs, saas, viral]
---

# Build a Waitlist and Launch Page with Viral Referral

## The Problem

You have a SaaS idea and want to validate demand before writing a single line of product code. You need a landing page that captures emails, builds social proof, and creates urgency — but also gives people a reason to share it. The classic "just collect emails" waitlist leaves 80% of visitors passive. A referral-powered waitlist turns every signup into a recruiter.

The goal: 500 signups in two weeks without paying for ads. Each person who signs up gets a unique referral link. Every successful referral moves them up the waitlist. Top referrers get early access first. By launch day, you know exactly how many people care, and your most engaged users are already your advocates.

## The Solution

Use **Next.js** for the landing page and API routes, **Prisma** to store waitlist entries and referral relationships, and **Resend** for magic link confirmation and drip launch emails.

## Step-by-Step Walkthrough

### Step 1: Database Schema

```text
Design a Prisma schema for a viral waitlist. Each entry has: email, 
unique referral code, referrer code (optional), position, confirmed status, 
invite tier, and timestamps. Include a ReferralClick table for tracking.
```

```prisma
// prisma/schema.prisma

model WaitlistEntry {
  id             String    @id @default(cuid())
  email          String    @unique
  referralCode   String    @unique @default(cuid())
  referredBy     String?   // referralCode of the person who invited them
  position       Int       // lower = better
  confirmed      Boolean   @default(false)
  confirmToken   String?   @unique
  inviteTier     String    @default("standard") // "founding", "early", "standard"
  invitedAt      DateTime?
  createdAt      DateTime  @default(now())

  referrals      WaitlistEntry[] @relation("ReferralTree", fields: [referredBy], references: [referralCode])
  referrer       WaitlistEntry?  @relation("ReferralTree")
  clicks         ReferralClick[]
}

model ReferralClick {
  id         String         @id @default(cuid())
  entryId    String
  entry      WaitlistEntry  @relation(fields: [entryId], references: [id])
  ip         String
  userAgent  String
  clickedAt  DateTime       @default(now())
}
```

```bash
npx prisma migrate dev --name init-waitlist
```

### Step 2: Landing Page with Email Capture

```text
Build a Next.js landing page for a SaaS waitlist. Include: headline, 
subheadline, email input form, current waitlist size counter (from DB), 
social proof section, and animated submit button with loading state.
```

```tsx
// app/page.tsx — Main landing page

import { prisma } from '@/lib/prisma'
import WaitlistForm from '@/components/WaitlistForm'

export default async function LandingPage() {
  const waitlistSize = await prisma.waitlistEntry.count({
    where: { confirmed: true }
  })

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        {/* Social proof badge */}
        <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1 text-sm mb-8">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          {waitlistSize.toLocaleString()} people already on the list
        </div>

        <h1 className="text-5xl font-bold mb-6 leading-tight">
          The tool your team has been waiting for
        </h1>
        <p className="text-xl text-slate-300 mb-12 max-w-2xl mx-auto">
          We're building something new. Join the waitlist for early access,
          founding member pricing, and a chance to shape the product.
        </p>

        <WaitlistForm />

        {/* Trust signals */}
        <p className="text-sm text-slate-400 mt-6">
          No spam. Unsubscribe anytime. Your spot is real.
        </p>
      </div>
    </main>
  )
}
```

```tsx
// components/WaitlistForm.tsx — Email capture with referral tracking

'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

export default function WaitlistForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref') // referral code from URL

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')
    const res = await fetch('/api/waitlist/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, ref }),
    })
    setStatus(res.ok ? 'done' : 'error')
  }

  if (status === 'done') {
    return (
      <div className="bg-green-500/20 border border-green-500/30 rounded-xl p-8">
        <p className="text-xl font-semibold mb-2">You're on the list! 🎉</p>
        <p className="text-slate-300">Check your email to confirm your spot.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
      <input
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@company.com"
        required
        className="flex-1 px-4 py-3 rounded-lg bg-white/10 border border-white/20 
                   text-white placeholder:text-slate-400 focus:outline-none focus:border-white/50"
      />
      <button
        type="submit"
        disabled={status === 'loading'}
        className="px-6 py-3 bg-indigo-500 hover:bg-indigo-400 rounded-lg font-semibold
                   disabled:opacity-50 transition-colors"
      >
        {status === 'loading' ? 'Joining…' : 'Join Waitlist'}
      </button>
    </form>
  )
}
```

### Step 3: Join API with Referral Tracking

```typescript
// app/api/waitlist/join/route.ts — Handle waitlist signups

import { prisma } from '@/lib/prisma'
import { sendConfirmationEmail } from '@/lib/email'
import { randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { email, ref } = await req.json()

  // Check for duplicate
  const existing = await prisma.waitlistEntry.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ message: 'Already on waitlist' })
  }

  // Validate referral code
  const referrer = ref
    ? await prisma.waitlistEntry.findUnique({ where: { referralCode: ref } })
    : null

  const position = (await prisma.waitlistEntry.count()) + 1
  const confirmToken = randomBytes(32).toString('hex')

  const entry = await prisma.waitlistEntry.create({
    data: {
      email,
      position,
      referredBy: referrer?.referralCode,
      confirmToken,
      inviteTier: position <= 100 ? 'founding' : position <= 500 ? 'early' : 'standard',
    },
  })

  // Boost referrer's position
  if (referrer) {
    const referralCount = await prisma.waitlistEntry.count({
      where: { referredBy: referrer.referralCode }
    })
    // Each referral moves you up 5 spots (minimum position: 1)
    await prisma.waitlistEntry.update({
      where: { id: referrer.id },
      data: { position: Math.max(1, referrer.position - 5 * referralCount) },
    })
  }

  // Send magic link confirmation
  await sendConfirmationEmail({
    to: email,
    confirmUrl: `${process.env.APP_URL}/api/waitlist/confirm?token=${confirmToken}`,
    position: entry.position,
    referralLink: `${process.env.APP_URL}?ref=${entry.referralCode}`,
  })

  return NextResponse.json({ success: true, position: entry.position })
}
```

### Step 4: Magic Link Confirmation Email with Resend

```typescript
// lib/email.ts — Resend email templates

import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendConfirmationEmail({
  to, confirmUrl, position, referralLink
}: {
  to: string; confirmUrl: string; position: number; referralLink: string
}) {
  await resend.emails.send({
    from: 'YourApp <waitlist@yourdomain.com>',
    to,
    subject: `Confirm your spot #${position} on the waitlist`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; margin-bottom: 8px;">You're in — almost.</h1>
        <p style="color: #6b7280; margin-bottom: 24px;">
          Confirm your email to lock in spot <strong>#${position}</strong>.
        </p>
        <a href="${confirmUrl}" style="display: inline-block; background: #4f46e5; color: white;
           padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          Confirm My Spot
        </a>
        <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e7eb;" />
        <p style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">
          <strong>Want to move up the list?</strong><br />
          Every friend you invite moves you up 5 spots. Share your link:
        </p>
        <p style="background: #f3f4f6; padding: 12px; border-radius: 6px; font-size: 13px; word-break: break-all;">
          ${referralLink}
        </p>
      </div>
    `,
  })
}
```

```typescript
// app/api/waitlist/confirm/route.ts — Confirm email and show referral dashboard

import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token')
  if (!token) redirect('/waitlist/invalid')

  const entry = await prisma.waitlistEntry.update({
    where: { confirmToken: token },
    data: { confirmed: true, confirmToken: null },
  })

  // Count referrals they've made
  const referralCount = await prisma.waitlistEntry.count({
    where: { referredBy: entry.referralCode, confirmed: true }
  })

  redirect(
    `/waitlist/confirmed?pos=${entry.position}&refs=${referralCount}&code=${entry.referralCode}`
  )
}
```

### Step 5: Post-Confirmation Page with Referral Share Widget

```tsx
// app/waitlist/confirmed/page.tsx — Share your referral link to climb the list

export default function ConfirmedPage({ searchParams }: { searchParams: any }) {
  const { pos, refs, code } = searchParams
  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}?ref=${code}`
  const shareText = encodeURIComponent(
    `I just joined the waitlist for [App Name] — looks promising. Join with my link to skip ahead: ${referralLink}`
  )

  return (
    <div className="max-w-lg mx-auto px-6 py-16 text-center">
      <div className="text-5xl mb-6">🎉</div>
      <h1 className="text-3xl font-bold mb-3">You're confirmed!</h1>
      <p className="text-slate-500 mb-8">
        You're currently <strong>#{pos}</strong> on the waitlist.
        You've referred <strong>{refs}</strong> friend{refs !== '1' ? 's' : ''} so far.
      </p>

      <div className="bg-slate-50 rounded-xl p-6 mb-6 text-left">
        <p className="text-sm font-semibold text-slate-700 mb-2">Your referral link</p>
        <p className="text-sm text-indigo-600 break-all mb-3">{referralLink}</p>
        <p className="text-xs text-slate-400">Each confirmed referral moves you up 5 spots</p>
      </div>

      <div className="flex gap-3">
        <a
          href={`https://twitter.com/intent/tweet?text=${shareText}`}
          target="_blank"
          className="flex-1 py-3 bg-black text-white rounded-lg font-semibold text-sm hover:bg-slate-800"
        >
          Share on X
        </a>
        <a
          href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`}
          target="_blank"
          className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold text-sm hover:bg-blue-500"
        >
          Share on LinkedIn
        </a>
      </div>
    </div>
  )
}
```

### Step 6: Admin Dashboard and Launch Drip Emails

```typescript
// scripts/send-invites.ts — Drip invite emails by tier at launch

import { prisma } from '../lib/prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

async function sendInviteBatch(tier: string, limit: number) {
  const entries = await prisma.waitlistEntry.findMany({
    where: { confirmed: true, inviteTier: tier, invitedAt: null },
    orderBy: { position: 'asc' },
    take: limit,
  })

  console.log(`Sending ${entries.length} invites for tier: ${tier}`)

  for (const entry of entries) {
    await resend.emails.send({
      from: 'Team <hello@yourdomain.com>',
      to: entry.email,
      subject: "Your early access is ready 🚀",
      html: `<p>You're in! <a href="${process.env.APP_URL}/signup?invite=${entry.referralCode}">Click here</a> to claim your early access.</p>`,
    })
    await prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { invitedAt: new Date() },
    })
    // Rate limit: 2 emails/sec to stay within Resend free tier
    await new Promise(r => setTimeout(r, 500))
  }
}

// Send founding tier first, then early, then standard
await sendInviteBatch('founding', 100)
```

## Real-World Example

A solo founder building a B2B analytics tool puts up this waitlist on a Monday. The landing page takes 4 hours end-to-end. On day one, 47 people sign up organically. Three of them are prolific sharers — one refers 18 people and climbs from position #31 to #2. By day 14, there are 612 confirmed signups, 40% came through referrals. The founder sends founding-tier invites to the top 100, gets 73 activated in the first week, and uses their feedback to shape the product before wider rollout.

## Related Skills

- [resend](../skills/resend/) — Transactional email and drip sequences
- [prisma](../skills/prisma/) — Database schema and queries
- [nextjs](../skills/nextjs/) — App Router, API routes, and server components
