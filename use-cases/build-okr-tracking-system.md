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

David is the CTO of a 50-person startup. They adopted OKRs six months ago. The process: every quarter, teams set objectives in a shared Notion doc, key results are tracked in a spreadsheet, and progress is presented in an all-hands. By week 4, the spreadsheet is out of date. By week 8, nobody is looking at it. David wants a system that makes OKRs visible, sends weekly nudges, and automatically flags key results that are off track — so OKRs stay alive, not just quarterly theater.

## Step 1 — Schema: Company → Team → Individual OKRs

```typescript
// prisma/schema.prisma — OKR hierarchy with company, team, and individual levels.

model Cycle {
  id        String   @id @default(cuid())
  name      String   // "Q1 2025", "H1 2025"
  startDate DateTime
  endDate   DateTime
  status    CycleStatus @default(ACTIVE)
  objectives Objective[]
  createdAt DateTime @default(now())
}

model Objective {
  id          String    @id @default(cuid())
  title       String
  description String?
  level       OKRLevel  // COMPANY | TEAM | INDIVIDUAL
  ownerId     String    // userId or teamId
  ownerName   String    // denormalized for display
  cycleId     String
  cycle       Cycle     @relation(fields: [cycleId], references: [id])
  parentId    String?   // links team OKR to company OKR
  parent      Objective? @relation("alignment", fields: [parentId], references: [id])
  children    Objective[] @relation("alignment")
  keyResults  KeyResult[]
  status      OKRStatus @default(ON_TRACK)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model KeyResult {
  id           String    @id @default(cuid())
  title        String
  targetValue  Float
  currentValue Float     @default(0)
  unit         String    @default("%")  // %, $, users, points
  startValue   Float     @default(0)
  objectiveId  String
  objective    Objective @relation(fields: [objectiveId], references: [id])
  updates      KRUpdate[]
  status       KRStatus  @default(ON_TRACK)
  confidence   Int       @default(5)   // 1-10 confidence score
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}

model KRUpdate {
  id           String    @id @default(cuid())
  keyResultId  String
  keyResult    KeyResult @relation(fields: [keyResultId], references: [id])
  previousValue Float
  newValue      Float
  note         String?
  updatedById  String
  createdAt    DateTime  @default(now())
}

enum CycleStatus { DRAFT ACTIVE COMPLETED }
enum OKRLevel    { COMPANY TEAM INDIVIDUAL }
enum OKRStatus   { ON_TRACK AT_RISK OFF_TRACK COMPLETED }
enum KRStatus    { ON_TRACK AT_RISK OFF_TRACK COMPLETED DROPPED }
```

## Step 2 — Key Result Progress and Auto-Status

When a key result is updated, automatically compute its status based on expected vs. actual progress.

```typescript
// src/app/api/key-results/[id]/update/route.ts — Update KR value and compute status.

import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { newValue, note, updatedById } = await request.json();

  const kr = await prisma.keyResult.findUniqueOrThrow({
    where: { id: params.id },
    include: { objective: { include: { cycle: true } } },
  });

  // Log the update
  await prisma.kRUpdate.create({
    data: {
      keyResultId: params.id,
      previousValue: kr.currentValue,
      newValue,
      note,
      updatedById,
    },
  });

  // Compute progress percentage
  const range = kr.targetValue - kr.startValue;
  const progress = range !== 0
    ? ((newValue - kr.startValue) / range) * 100
    : 0;

  // Compute expected progress based on how far through the cycle we are
  const cycle = kr.objective.cycle;
  const now = Date.now();
  const cycleTotal = cycle.endDate.getTime() - cycle.startDate.getTime();
  const cycleElapsed = now - cycle.startDate.getTime();
  const expectedProgress = Math.min((cycleElapsed / cycleTotal) * 100, 100);

  // Status: if progress is <70% of expected, flag as at-risk; <40%, off-track
  const progressRatio = expectedProgress > 0 ? progress / expectedProgress : 1;
  const status: "ON_TRACK" | "AT_RISK" | "OFF_TRACK" | "COMPLETED" =
    progress >= 100 ? "COMPLETED" :
    progressRatio >= 0.7 ? "ON_TRACK" :
    progressRatio >= 0.4 ? "AT_RISK" :
    "OFF_TRACK";

  const updated = await prisma.keyResult.update({
    where: { id: params.id },
    data: { currentValue: newValue, status },
  });

  // Roll up status to parent objective
  await updateObjectiveStatus(kr.objectiveId);

  return Response.json({ ...updated, progress: +progress.toFixed(1), expectedProgress: +expectedProgress.toFixed(1) });
}

async function updateObjectiveStatus(objectiveId: string) {
  const krs = await prisma.keyResult.findMany({
    where: { objectiveId },
    select: { status: true },
  });

  const worstStatus =
    krs.some((kr) => kr.status === "OFF_TRACK") ? "OFF_TRACK" :
    krs.some((kr) => kr.status === "AT_RISK") ? "AT_RISK" :
    krs.every((kr) => kr.status === "COMPLETED") ? "COMPLETED" :
    "ON_TRACK";

  await prisma.objective.update({
    where: { id: objectiveId },
    data: { status: worstStatus as any },
  });
}
```

