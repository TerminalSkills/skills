---
title: Ship a Micro-SaaS in a Weekend
description: "Go from idea to paying customers in 48 hours — Next.js, Clerk auth, Stripe billing, a core feature, a landing page, and a Vercel deploy. Real steps, real code."
skills:
  - nextjs
  - stripe-billing
  - clerk
difficulty: intermediate
time_estimate: "8 hours"
tags: [micro-saas, weekend-project, nextjs, clerk, stripe, vercel, mvp, indiehacker]
---

# Ship a Micro-SaaS in a Weekend

## The Problem

You have an idea. You've had it for months. You keep "planning" it. This weekend, you're shipping it — not a polished v2 with every feature, but a working v1 that real people can pay you for. A micro-SaaS: one specific problem, one clear user, one price point.

The example here: **ScreenInvoice** — paste a screenshot of your work (Figma, code, design), and the app generates a professional invoice PDF. Freelancers hate invoicing. This solves it in 10 seconds.

## The Plan

- **Day 1 Morning (4 hours):** Auth + billing scaffold
- **Day 1 Afternoon (4 hours):** Core feature
- **Day 2 Morning (3 hours):** Landing page + polish
- **Day 2 Afternoon (2 hours):** Deploy + announce

## Day 1 Morning: Scaffold in 4 Hours

### Step 1: Create the App (30 min)

```bash
npx create-next-app@latest screeninvoice --typescript --tailwind --app
cd screeninvoice
npm install @clerk/nextjs stripe @stripe/stripe-js
```

Configure environment:
```bash
# .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Step 2: Clerk Auth (45 min)

```tsx
// middleware.ts — Protect /dashboard routes
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: ["/", "/pricing", "/api/webhooks/stripe"],
});

export const config = { matcher: ["/((?!.+\\.[\\w]+$)|(?!_next)).*", "/", "/(api|trpc)(.*)"] };
```

```tsx
// app/layout.tsx — Wrap with ClerkProvider
import { ClerkProvider } from '@clerk/nextjs';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

That's it. Clerk handles signup, login, password reset, Google OAuth — all hosted, no custom UI needed for v1.

### Step 3: Stripe Billing (90 min)

Create one product in Stripe dashboard: **ScreenInvoice Pro**, $12/month.

```typescript
// app/api/billing/checkout/route.ts — Create Stripe checkout session

import { auth } from '@clerk/nextjs';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST() {
  const { userId } = auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    metadata: { userId },
    success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?upgraded=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/pricing`,
    allow_promotion_codes: true,
  });

  return Response.json({ url: session.url });
}
```

```typescript
// app/api/webhooks/stripe/route.ts — Track subscription status

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Simple KV store — use Redis/DB in production
const userSubscriptions = new Map<string, { active: boolean; ends: Date }>();

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    userSubscriptions.set(session.metadata!.userId, {
      active: true,
      ends: new Date(sub.current_period_end * 1000),
    });
  }

  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object as Stripe.Subscription;
    const userId = sub.metadata.userId;
    if (userId) userSubscriptions.set(userId, { active: false, ends: new Date() });
  }

  return Response.json({ received: true });
}

export function isUserPro(userId: string): boolean {
  const sub = userSubscriptions.get(userId);
  return !!sub?.active && sub.ends > new Date();
}
```

## Day 1 Afternoon: Core Feature (4 Hours)

```typescript
// app/api/generate-invoice/route.ts — The actual product

import { auth } from '@clerk/nextjs';
import OpenAI from 'openai';
import { isUserPro } from '../webhooks/stripe/route';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // Free users get 3 invoices/month — pro users get unlimited
  const isPro = isUserPro(userId);
  const usage = await getMonthlyUsage(userId);
  if (!isPro && usage >= 3) {
    return Response.json({ error: 'Free limit reached. Upgrade to Pro.' }, { status: 403 });
  }

  const { imageBase64, clientName, yourName, hourlyRate } = await req.json();

  // GPT-4V: extract work items from screenshot
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: `You are an invoice generator. Extract billable work items from this screenshot.
                 Return JSON: { items: [{ description: string, hours: number }] }
                 Hourly rate: $${hourlyRate}/hr`,
        },
        { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
      ],
    }],
    response_format: { type: 'json_object' },
  });

  const { items } = JSON.parse(completion.choices[0].message.content!);
  const total = items.reduce((sum: number, item: any) => sum + item.hours * hourlyRate, 0);

  // Generate PDF (using @react-pdf/renderer or puppeteer)
  const pdfBuffer = await generateInvoicePDF({
    items,
    total,
    clientName,
    yourName,
    invoiceNumber: `INV-${Date.now()}`,
    date: new Date().toLocaleDateString(),
  });

  await incrementUsage(userId);

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${Date.now()}.pdf"`,
    },
  });
}
```

```tsx
// app/dashboard/page.tsx — The main UI

'use client';
import { useState, useRef } from 'react';

