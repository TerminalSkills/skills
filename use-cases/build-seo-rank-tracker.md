---
title: "Build a Keyword Rank Tracker"
description: "Monitor Google keyword positions daily across 5000+ keywords and 50+ client sites, with position change alerts, historical charts, and competitor tracking."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "10 hours"
tags: [seo, rank-tracking, keywords, analytics, alerts, agency]
---

# Build a Keyword Rank Tracker

## The Problem

SEO tools like Ahrefs and SEMrush cost $400-500/month for agency plans. You're tracking 5,000 keywords across 50 client sites. Most of that price is for features you don't use. The core need is simple: check Google rankings daily and alert when something changes.

## Who This Is For

**Persona:** An SEO agency owner with 50 clients. You currently use a mix of SERPWatcher and manual checks. You want a white-labeled tool running on your own server, with your branding, that you can offer as an add-on to clients. No per-keyword pricing. Own the data.

## What You'll Build

- Keyword and URL management per client/project
- Daily automated rank checking via SerpAPI or ValueSERP
- Position change alerts (±5 spots threshold)
- Historical position charts per keyword
- Competitor tracking: your rank vs competitor domains
- Weekly summary email per client

---

## Architecture

```
Cron Job (daily 3am UTC)
    ↓
Rank Checker Worker
    ├── SerpAPI / ValueSERP calls (batched)
    └── Parse rank for target URL in results
         ↓
Prisma: store RankSnapshot
         ↓
Compare vs yesterday → trigger alerts if change ≥ 5
         ↓
Resend: alert email to client
```

---

## Step 1: Data Schema

```prisma
// schema.prisma
model Project {
  id       String    @id @default(cuid())
  name     String
  domain   String    // e.g. "example.com"
  clientEmail String
  keywords Keyword[]
  competitors ProjectCompetitor[]
  createdAt DateTime @default(now())
}

model Keyword {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  keyword   String
  targetUrl String   // specific URL to track
  country   String   @default("us")
  language  String   @default("en")
  device    String   @default("desktop") // desktop | mobile
  snapshots RankSnapshot[]
  createdAt DateTime @default(now())

  @@index([projectId])
}

model RankSnapshot {
  id        String   @id @default(cuid())
  keywordId String
  keyword   Keyword  @relation(fields: [keywordId], references: [id], onDelete: Cascade)
  position  Int?     // null = not in top 100
  url       String?  // actual ranking URL (may differ from target)
  date      DateTime @default(now())
  checkedAt DateTime @default(now())

  @@index([keywordId, date])
}

model ProjectCompetitor {
  id        String  @id @default(cuid())
  projectId String
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  domain    String
}
```

---

## Step 2: Rank Checking Worker

```typescript
// workers/rankChecker.ts
import { prisma } from '@/lib/prisma'

const SERP_API_KEY = process.env.SERPAPI_KEY!
const BATCH_SIZE = 10 // process 10 keywords at a time

export async function runDailyRankCheck() {
  const keywords = await prisma.keyword.findMany({
    include: { project: true }
  })

  console.log(`Checking ${keywords.length} keywords...`)

  // Process in batches to respect API rate limits
  for (let i = 0; i < keywords.length; i += BATCH_SIZE) {
    const batch = keywords.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map(checkKeyword))
    // Small delay between batches
    if (i + BATCH_SIZE < keywords.length) {
      await sleep(1000)
    }
  }

  console.log('Rank check complete. Running alerts...')
  await runAlerts()
}

async function checkKeyword(keyword: any) {
  try {
    const result = await fetchSerp(keyword.keyword, keyword.country, keyword.language, keyword.device)
    const position = findPosition(result.organic_results, keyword.targetUrl, keyword.project.domain)

    await prisma.rankSnapshot.create({
      data: {
        keywordId: keyword.id,
        position,
        url: position ? findUrl(result.organic_results, keyword.project.domain) : null
      }
    })
  } catch (err) {
    console.error(`Failed to check keyword ${keyword.id}:`, err)
  }
}

async function fetchSerp(query: string, country: string, language: string, device: string) {
  const params = new URLSearchParams({
    q: query,
    gl: country,
    hl: language,
    device,
    num: '100',
    api_key: SERP_API_KEY
  })

  const res = await fetch(`https://serpapi.com/search.json?${params}`)
  return res.json()
}

