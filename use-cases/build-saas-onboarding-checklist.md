---
title: Build a SaaS Onboarding Checklist That Drives Activation
slug: build-saas-onboarding-checklist
description: "Build an interactive onboarding checklist that guides users step-by-step to their 'aha moment' — with DB-persisted progress, completion emails, tooltip guides, and activation analytics."
skills: [prisma, resend, posthog]
category: product
tags: [onboarding, activation, checklist, saas, analytics, email, ux]
---

# Build a SaaS Onboarding Checklist That Drives Activation

## The Problem

Your SaaS has a 20% activation rate. Eighty percent of new signups never complete setup, never invite a teammate, and churn before their first value moment. The product is good — but users don't know where to start, get confused, and quietly leave. No Intercom message fixes this. The problem is structural: there's no guided path from "just signed up" to "oh, this is actually useful."

A well-designed onboarding checklist with contextual guidance, progress persistence, and automated nudges can push activation from 20% to 60%+. Not by adding more features — by showing people the features they already have in the right order.

## The Solution

Use **Prisma** to persist per-user checklist progress, **Resend** to trigger emails at key milestones and nudge users who stall, and **PostHog** to track completion rates and identify where users drop off.

## Step-by-Step Walkthrough

### Step 1: Define Onboarding Steps and Schema

```text
Design a Prisma schema for an onboarding checklist system. Each user has an 
OnboardingProgress record with individual boolean fields per step and a 
completedAt timestamp. Steps: setupProfile, connectData, inviteTeam, goLive.
```

```prisma
// prisma/schema.prisma

model OnboardingProgress {
  id             String    @id @default(cuid())
  userId         String    @unique
  user           User      @relation(fields: [userId], references: [id])

  // Steps — each is a boolean completed flag
  setupProfile   Boolean   @default(false)
  connectData    Boolean   @default(false)
  inviteTeam     Boolean   @default(false)
  goLive         Boolean   @default(false)

  // Timestamps for funnel analysis
  profileAt      DateTime?
  connectDataAt  DateTime?
  inviteTeamAt   DateTime?
  goLiveAt       DateTime?

  completedAt    DateTime? // All steps done
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}
```

```bash
npx prisma migrate dev --name add-onboarding-progress
```

### Step 2: Initialize Progress on Signup

```typescript
// lib/onboarding.ts — Create progress record on new user creation

import { prisma } from './prisma'

export async function initOnboarding(userId: string) {
  return prisma.onboardingProgress.upsert({
    where: { userId },
    create: { userId },
    update: {}, // Don't overwrite if already exists
  })
}

// Call this in your signup handler:
// await initOnboarding(user.id)
```

### Step 3: Checklist UI Component

```tsx
// components/OnboardingChecklist.tsx — Floating checklist with progress ring

'use client'
import { useState } from 'react'

interface Step {
  id: string
  label: string
  description: string
  done: boolean
  href: string  // Where to send the user to complete this step
}

interface Props {
  steps: Step[]
  userId: string
}

export default function OnboardingChecklist({ steps, userId }: Props) {
  const [open, setOpen] = useState(true)
  const completedCount = steps.filter(s => s.done).length
  const pct = Math.round((completedCount / steps.length) * 100)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open ? (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-xl w-80">
          {/* Header with progress ring */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <ProgressRing pct={pct} size={36} />
              <div>
                <p className="font-semibold text-sm">Get started</p>
                <p className="text-xs text-slate-400">{completedCount}/{steps.length} complete</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">✕</button>
          </div>

          {/* Steps list */}
          <div className="p-2">
            {steps.map(step => (
              <a
                key={step.id}
                href={step.done ? '#' : step.href}
                className={`flex items-start gap-3 p-3 rounded-xl transition-colors
                  ${step.done ? 'opacity-50 cursor-default' : 'hover:bg-slate-50'}`}
              >
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                  ${step.done ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300'}`}>
                  {step.done && <span className="text-white text-xs">✓</span>}
                </div>
                <div>
                  <p className={`text-sm font-medium ${step.done ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                    {step.label}
                  </p>
                  {!step.done && (
                    <p className="text-xs text-slate-400 mt-0.5">{step.description}</p>
                  )}
                </div>
              </a>
            ))}
          </div>

          {completedCount === steps.length && (
            <div className="p-4 pt-0 text-center">
              <div className="bg-green-50 rounded-xl p-3">
                <p className="text-sm font-semibold text-green-700">🎉 All done! You're set up.</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="bg-indigo-500 text-white rounded-full w-14 h-14 flex items-center justify-center
                     shadow-lg hover:bg-indigo-400 relative"
        >
          <span className="text-xl">✓</span>
          {completedCount < steps.length && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-xs w-5 h-5 
                             rounded-full flex items-center justify-center">
              {steps.length - completedCount}
            </span>
          )}
        </button>
      )}
    </div>
  )
}

function ProgressRing({ pct, size }: { pct: number; size: number }) {
  const r = (size - 4) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#4f46e5" strokeWidth="3"
        strokeDasharray={c} strokeDashoffset={c - (c * pct) / 100} strokeLinecap="round" />
    </svg>
  )
}
```

### Step 4: Mark Steps Complete with PostHog Tracking

```typescript
// app/api/onboarding/complete-step/route.ts — Mark a step complete and track the event

import { prisma } from '@/lib/prisma'
import { PostHog } from 'posthog-node'
import { triggerMilestoneEmail } from '@/lib/onboarding-emails'
import { NextRequest, NextResponse } from 'next/server'

const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
})

const STEP_FIELDS: Record<string, string> = {
  setupProfile: 'profileAt',
  connectData:  'connectDataAt',
  inviteTeam:   'inviteTeamAt',
  goLive:       'goLiveAt',
}

export async function POST(req: NextRequest) {
  const { userId, step } = await req.json()

  if (!STEP_FIELDS[step]) {
    return NextResponse.json({ error: 'Unknown step' }, { status: 400 })
  }

  const progress = await prisma.onboardingProgress.update({
    where: { userId },
    data: {
      [step]: true,
      [STEP_FIELDS[step]]: new Date(),
    },
  })

  // Track step completion in PostHog
  posthog.capture({
    distinctId: userId,
    event: 'onboarding_step_completed',
    properties: { step, timestamp: new Date().toISOString() },
  })

  // Check if all steps done → trigger confetti + completion email
  const allSteps = ['setupProfile', 'connectData', 'inviteTeam', 'goLive']
  const allDone = allSteps.every(s => (progress as any)[s])

  if (allDone && !progress.completedAt) {
    await prisma.onboardingProgress.update({
      where: { userId },
      data: { completedAt: new Date() },
    })
    posthog.capture({
      distinctId: userId,
      event: 'onboarding_completed',
    })
    await triggerMilestoneEmail(userId, 'onboarding_complete')
  }

  await posthog.shutdown()
  return NextResponse.json({ success: true, allDone })
}
```

### Step 5: Automated Email Nudges with Resend

```typescript
// lib/onboarding-emails.ts — Triggered and scheduled onboarding emails

import { Resend } from 'resend'
import { prisma } from './prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function triggerMilestoneEmail(userId: string, milestone: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return

  const templates: Record<string, { subject: string; html: string }> = {
    onboarding_complete: {
      subject: "You're all set up! Here's what to do next 🚀",
      html: `<p>Hi ${user.name},</p>
             <p>You've completed your setup — you're now in the top 10% of users who get full value from the product.</p>
             <p>Here's your next step: <a href="${process.env.APP_URL}/dashboard">Check your dashboard</a>.</p>`,
    },
    invite_team_nudge: {
      subject: "You're missing out on the best feature",
      html: `<p>Hi ${user.name},</p>
             <p>Teams that invite at least one colleague see 3x more value in the first month.</p>
             <p><a href="${process.env.APP_URL}/team/invite">Invite your team →</a></p>`,
    },
  }

  const template = templates[milestone]
  if (!template) return

  await resend.emails.send({
    from: 'Your Name <hello@yourdomain.com>',
    to: user.email,
    subject: template.subject,
    html: template.html,
  })
}

