---
title: Build a Public Changelog and Roadmap for Your SaaS
slug: build-product-changelog-and-roadmap
description: "Build a public changelog with categorized entries and an upvotable roadmap. Includes an embeddable widget with unread badge, weekly email digest, and admin publishing via Notion or GitHub webhooks."
skills: [resend, prisma]
category: product
tags: [changelog, roadmap, transparency, email-digest, widget, saas, retention]
---

# Build a Public Changelog and Roadmap for Your SaaS

## The Problem

You ship updates constantly, but users don't know about them. They cancel because they think you're stagnant. They request features you already built. They assume bugs are permanent. Meanwhile, the users who *are* paying attention have nowhere to vote on what comes next — their requests disappear into a Typeform or a Notion doc nobody reads.

Transparency is a retention tool. Companies that publicly communicate what they're building and what they've shipped have lower churn and more engaged users. The goal isn't just a changelog page — it's an active feedback loop: users see progress, they vote on what's coming, you ship faster because you know what matters.

## The Solution

Use **Prisma** to store changelog entries and roadmap items. Use **Resend** to send weekly "what's new" digests to subscribers. Add a lightweight embeddable widget and a webhook endpoint so you can publish directly from Notion or GitHub Issues without touching the admin UI.

## Step-by-Step Walkthrough

### Step 1: Database Schema

```text
Design a Prisma schema for a changelog and roadmap system. Changelog entries 
have: title, body (markdown), tags (new/improved/fixed/removed), category, 
publishedAt, and author. Roadmap items have: title, description, status 
(planned/in-progress/shipped), upvote count, and a vote relation.
```

```prisma
// prisma/schema.prisma additions

model ChangelogEntry {
  id          String    @id @default(cuid())
  title       String
  body        String    // Markdown content
  tags        String[]  // ["new", "improved", "fixed", "removed"]
  category    String    // "product", "performance", "integrations", "api"
  publishedAt DateTime?
  published   Boolean   @default(false)
  authorId    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model RoadmapItem {
  id          String    @id @default(cuid())
  title       String
  description String
  status      String    @default("planned") // "planned" | "in-progress" | "shipped"
  upvoteCount Int       @default(0)
  votes       RoadmapVote[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model RoadmapVote {
  id           String      @id @default(cuid())
  itemId       String
  item         RoadmapItem @relation(fields: [itemId], references: [id])
  voterEmail   String      // Require email to prevent duplicate votes
  votedAt      DateTime    @default(now())

  @@unique([itemId, voterEmail])
}

model ChangelogSubscriber {
  id          String    @id @default(cuid())
  email       String    @unique
  confirmed   Boolean   @default(false)
  token       String?   @unique
  subscribedAt DateTime @default(now())
  lastSentAt  DateTime?
}
```

### Step 2: Changelog Page

```tsx
// app/changelog/page.tsx — Public changelog with tag filtering

import { prisma } from '@/lib/prisma'
import ReactMarkdown from 'react-markdown'

const TAG_COLORS: Record<string, string> = {
  new:      'bg-green-100 text-green-700',
  improved: 'bg-blue-100 text-blue-700',
  fixed:    'bg-orange-100 text-orange-700',
  removed:  'bg-red-100 text-red-700',
}

export default async function ChangelogPage({
  searchParams
}: {
  searchParams: { tag?: string; category?: string }
}) {
  const entries = await prisma.changelogEntry.findMany({
    where: {
      published: true,
      ...(searchParams.tag ? { tags: { has: searchParams.tag } } : {}),
      ...(searchParams.category ? { category: searchParams.category } : {}),
    },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold mb-2">What's new</h1>
        <p className="text-slate-500">Updates, improvements, and fixes — all in one place.</p>
      </div>

      <div className="space-y-12">
        {entries.map(entry => (
          <article key={entry.id} className="border-l-2 border-slate-200 pl-6">
            <div className="flex items-center gap-2 mb-3">
              <time className="text-sm text-slate-400">
                {new Date(entry.publishedAt!).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'long', day: 'numeric'
                })}
              </time>
              {entry.tags.map(tag => (
                <span key={tag} className={`text-xs px-2 py-0.5 rounded-full font-medium ${TAG_COLORS[tag] || 'bg-slate-100 text-slate-600'}`}>
                  {tag}
                </span>
              ))}
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                {entry.category}
              </span>
            </div>
            <h2 className="text-xl font-semibold mb-3">{entry.title}</h2>
            <div className="prose prose-slate prose-sm max-w-none">
              <ReactMarkdown>{entry.body}</ReactMarkdown>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
```