## Step 3 — Weekly Check-In Reminders

Every Monday, send each objective owner a brief check-in prompt. Keep the update friction-free: a link goes directly to the KR update form.

```typescript
// src/lib/checkins.ts — Send weekly OKR check-in emails to KR owners.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWeeklyCheckins() {
  const activeCycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    include: {
      objectives: {
        include: { keyResults: true },
        where: { status: { not: "COMPLETED" } },
      },
    },
  });

  if (!activeCycle) return;

  // Group KRs by owner
  const ownerMap = new Map<string, { name: string; krs: typeof activeCycle.objectives[0]["keyResults"] }>();

  for (const obj of activeCycle.objectives) {
    const existing = ownerMap.get(obj.ownerId);
    if (existing) {
      existing.krs.push(...obj.keyResults);
    } else {
      ownerMap.set(obj.ownerId, { name: obj.ownerName, krs: [...obj.keyResults] });
    }
  }

  const emails = [];

  for (const [ownerId, { name, krs }] of ownerMap.entries()) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    if (!owner) continue;

    const atRiskKRs = krs.filter((kr) => kr.status === "AT_RISK" || kr.status === "OFF_TRACK");
    const alertSection = atRiskKRs.length > 0
      ? `<p>⚠️ <strong>${atRiskKRs.length} key result(s) need attention:</strong> ${atRiskKRs.map((kr) => kr.title).join(", ")}</p>`
      : "";

    emails.push({
      from: "OKRs <okrs@yourcompany.com>",
      to: owner.email,
      subject: `📊 Weekly OKR Check-In — ${activeCycle.name}`,
      html: `
        <h2>Weekly Check-In — ${activeCycle.name}</h2>
        ${alertSection}
        <p>Take 5 minutes to update your key results. It keeps the team aligned and surfaces blockers early.</p>
        <ul>
          ${krs.map((kr) => `
            <li>
              <strong>${kr.title}</strong> — ${kr.currentValue}/${kr.targetValue} ${kr.unit}
              <a href="${process.env.NEXT_PUBLIC_APP_URL}/kr/${kr.id}/update">Update →</a>
            </li>
          `).join("")}
        </ul>
        <h3>Reflection prompts:</h3>
        <ul>
          <li>What progress did you make this week?</li>
          <li>What's blocking you?</li>
          <li>Do you need to change your approach?</li>
        </ul>
      `,
    });
  }

  await resend.batch.send(emails);
}
```

## Step 4 — Company Health Dashboard

Real-time view of all OKRs: green/yellow/red by status, progress bars, top performers, and at-risk items that need attention.

