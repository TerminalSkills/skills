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

You've identified a gap: no one has built a proper directory for [remote dev tools / indie SaaS products / boutique design agencies / AI startups in your city]. You want to build it, grow it to 10K monthly visitors via SEO, and monetize with $99/month featured spots. The directory needs a submission form, a review queue so spam stays out, and excellent SEO so Google ranks individual listing pages.

## The Solution

Next.js App Router with Prisma + PostgreSQL for listings, a submission form that puts new entries in a review queue, search and filtering by category/tags/location, featured spots paid via Stripe, and programmatic SEO: dynamic meta tags, JSON-LD structured data, and an auto-generated sitemap.

## Database Schema

```prisma
// prisma/schema.prisma

model Listing {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  description String   @db.Text
  website     String
  logo        String?
  category    String
  tags        String[] @default([])
  location    String?  // null = global/remote
  email       String   // submitter email, not public
  status      String   @default("pending")  // pending, approved, rejected
  featured    Boolean  @default(false)
  featuredAt  DateTime?
  featuredEnd DateTime?
  clicks      Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([category, status, featured])
  @@index([slug])
}
```

## Step-by-Step Walkthrough

### Step 1: Submission Form with Validation

```tsx
// app/submit/page.tsx — Listing submission form

'use client';
import { useState } from 'react';
import { z } from 'zod';

const submitSchema = z.object({
  name: z.string().min(2).max(100),
  website: z.string().url(),
  description: z.string().min(50).max(500),
  category: z.enum(['tool', 'agency', 'product', 'community', 'resource']),
  tags: z.string(),  // comma-separated
  location: z.string().optional(),
  email: z.string().email(),
});

export default function SubmitPage() {
  const [form, setForm] = useState({ name: '', website: '', description: '',
    category: 'tool', tags: '', location: '', email: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = submitSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach(err => {
        fieldErrors[err.path[0]] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const res = await fetch('/api/listings/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.data),
    });

    if (res.ok) setSubmitted(true);
  }

  if (submitted) return (
    <div className="text-center py-16">
      <h2 className="text-2xl font-bold">Submission received!</h2>
      <p className="text-gray-500 mt-2">We'll review your listing within 48 hours.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="max-w-lg mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">Submit a listing</h1>
      {(['name', 'website', 'email'] as const).map(field => (
        <div key={field}>
          <input
            placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
            value={form[field]}
            onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
            className="w-full border rounded px-3 py-2"
          />
          {errors[field] && <p className="text-red-500 text-sm">{errors[field]}</p>}
        </div>
      ))}
      <textarea
        placeholder="Description (50–500 characters)"
        value={form.description}
        onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
        className="w-full border rounded px-3 py-2 h-28"
      />
      <input
        placeholder="Tags (comma-separated: ai, productivity, design)"
        value={form.tags}
        onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
        className="w-full border rounded px-3 py-2"
      />
      <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded font-medium">
        Submit listing (free)
      </button>
    </form>
  );
}
```

### Step 2: Review Queue API + Slug Generation

```typescript
// app/api/listings/submit/route.ts — Save listing to review queue

import { prisma } from '@/lib/prisma';
import slugify from 'slugify';

export async function POST(req: Request) {
  const body = await req.json();

  // Generate unique slug
  let slug = slugify(body.name, { lower: true, strict: true });
  const existing = await prisma.listing.findUnique({ where: { slug } });
  if (existing) slug = `${slug}-${Date.now()}`;

  await prisma.listing.create({
    data: {
      name: body.name,
      slug,
      description: body.description,
      website: body.website,
      category: body.category,
      tags: body.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      location: body.location || null,
      email: body.email,
      status: 'pending',  // Goes to review queue
    },
  });

  // Notify admin
  await fetch(`${process.env.SLACK_WEBHOOK_URL}`, {
    method: 'POST',
    body: JSON.stringify({ text: `New listing submitted: ${body.name} (${body.website})` }),
  });

  return Response.json({ ok: true });
}

// app/api/admin/listings/[id]/approve/route.ts — Admin: approve listing
export async function POST(req: Request, { params }: { params: { id: string } }) {
  // In production: add admin auth here
  await prisma.listing.update({
    where: { id: params.id },
    data: { status: 'approved' },
  });
  return Response.json({ ok: true });
}
```

### Step 3: Search and Filter

