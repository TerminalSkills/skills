---
title: "Build a Backlink Monitoring and Alert System"
description: "Monitor your client backlink profiles daily — detect new and lost backlinks, score link quality, alert on toxic links, and auto-generate Google Search Console disavow files."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "12 hours"
tags: [seo, backlinks, link-building, monitoring, alerts, agency]
---

# Build a Backlink Monitoring and Alert System

## The Problem

A client's rankings dropped 30 positions overnight. The cause: 200 spammy backlinks from a PBN were detected and discounted by Google. You found out 3 weeks later. Ahrefs costs $399/month for agencies. You're tracking 20 client sites. That's $80/site — more than you charge some clients for basic SEO maintenance.

## Who This Is For

**Persona:** An SEO consultant managing link profiles for 20 clients. You do monthly link audits manually. You want an automated system that checks every client's backlinks daily, scores quality, flags new toxic links immediately, and generates disavow files automatically. White-labeled, running on your own server.

## What You'll Build

- Backlink discovery via Ahrefs/Moz API (or Common Crawl fallback)
- Daily monitoring: detect new and lost backlinks
- Quality scoring: Domain Authority, spam score, anchor text analysis
- Alerts: new high-value link acquired, toxic link detected, valuable link lost
- Auto-generated disavow file for Google Search Console
- Monthly link profile report per client

---

## Architecture

```
Daily Cron Worker
├── Fetch backlinks from API (Ahrefs/Moz/DataForSEO)
├── Compare with yesterday's snapshot
├── Score each new backlink
├── Detect toxic links (spam score > 50)
├── Detect lost high-value links (DA > 40)
└── Send alerts → Resend

Prisma: projects, backlinks, alerts, disavow lists
```

---

## Step 1: Data Schema

```prisma
// schema.prisma
model Project {
  id           String     @id @default(cuid())
  name         String
  domain       String
  clientEmail  String
  backlinks    Backlink[]
  disavowItems DisavowItem[]
  createdAt    DateTime   @default(now())
}

model Backlink {
  id          String    @id @default(cuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sourceUrl   String
  sourceDomain String
  targetUrl   String
  anchorText  String?
  doFollow    Boolean   @default(true)
  // Quality metrics
  domainAuthority Int?  // 0-100
  pageAuthority   Int?  // 0-100
  spamScore       Int?  // 0-100
  // Status tracking
  firstSeen   DateTime  @default(now())
  lastSeen    DateTime  @default(now())
  lostAt      DateTime? // null = still active
  status      String    @default("active") // active | lost

  @@unique([projectId, sourceUrl, targetUrl])
  @@index([projectId, status])
}

model DisavowItem {
  id        String   @id @default(cuid())
  projectId String
  project   Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  domain    String   // domain to disavow
  reason    String?
  addedAt   DateTime @default(now())

  @@unique([projectId, domain])
}

model BacklinkAlert {
  id          String   @id @default(cuid())
  projectId   String
  type        String   // new_toxic | lost_valuable | new_high_value
  backlinkId  String
  message     String
  alertedAt   DateTime @default(now())
  emailSent   Boolean  @default(false)
}
```

---

## Step 2: Backlink Fetcher (DataForSEO API)

```typescript
// lib/backlinkFetcher.ts
// DataForSEO offers affordable backlink data ($0.01-0.05 per domain)
// Falls back to Moz or Ahrefs if available

export async function fetchBacklinks(domain: string): Promise<BacklinkData[]> {
  const response = await fetch('https://api.dataforseo.com/v3/backlinks/backlinks/live', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString('base64')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([{
      target: domain,
      limit: 1000,
      mode: 'as_is',
      filters: ['dofollow', '=', true]
    }])
  })

  const data = await response.json()
  const items = data.tasks?.[0]?.result?.[0]?.items ?? []

  return items.map((item: any) => ({
    sourceUrl: item.url_from,
    sourceDomain: extractDomain(item.url_from),
    targetUrl: item.url_to,
    anchorText: item.anchor,
    doFollow: item.dofollow,
    domainAuthority: item.domain_from_rank,
    spamScore: item.spam_score
  }))
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
```

---

## Step 3: Daily Sync and Change Detection

