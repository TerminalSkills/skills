---
title: Build a Linktree Alternative — Link-in-Bio with Analytics and Custom Domains
slug: build-link-in-bio-tool
description: "Build a self-hosted Linktree alternative with custom domains via CNAME, per-link click analytics, geo/device tracking, theme customization, and a Stripe-powered Pro plan."
skills: [stripe, prisma, nextjs]
category: saas
tags: [link-in-bio, linktree, creator, analytics, custom-domain, stripe, nextjs, monetization]
---

# Build a Linktree Alternative — Link-in-Bio with Analytics and Custom Domains

## The Problem

You're a creator with 50k followers. Your Linktree has 8 links. You have no idea which ones are getting clicked, where your traffic comes from, or what device your audience uses. Linktree Pro is $9/month — but you have no custom domain, the branding is Linktree's, and you own none of your data.

The same problem applies if you're building a product: "link-in-bio" is a narrow but high-intent SaaS category with clear freemium → Pro conversion triggers (custom domain, analytics, themes). It's a great first SaaS to build.

## The Solution

Use **Next.js** (App Router) for the profile page and admin UI. Use **Prisma** for profiles, links, themes, and click events. Use **Stripe** for the Pro plan that unlocks custom domains and detailed analytics.

## Step-by-Step Walkthrough

### Step 1: Prisma Schema

```text
Design a Prisma schema for a link-in-bio tool. Include: Profile (username, 
bio, avatar, theme settings, customDomain, plan), Link (title, url, icon, 
order, enabled), ClickEvent (linkId, ip, country, city, device, browser, 
referer), and Subscription (Stripe data).
```

```prisma
// prisma/schema.prisma

model Profile {
  id           String    @id @default(cuid())
  userId       String    @unique
  username     String    @unique
  displayName  String
  bio          String?
  avatarUrl    String?
  customDomain String?   @unique
  plan         String    @default("free") // "free" | "pro"

  // Theme
  bgColor      String    @default("#ffffff")
  textColor    String    @default("#111827")
  buttonStyle  String    @default("rounded") // "rounded" | "sharp" | "pill"
  fontFamily   String    @default("Inter")

  // Stripe
  stripeCustomerId     String?
  stripeSubscriptionId String?

  links        Link[]
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model Link {
  id        String    @id @default(cuid())
  profileId String
  profile   Profile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  title     String
  url       String
  icon      String?   // Emoji or icon name
  order     Int       @default(0)
  enabled   Boolean   @default(true)
  clicks    ClickEvent[]
  createdAt DateTime  @default(now())
}

model ClickEvent {
  id        String   @id @default(cuid())
  linkId    String
  link      Link     @relation(fields: [linkId], references: [id], onDelete: Cascade)
  ip        String
  country   String?
  city      String?
  device    String?  // "mobile" | "desktop" | "tablet"
  browser   String?
  referer   String?
  clickedAt DateTime @default(now())
}
```

### Step 2: Public Profile Page

```tsx
// app/[username]/page.tsx — The public link-in-bio page

import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export async function generateMetadata({ params }: { params: { username: string } }) {
  const profile = await prisma.profile.findUnique({ where: { username: params.username } })
  if (!profile) return {}
  return {
    title: profile.displayName,
    description: profile.bio || `Links from ${profile.displayName}`,
    openGraph: { images: profile.avatarUrl ? [profile.avatarUrl] : [] },
  }
}

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const profile = await prisma.profile.findUnique({
    where: { username: params.username },
    include: {
      links: { where: { enabled: true }, orderBy: { order: 'asc' } }
    }
  })

  if (!profile) notFound()

  const buttonClass = {
    rounded: 'rounded-xl',
    sharp: 'rounded-none',
    pill: 'rounded-full',
  }[profile.buttonStyle] || 'rounded-xl'

  return (
    <div
      className="min-h-screen flex flex-col items-center py-16 px-4"
      style={{ backgroundColor: profile.bgColor, color: profile.textColor, fontFamily: profile.fontFamily }}
    >
      {/* Avatar and bio */}
      {profile.avatarUrl && (
        <img src={profile.avatarUrl} alt=""
          className="w-20 h-20 rounded-full object-cover mb-4 shadow-md" />
      )}
      <h1 className="text-xl font-bold mb-1">{profile.displayName}</h1>
      {profile.bio && (
        <p className="text-sm opacity-70 text-center max-w-xs mb-8">{profile.bio}</p>
      )}

      {/* Links */}
      <div className="w-full max-w-sm space-y-3">
        {profile.links.map(link => (
          <a
            key={link.id}
            href={`/api/click/${link.id}`}  // Track click, then redirect
            className={`flex items-center justify-center gap-2 w-full py-4 px-6 font-semibold
                        border-2 transition-all hover:opacity-80 active:scale-95 ${buttonClass}`}
            style={{ borderColor: profile.textColor }}
          >
            {link.icon && <span>{link.icon}</span>}
            {link.title}
          </a>
        ))}
      </div>

      {/* Footer branding — remove on Pro */}
      {profile.plan === 'free' && (
        <p className="text-xs opacity-40 mt-12">
          Made with <a href="/" className="underline">YourApp</a>
        </p>
      )}
    </div>
  )
}
```