### Step 3: Roadmap with Upvoting

```tsx
// app/roadmap/page.tsx — Upvotable roadmap by status column

import { prisma } from '@/lib/prisma'

const STATUS_LABELS: Record<string, string> = {
  planned: '🗓 Planned',
  'in-progress': '🔨 In Progress',
  shipped: '✅ Shipped',
}

export default async function RoadmapPage() {
  const items = await prisma.roadmapItem.findMany({
    orderBy: { upvoteCount: 'desc' }
  })

  const grouped = Object.groupBy(items, item => item.status)

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <h1 className="text-3xl font-bold mb-2">Roadmap</h1>
      <p className="text-slate-500 mb-10">Vote on features to help us prioritize what to build next.</p>

      <div className="grid grid-cols-3 gap-6">
        {['planned', 'in-progress', 'shipped'].map(status => (
          <div key={status}>
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
              {STATUS_LABELS[status]}
            </h2>
            <div className="space-y-3">
              {(grouped[status] || []).map(item => (
                <div key={item.id} className="bg-white border rounded-xl p-4 shadow-sm">
                  <p className="font-medium text-sm mb-1">{item.title}</p>
                  <p className="text-xs text-slate-500 mb-3">{item.description}</p>
                  <form action={`/api/roadmap/vote`} method="POST" className="inline">
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600">
                      <span>▲</span>
                      <span>{item.upvoteCount}</span>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

```typescript
// app/api/roadmap/vote/route.ts — Handle upvotes (email-gated)

import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const { itemId, email } = await req.json()

  try {
    await prisma.roadmapVote.create({
      data: { itemId, voterEmail: email }
    })
    await prisma.roadmapItem.update({
      where: { id: itemId },
      data: { upvoteCount: { increment: 1 } }
    })
    return NextResponse.json({ success: true })
  } catch {
    // Unique constraint violation = already voted
    return NextResponse.json({ error: 'Already voted' }, { status: 409 })
  }
}
```

### Step 4: Embeddable Widget with Unread Badge

```typescript
// public/widget.js — Embeddable changelog popup (<script> embed)
// Hosted at yourdomain.com/widget.js