```tsx
// app/page.tsx — Directory homepage with search and filters

import { prisma } from '@/lib/prisma';

interface SearchParams {
  q?: string;
  category?: string;
  location?: string;
}

export default async function DirectoryPage({ searchParams }: { searchParams: SearchParams }) {
  const listings = await prisma.listing.findMany({
    where: {
      status: 'approved',
      ...(searchParams.q && {
        OR: [
          { name: { contains: searchParams.q, mode: 'insensitive' } },
          { description: { contains: searchParams.q, mode: 'insensitive' } },
          { tags: { has: searchParams.q.toLowerCase() } },
        ],
      }),
      ...(searchParams.category && { category: searchParams.category }),
      ...(searchParams.location && { location: { contains: searchParams.location, mode: 'insensitive' } }),
    },
    orderBy: [
      { featured: 'desc' },  // Featured first
      { createdAt: 'desc' },
    ],
  });

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">The best tools for indie hackers</h1>
      <form className="flex gap-3 mb-8">
        <input name="q" placeholder="Search..." defaultValue={searchParams.q}
          className="flex-1 border rounded px-3 py-2" />
        <select name="category" defaultValue={searchParams.category}
          className="border rounded px-3 py-2">
          <option value="">All categories</option>
          <option value="tool">Tools</option>
          <option value="agency">Agencies</option>
          <option value="product">Products</option>
        </select>
        <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded">Search</button>
      </form>

      <div className="grid gap-4">
        {listings.map(listing => (
          <a key={listing.id} href={`/${listing.slug}`}
            className={`border rounded-lg p-4 flex gap-4 hover:shadow-md transition ${listing.featured ? 'border-yellow-400 bg-yellow-50' : ''}`}>
            {listing.featured && (
              <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded font-bold self-start">
                ⭐ Featured
              </span>
            )}
            <div>
              <h2 className="font-semibold text-lg">{listing.name}</h2>
              <p className="text-gray-600 text-sm">{listing.description}</p>
              <div className="flex gap-2 mt-2">
                {listing.tags.slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs bg-gray-100 px-2 py-0.5 rounded">{tag}</span>
                ))}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
```

### Step 4: Featured Listings with Stripe

```typescript
// app/api/listings/[id]/feature/route.ts — Create Stripe checkout for featured spot

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const listing = await prisma.listing.findUnique({ where: { id: params.id } });
  if (!listing || listing.status !== 'approved') {
    return Response.json({ error: 'Listing not found or not approved' }, { status: 404 });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Featured Listing — 30 days',
          description: `"${listing.name}" featured at the top of the directory`,
        },
        unit_amount: 9900,  // $99.00
      },
      quantity: 1,
    }],
    metadata: { listingId: listing.id },
    success_url: `${process.env.NEXT_PUBLIC_URL}/${listing.slug}?featured=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/${listing.slug}`,
  });

  return Response.json({ checkoutUrl: session.url });
}

// app/api/webhooks/stripe/route.ts (addition)
// Handle checkout.session.completed → mark listing as featured
async function handleFeaturedPayment(session: Stripe.Checkout.Session) {
  const listingId = session.metadata?.listingId;
  if (!listingId) return;

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      featured: true,
      featuredAt: new Date(),
      featuredEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}
```

### Step 5: SEO — Dynamic Meta, JSON-LD, Sitemap

```typescript
// app/[slug]/page.tsx — Listing detail page with full SEO

import { prisma } from '@/lib/prisma';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const listing = await prisma.listing.findUnique({ where: { slug: params.slug } });
  if (!listing) return {};

  return {
    title: `${listing.name} — IndieDirectory`,
    description: listing.description,
    openGraph: {
      title: listing.name,
      description: listing.description,
      url: `https://yoursite.com/${listing.slug}`,
      images: listing.logo ? [{ url: listing.logo }] : [],
    },
  };
}

export default async function ListingPage({ params }: { params: { slug: string } }) {
  const listing = await prisma.listing.findUnique({
    where: { slug: params.slug, status: 'approved' },
  });
  if (!listing) notFound();

  // Track click
  await prisma.listing.update({
    where: { id: listing.id },
    data: { clicks: { increment: 1 } },
  });

  // JSON-LD structured data for Google
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: listing.name,
    url: listing.website,
    description: listing.description,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-3xl font-bold">{listing.name}</h1>
        <p className="text-gray-600 mt-2">{listing.description}</p>
        <div className="flex gap-2 mt-4">
          {listing.tags.map(tag => (
            <span key={tag} className="bg-gray-100 px-3 py-1 rounded-full text-sm">{tag}</span>
          ))}
        </div>
        <a href={listing.website} target="_blank" rel="noopener noreferrer"
          className="mt-6 inline-block bg-indigo-600 text-white px-6 py-2 rounded font-medium">
          Visit {listing.name} →
        </a>
      </div>
    </>
  );
}

// app/sitemap.ts — Auto-generated sitemap
export default async function sitemap() {
  const listings = await prisma.listing.findMany({
    where: { status: 'approved' },
    select: { slug: true, updatedAt: true },
  });

  return listings.map(l => ({
    url: `https://yoursite.com/${l.slug}`,
    lastModified: l.updatedAt,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));
}
```

## Revenue Model

- Free submission: listed in standard order
- Featured spot: $99/month for top placement with yellow highlight badge
- Sponsored category: $199/month to be the top listing in a category
- Newsletter feature: $49 to be included in the weekly digest email

With 50 featured listings at $99 = $4,950/month. That's a real business from a simple directory.

## Related Skills

- [prisma](../skills/prisma/) — Database schema and full-text search
- [stripe-billing](../skills/stripe-billing/) — One-time featured listing payments
- [nextjs](../skills/nextjs/) — App Router, metadata API, dynamic sitemap
