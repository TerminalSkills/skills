---
title: "Build an Instant SaaS Demo Environment"
description: "Build one-click demo environments for prospects — isolated tenant with seed data in under 5 seconds, guided tour, engagement tracking, and upgrade CTA on expiry."
skills: [prisma, nextjs]
difficulty: advanced
time_estimate: "6 hours"
tags: [demo, saas, multi-tenant, prisma, nextjs, sales, onboarding, guided-tour]
---

# Build an Instant SaaS Demo Environment

## The Problem

Your sales engineer spends 2 hours setting up a custom demo for every prospect. Half of them don't show up. The other half want to "try it themselves" after the call, but you don't have a self-serve option — so they bounce.

**Goal:** One-click demo provisioning. Prospect gets an isolated environment with realistic seed data in <5 seconds, a guided tour, and you see exactly which features they explored.

---

## Who This Is For

**SaaS sales engineer** replacing manual demo setup. You want to send a prospect a link that spins up a full demo in their browser, tracks engagement, and converts them to a signup when the demo expires.

---

## Step 1: Prisma Schema

```prisma
// prisma/schema.prisma
model DemoSession {
  id           String    @id @default(cuid())
  token        String    @unique @default(cuid())  // URL token
  prospectEmail String?
  prospectName  String?
  company       String?

  // Tenant isolation
  tenantId     String    @unique  // one tenant per demo

  status       String    @default("active")  // active | expired | converted
  expiresAt    DateTime
  convertedAt  DateTime?
  createdAt    DateTime  @default(now())

  tenant  DemoTenant @relation(fields: [tenantId], references: [id])
  events  DemoEvent[]
}

model DemoTenant {
  id        String   @id @default(cuid())
  name      String   @default("Demo Company")
  createdAt DateTime @default(now())

  session DemoSession?
  // All demo data is scoped to this tenant
  users   DemoUser[]
  projects DemoProject[]
}

model DemoUser {
  id       String @id @default(cuid())
  tenantId String
  name     String
  email    String
  role     String
  avatar   String?

  tenant DemoTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model DemoProject {
  id          String @id @default(cuid())
  tenantId    String
  name        String
  status      String
  description String?
  createdAt   DateTime @default(now())

  tenant DemoTenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
}

model DemoEvent {
  id          String   @id @default(cuid())
  sessionId   String
  event       String   // "feature.viewed", "project.opened", "invite.clicked"
  feature     String?
  metadata    String?  @db.Text  // JSON
  createdAt   DateTime @default(now())

  session DemoSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
}
```

---

## Step 2: Demo Provisioning API

```typescript
// app/api/demo/create/route.ts
import { prisma } from "@/lib/prisma";
import { seedDemoTenant } from "@/lib/demo/seeder";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { email, name, company } = body;

  // Create isolated tenant + demo session in a transaction
  const session = await prisma.$transaction(async (tx) => {
    const tenant = await tx.demoTenant.create({
      data: { name: company ? `${company} Demo` : "Your Company Demo" },
    });

    const demoSession = await tx.demoSession.create({
      data: {
        tenantId: tenant.id,
        prospectEmail: email,
        prospectName: name,
        company,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      },
    });

    return demoSession;
  });

  // Seed realistic demo data (outside transaction for performance)
  await seedDemoTenant(session.tenantId);

  return Response.json({
    url: `${process.env.APP_URL}/demo/${session.token}`,
    expiresAt: session.expiresAt,
  });
}
```

---

## Step 3: Demo Seeder — Realistic Data in <5s

```typescript
// lib/demo/seeder.ts
import { prisma } from "../prisma";

const SEED_USERS = [
  { name: "Alice Johnson", email: "alice@demo.example", role: "admin", avatar: "https://i.pravatar.cc/150?u=alice" },
  { name: "Bob Chen", email: "bob@demo.example", role: "member", avatar: "https://i.pravatar.cc/150?u=bob" },
  { name: "Carol White", email: "carol@demo.example", role: "viewer", avatar: "https://i.pravatar.cc/150?u=carol" },
];

const SEED_PROJECTS = [
  { name: "Q1 Marketing Campaign", status: "active", description: "Driving awareness for the spring launch" },
  { name: "Product Redesign", status: "completed", description: "UX overhaul shipped in Feb" },
  { name: "Customer Onboarding Flow", status: "active", description: "Reduce time-to-value from 7 days to 2" },
  { name: "API Integration", status: "planning", description: "Connect with Salesforce and HubSpot" },
  { name: "Analytics Dashboard", status: "active", description: "Real-time metrics for the exec team" },
];

export async function seedDemoTenant(tenantId: string): Promise<void> {
  // Use createMany for speed — bulk insert, not N queries
  await Promise.all([
    prisma.demoUser.createMany({
      data: SEED_USERS.map((u) => ({ ...u, tenantId })),
    }),
    prisma.demoProject.createMany({
      data: SEED_PROJECTS.map((p) => ({
        ...p,
        tenantId,
        createdAt: randomPastDate(30), // randomize dates for realism
      })),
    }),
  ]);
}

function randomPastDate(maxDaysAgo: number): Date {
  const daysAgo = Math.floor(Math.random() * maxDaysAgo);
  return new Date(Date.now() - daysAgo * 86400000);
}
```

---

## Step 4: Demo Session Middleware