### Step 3: Click Tracking with Geo and Device Detection

```typescript
// app/api/click/[linkId]/route.ts — Record click event and redirect

import { prisma } from '@/lib/prisma'
import { headers } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { UAParser } from 'ua-parser-js'

export async function GET(req: NextRequest, { params }: { params: { linkId: string } }) {
  const link = await prisma.link.findUnique({
    where: { id: params.linkId },
    include: { profile: { select: { plan: true } } },
  })

  if (!link) return NextResponse.redirect('/')

  const headersList = headers()
  const ip = headersList.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  const userAgent = headersList.get('user-agent') || ''
  const referer = headersList.get('referer') || ''

  // Parse user agent
  const parser = new UAParser(userAgent)
  const deviceType = parser.getDevice().type || 'desktop'
  const browser = parser.getBrowser().name || 'unknown'

  // Geo lookup — free tier: use ip-api.com (1000 req/day free)
  let country: string | undefined, city: string | undefined
  if (ip !== 'unknown' && link.profile.plan === 'pro') {
    try {
      const geo = await fetch(`http://ip-api.com/json/${ip}?fields=country,city`)
      const geoData = await geo.json()
      country = geoData.country
      city = geoData.city
    } catch {
      // Geo lookup failed — non-critical, don't block redirect
    }
  }

  // Save click (don't await — fire and forget to keep redirect fast)
  prisma.clickEvent.create({
    data: {
      linkId: params.linkId,
      ip,
      country,
      city,
      device: deviceType,
      browser,
      referer: referer.substring(0, 255),
    }
  }).catch(console.error)

  return NextResponse.redirect(link.url)
}
```

### Step 4: Custom Domain Mapping

```typescript
// middleware.ts — Route requests from custom domains to the right profile

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { prisma } from './lib/prisma'

export async function middleware(req: NextRequest) {
  const hostname = req.headers.get('host') || ''
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || 'yourdomain.com'

  // Skip if it's the main app domain
  if (hostname === appDomain || hostname.endsWith(`.${appDomain}`)) {
    return NextResponse.next()
  }

  // Look up the profile for this custom domain
  const profile = await prisma.profile.findUnique({
    where: { customDomain: hostname },
    select: { username: true, plan: true },
  })

  if (!profile || profile.plan !== 'pro') {
    return NextResponse.next()
  }

  // Rewrite to the profile page
  const url = req.nextUrl.clone()
  url.pathname = `/${profile.username}`
  return NextResponse.rewrite(url)
}

export const config = {
  matcher: ['/((?!api|_next|_static|favicon).*)'],
}
```

```typescript
// app/api/profile/domain/route.ts — Save custom domain after user adds CNAME

export async function POST(req: Request) {
  const { domain } = await req.json()
  const userId = 'from-auth' // get from session

  // Verify CNAME is pointing to our server before saving
  const { Resolver } = await import('dns/promises')
  const resolver = new Resolver()
  try {
    const cnames = await resolver.resolveCname(domain)
    const targetCname = process.env.CNAME_TARGET || 'cname.yourdomain.com'
    if (!cnames.includes(targetCname)) {
      return Response.json({
        error: `CNAME not configured. Add a CNAME record pointing ${domain} to ${targetCname}`,
      }, { status: 400 })
    }
  } catch {
    return Response.json({ error: 'Could not verify CNAME. DNS propagation may take up to 48 hours.' }, { status: 400 })
  }

  await prisma.profile.update({
    where: { userId },
    data: { customDomain: domain }
  })

  return Response.json({ success: true })
}
```

### Step 5: Stripe Pro Plan Subscription

```typescript
// app/api/billing/upgrade/route.ts — Stripe Checkout for Pro plan

