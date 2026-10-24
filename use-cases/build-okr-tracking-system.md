---
title: Build an OKR Tracking System
slug: build-okr-tracking-system
description: Build a company-wide OKR system — objective hierarchy, key result progress tracking, weekly check-in reminders, health dashboard, and end-of-quarter retrospective reports.
skills:
  - prisma
  - resend
category: business
tags:
  - okr
  - goals
  - strategy
  - productivity
  - management
  - reporting
---

# Build an OKR Tracking System

David is the CTO of a 50-person startup. They adopted OKRs six months ago. The process: every quarter, teams set objectives in a shared Notion doc, key results are tracked in a spreadsheet, and progress is presented in an all-hands. By week 4, the spreadsheet is out of date. By week 8, nobody is looking at it. David wants a system that makes OKRs visible, sends weekly nudges, and automatically flags key results that are off track, so OKRs stay alive instead of becoming quarterly theater.
The stack is Next.js (App Router), PostgreSQL through Prisma 7 and Resend; checked against Prisma 7.10, Resend SDK 6.34 and Next.js 16.

## Step 1 — Schema: Company → Team → Individual OKRs

Install `@prisma/client@7`, `@prisma/adapter-pg@7`, `resend` and, as dev dependencies, `prisma@7` (the npm `latest` tag now points at an 8.0 release candidate, so pin the major) and `dotenv`. Prisma 7 changed three things you will trip over if you copy older tutorials: the generator is `prisma-client` with a required `output`, the connection URL no longer lives in `schema.prisma`, and the client needs a driver adapter.

In `prisma.config.ts`, start with `import "dotenv/config"` (Prisma 7 no longer reads `.env` for the CLI by itself), then export `defineConfig({ schema: "prisma/schema.prisma", datasource: { url: env("DATABASE_URL") } })` (both from `prisma/config`).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model User {
  id    String @id @default(cuid())
  name  String
  email String @unique
}

model Cycle {
  id         String      @id @default(cuid())
  name       String      // "Q3 2026"
  startDate  DateTime
  endDate    DateTime
  status     String      @default("ACTIVE") // DRAFT | ACTIVE | COMPLETED
  objectives Objective[]
}

model Objective {
  id         String      @id @default(cuid())
  title      String
  level      String      // COMPANY | TEAM | INDIVIDUAL
  ownerId    String      // accountable user (the team lead for team objectives)
  ownerName  String      // denormalized for display
  cycleId    String
  cycle      Cycle       @relation(fields: [cycleId], references: [id])
  parentId   String?     // links a team objective to a company objective
  parent     Objective?  @relation("alignment", fields: [parentId], references: [id])
  children   Objective[] @relation("alignment")
  keyResults KeyResult[]
  status     Status      @default(ON_TRACK)
}

model KeyResult {
  id           String     @id @default(cuid())
  title        String
  startValue   Float      @default(0)
  targetValue  Float
  currentValue Float      @default(0)
  unit         String     @default("%")
  objectiveId  String
  objective    Objective  @relation(fields: [objectiveId], references: [id])
  updates      KRUpdate[]
  status       Status     @default(ON_TRACK)
}

model KRUpdate {
  id            String    @id @default(cuid())
  keyResultId   String
  keyResult     KeyResult @relation(fields: [keyResultId], references: [id])
  previousValue Float
  newValue      Float
  note          String?
  updatedById   String
  createdAt     DateTime  @default(now())
}