```typescript
// workers/backlinkSync.ts
import { prisma } from '@/lib/prisma'
import { fetchBacklinks } from '@/lib/backlinkFetcher'

export async function syncProjectBacklinks(projectId: string) {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } })

  const freshBacklinks = await fetchBacklinks(project.domain)
  const freshUrls = new Set(freshBacklinks.map(b => b.sourceUrl))

  const existing = await prisma.backlink.findMany({
    where: { projectId, status: 'active' }
  })
  const existingUrls = new Set(existing.map(b => b.sourceUrl))

  // Mark lost backlinks
  const lostLinks = existing.filter(b => !freshUrls.has(b.sourceUrl))
  if (lostLinks.length > 0) {
    await prisma.backlink.updateMany({
      where: { id: { in: lostLinks.map(b => b.id) } },
      data: { status: 'lost', lostAt: new Date() }
    })

    // Alert on lost high-value backlinks
    const valuableLost = lostLinks.filter(b => (b.domainAuthority ?? 0) >= 40)
    for (const link of valuableLost) {
      await createAlert(projectId, 'lost_valuable', link.id,
        `Lost high-value backlink from ${link.sourceDomain} (DA: ${link.domainAuthority})`)
    }
  }

  // Process new backlinks
  const newLinks = freshBacklinks.filter(b => !existingUrls.has(b.sourceUrl))
  for (const link of newLinks) {
    const record = await prisma.backlink.upsert({
      where: {
        projectId_sourceUrl_targetUrl: {
          projectId,
          sourceUrl: link.sourceUrl,
          targetUrl: link.targetUrl
        }
      },
      update: { lastSeen: new Date(), status: 'active', lostAt: null },
      create: { projectId, ...link }
    })

    // Alert on toxic links
    if ((link.spamScore ?? 0) > 50) {
      await createAlert(projectId, 'new_toxic', record.id,
        `Toxic backlink detected from ${link.sourceDomain} (spam score: ${link.spamScore})`)

      // Auto-add to disavow list
      await prisma.disavowItem.upsert({
        where: { projectId_domain: { projectId, domain: link.sourceDomain } },
        update: {},
        create: { projectId, domain: link.sourceDomain, reason: `Spam score: ${link.spamScore}` }
      })
    }

    // Alert on new high-value backlinks
    if ((link.domainAuthority ?? 0) >= 50) {
      await createAlert(projectId, 'new_high_value', record.id,
        `New high-value backlink from ${link.sourceDomain} (DA: ${link.domainAuthority})`)
    }
  }

  await sendPendingAlerts(projectId, project.clientEmail)
}

async function createAlert(projectId: string, type: string, backlinkId: string, message: string) {
  await prisma.backlinkAlert.create({ data: { projectId, type, backlinkId, message } })
}
```

---

## Step 4: Alert Emails via Resend

```typescript
// workers/backlinkAlerts.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY!)

export async function sendPendingAlerts(projectId: string, clientEmail: string) {
  const alerts = await prisma.backlinkAlert.findMany({
    where: { projectId, emailSent: false }
  })
  if (alerts.length === 0) return

  const toxic = alerts.filter(a => a.type === 'new_toxic')
  const lostValuable = alerts.filter(a => a.type === 'lost_valuable')
  const newHighValue = alerts.filter(a => a.type === 'new_high_value')

  await resend.emails.send({
    from: 'backlinks@yourseo.com',
    to: clientEmail,
    subject: `Backlink Alert: ${alerts.length} change(s) detected`,
    html: `
      <h2>Backlink Changes Detected</h2>
      ${toxic.length > 0 ? `
        <h3>🚨 Toxic Links (${toxic.length}) — Auto-Disavowed</h3>
        <ul>${toxic.map(a => `<li>${a.message}</li>`).join('')}</ul>
      ` : ''}
      ${lostValuable.length > 0 ? `
        <h3>📉 Lost High-Value Links (${lostValuable.length})</h3>
        <ul>${lostValuable.map(a => `<li>${a.message}</li>`).join('')}</ul>
      ` : ''}
      ${newHighValue.length > 0 ? `
        <h3>🎉 New High-Value Links (${newHighValue.length})</h3>
        <ul>${newHighValue.map(a => `<li>${a.message}</li>`).join('')}</ul>
      ` : ''}
    `
  })

  await prisma.backlinkAlert.updateMany({
    where: { id: { in: alerts.map(a => a.id) } },
    data: { emailSent: true }
  })
}
```

---

## Step 5: Disavow File Generator

```typescript
// app/api/projects/[id]/disavow/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const items = await prisma.disavowItem.findMany({
    where: { projectId: params.id },
    orderBy: { addedAt: 'desc' }
  })

  const lines = [
    '# Disavow file generated by BacklinkMonitor',
    `# Generated: ${new Date().toISOString()}`,
    `# Total domains: ${items.length}`,
    '',
    ...items.map(item => `domain:${item.domain}${item.reason ? ` # ${item.reason}` : ''}`)
  ]

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain',
      'Content-Disposition': `attachment; filename="disavow-${params.id}.txt"`
    }
  })
}
```

---

## Link Quality Scoring

| Metric | Weight | Threshold |
|--------|--------|-----------|
| Domain Authority (DA) | High | DA > 40 = valuable |
| Spam Score | High | >50 = toxic, auto-disavow |
| Anchor text match | Medium | Brand/exact = natural |
| DoFollow status | Medium | NoFollow = less value |
| Link velocity | Low | 100+ new links/day = suspicious |

---

## Next Steps

1. Add anchor text distribution analysis (over-optimization detection)
2. Build a link prospecting tool (find unlinked mentions)
3. Create a link reclamation workflow for lost high-value links
4. Add competitor backlink gap analysis
5. Integrate with Google Search Console for coverage data
