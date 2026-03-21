---
title: "Build a Customer Success Platform"
description: "Build health scores, automated playbooks, QBR generation, and renewal forecasting for a CS team managing 200 enterprise accounts — all in-house."
skills: [anthropic-sdk, resend, prisma]
difficulty: advanced
time_estimate: "8 hours"
tags: [customer-success, health-score, churn, renewals, ai, enterprise, saas]
---

# Build a Customer Success Platform

Enterprise CS teams are drowning in spreadsheets. They track health scores in Google Sheets, QBRs in PowerPoint, and renewal dates in Salesforce — and still miss at-risk accounts until it's too late. A purpose-built CS platform changes the calculus: every account gets scored every day, at-risk alerts fire automatically, and your CS team focuses on conversations, not data entry.

## The Persona

You're the VP of Customer Success at a B2B SaaS. You have 5 CSMs and 200 accounts worth $4M ARR. Average contract is $20k/year with 18-month renewal cycles. A 5% increase in net retention adds $200k ARR. You need to spot churn risk 60 days before renewal — not 5 days before.

## What You'll Build

- **Health scoring** — composite score from product usage, support, and NPS
- **At-risk alerts** — ping CSMs via email when score drops below threshold
- **Playbooks** — automated action sequences for onboarding and renewal
- **QBR generation** — AI-generated quarterly business review drafts
- **Renewal forecasting** — predict churn probability 60 days ahead

## Schema

```prisma
// schema.prisma
model Account {
  id              String   @id @default(cuid())
  name            String
  arr             Float    // Annual Recurring Revenue
  renewalDate     DateTime
  csmId           String
  healthScore     Float?   // 0-100, updated daily
  healthUpdatedAt DateTime?
  tier            AccountTier @default(STANDARD)

  csm             User     @relation(fields: [csmId], references: [id])
  events          HealthEvent[]
  playbooks       PlaybookRun[]
}

model HealthEvent {
  id          String   @id @default(cuid())
  accountId   String
  dimension   String   // "product_usage", "support", "nps", "engagement"
  score       Float    // 0-100 for this dimension
  raw         Json     // raw data that produced this score
  createdAt   DateTime @default(now())

  account     Account  @relation(fields: [accountId], references: [id])
}

model PlaybookRun {
  id          String         @id @default(cuid())
  accountId   String
  playbook    String         // "onboarding_30day", "renewal_60day", "at_risk"
  step        Int            @default(0)
  status      PlaybookStatus @default(ACTIVE)
  startedAt   DateTime       @default(now())
  nextActionAt DateTime?

  account     Account        @relation(fields: [accountId], references: [id])
}

enum AccountTier { ENTERPRISE STANDARD SMB }
enum PlaybookStatus { ACTIVE PAUSED COMPLETED }
```

## Step 1: Calculate Health Scores

```typescript
// lib/health-score.ts
import { prisma } from './prisma'

interface HealthDimensions {
  productUsage: number  // 0-100: DAU/MAU, feature adoption
  supportHealth: number // 0-100: inverse of ticket volume/severity
  npsScore: number      // 0-100: normalized NPS
  engagementScore: number // 0-100: meetings, QBRs, champion presence
}

const WEIGHTS = {
  productUsage:    0.40,
  supportHealth:   0.25,
  npsScore:        0.20,
  engagementScore: 0.15,
}

export function computeHealthScore(dims: HealthDimensions): number {
  return Math.round(
    dims.productUsage    * WEIGHTS.productUsage +
    dims.supportHealth   * WEIGHTS.supportHealth +
    dims.npsScore        * WEIGHTS.npsScore +
    dims.engagementScore * WEIGHTS.engagementScore
  )
}

export async function refreshAccountHealth(accountId: string) {
  // Pull latest dimension scores from your data sources
  const [usage, support, nps, engagement] = await Promise.all([
    getProductUsageScore(accountId),
    getSupportHealthScore(accountId),
    getNPSScore(accountId),
    getEngagementScore(accountId),
  ])

  const score = computeHealthScore({ productUsage: usage, supportHealth: support, npsScore: nps, engagementScore: engagement })
  const previousScore = (await prisma.account.findUnique({ where: { id: accountId } }))?.healthScore

  await prisma.account.update({
    where: { id: accountId },
    data: { healthScore: score, healthUpdatedAt: new Date() },
  })

  // Store historical event for trending
  await prisma.healthEvent.create({
    data: {
      accountId,
      dimension: 'composite',
      score,
      raw: { usage, support, nps, engagement },
    },
  })

  // Trigger alerts if score dropped significantly
  if (previousScore && score < previousScore - 10) {
    await triggerAtRiskAlert(accountId, previousScore, score)
  }
}
```

## Step 2: At-Risk Alerts

