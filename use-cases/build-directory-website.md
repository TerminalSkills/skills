---
title: Build a Monetized Niche Directory Website
description: "Build a niche directory website — submit listings, search, filter, featured spots, and SEO-optimized pages. Monetize with Stripe-powered featured listings."
skills:
  - prisma
  - stripe-billing
  - nextjs
difficulty: intermediate
time_estimate: "12 hours"
tags: [directory, saas, nextjs, prisma, stripe, seo, json-ld, sitemap]
---

# Build a Monetized Niche Directory Website

## The Problem

You have spotted a gap: nobody has built a proper directory for remote dev tools, indie SaaS products, boutique design agencies or AI startups in your city. You want to build it, earn search traffic, and charge for featured spots. The directory needs a submission form, a review queue that keeps spam out, and listing pages that search engines can understand.

## The Solution

Next.js (App Router) with Prisma and PostgreSQL for listings, a submission form that puts entries in a review queue, search and filtering, featured spots paid through Stripe Checkout, and the SEO basics: per-page metadata, JSON-LD and a generated sitemap. The code targets Next.js 16 and Prisma ORM 7 (Prisma 8 is still a release candidate with a different schema format).

## Setup

```bash
npx create-next-app@latest niche-directory --yes   # TypeScript, Tailwind, App Router
cd niche-directory
npm install @prisma/client@7 @prisma/adapter-pg pg stripe zod slugify
npm install -D prisma@7 @types/pg dotenv
npx prisma init --datasource-provider postgresql --output ../generated/prisma
```

Put these in `.env` (never in git): `DATABASE_URL`, `STRIPE_SECRET_KEY` (a `sk_test_` key while developing), `STRIPE_WEBHOOK_SECRET` (printed by `stripe listen` locally) and `SITE_URL` (public URL, no trailing slash; `http://127.0.0.1:3000` locally).

## Database Schema

`prisma init` writes the `generator client` (provider `prisma-client`, output `../generated/prisma`) and `datasource db` blocks. Add the model below them; the connection URL lives in the generated Prisma config, which reads `DATABASE_URL`.

```prisma
// prisma/schema.prisma (after the generated blocks)
enum ListingStatus { PENDING APPROVED REJECTED }
model Listing {
  id          String        @id @default(cuid())
  name        String
  slug        String        @unique
  description String
  website     String
  category    String
  tags        String[]      @default([])
  location    String?       // null = global/remote
  email       String        // submitter email, never public
  status      ListingStatus @default(PENDING)
  featuredEnd DateTime?     // featured while this is in the future
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
}
```

Then run `npx prisma migrate dev --name init && npx prisma generate` to create the table and the client.

```typescript
// lib/prisma.ts — one client per process (dev reloads would otherwise open many)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = (g.prisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) }));
```

## Step-by-Step Walkthrough

### Step 1: Submission form with server-side validation

A Server Action is a public POST endpoint, so it validates everything itself. The website must be http(s), since `z.url()` alone also accepts `javascript:` links.

