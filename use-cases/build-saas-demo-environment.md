---
title: "Build an Instant SaaS Demo Environment"
description: "Give prospects a one-click demo pre-loaded with sample data — isolated tenant, guided tour, engagement tracking, and an upgrade CTA when the 24h trial expires."
skills: [prisma, nextjs]
difficulty: intermediate
time_estimate: "10 hours"
tags: [saas, demo, sales, onboarding, prisma, nextjs, multi-tenant, conversion]
---

# Build an Instant SaaS Demo Environment

## The Problem

Every enterprise demo requires a sales engineer to manually prep an environment, load data, and walk the prospect through it. It takes 2 hours of prep per call and doesn't scale. Prospects who find you via SEO bounce because they can't try the product instantly.

## What You'll Build

- **One-click demo provisioning**: isolated tenant + seed data in < 5 seconds
- **Time-limited access**: auto-expires after 24 hours with cleanup job
- **Guided tour**: tooltip overlay highlighting key features
- **Engagement tracking**: which features did the prospect actually use?
- **Convert flow**: upgrade CTA when demo expires, with lead capture

## Persona

**Tom, Sales Engineer** — manually demos to 8 prospects/week. Wants to send a link instead of scheduling a call for initial qualification. Target: 40% of demos self-serve, he only joins when they're warm.

---

## Architecture

```
Landing page → "Try Demo" button
        │
        ▼
POST /api/demos (provision)
  ├── Create tenant in DB (Prisma)
  ├── Run seed data job
  ├── Generate signed demo token (JWT, 24h TTL)
  └── Return demo URL

Demo app at /demo/[token]
  ├── Middleware: verify token, set tenant context
  ├── All queries scoped to demo tenant
  ├── Tour overlay (feature hotspots)
  └── Engagement events logged to DB

Cleanup cron (every hour)
  └── Delete expired tenants + data
```

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Tenant {
  id          String    @id @default(cuid())
  type        String    // "demo" | "paid"
  email       String?
  company     String?
  expiresAt   DateTime?
  createdAt   DateTime  @default(now())
  users       User[]
  events      DemoEvent[]
}

model User {
  id       String @id @default(cuid())
  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  email    String
  name     String
  role     String
}

model DemoEvent {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  feature    String   // e.g. "viewed_reports", "clicked_export"
  metadata   Json?
  createdAt  DateTime @default(now())
}
```

---

## Step 2: Demo Provisioning API

```typescript
// app/api/demos/route.ts
import { prisma } from "@/lib/prisma";
import { seedDemoTenant } from "@/lib/seed";
import { signDemoToken } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { email, company } = await req.json();

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

  // Create isolated tenant
  const tenant = await prisma.tenant.create({
    data: { type: "demo", email, company, expiresAt },
  });

  // Seed realistic sample data (< 3s target)
  await seedDemoTenant(tenant.id);

  // Issue signed JWT with tenant + expiry
  const token = signDemoToken({ tenantId: tenant.id, expiresAt });

  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_URL}/demo/${token}`,
    expiresAt,
  });
}
```

---

## Step 3: Seed Data Generator

```typescript
// lib/seed.ts
import { prisma } from "./prisma";
import { faker } from "@faker-js/faker";

export async function seedDemoTenant(tenantId: string) {
  // Create team members
  await prisma.user.createMany({
    data: Array.from({ length: 8 }, () => ({
      tenantId,
      email: faker.internet.email(),
      name: faker.person.fullName(),
      role: faker.helpers.arrayElement(["admin", "member", "viewer"]),
    })),
  });

  // Create sample projects, tasks, etc. — customize for your domain
  // Keep it realistic: 30-50 items feels "real", 5 feels empty
  // Use faker.seed(tenantId.hashCode()) for reproducible data
}
```

---

## Step 4: Demo Middleware + Tenant Context

```typescript
// middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { verifyDemoToken } from "@/lib/auth";

export function middleware(req: NextRequest) {
  const token = req.nextUrl.pathname.split("/demo/")[1];
  if (!token) return NextResponse.next();

  try {
    const { tenantId, expiresAt } = verifyDemoToken(token);

    if (new Date(expiresAt) < new Date()) {
      return NextResponse.redirect(new URL("/demo-expired", req.url));
    }

    const res = NextResponse.next();
    res.cookies.set("demo_tenant_id", tenantId, {
      httpOnly: true,
      maxAge: 86400,
      path: "/",
    });
    return res;
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }
}

export const config = { matcher: ["/demo/:path*", "/app/:path*"] };
```

---

## Step 5: Guided Tour Component

```typescript
// components/DemoTour.tsx
"use client";
import { useState, useEffect } from "react";

const TOUR_STEPS = [
  { target: "#dashboard-chart", title: "Real-time Overview", body: "See all your KPIs at a glance." },
  { target: "#reports-btn", title: "One-click Reports", body: "Export to PDF or share a live link." },
  { target: "#team-panel", title: "Team Collaboration", body: "Assign tasks, leave comments, track progress." },
];

export function DemoTour() {
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || step >= TOUR_STEPS.length) return null;

  const current = TOUR_STEPS[step];

  return (
    <div className="tour-tooltip" data-target={current.target}>
      <p className="tour-step">{step + 1} / {TOUR_STEPS.length}</p>
      <h4>{current.title}</h4>
      <p>{current.body}</p>
      <div className="tour-actions">
        <button onClick={() => setDismissed(true)}>Skip tour</button>
        <button onClick={() => setStep(s => s + 1)}>
          {step < TOUR_STEPS.length - 1 ? "Next →" : "Done ✓"}
        </button>
      </div>
    </div>
  );
}
```

---

## Step 6: Engagement Tracking

```typescript
// lib/track.ts
export async function trackFeature(feature: string, metadata?: object) {
  await fetch("/api/demo/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feature, metadata }),
  });
}

// Usage anywhere in the demo app:
// trackFeature("viewed_reports", { reportType: "monthly" });
// trackFeature("clicked_export");
// trackFeature("opened_settings");
```

```typescript
// app/api/demo/track/route.ts
export async function POST(req: NextRequest) {
  const tenantId = req.cookies.get("demo_tenant_id")?.value;
  if (!tenantId) return NextResponse.json({ ok: false });

  const { feature, metadata } = await req.json();
  await prisma.demoEvent.create({ data: { tenantId, feature, metadata } });

  return NextResponse.json({ ok: true });
}
```

---

## Step 7: Expired Demo + Upgrade CTA

```typescript
// app/demo-expired/page.tsx
export default function DemoExpiredPage() {
  return (
    <div className="expired-page">
      <h1>Your demo has expired 🎉</h1>
      <p>You explored the product. Ready to get started for real?</p>
      <a href="/signup?utm_source=demo_expired" className="cta-button">
        Start free trial →
      </a>
      <p className="subtext">or <a href="/sales">talk to us first</a></p>
    </div>
  );
}
```

---

## What's Next

- Send a follow-up email 1h before expiry with engagement summary
- Score leads by features used (viewed pricing + export = hot lead)
- Notify sales team via Slack when a high-engagement demo starts
- A/B test seed data themes (e-commerce vs SaaS vs agency)