enum Status {
  ON_TRACK
  AT_RISK
  OFF_TRACK
  COMPLETED
  DROPPED // key results only
}
```

```typescript
// src/lib/prisma.ts — Prisma 7 requires a driver adapter.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
```

Run `npx prisma migrate dev --name init`, then `npx prisma generate`: in Prisma 7, `migrate dev` no longer generates the client.

## Step 2 — Key Result Progress and Auto-Status

When a key result is updated, compute its status from expected versus actual progress. Since Next.js 15, `params` in a route handler is a Promise, so it must be awaited.

```typescript
// src/app/api/key-results/[id]/update/route.ts — Update KR value and compute status.
import { prisma } from "@/lib/prisma";
import { currentUserId } from "@/lib/auth"; // your own session helper

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { newValue, note } = await request.json();
  if (!Number.isFinite(newValue)) return Response.json({ error: "newValue must be a number" }, { status: 400 });

  const kr = await prisma.keyResult.findUniqueOrThrow({
    where: { id },
    include: { objective: { include: { cycle: true } } },
  });

  const range = kr.targetValue - kr.startValue;
  const progress = range !== 0 ? ((newValue - kr.startValue) / range) * 100 : 0;

  const { startDate, endDate } = kr.objective.cycle;
  const elapsed = (Date.now() - startDate.getTime()) / (endDate.getTime() - startDate.getTime());
  const expectedProgress = Math.min(Math.max(elapsed, 0), 1) * 100;

  // Below 70% of the expected pace is at risk, below 40% is off track
  const ratio = expectedProgress > 0 ? progress / expectedProgress : 1;
  const status =
    progress >= 100 ? "COMPLETED" : ratio >= 0.7 ? "ON_TRACK" : ratio >= 0.4 ? "AT_RISK" : "OFF_TRACK";

  // One transaction, so the history never disagrees with the value
  const updated = await prisma.$transaction(async (tx) => {
    await tx.kRUpdate.create({
      data: { keyResultId: id, previousValue: kr.currentValue, newValue, note, updatedById: userId },
    });
    const result = await tx.keyResult.update({ where: { id }, data: { currentValue: newValue, status } });

    const sibs = (await tx.keyResult.findMany({
      where: { objectiveId: kr.objectiveId, status: { not: "DROPPED" } },
      select: { status: true },
    })).map((s) => s.status);
    const worst =
      sibs.includes("OFF_TRACK") ? "OFF_TRACK" :
      sibs.includes("AT_RISK") ? "AT_RISK" :
      sibs.every((s) => s === "COMPLETED") ? "COMPLETED" : "ON_TRACK";
    await tx.objective.update({ where: { id: kr.objectiveId }, data: { status: worst } });
    return result;
  });

  return Response.json({ ...updated, progress: +progress.toFixed(1), expectedProgress: +expectedProgress.toFixed(1) });
}
```

The user id comes from the session, never from the request body.

## Step 3 — Weekly Check-In Reminders

Every Monday, each owner gets one email listing their key results with a direct link to the update form. Resend's batch endpoint takes at most 100 emails per call, so the code sends in chunks. The emails are plain text, so user-entered titles need no HTML escaping.

```typescript
// src/lib/checkins.ts — Send weekly OKR check-in emails to KR owners.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWeeklyCheckins() {
  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    include: { objectives: { where: { status: { not: "COMPLETED" } }, include: { keyResults: true } } },
  });
  if (!cycle) return;

  const byOwner = new Map<string, (typeof cycle.objectives)[number]["keyResults"]>();
  for (const obj of cycle.objectives) {
    byOwner.set(obj.ownerId, [...(byOwner.get(obj.ownerId) ?? []), ...obj.keyResults]);
  }

  const owners = await prisma.user.findMany({ where: { id: { in: [...byOwner.keys()] } } });

  const emails = owners.map((owner) => {
    const krs = (byOwner.get(owner.id) ?? []).filter((kr) => kr.status !== "DROPPED");
    return {
      from: "OKRs <okrs@yourcompany.com>", // a sender on a domain verified in Resend
      to: [owner.email],
      subject: `Weekly OKR check-in: ${cycle.name}`,
      text: [
        `Weekly check-in: ${cycle.name}`,
        ...krs.map((kr) => `- ${kr.title}: ${kr.currentValue}/${kr.targetValue} ${kr.unit}\n  ${process.env.NEXT_PUBLIC_APP_URL}/kr/${kr.id}/update`),
        "What progress did you make? What is blocking you?",
      ].join("\n\n"),
    };
  });

  for (let i = 0; i < emails.length; i += 100) {
    const { error } = await resend.batch.send(emails.slice(i, i + 100));
    if (error) throw new Error(`Resend batch failed: ${error.message}`);
  }
}
```

Trigger it on a schedule. With Vercel Cron, add `{"crons": [{"path": "/api/cron/checkins", "schedule": "0 8 * * 1"}]}` to `vercel.json` (Mondays 08:00 UTC; Hobby accounts allow only daily-or-slower jobs). Set a `CRON_SECRET` environment variable and Vercel sends it as `Authorization: Bearer <secret>`, which a `GET` route at that path must compare before calling `sendWeeklyCheckins()`; answer 401 otherwise.

## Step 4 — Company Health Dashboard

One endpoint returns objectives by status and the at-risk list. The counting is done by the database.

```typescript
// src/app/api/dashboard/health/route.ts — Company OKR health summary.
import { prisma } from "@/lib/prisma";