function findPosition(results: any[], targetUrl: string, domain: string): number | null {
  for (let i = 0; i < results.length; i++) {
    const link: string = results[i].link ?? ''
    if (link.includes(domain) || link.includes(targetUrl)) {
      return i + 1
    }
  }
  return null
}
```

---

## Step 3: Position Change Alerts

```typescript
// workers/alerts.ts
import { prisma } from '@/lib/prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)
const ALERT_THRESHOLD = 5

export async function runAlerts() {
  const keywords = await prisma.keyword.findMany({
    include: {
      project: true,
      snapshots: {
        orderBy: { checkedAt: 'desc' },
        take: 2  // today and yesterday
      }
    }
  })

  const alerts: Record<string, any[]> = {} // clientEmail → alerts

  for (const kw of keywords) {
    if (kw.snapshots.length < 2) continue

    const today = kw.snapshots[0].position
    const yesterday = kw.snapshots[1].position

    if (today === null || yesterday === null) continue

    const change = yesterday - today // positive = improved (lower number is better)

    if (Math.abs(change) >= ALERT_THRESHOLD) {
      const email = kw.project.clientEmail
      if (!alerts[email]) alerts[email] = []
      alerts[email].push({
        keyword: kw.keyword,
        domain: kw.project.domain,
        yesterday,
        today,
        change,
        improved: change > 0
      })
    }
  }

  // Send one email per client (batch alerts)
  for (const [email, keywordAlerts] of Object.entries(alerts)) {
    await sendAlertEmail(email, keywordAlerts)
  }
}

async function sendAlertEmail(clientEmail: string, alerts: any[]) {
  const improved = alerts.filter(a => a.improved)
  const dropped = alerts.filter(a => !a.improved)

  await resend.emails.send({
    from: 'ranks@yourseo.com',
    to: clientEmail,
    subject: `Rank Alert: ${alerts.length} keyword${alerts.length !== 1 ? 's' : ''} moved significantly`,
    html: `
      <h2>Keyword Position Alerts</h2>
      ${improved.length > 0 ? `
        <h3>🟢 Improved (${improved.length})</h3>
        <ul>${improved.map(a => `<li><strong>${a.keyword}</strong>: #${a.yesterday} → #${a.today} (+${a.change})</li>`).join('')}</ul>
      ` : ''}
      ${dropped.length > 0 ? `
        <h3>🔴 Dropped (${dropped.length})</h3>
        <ul>${dropped.map(a => `<li><strong>${a.keyword}</strong>: #${a.yesterday} → #${a.today} (${a.change})</li>`).join('')}</ul>
      ` : ''}
    `
  })
}
```

---

## Step 4: Historical Chart API

```typescript
// app/api/keywords/[id]/history/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url)
  const days = Number(searchParams.get('days') ?? 30)

  const since = new Date()
  since.setDate(since.getDate() - days)

  const snapshots = await prisma.rankSnapshot.findMany({
    where: {
      keywordId: params.id,
      checkedAt: { gte: since }
    },
    orderBy: { checkedAt: 'asc' },
    select: { position: true, checkedAt: true }
  })

  return Response.json({
    data: snapshots.map(s => ({
      date: s.checkedAt.toISOString().split('T')[0],
      position: s.position
    }))
  })
}
```

---

## Step 5: Cron Trigger

```typescript
// app/api/cron/rank-check/route.ts
// Vercel cron or external cron hitting this endpoint daily
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Run async, respond immediately
  runDailyRankCheck().catch(console.error)

  return Response.json({ started: true, timestamp: new Date() })
}
```

Vercel `vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/rank-check", "schedule": "0 3 * * *" }]
}
```

---

## Cost Analysis

| Keywords | SerpAPI cost | Ahrefs plan | Savings |
|----------|-------------|-------------|---------|
| 500/day | ~$15/mo | $99/mo | $84/mo |
| 5,000/day | ~$75/mo | $399/mo | $324/mo |
| 50,000/day | ~$500/mo | Custom | Huge |

---

## Next Steps

1. Build a React dashboard with Recharts position timeline graphs
2. Add Google Search Console integration for impression/click data
3. Implement white-label client portal with custom subdomain
4. Add Slack/Telegram alerting as alternative to email
5. Support local pack and featured snippet tracking