```typescript
// src/app/api/dashboard/health/route.ts — Company OKR health summary.

import { prisma } from "@/lib/prisma";

export async function GET() {
  const cycle = await prisma.cycle.findFirst({
    where: { status: "ACTIVE" },
    include: {
      objectives: {
        include: { keyResults: true },
        orderBy: { level: "asc" },
      },
    },
  });

  if (!cycle) return Response.json({ error: "No active cycle" }, { status: 404 });

  const allKRs = cycle.objectives.flatMap((o) => o.keyResults);

  const health = {
    cycleId: cycle.id,
    cycleName: cycle.name,
    daysRemaining: Math.ceil((cycle.endDate.getTime() - Date.now()) / 86400000),
    objectives: {
      total: cycle.objectives.length,
      onTrack: cycle.objectives.filter((o) => o.status === "ON_TRACK").length,
      atRisk: cycle.objectives.filter((o) => o.status === "AT_RISK").length,
      offTrack: cycle.objectives.filter((o) => o.status === "OFF_TRACK").length,
      completed: cycle.objectives.filter((o) => o.status === "COMPLETED").length,
    },
    keyResults: {
      total: allKRs.length,
      avgProgress: allKRs.length
        ? +(allKRs.reduce((s, kr) => {
            const range = kr.targetValue - kr.startValue;
            return s + (range !== 0 ? ((kr.currentValue - kr.startValue) / range) * 100 : 0);
          }, 0) / allKRs.length).toFixed(1)
        : 0,
    },
    atRiskObjectives: cycle.objectives
      .filter((o) => ["AT_RISK", "OFF_TRACK"].includes(o.status))
      .map((o) => ({ id: o.id, title: o.title, status: o.status, owner: o.ownerName })),
    topObjectives: cycle.objectives
      .filter((o) => o.level === "COMPANY")
      .map((o) => ({
        id: o.id,
        title: o.title,
        status: o.status,
        krCount: o.keyResults.length,
        completedKRs: o.keyResults.filter((kr) => kr.status === "COMPLETED").length,
      })),
  };

  return Response.json(health);
}
```

## Step 5 — End-of-Quarter Retrospective Report

When a cycle ends, auto-generate and email the retrospective: what was achieved, what was missed, and key learnings.

```typescript
// src/lib/retrospective.ts — Generate and email EOQ retrospective report.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendQuarterlyRetro(cycleId: string, leadershipEmails: string[]) {
  const cycle = await prisma.cycle.findUniqueOrThrow({
    where: { id: cycleId },
    include: {
      objectives: {
        include: { keyResults: { include: { updates: { take: 1, orderBy: { createdAt: "desc" } } } } },
      },
    },
  });

  const allKRs = cycle.objectives.flatMap((o) => o.keyResults);
  const completedKRs = allKRs.filter((kr) => kr.status === "COMPLETED");
  const missedKRs = allKRs.filter((kr) => kr.status === "OFF_TRACK");
  const completionRate = allKRs.length > 0
    ? Math.round((completedKRs.length / allKRs.length) * 100)
    : 0;

  await resend.emails.send({
    from: "OKRs <okrs@yourcompany.com>",
    to: leadershipEmails,
    subject: `${cycle.name} Retrospective — ${completionRate}% KR completion`,
    html: `
      <h2>${cycle.name} — End of Quarter Retrospective</h2>
      <h3>📊 Summary</h3>
      <p><strong>KR Completion Rate:</strong> ${completionRate}% (${completedKRs.length}/${allKRs.length} key results completed)</p>
      <p><strong>Objectives Completed:</strong> ${cycle.objectives.filter((o) => o.status === "COMPLETED").length}/${cycle.objectives.length}</p>

      <h3>✅ What We Achieved</h3>
      <ul>${completedKRs.map((kr) => `<li>${kr.title}</li>`).join("")}</ul>

      <h3>❌ What We Missed</h3>
      <ul>${missedKRs.map((kr) => `<li>${kr.title} — ${kr.currentValue}/${kr.targetValue} ${kr.unit}</li>`).join("")}</ul>

      <h3>🔍 Questions for Retrospective</h3>
      <ul>
        <li>Which missed OKRs were in our control?</li>
        <li>Did we set the right objectives for this quarter?</li>
        <li>What should we carry forward vs. drop next quarter?</li>
      </ul>
    `,
  });

  await prisma.cycle.update({ where: { id: cycleId }, data: { status: "COMPLETED" } });
}
```

## Results

David rolled out the OKR system company-wide for Q2:

- **KR update rate: 40% → 85%** — weekly reminder emails with one-click update links. No login friction.
- **At-risk detection**: 3 key results flagged as off-track in week 4. Previously, this was discovered at the all-hands in week 12 — too late to course-correct.
- **All-hands prep: 2 hours → 15 minutes** — the health dashboard generates the slide content. No one exports spreadsheets anymore.
- **OKR alignment**: team objectives linked to company objectives. Everyone can see how their work connects to company goals.
- **EOQ retrospective**: auto-generated and emailed to leadership on cycle close. Completion rate visible at a glance.
- **Build time: ~14 hours** — schema, progress engine, check-in emails, dashboard, retrospective report.
