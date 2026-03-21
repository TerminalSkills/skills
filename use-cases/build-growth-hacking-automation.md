---
title: "Build a Growth Hacking Automation Toolkit"
description: "Build viral loops, programmatic SEO, referral engines, and social proof widgets to grow a B2C SaaS without a marketing team."
skills: [anthropic-sdk, prisma, resend]
difficulty: advanced
time_estimate: "12 hours"
tags: [growth, seo, referrals, viral, saas, marketing-automation]
---

# Build a Growth Hacking Automation Toolkit

**Persona:** You're the solo growth engineer at a B2C SaaS. No marketing budget. You need to build distribution machinery — SEO at scale, viral loops, referrals, and social proof — all automated.

## What You'll Build

- **Programmatic SEO**: Generate 10k+ landing pages from structured data
- **Viral share mechanics**: Per-user OG images, share tracking
- **Social proof widgets**: Live visitor count, recent signup ticker
- **A/B testing engine**: Automatic landing page variant selection
- **Referral reward engine**: Double-sided incentive system

---

## 1. Programmatic SEO at Scale

Generate unique, SEO-optimized pages from a data source (e.g., city × use-case matrix).

```typescript
// scripts/generate-seo-pages.ts
import { prisma } from "@/lib/prisma";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";

const client = new Anthropic();

async function generatePage(city: string, useCase: string) {
  const message = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: `Write a 300-word SEO landing page for "${useCase} in ${city}". 
      Include: H1 title, 3 benefit bullets, CTA. JSON output: {title, body, metaDescription}`
    }]
  });

  const content = JSON.parse(message.content[0].text);
  
  await prisma.seoPage.create({
    data: { city, useCase, slug: `${useCase}-${city}`.toLowerCase().replace(/ /g, "-"), ...content }
  });
}

// Generate pages for top 1000 cities × 10 use cases = 10k pages
const cities = await prisma.city.findMany({ take: 1000 });
const useCases = ["invoicing", "time-tracking", "project-management", /* ... */];

for (const city of cities) {
  for (const useCase of useCases) {
    await generatePage(city.name, useCase);
    await new Promise(r => setTimeout(r, 200)); // rate limit
  }
}
```

```prisma
model SeoPage {
  id              String   @id @default(cuid())
  city            String
  useCase         String
  slug            String   @unique
  title           String
  body            String   @db.Text
  metaDescription String
  views           Int      @default(0)
  createdAt       DateTime @default(now())
}
```

---

## 2. Viral Share Mechanics

Generate per-user OG images for share cards with live share counts.

```typescript
// app/api/og/[userId]/route.tsx
import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { userId: string } }) {
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  
  // Increment share count
  await prisma.shareEvent.create({ data: { userId: params.userId, source: "og-card" } });

  return new ImageResponse(
    <div style={{ display: "flex", background: "#0f172a", width: "1200px", height: "630px", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "white", fontSize: 60, fontWeight: "bold" }}>
        {user?.name} saved 10 hours this week with YourSaaS
      </div>
    </div>
  );
}
```

---

## 3. Social Proof Widget

Real-time visitor count and recent signup ticker using SSE.

```typescript
// app/api/social-proof/route.ts
import { prisma } from "@/lib/prisma";

export async function GET() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        const [visitors, recentSignups] = await Promise.all([
          prisma.session.count({ where: { lastSeen: { gte: new Date(Date.now() - 300_000) } } }),
          prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 3, select: { name: true, createdAt: true } })
        ]);
        
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ visitors, recentSignups })}\n\n`));
      };
      
      await send();
      const interval = setInterval(send, 10_000);
      // cleanup on close
    }
  });

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}
```

---

## 4. A/B Testing Engine

Automatically split-test landing page variants and pick winners.

```typescript
// lib/ab-test.ts
import { prisma } from "@/lib/prisma";

export async function getVariant(userId: string, testName: string): Promise<"A" | "B"> {
  const existing = await prisma.abAssignment.findUnique({
    where: { userId_testName: { userId, testName } }
  });
  if (existing) return existing.variant as "A" | "B";
  
  const variant = Math.random() > 0.5 ? "A" : "B";
  await prisma.abAssignment.create({ data: { userId, testName, variant } });
  return variant;
}

export async function trackConversion(userId: string, testName: string) {
  await prisma.abConversion.create({ data: { userId, testName } });
}

// Get winner
export async function getWinner(testName: string) {
  const results = await prisma.$queryRaw`
    SELECT a.variant, 
           COUNT(a.id) as assigned,
           COUNT(c.id) as converted,
           COUNT(c.id)::float / COUNT(a.id) as rate
    FROM "AbAssignment" a
    LEFT JOIN "AbConversion" c ON c."userId" = a."userId" AND c."testName" = a."testName"
    WHERE a."testName" = ${testName}
    GROUP BY a.variant
  `;
  return results;
}
```

---

## 5. Referral Reward Engine

Double-sided referrals: referrer gets $20 credit, new user gets first month free.

```typescript
// lib/referral.ts
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";

export async function createReferralCode(userId: string): Promise<string> {
  const code = `REF-${userId.slice(-8).toUpperCase()}`;
  await prisma.referralCode.upsert({
    where: { userId },
    update: {},
    create: { userId, code, reward: 20_00 } // $20 in cents
  });
  return code;
}

export async function redeemReferral(newUserId: string, code: string) {
  const referral = await prisma.referralCode.findUnique({ where: { code } });
  if (!referral) throw new Error("Invalid referral code");
  
  await prisma.$transaction([
    prisma.referralRedemption.create({ data: { referralCodeId: referral.id, newUserId } }),
    prisma.credit.create({ data: { userId: referral.userId, amount: 20_00, reason: "referral" } }),
    prisma.credit.create({ data: { userId: newUserId, amount: 999, reason: "referral-welcome" } }) // 1 month free
  ]);

  await sendEmail({
    to: referral.userId,
    subject: "You earned a $20 credit!",
    html: `<p>Your friend just signed up using your referral link. $20 has been added to your account.</p>`
  });
}
```

---

## Schema Overview

```prisma
model ReferralCode {
  id          String               @id @default(cuid())
  userId      String               @unique
  code        String               @unique
  reward      Int
  redemptions ReferralRedemption[]
}

model AbAssignment {
  id       String @id @default(cuid())
  userId   String
  testName String
  variant  String
  @@unique([userId, testName])
}

model ShareEvent {
  id        String   @id @default(cuid())
  userId    String
  source    String
  createdAt DateTime @default(now())
}
```

---

## Result

With this toolkit you can:
- Index 10k SEO pages in days, not months
- Turn every user into a distribution channel via personalized share cards
- Prove social traction with live visitor counts even at 50 DAU (fake it till you make it, tastefully)
- Run continuous A/B tests and auto-promote winners
- Grow via word-of-mouth with automated double-sided referrals

All without a marketing team or paid ads budget.
