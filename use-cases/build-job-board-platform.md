---
title: Build a Niche Job Board SaaS
description: "Build a full job board SaaS — post jobs, apply, search, email notifications, and monetize with featured listings via Stripe."
skills:
  - prisma
  - stripe-billing
  - resend
  - nextjs
difficulty: intermediate
time_estimate: "16 hours"
tags: [job-board, saas, nextjs, prisma, stripe, resend, postgresql, search]
---

# Build a Niche Job Board SaaS

## The Problem

You've noticed that generic job boards like LinkedIn and Indeed have too much noise for a specific niche — remote React developers, Rust engineers, or indie hacker jobs. A focused job board with curated listings could attract a loyal audience. You want to build one over a weekend and start charging companies $49 to post featured jobs.

## The Solution

A Next.js App Router job board with Prisma + PostgreSQL for data, Tiptap rich-text editor for job descriptions, Resend for email notifications, and Stripe for monetizing featured listings. Applicants can apply directly through the platform; companies get a simple dashboard to manage their job posts and applications.

## Database Schema

```prisma
// prisma/schema.prisma

model Company {
  id        String   @id @default(cuid())
  name      String
  logo      String?
  website   String?
  email     String   @unique
  jobs      Job[]
  createdAt DateTime @default(now())
}

model Job {
  id           String        @id @default(cuid())
  title        String
  description  String        @db.Text  // Rich text (HTML from Tiptap)
  category     String        // engineering, design, marketing, etc.
  type         String        // full-time, part-time, contract, freelance
  location     String        // "Remote", "New York, NY", etc.
  remote       Boolean       @default(false)
  salaryMin    Int?
  salaryMax    Int?
  featured     Boolean       @default(false)
  published    Boolean       @default(false)
  expiresAt    DateTime?
  company      Company       @relation(fields: [companyId], references: [id])
  companyId    String
  applications Application[]
  createdAt    DateTime      @default(now())

  @@index([category, remote, published])  // Full-text search index
}

model Application {
  id          String   @id @default(cuid())
  name        String
  email       String
  resumeUrl   String?
  coverLetter String?  @db.Text
  status      String   @default("new")  // new, reviewing, shortlisted, rejected
  job         Job      @relation(fields: [jobId], references: [id])
  jobId       String
  createdAt   DateTime @default(now())
}
```

## Step-by-Step Walkthrough

### Step 1: Job Posting with Tiptap Rich Text

```tsx
// app/post-job/page.tsx — Job posting form with Tiptap editor

'use client';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';

export default function PostJobPage() {
  const [formData, setFormData] = useState({
    title: '',
    category: 'engineering',
    type: 'full-time',
    location: '',
    remote: false,
    salaryMin: '',
    salaryMax: '',
  });

  const editor = useEditor({
    extensions: [StarterKit],
    content: '<p>Describe the role, requirements, and benefits...</p>',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        description: editor?.getHTML(),
      }),
    });
    const { jobId, checkoutUrl } = await res.json();
    // Redirect to Stripe if they want to feature the listing
    if (checkoutUrl) window.location.href = checkoutUrl;
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto p-6 space-y-4">
      <input
        placeholder="Job title"
        value={formData.title}
        onChange={e => setFormData(p => ({ ...p, title: e.target.value }))}
        className="w-full border rounded px-3 py-2"
        required
      />
      <select
        value={formData.category}
        onChange={e => setFormData(p => ({ ...p, category: e.target.value }))}
        className="w-full border rounded px-3 py-2"
      >
        <option value="engineering">Engineering</option>
        <option value="design">Design</option>
        <option value="marketing">Marketing</option>
        <option value="product">Product</option>
      </select>
      <div className="grid grid-cols-2 gap-4">
        <input placeholder="Min salary" type="number" value={formData.salaryMin}
          onChange={e => setFormData(p => ({ ...p, salaryMin: e.target.value }))}
          className="border rounded px-3 py-2" />
        <input placeholder="Max salary" type="number" value={formData.salaryMax}
          onChange={e => setFormData(p => ({ ...p, salaryMax: e.target.value }))}
          className="border rounded px-3 py-2" />
      </div>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={formData.remote}
          onChange={e => setFormData(p => ({ ...p, remote: e.target.checked }))} />
        Remote OK
      </label>
      <div className="border rounded p-3 min-h-48">
        <EditorContent editor={editor} />
      </div>
      <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
        Post Job ($0 free / $49 featured)
      </button>
    </form>
  );
}
```

### Step 2: Job Listing API with Stripe Featured Checkout

```typescript
// app/api/jobs/route.ts — Create job + optional Stripe checkout for featured

import { prisma } from '@/lib/prisma';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.json();
  const { featured, companyEmail, companyName, ...jobData } = body;

  // Upsert company
  const company = await prisma.company.upsert({
    where: { email: companyEmail },
    update: {},
    create: { name: companyName, email: companyEmail },
  });

  // Create job as unpublished (publish after payment or immediately if free)
  const job = await prisma.job.create({
    data: {
      ...jobData,
      published: !featured,  // Free jobs publish immediately
      featured: false,        // Set to true after Stripe payment
      companyId: company.id,
    },
  });

  if (!featured) {
    // Free listing — notify company
    await sendJobPostedEmail(company.email, job);
    return Response.json({ jobId: job.id });
  }

  // Featured listing — create Stripe checkout
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Featured Job Listing — 30 days',
          description: `"${job.title}" at ${company.name}`,
        },
        unit_amount: 4900,  // $49.00
      },
      quantity: 1,
    }],
    metadata: { jobId: job.id },
    success_url: `${process.env.NEXT_PUBLIC_URL}/jobs/${job.id}?featured=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/post-job`,
  });

  return Response.json({ jobId: job.id, checkoutUrl: session.url });
}
```