export default function Dashboard() {
  const [uploading, setUploading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleGenerate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    const formData = new FormData(e.currentTarget);
    const file = formData.get('screenshot') as File;
    const base64 = await fileToBase64(file);

    const res = await fetch('/api/generate-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        clientName: formData.get('clientName'),
        yourName: formData.get('yourName'),
        hourlyRate: Number(formData.get('hourlyRate')),
      }),
    });

    if (res.status === 403) {
      alert('Free limit reached! Upgrade to Pro for unlimited invoices.');
      setUploading(false);
      return;
    }

    const blob = await res.blob();
    setPdfUrl(URL.createObjectURL(blob));
    setUploading(false);
  }

  return (
    <div className="max-w-lg mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Generate Invoice from Screenshot</h1>
      <form onSubmit={handleGenerate} className="space-y-4">
        <input ref={fileRef} name="screenshot" type="file" accept="image/*" required
          className="w-full border rounded px-3 py-2" />
        <input name="clientName" placeholder="Client name" required
          className="w-full border rounded px-3 py-2" />
        <input name="yourName" placeholder="Your name / company" required
          className="w-full border rounded px-3 py-2" />
        <input name="hourlyRate" placeholder="Hourly rate ($)" type="number" required
          className="w-full border rounded px-3 py-2" />
        <button type="submit" disabled={uploading}
          className="w-full bg-blue-600 text-white py-3 rounded font-medium disabled:opacity-50">
          {uploading ? 'Generating...' : '✨ Generate Invoice'}
        </button>
      </form>
      {pdfUrl && (
        <a href={pdfUrl} download="invoice.pdf"
          className="mt-4 block text-center text-blue-600 underline">
          Download Invoice PDF
        </a>
      )}
    </div>
  );
}
```

## Day 2: Landing Page + Launch

### Step 4: Minimal Landing Page (3 hours)

```tsx
// app/page.tsx — Landing page with pricing table

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      {/* Hero */}
      <section className="text-center py-24 px-4">
        <h1 className="text-5xl font-black">Turn screenshots into invoices<br />in 10 seconds.</h1>
        <p className="text-xl text-gray-500 mt-4 max-w-lg mx-auto">
          Paste a screenshot of your work. ScreenInvoice generates a professional PDF invoice instantly. No more manual entry.
        </p>
        <a href="/sign-up" className="mt-8 inline-block bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-bold">
          Try free — 3 invoices/month
        </a>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 bg-gray-50">
        <h2 className="text-3xl font-bold text-center mb-12">Simple pricing</h2>
        <div className="flex gap-6 justify-center flex-wrap">
          <div className="bg-white border rounded-2xl p-8 w-72">
            <h3 className="text-xl font-bold">Free</h3>
            <p className="text-4xl font-black mt-2">$0</p>
            <ul className="mt-4 space-y-2 text-gray-600">
              <li>✅ 3 invoices/month</li>
              <li>✅ PDF download</li>
              <li>❌ Unlimited invoices</li>
            </ul>
            <a href="/sign-up" className="mt-6 block text-center border rounded-xl py-2 font-medium">Get started</a>
          </div>
          <div className="bg-blue-600 text-white rounded-2xl p-8 w-72">
            <h3 className="text-xl font-bold">Pro</h3>
            <p className="text-4xl font-black mt-2">$12<span className="text-lg font-normal">/mo</span></p>
            <ul className="mt-4 space-y-2">
              <li>✅ Unlimited invoices</li>
              <li>✅ PDF download</li>
              <li>✅ Custom branding</li>
            </ul>
            <a href="/sign-up" className="mt-6 block text-center bg-white text-blue-600 rounded-xl py-2 font-bold">Start free trial</a>
          </div>
        </div>
      </section>
    </main>
  );
}
```

### Step 5: Deploy to Vercel + Announce

```bash
# Deploy
npx vercel --prod

# Set env vars
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_SECRET_KEY production
vercel env add STRIPE_SECRET_KEY production
vercel env add OPENAI_API_KEY production
```

**Announce where:**
- Twitter/X: "Built ScreenInvoice in 48h — paste a screenshot, get a PDF invoice in 10 seconds. Free to try: [link]"
- Product Hunt: Submit Sunday evening (peaks on weekday mornings)
- Hacker News: "Show HN: I built a micro-SaaS in a weekend"
- Reddit: r/freelance, r/webdev, r/indiehackers
- IndieHackers: Post your launch story with the timeline

## What to Do After First $1 MRR

1. Talk to every paying user — what do they wish the app did?
2. Add the top-requested feature
3. Write a blog post about building it (great SEO + HN fodder)
4. Watch churn — if >20% cancel in month 1, talk to churned users

## Related Skills

- [nextjs](../skills/nextjs/) — App Router, Server Actions, API routes
- [stripe-billing](../skills/stripe-billing/) — Subscriptions, webhooks, customer portal
- [clerk](../skills/clerk/) — Auth with zero custom UI
