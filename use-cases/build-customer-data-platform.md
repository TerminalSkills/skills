---
title: "Build a Customer Data Platform (CDP)"
description: "Unify user data from your website, mobile app, CRM, and payment system. Build identity resolution, unified profiles, segment builder, and destination sync — replacing Segment."
skills: [prisma, resend]
difficulty: advanced
time_estimate: "8 hours"
tags: [cdp, analytics, segment, data, identity-resolution, audience, email, marketing]
---

# Build a Customer Data Platform (CDP)

Segment charges $120/month per source. You have 5 sources — that's $600/month for a data pipe. Building your own CDP gives you full control of your customer data, no per-event costs, and the ability to build custom identity resolution logic that actually works for your data model.

## The Persona

You're on the data team at a B2C SaaS. Users sign up on web, use your mobile app, come back via email links, and pay via Stripe. The same person shows up as 4 different "users" in your analytics. You need a single source of truth for every customer's journey — and the ability to slice audiences and sync them to your email tool, Facebook Ads, and CRM.

## What You'll Build

- **Event ingestion** — single `/track` endpoint for all sources
- **Identity resolution** — merge users across devices and channels
- **Unified profiles** — one timeline per person across all sources
- **Segment builder** — define audiences with SQL-like filters
- **Destination sync** — push segments to Resend email lists, CRM, and ad platforms

## Schema

```prisma
// schema.prisma
model Identity {
  id         String   @id @default(cuid())
  userId     String?  // your product's userId when logged in
  anonymousId String? // device/cookie ID before login
  email      String?
  phone      String?
  traits     Json     @default("{}") // name, plan, createdAt, etc.
  mergedInto String?  // if this identity was merged into another
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  events     Event[]

  @@index([userId])
  @@index([email])
  @@index([anonymousId])
}

model Event {
  id         String   @id @default(cuid())
  identityId String
  type       EventType
  name       String   // "Page Viewed", "Signed Up", "Upgraded Plan"
  source     String   // "web", "mobile", "server", "stripe"
  properties Json     @default("{}")
  timestamp  DateTime @default(now())

  identity   Identity @relation(fields: [identityId], references: [id])

  @@index([identityId, timestamp])
  @@index([name, timestamp])
}

model Segment {
  id          String   @id @default(cuid())
  name        String
  description String?
  filter      Json     // filter criteria (see Step 4)
  memberCount Int      @default(0)
  lastSyncAt  DateTime?
  createdAt   DateTime @default(now())
}

enum EventType { TRACK PAGE IDENTIFY GROUP }
```

## Step 1: Event Ingestion Endpoint

```typescript
// app/api/track/route.ts — unified ingestion for all sources
export async function POST(req: Request) {
  const payload = await req.json()
  const { type, userId, anonymousId, event, properties, traits, timestamp, source } = payload

  // Resolve or create identity
  const identity = await resolveIdentity({ userId, anonymousId, email: traits?.email })

  if (type === 'identify') {
    // Update traits on the profile
    await prisma.identity.update({
      where: { id: identity.id },
      data: {
        userId: userId ?? identity.userId,
        email: traits?.email ?? identity.email,
        traits: { ...(identity.traits as object), ...traits },
      },
    })
  }

  if (type === 'track' || type === 'page') {
    await prisma.event.create({
      data: {
        identityId: identity.id,
        type: type.toUpperCase() as any,
        name: event ?? 'Page Viewed',
        source: source ?? 'unknown',
        properties: properties ?? {},
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      },
    })
  }

  return Response.json({ success: true, identityId: identity.id })
}
```

## Step 2: Identity Resolution

```typescript
// lib/identity-resolution.ts
import { prisma } from './prisma'

interface IdentityInput {
  userId?: string
  anonymousId?: string
  email?: string
}

export async function resolveIdentity(input: IdentityInput) {
  // Priority: userId > email > anonymousId
  // When a user logs in, merge their anonymous events into their profile

  let identity = null

  // Try to find by userId first (most authoritative)
  if (input.userId) {
    identity = await prisma.identity.findFirst({
      where: { userId: input.userId, mergedInto: null },
    })
  }

  // Try by email
  if (!identity && input.email) {
    identity = await prisma.identity.findFirst({
      where: { email: input.email, mergedInto: null },
    })
  }

  // Try by anonymousId
  if (!identity && input.anonymousId) {
    identity = await prisma.identity.findFirst({
      where: { anonymousId: input.anonymousId, mergedInto: null },
    })
  }

  // Create new identity if not found
  if (!identity) {
    identity = await prisma.identity.create({
      data: {
        userId: input.userId,
        anonymousId: input.anonymousId,
        email: input.email,
      },
    })
  }

  // Merge: if we have both userId and anonymousId, merge anonymous into user profile
  if (input.userId && input.anonymousId && identity.userId === input.userId) {
    const anonIdentity = await prisma.identity.findFirst({
      where: { anonymousId: input.anonymousId, userId: null, mergedInto: null },
    })

    if (anonIdentity && anonIdentity.id !== identity.id) {
      // Move all events from anonymous to user identity
      await prisma.event.updateMany({
        where: { identityId: anonIdentity.id },
        data: { identityId: identity.id },
      })
      // Mark anonymous as merged
      await prisma.identity.update({
        where: { id: anonIdentity.id },
        data: { mergedInto: identity.id },
      })
    }
  }

  return identity
}
```