/** Cron job: nudge users stuck on a step after 24 hours. */
export async function nudgeStuckUsers() {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Users who signed up >24h ago and haven't invited their team
  const stuck = await prisma.onboardingProgress.findMany({
    where: {
      inviteTeam: false,
      setupProfile: true,      // Did step 1 but stopped
      createdAt: { lt: oneDayAgo },
    },
    include: { user: true },
  })

  for (const entry of stuck) {
    await triggerMilestoneEmail(entry.userId, 'invite_team_nudge')
  }
}
```

### Step 6: Activation Funnel in PostHog

```typescript
// scripts/analyze-onboarding.ts — Query drop-off stats from PostHog

// In PostHog dashboard, create a Funnel with these events in order:
// 1. user_signed_up
// 2. onboarding_step_completed { step: 'setupProfile' }
// 3. onboarding_step_completed { step: 'connectData' }
// 4. onboarding_step_completed { step: 'inviteTeam' }
// 5. onboarding_step_completed { step: 'goLive' }
// 6. onboarding_completed

// Or query via PostHog API:
const response = await fetch(`${process.env.POSTHOG_HOST}/api/projects/${process.env.POSTHOG_PROJECT_ID}/insights/funnel/`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    insight: 'FUNNELS',
    events: [
      { id: 'user_signed_up', type: 'events', order: 0 },
      { id: 'onboarding_step_completed', type: 'events', order: 1,
        properties: [{ key: 'step', value: 'setupProfile' }] },
      { id: 'onboarding_step_completed', type: 'events', order: 2,
        properties: [{ key: 'step', value: 'connectData' }] },
      { id: 'onboarding_completed', type: 'events', order: 3 },
    ],
    date_from: '-30d',
  }),
})

const data = await response.json()
console.log('Activation funnel:', data.result)
// Typical output: [100%, 78%, 54%, 38%] → shows biggest drop-off is connectData→inviteTeam
```

## Real-World Example

A SaaS PM takes over a product with 22% activation. The onboarding is a wall of text that no one reads. She builds this checklist in a weekend: four steps, each linking directly to the relevant screen, with tooltip guides on the tricky parts (Shepherd.js for connect-data, a custom tooltip for the invite flow).

PostHog data after 30 days: step 1 (profile) completion goes from 65% to 89% — the form used to be buried three levels deep, now a button in the checklist takes you straight there. Step 3 (invite team) jumps from 18% to 41% after adding the nudge email. Overall activation moves from 22% to 51% in six weeks without touching the core product.

## Related Skills

- [prisma](../skills/prisma/) — Database schema design and queries
- [resend](../skills/resend/) — Transactional and triggered email sequences
- [posthog](../skills/posthog/) — Product analytics, funnels, and event tracking