(function() {
  const LAST_SEEN_KEY = 'changelog_last_seen';
  const API_URL = 'https://yourdomain.com/api/changelog/recent';

  async function init() {
    const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
    const res = await fetch(`${API_URL}?since=${lastSeen || ''}`);
    const { entries, count } = await res.json();

    // Inject button + popup into host page
    const btn = document.createElement('button');
    btn.id = 'changelog-widget-btn';
    btn.innerHTML = `What's new ${count > 0 ? `<span class="badge">${count}</span>` : ''}`;
    btn.style.cssText = 'position:fixed;bottom:20px;left:20px;background:#4f46e5;color:white;' +
      'border:none;padding:8px 16px;border-radius:999px;cursor:pointer;font-family:sans-serif;' +
      'font-size:14px;font-weight:600;z-index:9999;display:flex;align-items:center;gap:6px;';

    const popup = document.createElement('div');
    popup.id = 'changelog-popup';
    popup.style.cssText = 'display:none;position:fixed;bottom:70px;left:20px;width:340px;max-height:480px;' +
      'overflow-y:auto;background:white;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.15);' +
      'z-index:9999;padding:20px;font-family:sans-serif;';

    popup.innerHTML = `
      <h3 style="margin:0 0 16px;font-size:16px;">What's new</h3>
      ${entries.slice(0, 5).map(e => `
        <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f3f4f6;">
          <p style="font-size:11px;color:#9ca3af;margin:0 0 4px;">
            ${new Date(e.publishedAt).toLocaleDateString()}
          </p>
          <p style="font-size:14px;font-weight:600;margin:0 0 4px;">${e.title}</p>
        </div>
      `).join('')}
      <a href="https://yourdomain.com/changelog" style="font-size:13px;color:#4f46e5;">
        View all updates →
      </a>
    `;

    btn.onclick = () => {
      const isOpen = popup.style.display !== 'none';
      popup.style.display = isOpen ? 'none' : 'block';
      if (!isOpen) {
        localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
        btn.querySelector('.badge')?.remove();
      }
    };

    document.body.appendChild(btn);
    document.body.appendChild(popup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
```

### Step 5: Weekly Email Digest with Resend

```typescript
// scripts/send-changelog-digest.ts — Weekly digest of new entries

import { prisma } from '../lib/prisma'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendWeeklyDigest() {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const entries = await prisma.changelogEntry.findMany({
    where: { published: true, publishedAt: { gte: oneWeekAgo } },
    orderBy: { publishedAt: 'desc' },
  })

  if (entries.length === 0) {
    console.log('No new entries this week — skipping digest')
    return
  }

  const subscribers = await prisma.changelogSubscriber.findMany({
    where: { confirmed: true }
  })

  const html = `
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
      <h1 style="font-size: 20px; margin-bottom: 4px;">What's new this week</h1>
      <p style="color: #6b7280; margin-bottom: 24px;">${entries.length} update${entries.length > 1 ? 's' : ''} from the team</p>
      ${entries.map(e => `
        <div style="margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
          <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            ${e.tags.map(tag => `<span style="background: #f3f4f6; padding: 2px 8px; border-radius: 999px; font-size: 11px;">${tag}</span>`).join('')}
          </div>
          <h2 style="font-size: 16px; margin: 0 0 8px;">${e.title}</h2>
          <p style="color: #6b7280; font-size: 14px; margin: 0;">${e.body.substring(0, 200)}...</p>
        </div>
      `).join('')}
      <a href="${process.env.APP_URL}/changelog" style="color: #4f46e5;">Read the full changelog →</a>
    </div>
  `

  // Send in batches to respect rate limits
  for (let i = 0; i < subscribers.length; i += 50) {
    const batch = subscribers.slice(i, i + 50)
    await Promise.all(batch.map(sub =>
      resend.emails.send({
        from: 'Product Updates <updates@yourdomain.com>',
        to: sub.email,
        subject: `What's new: ${entries[0].title}${entries.length > 1 ? ` and ${entries.length - 1} more` : ''}`,
        html,
      })
    ))
    if (i + 50 < subscribers.length) {
      await new Promise(r => setTimeout(r, 1000)) // Rate limit pause
    }
  }

  // Mark last sent time
  await prisma.changelogSubscriber.updateMany({
    data: { lastSentAt: new Date() }
  })

  console.log(`Sent digest to ${subscribers.length} subscribers`)
}
```

### Step 6: Publish from GitHub Issues via Webhook

```typescript
// app/api/webhooks/github/route.ts — Auto-publish changelog entries from GitHub Issues

import { prisma } from '@/lib/prisma'
import { createHmac } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('x-hub-signature-256')

  // Verify webhook signature
  const expected = 'sha256=' + createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!)
    .update(body).digest('hex')
  if (sig !== expected) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body)
  const { action, issue } = payload

  // Only process closed issues labeled "changelog"
  if (action !== 'closed') return NextResponse.json({ ignored: true })
  const labels = issue.labels.map((l: any) => l.name)
  if (!labels.includes('changelog')) return NextResponse.json({ ignored: true })

  // Map GitHub labels to changelog tags
  const tagMap: Record<string, string> = {
    'type: new': 'new',
    'type: improvement': 'improved',
    'type: bug': 'fixed',
  }
  const tags = labels.map((l: string) => tagMap[l]).filter(Boolean)

  await prisma.changelogEntry.create({
    data: {
      title: issue.title,
      body: issue.body || '',
      tags: tags.length > 0 ? tags : ['new'],
      category: labels.includes('api') ? 'api' : 'product',
      published: true,
      publishedAt: new Date(),
    },
  })

  return NextResponse.json({ published: true })
}
```

## Real-World Example

A SaaS founder building a design tool notices that churn surveys consistently mention "I didn't know you added X." They ship this changelog and roadmap in a weekend. After three months, support tickets asking "when will Y be built?" drop by 40% because users can find it on the roadmap and vote. The weekly digest has 340 subscribers with a 41% open rate — it's the highest-performing email they send. Three users who were about to cancel see a shipped roadmap item they'd requested and stay.

## Related Skills

- [resend](../skills/resend/) — Email digests and subscriber management
- [prisma](../skills/prisma/) — Changelog entries, roadmap items, and votes