### Step 3: Stripe Webhook — Publish Featured Job

```typescript
// app/api/webhooks/stripe/route.ts — Publish job after payment

import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  const event = stripe.webhooks.constructEvent(
    body, sig, process.env.STRIPE_WEBHOOK_SECRET!
  );

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const jobId = session.metadata?.jobId;

    if (jobId) {
      const job = await prisma.job.update({
        where: { id: jobId },
        data: {
          featured: true,
          published: true,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        },
        include: { company: true },
      });

      await sendJobPostedEmail(job.company.email, job);
    }
  }

  return Response.json({ received: true });
}
```

### Step 4: Full-Text Search with PostgreSQL

```typescript
// app/api/jobs/search/route.ts — Full-text search via PostgreSQL

import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const category = searchParams.get('category');
  const remote = searchParams.get('remote') === 'true';

  // PostgreSQL full-text search using raw query for performance
  const jobs = await prisma.$queryRaw`
    SELECT j.*, c.name as company_name, c.logo as company_logo
    FROM "Job" j
    JOIN "Company" c ON j."companyId" = c.id
    WHERE j.published = true
      AND j."expiresAt" > NOW()
      ${q ? Prisma.sql`AND to_tsvector('english', j.title || ' ' || j.description) @@ plainto_tsquery('english', ${q})` : Prisma.empty}
      ${category ? Prisma.sql`AND j.category = ${category}` : Prisma.empty}
      ${remote ? Prisma.sql`AND j.remote = true` : Prisma.empty}
    ORDER BY j.featured DESC, j."createdAt" DESC
    LIMIT 50
  `;

  return Response.json({ jobs });
}
```

### Step 5: Application Flow with Email Notifications

```typescript
// app/api/jobs/[id]/apply/route.ts — Accept application and notify company

import { prisma } from '@/lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const body = await req.json();
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: { company: true },
  });

  if (!job) return Response.json({ error: 'Job not found' }, { status: 404 });

  const application = await prisma.application.create({
    data: {
      name: body.name,
      email: body.email,
      resumeUrl: body.resumeUrl,
      coverLetter: body.coverLetter,
      jobId: job.id,
    },
  });

  // Notify applicant
  await resend.emails.send({
    from: 'jobs@yourdomain.com',
    to: body.email,
    subject: `Application received: ${job.title} at ${job.company.name}`,
    html: `<p>Hi ${body.name},</p>
           <p>We received your application for <strong>${job.title}</strong>. Good luck!</p>`,
  });

  // Notify company
  await resend.emails.send({
    from: 'jobs@yourdomain.com',
    to: job.company.email,
    subject: `New application for ${job.title}`,
    html: `<p>New application from <strong>${body.name}</strong> (${body.email}).</p>
           <p><a href="${process.env.NEXT_PUBLIC_URL}/dashboard/jobs/${job.id}/applications">View application</a></p>`,
  });

  return Response.json({ applicationId: application.id });
}
```

### Step 6: Applicant Tracking Dashboard

```tsx
// app/dashboard/jobs/[id]/applications/page.tsx — ATS for companies

import { prisma } from '@/lib/prisma';

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800',
  reviewing: 'bg-yellow-100 text-yellow-800',
  shortlisted: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
};

export default async function ApplicationsPage({ params }: { params: { id: string } }) {
  const job = await prisma.job.findUnique({
    where: { id: params.id },
    include: { applications: { orderBy: { createdAt: 'desc' } } },
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Applications for {job?.title}</h1>
      <div className="space-y-3">
        {job?.applications.map(app => (
          <div key={app.id} className="border rounded p-4 flex items-center justify-between">
            <div>
              <p className="font-medium">{app.name}</p>
              <p className="text-sm text-gray-500">{app.email}</p>
            </div>
            <select
              defaultValue={app.status}
              onChange={async (e) => {
                await fetch(`/api/applications/${app.id}/status`, {
                  method: 'PATCH',
                  body: JSON.stringify({ status: e.target.value }),
                });
              }}
              className={`text-sm px-2 py-1 rounded ${STATUS_COLORS[app.status]}`}
            >
              <option value="new">New</option>
              <option value="reviewing">Reviewing</option>
              <option value="shortlisted">Shortlisted</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Launch Strategy

Start with a niche: "Remote React Jobs", "Rust Engineer Jobs", "Indie Hacker Jobs". Post manually curated free listings for the first 30 jobs to show value. Then charge $49 for featured spots — companies get top placement for 30 days. Promote on relevant communities (Reddit, Slack groups, newsletters). Once you have 500 monthly visitors, companies will pay.

## Related Skills

- [prisma](../skills/prisma/) — Database schema, migrations, query optimization
- [stripe-billing](../skills/stripe-billing/) — One-time payments and checkout sessions
- [resend](../skills/resend/) — Transactional emails for applications and notifications