```tsx
// app/submit/page.tsx — form, validation and insert in one file
import { randomBytes } from 'node:crypto';
import { redirect } from 'next/navigation';
import slugify from 'slugify';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
const CATEGORIES = ['tool', 'agency', 'product', 'community', 'resource'] as const;
const submitSchema = z.object({
  name: z.string().trim().min(2).max(100),
  website: z.url().refine(u => /^https?:\/\//i.test(u), 'must be an http(s) URL'),
  description: z.string().trim().min(50).max(500),
  category: z.enum(CATEGORIES),
  tags: z.string().max(200), // comma-separated
  location: z.string().trim().max(100).optional(),
  email: z.email(),
});
async function submit(form: FormData) {
  'use server';
  const parsed = submitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    redirect(`/submit?error=${encodeURIComponent(parsed.error.issues.map(i => `${String(i.path[0])}: ${i.message}`).join('; '))}`);
  }
  const d = parsed.data;
  const base = slugify(d.name, { lower: true, strict: true }) || 'listing';
  const taken = await prisma.listing.findUnique({ where: { slug: base }, select: { id: true } });
  await prisma.listing.create({
    data: {
      name: d.name, description: d.description, website: d.website, category: d.category,
      slug: taken ? `${base}-${randomBytes(3).toString('hex')}` : base,
      tags: d.tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8),
      location: d.location || null, email: d.email, // status defaults to PENDING
    },
  });
  redirect('/submit?ok=1');
}
export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { error, ok } = await searchParams;
  if (ok) return <p className="p-16 text-center">Thanks! We review new listings within 48 hours.</p>;
  return (
    <form action={submit} className="mx-auto max-w-lg space-y-3 p-6">
      <h1 className="text-2xl font-bold">Submit a listing</h1>
      {['name', 'website', 'email', 'location', 'tags', 'description'].map(f => (
        <input key={f} name={f} placeholder={f} className="w-full rounded border px-3 py-2" />
      ))}
      <select name="category" className="w-full rounded border px-3 py-2">
        {CATEGORIES.map(c => <option key={c}>{c}</option>)}
      </select>
      {error && <p className="text-sm text-red-500">{error}</p>}
      <button className="w-full rounded bg-indigo-600 py-2 text-white">Submit listing (free)</button>
    </form>
  );
}
```

### Step 2: Review queue and approval

New rows start as `PENDING` and are invisible everywhere. Before launch, add a notification (an email or Slack incoming webhook) after the `create`, and rate limiting.

Until you build a review screen, approve listings by hand: run `npx prisma studio` and set a row's `status` to `APPROVED`. A review screen must sit behind real authentication (your auth provider's session check, not a shared URL or token); never expose an unauthenticated approve endpoint.

### Step 3: Search and filter

A listing is featured while `featuredEnd` is in the future, so spots expire by themselves with no cron job. Search and `?category=tool` are plain GET parameters, so every view is a shareable URL.

```tsx
// app/page.tsx
import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const { q, category } = await searchParams; // a Promise in Next.js 15+
  const now = new Date();
  const filters: Prisma.ListingWhereInput = {
    status: 'APPROVED',
    ...(q && { OR: [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { tags: { has: q.toLowerCase() } },
    ] }),
    ...(category && { category }),
  };
  const [featured, regular] = await Promise.all([
    prisma.listing.findMany({ where: { AND: [filters, { featuredEnd: { gt: now } }] }, orderBy: { featuredEnd: 'desc' } }),
    prisma.listing.findMany({
      where: { AND: [filters, { OR: [{ featuredEnd: null }, { featuredEnd: { lte: now } }] }] },
      orderBy: { createdAt: 'desc' }, take: 24,
    }),
  ]);
  return (
    <div className="mx-auto max-w-4xl p-6">
      <form className="mb-8">
        <input name="q" placeholder="Search..." defaultValue={q} className="w-full rounded border px-3 py-2" />
      </form>
      {[...featured, ...regular].map(l => (
        <Link key={l.id} href={`/listing/${l.slug}`} className="mb-4 block rounded-lg border p-4">
          <h2 className="text-lg font-semibold">{l.featuredEnd && l.featuredEnd > now && '★ '}{l.name}</h2>
          <p className="text-sm text-gray-600">{l.description}</p>
        </Link>
      ))}
    </div>
  );
}
```

### Step 4: Paid featured spots with Stripe Checkout

```typescript
// app/api/listings/[id]/feature/route.ts
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await prisma.listing.findFirst({ where: { id, status: 'APPROVED' } });
  if (!listing) return Response.json({ error: 'Not found' }, { status: 404 });
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd', unit_amount: 9900, // $99.00 in cents
        product_data: { name: 'Featured listing, 30 days', description: listing.name },
      },
      quantity: 1,
    }],
    metadata: { listingId: listing.id },
    success_url: `${process.env.SITE_URL}/listing/${listing.slug}?featured=success`,
    cancel_url: `${process.env.SITE_URL}/listing/${listing.slug}`,
  });
  return Response.json({ checkoutUrl: session.url });
}
```