export async function GET() {
  const cycle = await prisma.cycle.findFirst({ where: { status: "ACTIVE" } });
  if (!cycle) return Response.json({ error: "No active cycle" }, { status: 404 });

  const [byStatus, atRisk] = await Promise.all([
    prisma.objective.groupBy({ by: ["status"], where: { cycleId: cycle.id }, _count: true }),
    prisma.objective.findMany({ where: { cycleId: cycle.id, status: { in: ["AT_RISK", "OFF_TRACK"] } } }),
  ]);

  return Response.json({
    cycleName: cycle.name,
    objectivesByStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])),
    atRiskObjectives: atRisk,
  });
}
```

## Step 5 — End-of-Quarter Retrospective Report

When a cycle ends, email leadership what was achieved and what was missed, then close the cycle.

```typescript
// src/lib/retrospective.ts — Generate and email the end-of-quarter retrospective.
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendQuarterlyRetro(cycleId: string, leadershipEmails: string[]) {
  const cycle = await prisma.cycle.findUniqueOrThrow({
    where: { id: cycleId },
    include: { objectives: { include: { keyResults: true } } },
  });
  const krs = cycle.objectives.flatMap((o) => o.keyResults).filter((kr) => kr.status !== "DROPPED");
  const done = krs.filter((kr) => kr.status === "COMPLETED");
  const missed = krs.filter((kr) => kr.status !== "COMPLETED");
  const rate = krs.length ? Math.round((done.length / krs.length) * 100) : 0;
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

  const { error } = await resend.emails.send({
    from: "OKRs <okrs@yourcompany.com>",
    to: leadershipEmails,
    subject: `${cycle.name} retrospective: ${rate}% KR completion`,
    text: [
      `${cycle.name}: ${done.length} of ${krs.length} key results completed (${rate}%).`,
      `Achieved:\n${list(done.map((kr) => kr.title))}`,
      `Missed:\n${list(missed.map((kr) => `${kr.title}: ${kr.currentValue}/${kr.targetValue} ${kr.unit}`))}`,
      "Which misses were in our control? What do we carry forward, and what do we drop?",
    ].join("\n\n"),
  });
  if (error) throw new Error(`Resend failed: ${error.message}`);

  await prisma.cycle.update({ where: { id: cycleId }, data: { status: "COMPLETED" } });
}
```

## Results

In David's first full quarter on the system (the team's own numbers):

- Weekly reminders with a direct update link kept key results current instead of drifting after week 4.
- Three key results were flagged off track in week 4. Before, the same problems surfaced at the week-12 all-hands.
- All-hands prep became reading the health endpoint instead of exporting spreadsheets.

## Related Skills

- [prisma](/skills/prisma): schema, migrations and the typed client used in every step
- [resend](/skills/resend): check-in and retrospective emails