import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: NextRequest) {
  const userId = 'from-auth' // get from session
  const profile = await prisma.profile.findUnique({ where: { userId } })
  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let customerId = profile.stripeCustomerId

  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { userId, username: profile.username },
    })
    customerId = customer.id
    await prisma.profile.update({ where: { userId }, data: { stripeCustomerId: customer.id } })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRO_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.APP_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.APP_URL}/dashboard/billing`,
    subscription_data: { metadata: { userId } },
  })

  return NextResponse.json({ url: session.url })
}
```

```typescript
// app/api/webhooks/stripe/route.ts — Activate Pro on payment success

import Stripe from 'stripe'
import { prisma } from '@/lib/prisma'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

export async function POST(req: Request) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return new Response('Signature invalid', { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const sub = await stripe.subscriptions.retrieve(session.subscription as string)
    const userId = sub.metadata.userId

    await prisma.profile.update({
      where: { userId },
      data: { plan: 'pro', stripeSubscriptionId: sub.id },
    })
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription
    const userId = sub.metadata.userId
    await prisma.profile.update({
      where: { userId },
      data: { plan: 'free', stripeSubscriptionId: null, customDomain: null },
    })
  }

  return new Response('OK')
}
```

### Step 6: Analytics Dashboard

```tsx
// app/dashboard/analytics/page.tsx — Per-link click analytics for Pro users

import { prisma } from '@/lib/prisma'

export default async function AnalyticsPage({ userId }: { userId: string }) {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    include: {
      links: {
        include: {
          clicks: {
            where: { clickedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }
          }
        }
      }
    }
  })

  if (!profile) return null
  const totalClicks = profile.links.reduce((sum, l) => sum + l.clicks.length, 0)

  // Device breakdown
  const deviceMap: Record<string, number> = {}
  const countryMap: Record<string, number> = {}
  profile.links.forEach(link => {
    link.clicks.forEach(click => {
      if (click.device) deviceMap[click.device] = (deviceMap[click.device] || 0) + 1
      if (click.country) countryMap[click.country] = (countryMap[click.country] || 0) + 1
    })
  })

  const topCountries = Object.entries(countryMap)
    .sort((a, b) => b[1] - a[1]).slice(0, 5)

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Analytics — Last 30 days</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard label="Total Clicks" value={totalClicks} />
        <StatCard label="Links" value={profile.links.length} />
        <StatCard label="Top Country" value={topCountries[0]?.[0] || 'N/A'} />
      </div>

      {/* Per-link breakdown */}
      <h2 className="font-semibold mb-4">By link</h2>
      <div className="space-y-3">
        {profile.links
          .sort((a, b) => b.clicks.length - a.clicks.length)
          .map(link => (
            <div key={link.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
              <span className="text-xl">{link.icon || '🔗'}</span>
              <div className="flex-1">
                <p className="font-medium text-sm">{link.title}</p>
                <p className="text-xs text-slate-400">{link.url}</p>
              </div>
              <span className="font-bold text-indigo-600">{link.clicks.length}</span>
            </div>
          ))}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-slate-50 rounded-xl p-5">
      <p className="text-sm text-slate-500 mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
```

## Real-World Example

A travel creator with 80k Instagram followers builds this in two weekends. She adds 10 links (YouTube, newsletter, affiliate links, merch store). After the first week, analytics show that 72% of her clicks come from mobile, 60% from the US, and her merch store link gets 3x more clicks than her YouTube link — something she wouldn't have known from Linktree's free plan. She upgrades herself to Pro, sets up a custom domain (bio.heracount.com), and removes the "Made with YourApp" branding. Three creator friends join within a month after seeing her custom domain.

## Related Skills

- [stripe](../skills/stripe/) — Pro plan subscriptions and webhook lifecycle management
- [prisma](../skills/prisma/) — Profile, link, and click event data modeling
- [nextjs](../skills/nextjs/) — App Router, middleware for custom domains, server components