Only the webhook may mark a listing as featured, because anyone can open the success URL:

```typescript
// app/api/webhooks/stripe/route.ts
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
export async function POST(req: Request) {
  let event: Stripe.Event;
  try { // req.text(), not req.json(): the signature covers the raw bytes
    event = stripe.webhooks.constructEvent(
      await req.text(), req.headers.get('stripe-signature') ?? '', process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return Response.json({ error: 'Bad signature' }, { status: 400 });
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object;
    const id = session.metadata?.listingId;
    const l = id && session.payment_status === 'paid' ? await prisma.listing.findUnique({ where: { id } }) : null;
    if (l) { // renewing early extends the current period
      const from = l.featuredEnd && l.featuredEnd > new Date() ? +l.featuredEnd : Date.now();
      await prisma.listing.update({ where: { id: l.id }, data: { featuredEnd: new Date(from + THIRTY_DAYS) } });
    }
  }
  return Response.json({ received: true });
}
```

Locally, forward events with `stripe listen --forward-to 127.0.0.1:3000/api/webhooks/stripe`; in production, add the endpoint in the dashboard for both event types. Stripe can deliver an event twice, so record processed `event.id`s before taking real money.

### Step 5: SEO — metadata, JSON-LD, sitemap

```tsx
// app/listing/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { prisma } from '@/lib/prisma';
// One cached query for metadata and page; only approved listings are public
const getListing = cache((slug: string) => prisma.listing.findFirst({ where: { slug, status: 'APPROVED' } }));
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await getListing((await params).slug);
  if (!l) return {};
  return {
    title: `${l.name} — Niche Directory`, description: l.description,
    alternates: { canonical: `${process.env.SITE_URL}/listing/${l.slug}` },
  };
}
export default async function ListingPage({ params }: Props) {
  const l = await getListing((await params).slug);
  if (!l) notFound();
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'WebPage', name: l.name, description: l.description,
    url: `${process.env.SITE_URL}/listing/${l.slug}`, about: { '@type': 'Thing', name: l.name, url: l.website },
  };
  return (
    <div className="mx-auto max-w-2xl p-6">
      {/* escape "<" so a listing name can never close the script tag */}
      <script type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <h1 className="text-3xl font-bold">{l.name}</h1>
      <p className="mt-2 text-gray-600">{l.description}</p>
      <a href={l.website} target="_blank" rel={l.featuredEnd && l.featuredEnd > new Date() ? 'sponsored noopener' : 'nofollow ugc noopener'}
        className="mt-6 inline-block rounded bg-indigo-600 px-6 py-2 text-white">Visit {l.name} →</a>
    </div>
  );
}
```

Links to user-submitted sites carry `rel="nofollow ugc"` and paid featured links `rel="sponsored"`, as Google's link guidelines ask. A pending listing returns 404 for both the page and its metadata.

```typescript
// app/sitemap.ts
import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic'; // read the database per request, not at build time
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await prisma.listing.findMany({ where: { status: 'APPROVED' }, select: { slug: true, updatedAt: true } });
  return listings.map(l => ({ url: `${process.env.SITE_URL}/listing/${l.slug}`, lastModified: l.updatedAt }));
}
```

## Real-World Example

Mira builds "Remote Dev Tools", a directory for tools used by distributed teams. She seeds 60 listings by hand, opens submissions, and approves new ones in batches. After a few months of indexed pages, tool makers ask how to be placed first, and she sends them the featured link: a $99 Checkout payment that keeps the listing at the top for 30 days. The price and period are Mira's own choices; change them to fit your niche.

## Related Skills

- [prisma](../skills/prisma/) — Schema, migrations and typed queries for the listing table
- [stripe-billing](../skills/stripe-billing/) — Stripe Checkout, webhooks and billing concepts for featured spots
- [nextjs](../skills/nextjs/) — App Router, async params, metadata API and the generated sitemap
