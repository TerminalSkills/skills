---
title: "Build a High-Converting Trial-to-Paid Conversion Flow"
description: "Set up a 14-day free trial with activation tracking, usage-based nudge emails, in-app upgrade prompts, and an offboarding survey — to take conversion from 15% to 30%."
skills: [stripe, resend, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [saas, conversion, trial, email, stripe, onboarding, growth]
---

# Build a High-Converting Trial-to-Paid Conversion Flow

Most SaaS companies treat trials as "give them 14 days and hope for the best." The ones with 25-30% conversion rates do something different: they watch what users do, intervene at exactly the right moment, and make upgrading feel like the obvious next step.

## The Persona

You're the PM at a project management SaaS. Your trial conversion is 15%. You know the "aha moment" is when a user adds their first team member. Users who do that in the first 3 days convert at 40%. Users who never do it convert at 2%. You need to engineer the path to that moment.

## What You'll Build

- **Trial setup** — 14-day free trial, no credit card, auto-expiry
- **Activation tracking** — define and detect the aha moment
- **Nudge campaigns** — day 3, day 7, day 13 emails based on actual usage
- **In-app upgrade prompts** — contextual banners when hitting limits
- **Offboarding survey** — capture why they didn't convert on expiry

## Schema

```prisma
// schema.prisma
model Trial {
  id              String      @id @default(cuid())
  userId          String      @unique
  startedAt       DateTime    @default(now())
  expiresAt       DateTime
  activatedAt     DateTime?   // when they hit the aha moment
  convertedAt     DateTime?
  status          TrialStatus @default(ACTIVE)
  nudgesSent      Json        @default("[]") // track which emails sent

  user            User        @relation(fields: [userId], references: [id])
}

enum TrialStatus {
  ACTIVE
  CONVERTED
  EXPIRED
  CHURNED
}

model OffboardingSurvey {
  id        String   @id @default(cuid())
  userId    String
  reason    String   // too_expensive, missing_feature, not_ready, competitor
  feedback  String?
  createdAt DateTime @default(now())
}
```

## Step 1: Start a Trial

```typescript
// lib/trial.ts
import { prisma } from './prisma'
import { addDays } from 'date-fns'

export async function startTrial(userId: string) {
  const trial = await prisma.trial.create({
    data: {
      userId,
      expiresAt: addDays(new Date(), 14),
    },
  })

  // Send welcome email immediately
  await sendTrialWelcome(userId)

  return trial
}

// Called when user registers
export async function onUserSignup(userId: string) {
  await startTrial(userId)
  // Schedule the nudge pipeline
  await scheduleNudges(userId)
}
```

## Step 2: Track the Aha Moment

```typescript
// lib/activation.ts
import { prisma } from './prisma'

// Define your aha moment — the action that predicts conversion
const AHA_MOMENT = 'team_member_added'

export async function trackActivationEvent(userId: string, event: string) {
  if (event !== AHA_MOMENT) return

  const trial = await prisma.trial.findUnique({ where: { userId } })
  if (!trial || trial.activatedAt) return // already activated

  await prisma.trial.update({
    where: { userId },
    data: { activatedAt: new Date() },
  })

  // Activated users get a different email — celebrate + nudge upgrade
  await sendActivationEmail(userId)
}

export async function isActivated(userId: string): Promise<boolean> {
  const trial = await prisma.trial.findUnique({ where: { userId } })
  return !!trial?.activatedAt
}
```

## Step 3: Nudge Email Campaigns

```typescript
// workers/trial-nudges.ts
import { Resend } from 'resend'
import { prisma } from '../lib/prisma'
import { differenceInDays } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)

const NUDGE_SCHEDULE = [
  { day: 3,  templateId: 'trial-day-3-not-activated', condition: 'not_activated' },
  { day: 3,  templateId: 'trial-day-3-activated',     condition: 'activated' },
  { day: 7,  templateId: 'trial-day-7-usage-low',     condition: 'not_activated' },
  { day: 7,  templateId: 'trial-day-7-upgrade',       condition: 'activated' },
  { day: 13, templateId: 'trial-day-13-last-chance',  condition: 'any' },
]

export async function processTrialNudges() {
  const activeTrials = await prisma.trial.findMany({
    where: { status: 'ACTIVE' },
    include: { user: true },
  })

  for (const trial of activeTrials) {
    const daysSinceStart = differenceInDays(new Date(), trial.startedAt)
    const activated = !!trial.activatedAt
    const nudgesSent = trial.nudgesSent as string[]

    for (const nudge of NUDGE_SCHEDULE) {
      if (daysSinceStart < nudge.day) continue
      if (nudgesSent.includes(nudge.templateId)) continue
      if (nudge.condition === 'activated' && !activated) continue
      if (nudge.condition === 'not_activated' && activated) continue

      await sendNudgeEmail(trial.user.email, nudge.templateId, {
        userName: trial.user.name,
        daysLeft: 14 - daysSinceStart,
        activated,
      })

      // Mark as sent
      await prisma.trial.update({
        where: { id: trial.id },
        data: { nudgesSent: [...nudgesSent, nudge.templateId] },
      })

      break // one nudge per run per user
    }
  }
}

async function sendNudgeEmail(
  to: string,
  templateId: string,
  vars: Record<string, unknown>
) {
  const templates: Record<string, { subject: string; html: string }> = {
    'trial-day-3-not-activated': {
      subject: 'You haven\'t tried the best part yet 👀',
      html: `<p>Hey ${vars.userName},</p>
             <p>Most teams unlock 10x productivity by inviting their colleagues.
             It takes 30 seconds. <a href="https://app.example.com/team/invite">Try it now →</a></p>`,
    },
    'trial-day-13-last-chance': {
      subject: `Your trial ends tomorrow — here's what you'd lose`,
      html: `<p>Tomorrow your trial ends. Here's what stops working:
             all your projects, team collaboration, and integrations.
             <a href="https://app.example.com/upgrade">Upgrade for $29/mo →</a></p>`,
    },
    // ... other templates
  }

  const template = templates[templateId] ?? templates['trial-day-13-last-chance']

  await resend.emails.send({
    from: 'team@example.com',
    to,
    subject: template.subject,
    html: template.html,
  })
}
```

## Step 4: In-App Upgrade Prompts

```typescript
// app/api/trial/status/route.ts
export async function GET(req: Request) {
  const trial = await prisma.trial.findUnique({
    where: { userId: req.user.id },
  })

  if (!trial) return Response.json({ hasTrial: false })

  const daysLeft = differenceInDays(trial.expiresAt, new Date())

  return Response.json({
    hasTrial: true,
    daysLeft,
    activated: !!trial.activatedAt,
    // Show upgrade banner when < 5 days left or hit a limit
    showUpgradeBanner: daysLeft <= 5,
    bannerMessage: daysLeft <= 1
      ? 'Your trial expires today. Upgrade to keep your work.'
      : `${daysLeft} days left in your trial.`,
    upgradeUrl: await createStripeCheckoutUrl(req.user.id),
  })
}

// Generate a Stripe Checkout link for one-click upgrade
async function createStripeCheckoutUrl(userId: string) {
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: 'https://app.example.com/welcome-pro',
    cancel_url: 'https://app.example.com/billing',
    metadata: { userId },
  })
  return session.url
}
```

## Step 5: Handle Trial Expiry + Offboarding Survey

```typescript
// workers/expire-trials.ts
export async function expireTrials() {
  const expired = await prisma.trial.findMany({
    where: {
      status: 'ACTIVE',
      expiresAt: { lte: new Date() },
    },
    include: { user: true },
  })

  for (const trial of expired) {
    await prisma.trial.update({
      where: { id: trial.id },
      data: { status: 'EXPIRED' },
    })

    // Send offboarding email with survey link
    await resend.emails.send({
      from: 'team@example.com',
      to: trial.user.email,
      subject: 'Your trial ended — what happened?',
      html: `<p>We'd love to know why you didn't upgrade.
             <a href="https://app.example.com/survey?token=${trial.id}">
             Take our 2-minute survey</a> — it genuinely helps us improve.</p>
             <p>And if you're ready to give us another shot:
             <a href="https://app.example.com/upgrade">upgrade anytime</a>.</p>`,
    })
  }
}

// app/api/survey/route.ts — save survey response
export async function POST(req: Request) {
  const { token, reason, feedback } = await req.json()
  const trial = await prisma.trial.findUnique({ where: { id: token } })
  if (!trial) return Response.json({ error: 'Invalid token' }, { status: 400 })

  await prisma.offboardingSurvey.create({
    data: { userId: trial.userId, reason, feedback },
  })

  return Response.json({ success: true })
}
```

## Step 6: Conversion Analytics

```typescript
// app/api/admin/trial-metrics/route.ts
export async function GET() {
  const [total, converted, activated, surveyReasons] = await Promise.all([
    prisma.trial.count({ where: { status: { in: ['CONVERTED', 'EXPIRED', 'CHURNED'] } } }),
    prisma.trial.count({ where: { status: 'CONVERTED' } }),
    prisma.trial.count({ where: { activatedAt: { not: null } } }),
    prisma.offboardingSurvey.groupBy({
      by: ['reason'],
      _count: true,
    }),
  ])

  return Response.json({
    conversionRate: `${((converted / total) * 100).toFixed(1)}%`,
    activationRate: `${((activated / total) * 100).toFixed(1)}%`,
    topChurnReasons: surveyReasons,
  })
}
```

## Run the Workers

```bash
# Run every hour via cron
0 * * * * npx ts-node workers/trial-nudges.ts
0 * * * * npx ts-node workers/expire-trials.ts
```

## What Moves the Needle

| Lever | Typical Lift |
|-------|-------------|
| Identify aha moment + nudge toward it | +5-8% conversion |
| Day 13 last-chance email | +2-3% conversion |
| Contextual upgrade prompts at limits | +3-5% conversion |
| Offboarding survey → product fixes | compounding over time |

## What's Next

- A/B test email subject lines with different cohorts
- Add in-app product tours triggered on day 1 for non-activated users
- Build a "trial extension" flow for high-intent users who need more time
- Integrate with your CRM to flag high-intent trials for sales outreach