```typescript
// middleware.ts — inject demo context
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const demoToken = request.cookies.get("demo_token")?.value;
  const pathToken = request.nextUrl.pathname.match(/^\/demo\/([^/]+)/)?.[1];

  const token = pathToken ?? demoToken;

  if (token) {
    // Let the layout resolve the tenant from the token
    const response = NextResponse.next();
    response.headers.set("x-demo-token", token);

    // Set cookie so subsequent navigations stay in demo context
    if (pathToken && !demoToken) {
      response.cookies.set("demo_token", pathToken, {
        httpOnly: true,
        maxAge: 24 * 3600,
        sameSite: "lax",
      });
    }

    return response;
  }

  return NextResponse.next();
}
```

---

## Step 5: Engagement Tracking

```typescript
// lib/demo/track.ts
"use server";

import { prisma } from "../prisma";
import { cookies, headers } from "next/headers";

export async function trackDemoEvent(
  event: string,
  feature?: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  const token = cookies().get("demo_token")?.value;
  if (!token) return;

  const session = await prisma.demoSession.findUnique({
    where: { token },
    select: { id: true, status: true, expiresAt: true },
  });

  if (!session || session.status !== "active") return;
  if (session.expiresAt < new Date()) {
    // Mark expired
    await prisma.demoSession.update({ where: { token }, data: { status: "expired" } });
    return;
  }

  await prisma.demoEvent.create({
    data: {
      sessionId: session.id,
      event,
      feature,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });
}
```

Client-side tracking hook:

```typescript
// hooks/use-demo-tracking.ts
"use client";

export function useDemoTracking() {
  const track = async (event: string, feature?: string) => {
    await fetch("/api/demo/track", {
      method: "POST",
      body: JSON.stringify({ event, feature }),
    });
  };

  return { track };
}
```

---

## Step 6: Guided Tour Overlay

```tsx
// components/demo/guided-tour.tsx
"use client";

import { useState } from "react";

type TourStep = {
  target: string;  // CSS selector
  title: string;
  description: string;
  feature: string;
};

const TOUR_STEPS: TourStep[] = [
  {
    target: "#project-list",
    title: "Your Projects",
    description: "All your team's projects in one place. Click any to dive in.",
    feature: "project_list",
  },
  {
    target: "#invite-button",
    title: "Invite Your Team",
    description: "Add teammates with role-based access. Admins, members, viewers.",
    feature: "team_invite",
  },
  {
    target: "#analytics-nav",
    title: "Real-Time Analytics",
    description: "See exactly where time is spent across all your projects.",
    feature: "analytics",
  },
];

export function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const { track } = useDemoTracking();

  const current = TOUR_STEPS[step];

  async function advance() {
    await track("tour.step_viewed", current.feature);

    if (step < TOUR_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      await track("tour.completed");
      onComplete();
    }
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Backdrop with cutout for highlighted element */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Tooltip */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto
                      bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold">{current.title}</h3>
          <span className="text-xs text-gray-400">{step + 1}/{TOUR_STEPS.length}</span>
        </div>
        <p className="text-sm text-gray-600 mb-4">{current.description}</p>
        <button onClick={advance} className="btn-primary w-full">
          {step < TOUR_STEPS.length - 1 ? "Next →" : "Start exploring"}
        </button>
      </div>
    </div>
  );
}
```

---

## Step 7: Expiry + Convert CTA

```tsx
// components/demo/demo-banner.tsx
"use client";

import { useEffect, useState } from "react";

export function DemoBanner({ expiresAt }: { expiresAt: Date }) {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = expiresAt.getTime() - Date.now();
      if (remaining <= 0) {
        setExpired(true);
        clearInterval(interval);
        return;
      }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      setTimeLeft(`${h}h ${m}m`);
    }, 60000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  if (expired) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center">
        <div className="bg-white rounded-2xl p-8 max-w-md text-center space-y-4">
          <h2 className="text-2xl font-bold">Your demo has expired</h2>
          <p className="text-gray-600">
            Ready to get started for real? Sign up in 60 seconds.
          </p>
          <a href="/signup?from=demo" className="btn-primary block">
            Start free trial →
          </a>
          <p className="text-xs text-gray-400">No credit card required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-indigo-600 text-white text-center py-2 text-sm">
      🎭 Demo mode · Expires in {timeLeft} ·{" "}
      <a href="/signup?from=demo" className="underline font-medium">
        Create your real account →
      </a>
    </div>
  );
}
```

---

## Step 8: Cleanup Expired Demos

```typescript
// Cron job — run daily
export async function cleanupExpiredDemos(): Promise<void> {
  const expired = await prisma.demoSession.findMany({
    where: {
      status: "active",
      expiresAt: { lt: new Date() },
    },
    select: { id: true, tenantId: true },
  });

  for (const session of expired) {
    await prisma.$transaction([
      prisma.demoEvent.deleteMany({ where: { sessionId: session.id } }),
      prisma.demoProject.deleteMany({ where: { tenantId: session.tenantId } }),
      prisma.demoUser.deleteMany({ where: { tenantId: session.tenantId } }),
      prisma.demoTenant.delete({ where: { id: session.tenantId } }),
      prisma.demoSession.update({
        where: { id: session.id },
        data: { status: "expired" },
      }),
    ]);
  }

  console.log(`Cleaned up ${expired.length} expired demo environments`);
}
```

---

## Result

- ✅ Demo provisioned in <5 seconds via bulk seed inserts
- ✅ Fully isolated tenant — no cross-demo data leakage
- ✅ 24-hour auto-expiry with cleanup cron
- ✅ Guided tour highlights key features
- ✅ Every feature interaction tracked as a named event
- ✅ Expiry screen with upgrade CTA to convert prospects

**Payoff:** Prospects explore your product on their own time, you see which features they engaged with before the sales call, and your close rate improves because demos actually happen.