## Step 3: Unified Profile API

```typescript
// app/api/profiles/[id]/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const identity = await prisma.identity.findUnique({
    where: { id: params.id },
    include: {
      events: {
        where: { timestamp: { gte: subDays(new Date(), 90) } },
        orderBy: { timestamp: 'desc' },
        take: 100,
      },
    },
  })

  if (!identity) return Response.json({ error: 'Not found' }, { status: 404 })

  // Compute derived traits
  const firstSeen = await prisma.event.findFirst({
    where: { identityId: identity.id },
    orderBy: { timestamp: 'asc' },
    select: { timestamp: true },
  })

  const pageViews = identity.events.filter(e => e.type === 'PAGE').length
  const conversions = identity.events.filter(e => e.name === 'Upgraded Plan').length

  return Response.json({
    id: identity.id,
    userId: identity.userId,
    email: identity.email,
    traits: identity.traits,
    firstSeen: firstSeen?.timestamp,
    lastSeen: identity.events[0]?.timestamp,
    eventCount: identity.events.length,
    pageViews,
    conversions,
    timeline: identity.events,
  })
}
```

## Step 4: Segment Builder

```typescript
// lib/segment-evaluator.ts
// Filter schema: { field, operator, value } | { and/or: Filter[] }

interface Filter {
  field?: string       // "traits.plan", "events.count", "traits.createdAt"
  operator?: string    // "eq", "gt", "lt", "contains", "exists"
  value?: unknown
  and?: Filter[]
  or?: Filter[]
}

export async function evaluateSegment(filter: Filter): Promise<string[]> {
  // Build Prisma query from filter tree
  const where = buildPrismaWhere(filter)

  const identities = await prisma.identity.findMany({
    where: { ...where, mergedInto: null },
    select: { id: true },
  })

  return identities.map(i => i.id)
}

function buildPrismaWhere(filter: Filter): object {
  if (filter.and) return { AND: filter.and.map(buildPrismaWhere) }
  if (filter.or)  return { OR: filter.or.map(buildPrismaWhere) }

  // Map filter.field to Prisma path
  const fieldMap: Record<string, string> = {
    'traits.plan':        'traits.path(["plan"])',
    'traits.createdAt':   'createdAt',
    'email':              'email',
  }

  // Simple examples — extend for your schema
  if (filter.field === 'traits.plan' && filter.operator === 'eq') {
    return { traits: { path: ['plan'], equals: filter.value } }
  }
  if (filter.field === 'email' && filter.operator === 'contains') {
    return { email: { contains: filter.value as string } }
  }

  return {}
}

// Example segment: Pro users who haven't used the app in 7 days
const atRiskProUsers: Filter = {
  and: [
    { field: 'traits.plan', operator: 'eq', value: 'pro' },
    // Extend: last event > 7 days ago
  ],
}
```

## Step 5: Destination Sync — Push to Resend

```typescript
// lib/destinations/resend-sync.ts
import { Resend } from 'resend'
import { prisma } from '../prisma'
import { evaluateSegment } from '../segment-evaluator'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function syncSegmentToResend(segmentId: string, audienceId: string) {
  const segment = await prisma.segment.findUnique({ where: { id: segmentId } })
  if (!segment) throw new Error('Segment not found')

  const identityIds = await evaluateSegment(segment.filter as any)

  const identities = await prisma.identity.findMany({
    where: { id: { in: identityIds }, email: { not: null } },
    select: { email: true, traits: true },
  })

  // Upsert contacts in Resend audience
  for (const identity of identities) {
    const traits = identity.traits as Record<string, string>
    await resend.contacts.upsert({
      audienceId,
      email: identity.email!,
      firstName: traits.firstName,
      lastName: traits.lastName,
      unsubscribed: false,
    })
  }

  await prisma.segment.update({
    where: { id: segmentId },
    data: { memberCount: identities.length, lastSyncAt: new Date() },
  })

  console.log(`Synced ${identities.length} contacts to Resend audience ${audienceId}`)
}
```

## Step 6: Client-Side Tracking Snippet

```javascript
// Embed on your website — mirrors Segment's analytics.js API
(function() {
  window.cdp = {
    track: function(event, properties) {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'track',
          event,
          properties,
          anonymousId: this._getAnonymousId(),
          source: 'web',
        }),
      })
    },
    identify: function(userId, traits) {
      fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'identify',
          userId,
          traits,
          anonymousId: this._getAnonymousId(),
          source: 'web',
        }),
      })
    },
    page: function(name, properties) {
      this.track(name ?? document.title, {
        url: window.location.href,
        referrer: document.referrer,
        ...properties,
      })
    },
    _getAnonymousId: function() {
      let id = localStorage.getItem('cdp_anon_id')
      if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem('cdp_anon_id', id)
      }
      return id
    },
  }
})()
```

## What's Next

- Add server-side Stripe webhook handler to ingest payment events
- Build a real-time segment membership counter
- Sync segments to Facebook Custom Audiences via Marketing API
- Add HubSpot destination: push contact updates when traits change
- Build a visual segment builder UI with drag-and-drop filter blocks
