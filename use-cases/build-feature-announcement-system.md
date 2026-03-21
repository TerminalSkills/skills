---
title: "Build a Feature Announcement and Release Notes System"
description: "Build a versioned changelog with in-app notification bell, product tours for new features, segment-targeted announcements, and a monthly email digest."
skills: [resend, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [product, announcements, changelog, email, notifications, saas, onboarding]
---

# Build a Feature Announcement and Release Notes System

You ship features. Users don't find out. They email support asking "how do I..." for things you launched 3 months ago. A proper announcement system closes the loop: every feature ships with an announcement, users are notified in-app and by email, and the unread badge keeps drawing them back.

## The Persona

You're the PM at a design tool SaaS. You ship 2-3 features per week. Support gets 40 tickets/month asking about features that already exist. Your goal: increase feature discovery, reduce "how do I..." support volume, and make users feel like the product is constantly getting better.

## What You'll Build

- **Announcement feed** — versioned changelog with rich content
- **In-app notification bell** — badge with unread count
- **Segment-targeted announcements** — pro-only features for pro users
- **Product tour triggers** — show interactive overlays for new features
- **Monthly email digest** — "Here's what's new this month"

## Schema

```prisma
// schema.prisma
model Announcement {
  id           String           @id @default(cuid())
  version      String?          // e.g. "2.4.0" — optional
  title        String
  body         String           // markdown content
  category     AnnouncementType @default(FEATURE)
  targetPlans  String[]         // [] = everyone, ["pro", "enterprise"] = segment
  publishedAt  DateTime?        // null = draft
  createdAt    DateTime         @default(now())

  reads        AnnouncementRead[]
}

model AnnouncementRead {
  id             String       @id @default(cuid())
  announcementId String
  userId         String
  readAt         DateTime     @default(now())

  announcement   Announcement @relation(fields: [announcementId], references: [id])
  user           User         @relation(fields: [userId], references: [id])

  @@unique([announcementId, userId])
}

model ProductTour {
  id             String   @id @default(cuid())
  announcementId String   @unique
  steps          Json     // array of tour steps (element, title, body)
  targetUrl      String?  // only show on this URL pattern
}

enum AnnouncementType { FEATURE IMPROVEMENT BUGFIX }
```

## Step 1: Create an Announcement

```typescript
// app/api/admin/announcements/route.ts
export async function POST(req: Request) {
  const { title, body, category, targetPlans, version, publishedAt, tour } = await req.json()

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      category,
      targetPlans: targetPlans ?? [],
      version,
      publishedAt: publishedAt ? new Date(publishedAt) : new Date(),
    },
  })

  // Optionally attach a product tour
  if (tour?.steps) {
    await prisma.productTour.create({
      data: {
        announcementId: announcement.id,
        steps: tour.steps,
        targetUrl: tour.targetUrl,
      },
    })
  }

  return Response.json(announcement)
}
```

## Step 2: Notification Bell API

```typescript
// app/api/announcements/unread/route.ts
export async function GET(req: Request) {
  const userId = req.user.id
  const userPlan = req.user.plan // "free" | "pro" | "enterprise"

  // Get announcements relevant to this user's plan
  const announcements = await prisma.announcement.findMany({
    where: {
      publishedAt: { not: null, lte: new Date() },
      OR: [
        { targetPlans: { isEmpty: true } },     // everyone
        { targetPlans: { has: userPlan } },     // user's plan
      ],
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  })

  const readIds = await prisma.announcementRead.findMany({
    where: {
      userId,
      announcementId: { in: announcements.map(a => a.id) },
    },
    select: { announcementId: true },
  })

  const readSet = new Set(readIds.map(r => r.announcementId))

  const withReadStatus = announcements.map(a => ({
    ...a,
    isRead: readSet.has(a.id),
  }))

  return Response.json({
    announcements: withReadStatus,
    unreadCount: withReadStatus.filter(a => !a.isRead).length,
  })
}

// Mark as read
// app/api/announcements/[id]/read/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  await prisma.announcementRead.upsert({
    where: {
      announcementId_userId: {
        announcementId: params.id,
        userId: req.user.id,
      },
    },
    update: {},
    create: {
      announcementId: params.id,
      userId: req.user.id,
    },
  })
  return Response.json({ success: true })
}
```

## Step 3: Product Tour Trigger

```typescript
// app/api/tours/active/route.ts
export async function GET(req: Request) {
  const { pathname } = new URL(req.url)
  const userId = req.user.id
  const userPlan = req.user.plan

  // Find tours for announcements on this page that user hasn't seen
  const seenAnnouncementIds = (await prisma.announcementRead.findMany({
    where: { userId },
    select: { announcementId: true },
  })).map(r => r.announcementId)

  const activeTour = await prisma.productTour.findFirst({
    where: {
      announcement: {
        publishedAt: { not: null, lte: new Date() },
        id: { notIn: seenAnnouncementIds },
        OR: [
          { targetPlans: { isEmpty: true } },
          { targetPlans: { has: userPlan } },
        ],
      },
      OR: [
        { targetUrl: null },
        { targetUrl: { contains: pathname } },
      ],
    },
    include: { announcement: true },
    orderBy: { announcement: { publishedAt: 'desc' } },
  })

  return Response.json(activeTour ?? null)
}
```

**Frontend tour runner (vanilla JS):**
```javascript
// Fetch and run tour
async function checkForTour() {
  const tour = await fetch('/api/tours/active').then(r => r.json())
  if (!tour) return

  let stepIndex = 0
  function showStep() {
    const step = tour.steps[stepIndex]
    const target = document.querySelector(step.element)
    if (!target) return

    const tooltip = document.createElement('div')
    tooltip.className = 'product-tour-tooltip'
    tooltip.innerHTML = `
      <strong>${step.title}</strong>
      <p>${step.body}</p>
      <button onclick="nextStep()">
        ${stepIndex < tour.steps.length - 1 ? 'Next →' : 'Got it ✓'}
      </button>
    `
    target.appendChild(tooltip)
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  window.nextStep = async () => {
    document.querySelectorAll('.product-tour-tooltip').forEach(el => el.remove())
    stepIndex++
    if (stepIndex < tour.steps.length) {
      showStep()
    } else {
      // Mark announcement as read when tour completes
      await fetch(`/api/announcements/${tour.announcementId}/read`, { method: 'POST' })
    }
  }

  showStep()
}
```

## Step 4: Monthly Email Digest

```typescript
// workers/monthly-digest.ts
import { Resend } from 'resend'
import { startOfMonth, endOfMonth, subMonths } from 'date-fns'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendMonthlyDigest() {
  const lastMonth = subMonths(new Date(), 1)
  const from = startOfMonth(lastMonth)
  const to = endOfMonth(lastMonth)
  const monthName = lastMonth.toLocaleString('default', { month: 'long', year: 'numeric' })

  const announcements = await prisma.announcement.findMany({
    where: {
      publishedAt: { gte: from, lte: to },
      category: 'FEATURE',
    },
    orderBy: { publishedAt: 'asc' },
  })

  if (announcements.length === 0) return // nothing to send

  // Get all active users
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { email: true, name: true, plan: true },
  })

  const announcementHtml = announcements
    .map(a => `
      <div style="margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid #eee;">
        <h3 style="margin:0 0 8px">${a.title}</h3>
        <p style="color:#666; margin:0">${a.body.substring(0, 200)}...</p>
        <a href="https://app.example.com/changelog#${a.id}">Learn more →</a>
      </div>
    `).join('')

  // Send in batches (Resend batch API)
  const emailBatch = users.map(user => ({
    from: 'product@example.com',
    to: user.email,
    subject: `🚀 What's new in ${monthName}`,
    html: `
      <h2>Here's what we shipped in ${monthName}</h2>
      ${announcementHtml}
      <p><a href="https://app.example.com/changelog">View full changelog →</a></p>
      <p style="color:#aaa; font-size:12px">
        <a href="https://app.example.com/unsubscribe">Unsubscribe from product updates</a>
      </p>
    `,
  }))

  // Send in chunks of 100 (Resend batch limit)
  for (let i = 0; i < emailBatch.length; i += 100) {
    await resend.batch.send(emailBatch.slice(i, i + 100))
  }
}
```

## Step 5: Public Changelog Page

```typescript
// app/changelog/page.tsx
export default async function Changelog() {
  const announcements = await prisma.announcement.findMany({
    where: { publishedAt: { not: null, lte: new Date() } },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <div className="max-w-2xl mx-auto py-16">
      <h1 className="text-3xl font-bold mb-8">What's New</h1>
      {announcements.map(a => (
        <article key={a.id} id={a.id} className="mb-12">
          <div className="flex items-center gap-3 mb-2">
            {a.version && <span className="text-sm font-mono bg-gray-100 px-2 py-1 rounded">v{a.version}</span>}
            <span className="text-sm text-gray-500">{a.publishedAt?.toLocaleDateString()}</span>
            <span className={`text-xs px-2 py-1 rounded ${a.category === 'FEATURE' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
              {a.category}
            </span>
          </div>
          <h2 className="text-xl font-semibold mb-2">{a.title}</h2>
          <div className="prose text-gray-700">{a.body}</div>
        </article>
      ))}
    </div>
  )
}
```

## Run the Digest Worker

```bash
# Schedule for first day of each month
0 9 1 * * npx ts-node workers/monthly-digest.ts
```

## What's Next

- Add "subscribe to changelog" option for non-users (prospect nurturing)
- Track announcement open rates and feature adoption correlation
- Build a Slack integration: post announcements to #product-updates channel
- Add emoji reactions on announcements ("🔥 This is great!")
