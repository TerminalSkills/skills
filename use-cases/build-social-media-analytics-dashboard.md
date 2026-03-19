---
title: "Build a Unified Social Media Analytics Dashboard"
description: "Aggregate metrics from Twitter/X, LinkedIn, Instagram, TikTok, and YouTube into one dashboard with engagement tracking, competitor benchmarking, and weekly insight emails."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "14 hours"
tags: [social-media, analytics, dashboard, automation, reporting, marketing]
---

# Build a Unified Social Media Analytics Dashboard

## The Problem

Sprout Social costs $249/month for 5 profiles. Buffer Analyze is $35/month but lacks competitor data. You're switching between 5 native dashboards to compile a weekly report that takes 3 hours to write. The APIs are all public. The math is the same everywhere.

## Who This Is For

**Persona:** A social media manager handling 5 brand accounts — a SaaS company, a DTC brand, and 3 agencies. Every Monday you spend 2 hours pulling numbers, making screenshots, and building a Google Slides deck. You want a single dashboard that fetches everything, highlights what moved, and auto-generates the weekly report.

## What You'll Build

- OAuth connections for Twitter/X, LinkedIn, Instagram, TikTok, YouTube
- Unified metrics: followers, engagement rate, reach, impressions
- Post-level performance: top posts ranked by engagement
- Competitor benchmarking: compare your profile vs up to 3 competitors
- Weekly automated report email with insights via Resend
- Trend detection: flag metrics that changed >20% week-over-week

---

## Architecture

```
Next.js Dashboard
├── /accounts         — Connect and manage social accounts
├── /overview         — Unified metrics across all accounts
├── /posts            — Top performing content
└── /competitors      — Benchmarking view

Data Sync Workers (daily cron)
├── Twitter API v2
├── LinkedIn API
├── Instagram Graph API
├── TikTok API
└── YouTube Data API v3

Prisma: accounts, metric snapshots, post data
Resend: weekly report email
```

---

## Step 1: Data Schema

```prisma
// schema.prisma
model SocialAccount {
  id           String   @id @default(cuid())
  platform     String   // twitter | linkedin | instagram | tiktok | youtube
  accountName  String
  accountId    String   // platform-specific ID
  accessToken  String   // encrypted
  refreshToken String?
  workspaceId  String
  isCompetitor Boolean  @default(false)
  metrics      MetricSnapshot[]
  posts        PostSnapshot[]

  @@unique([platform, accountId])
}

model MetricSnapshot {
  id            String        @id @default(cuid())
  accountId     String
  account       SocialAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  date          DateTime      @default(now())
  followers     Int
  following     Int?
  posts         Int
  // Engagement for the period
  impressions   Int?
  reach         Int?
  likes         Int?
  comments      Int?
  shares        Int?
  engagementRate Float?       // (likes + comments + shares) / reach * 100

  @@index([accountId, date])
}

model PostSnapshot {
  id          String        @id @default(cuid())
  accountId   String
  account     SocialAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  platformPostId String
  publishedAt DateTime
  content     String?
  mediaUrl    String?
  likes       Int           @default(0)
  comments    Int           @default(0)
  shares      Int           @default(0)
  impressions Int?
  reach       Int?
  engagementRate Float?

  @@unique([accountId, platformPostId])
}
```

---

## Step 2: Twitter/X Data Sync

```typescript
// workers/platforms/twitter.ts
export async function syncTwitterAccount(account: any) {
  const headers = { Authorization: `Bearer ${account.accessToken}` }

  // Get profile metrics
  const userRes = await fetch(
    `https://api.twitter.com/2/users/${account.accountId}?user.fields=public_metrics`,
    { headers }
  )
  const { data: user } = await userRes.json()

  await prisma.metricSnapshot.create({
    data: {
      accountId: account.id,
      followers: user.public_metrics.followers_count,
      following: user.public_metrics.following_count,
      posts: user.public_metrics.tweet_count
    }
  })

  // Get recent tweets for post performance
  const tweetsRes = await fetch(
    `https://api.twitter.com/2/users/${account.accountId}/tweets` +
    `?tweet.fields=public_metrics,created_at&max_results=20`,
    { headers }
  )
  const { data: tweets } = await tweetsRes.json()

  for (const tweet of tweets ?? []) {
    const m = tweet.public_metrics
    const total = m.like_count + m.reply_count + m.retweet_count
    const engagement = m.impression_count > 0 ? (total / m.impression_count) * 100 : 0

    await prisma.postSnapshot.upsert({
      where: { accountId_platformPostId: { accountId: account.id, platformPostId: tweet.id } },
      update: {
        likes: m.like_count,
        comments: m.reply_count,
        shares: m.retweet_count,
        impressions: m.impression_count,
        engagementRate: engagement
      },
      create: {
        accountId: account.id,
        platformPostId: tweet.id,
        publishedAt: new Date(tweet.created_at),
        content: tweet.text,
        likes: m.like_count,
        comments: m.reply_count,
        shares: m.retweet_count,
        impressions: m.impression_count,
        engagementRate: engagement
      }
    })
  }
}
```

---

## Step 3: Engagement Rate Calculator

```typescript
// lib/analytics.ts
export function calculateEngagementRate(
  likes: number,
  comments: number,
  shares: number,
  followers: number,
  platform: string
): number {
  const interactions = likes + comments + shares

  // Different platforms use different denominators
  switch (platform) {
    case 'instagram':
    case 'tiktok':
      return followers > 0 ? (interactions / followers) * 100 : 0
    case 'twitter':
      return followers > 0 ? (interactions / followers) * 100 : 0
    case 'linkedin':
      return followers > 0 ? (interactions / followers) * 100 : 0
    case 'youtube':
      // YouTube uses views, not followers
      return 0 // requires impressions data
    default:
      return 0
  }
}