```typescript
// lib/alerts.ts
import { Resend } from 'resend'
import { prisma } from './prisma'

const resend = new Resend(process.env.RESEND_API_KEY)

const ALERT_THRESHOLDS = {
  red:    40,  // immediate action needed
  yellow: 65,  // monitor closely
}

export async function triggerAtRiskAlert(
  accountId: string,
  previousScore: number,
  currentScore: number
) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { csm: true },
  })
  if (!account) return

  const severity = currentScore < ALERT_THRESHOLDS.red ? 'red' : 'yellow'
  const daysToRenewal = Math.floor(
    (account.renewalDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )

  await resend.emails.send({
    from: 'cs-alerts@example.com',
    to: account.csm.email,
    subject: `🚨 At-Risk: ${account.name} health dropped to ${currentScore}`,
    html: `
      <h2>${account.name} needs attention</h2>
      <p><strong>Health Score:</strong> ${previousScore} → ${currentScore} (${severity.toUpperCase()})</p>
      <p><strong>ARR at Risk:</strong> $${account.arr.toLocaleString()}</p>
      <p><strong>Days to Renewal:</strong> ${daysToRenewal}</p>
      <p><a href="https://cs.example.com/accounts/${accountId}">View Account →</a></p>
    `,
  })

  // Auto-trigger at-risk playbook if not already running
  const existingPlaybook = await prisma.playbookRun.findFirst({
    where: { accountId, playbook: 'at_risk', status: 'ACTIVE' },
  })

  if (!existingPlaybook) {
    await prisma.playbookRun.create({
      data: {
        accountId,
        playbook: 'at_risk',
        nextActionAt: new Date(), // start immediately
      },
    })
  }
}
```

## Step 3: Automated Playbooks

```typescript
// lib/playbooks.ts
const PLAYBOOKS = {
  onboarding_30day: [
    { day: 1,  action: 'send_email',     template: 'welcome-and-kickoff' },
    { day: 3,  action: 'create_task',    task: 'Schedule kickoff call' },
    { day: 7,  action: 'send_email',     template: 'week-1-checkin' },
    { day: 14, action: 'send_email',     template: 'adoption-tips' },
    { day: 30, action: 'send_email',     template: '30-day-review' },
  ],
  renewal_60day: [
    { day: 0,  action: 'create_task',    task: 'Pull renewal data from CRM' },
    { day: 7,  action: 'send_email',     template: 'renewal-intro' },
    { day: 21, action: 'create_task',    task: 'Schedule renewal call' },
    { day: 45, action: 'send_email',     template: 'renewal-proposal' },
  ],
  at_risk: [
    { day: 0,  action: 'create_task',    task: 'Review account health trends' },
    { day: 1,  action: 'send_email',     template: 'executive-reach-out' },
    { day: 5,  action: 'create_task',    task: 'Conduct success review call' },
    { day: 14, action: 'send_email',     template: 'recovery-plan-follow-up' },
  ],
}

export async function advancePlaybooks() {
  const active = await prisma.playbookRun.findMany({
    where: { status: 'ACTIVE', nextActionAt: { lte: new Date() } },
    include: { account: { include: { csm: true } } },
  })

  for (const run of active) {
    const steps = PLAYBOOKS[run.playbook as keyof typeof PLAYBOOKS]
    if (!steps || run.step >= steps.length) {
      await prisma.playbookRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } })
      continue
    }

    const step = steps[run.step]
    await executePlaybookStep(run.account, step)

    const nextStep = steps[run.step + 1]
    await prisma.playbookRun.update({
      where: { id: run.id },
      data: {
        step: run.step + 1,
        nextActionAt: nextStep ? addDays(new Date(), nextStep.day - step.day) : null,
        status: nextStep ? 'ACTIVE' : 'COMPLETED',
      },
    })
  }
}
```

## Step 4: AI-Generated QBR Decks

```typescript
// lib/qbr-generator.ts
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export async function generateQBR(accountId: string): Promise<string> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { events: { orderBy: { createdAt: 'desc' }, take: 90 } },
  })

  const healthTrend = account?.events.map(e => `${e.createdAt.toISOString().split('T')[0]}: ${e.score}`).join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Generate a Quarterly Business Review (QBR) for ${account?.name}.
      
      Health Score Trend (last 90 days):
      ${healthTrend}
      
      ARR: $${account?.arr.toLocaleString()}
      Renewal Date: ${account?.renewalDate.toDateString()}
      
      Include: Executive Summary, Key Wins, Challenges, Usage Highlights, Roadmap Alignment, Renewal Recommendation.
      Format as clean markdown suitable for a customer-facing presentation.`,
    }],
  })

  return (message.content[0] as { text: string }).text
}
```

## Step 5: Renewal Forecasting

```typescript
// lib/renewal-forecast.ts
export async function forecastRenewals(daysAhead = 60) {
  const upcoming = await prisma.account.findMany({
    where: {
      renewalDate: {
        gte: new Date(),
        lte: addDays(new Date(), daysAhead),
      },
    },
  })

  return upcoming.map(account => {
    const churnProbability = calculateChurnProbability(account.healthScore ?? 50, account.arr)
    return {
      accountId: account.id,
      name: account.name,
      arr: account.arr,
      renewalDate: account.renewalDate,
      healthScore: account.healthScore,
      churnProbability,
      riskLevel: churnProbability > 0.5 ? 'high' : churnProbability > 0.25 ? 'medium' : 'low',
      arrAtRisk: account.arr * churnProbability,
    }
  }).sort((a, b) => b.arrAtRisk - a.arrAtRisk)
}

function calculateChurnProbability(healthScore: number, arr: number): number {
  // Simple logistic model — replace with trained ML model for production
  const baseRate = healthScore < 40 ? 0.6 : healthScore < 65 ? 0.25 : 0.05
  const arrModifier = arr > 50000 ? 0.9 : 1.0 // large accounts churn less
  return Math.min(baseRate * arrModifier, 1.0)
}
```

## What's Next

- Connect to your product database for real usage signals (logins, feature usage, API calls)
- Integrate with Salesforce/HubSpot to sync health scores and create renewal tasks
- Add Slack notifications for at-risk alerts alongside email
- Build a CSM dashboard with portfolio view sorted by ARR at risk