export async function getWeeklyChanges(accountId: string) {
  const today = await prisma.metricSnapshot.findFirst({
    where: { accountId },
    orderBy: { date: 'desc' }
  })

  const weekAgo = await prisma.metricSnapshot.findFirst({
    where: {
      accountId,
      date: { lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    },
    orderBy: { date: 'desc' }
  })

  if (!today || !weekAgo) return null

  return {
    followers: {
      current: today.followers,
      change: today.followers - weekAgo.followers,
      changePercent: ((today.followers - weekAgo.followers) / weekAgo.followers) * 100
    },
    engagementRate: {
      current: today.engagementRate ?? 0,
      change: (today.engagementRate ?? 0) - (weekAgo.engagementRate ?? 0)
    }
  }
}
```

---

## Step 4: Competitor Benchmarking

```typescript
// lib/benchmarking.ts
export async function getCompetitorComparison(workspaceId: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId },
    include: {
      metrics: {
        orderBy: { date: 'desc' },
        take: 1
      }
    }
  })

  const myAccounts = accounts.filter(a => !a.isCompetitor)
  const competitors = accounts.filter(a => a.isCompetitor)

  return {
    myAvgEngagement: average(myAccounts.map(a => a.metrics[0]?.engagementRate ?? 0)),
    competitorAvgEngagement: average(competitors.map(a => a.metrics[0]?.engagementRate ?? 0)),
    accounts: accounts.map(a => ({
      name: a.accountName,
      platform: a.platform,
      followers: a.metrics[0]?.followers ?? 0,
      engagementRate: a.metrics[0]?.engagementRate ?? 0,
      isCompetitor: a.isCompetitor
    }))
  }
}
```

---

## Step 5: Weekly Report Email

```typescript
// workers/weeklyReport.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendWeeklyReport(workspaceId: string, recipientEmail: string) {
  const accounts = await prisma.socialAccount.findMany({
    where: { workspaceId, isCompetitor: false }
  })

  const summaries = await Promise.all(
    accounts.map(async (account) => {
      const changes = await getWeeklyChanges(account.id)
      const topPosts = await prisma.postSnapshot.findMany({
        where: { accountId: account.id, publishedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
        orderBy: { engagementRate: 'desc' },
        take: 3
      })
      return { account, changes, topPosts }
    })
  )

  const totalFollowerGain = summaries.reduce((sum, s) => sum + (s.changes?.followers.change ?? 0), 0)

  await resend.emails.send({
    from: 'reports@yoursocial.com',
    to: recipientEmail,
    subject: `Weekly Social Report — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    html: `
      <h2>📊 Weekly Social Media Report</h2>
      <p><strong>Total new followers this week: ${totalFollowerGain > 0 ? '+' : ''}${totalFollowerGain}</strong></p>
      ${summaries.map(({ account, changes, topPosts }) => `
        <h3>${account.accountName} (${account.platform})</h3>
        <ul>
          <li>Followers: ${changes?.followers.current.toLocaleString()} (${changes?.followers.change > 0 ? '+' : ''}${changes?.followers.change})</li>
          <li>Engagement rate: ${changes?.engagementRate.current.toFixed(2)}%</li>
        </ul>
        ${topPosts.length > 0 ? `
          <p><strong>Top post:</strong> ${topPosts[0].content?.slice(0, 100)}... (${topPosts[0].engagementRate?.toFixed(2)}% engagement)</p>
        ` : ''}
      `).join('')}
    `
  })
}
```

---

## Platform API Comparison

| Platform | Free Tier | Key Limitation |
|----------|----------|----------------|
| Twitter/X | Basic $100/mo | Rate limited |
| LinkedIn | Free (own data) | No competitor data |
| Instagram | Free (Graph API) | Business account required |
| TikTok | Free (Research API) | Limited metrics |
| YouTube | Free (10k units/day) | Generous quota |

---

## Next Steps

1. Build chart visualizations with Recharts or Victory
2. Add Slack integration for daily highlights
3. Implement post scheduling across platforms
4. Create PDF report export with charts
5. Add AI-powered content recommendations based on top posts
