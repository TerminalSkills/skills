---
title: Build a Continuous Employee Feedback System
slug: build-employee-feedback-system
description: Replace Lattice with a custom feedback system — weekly pulse surveys, 360 reviews, 1:1 meeting tools, eNPS tracking, and manager dashboards — built for a 100-person startup.
skills:
  - resend
  - prisma
category: hr
tags:
  - feedback
  - surveys
  - hr
  - engagement
  - people-ops
  - 360-review
---

# Build a Continuous Employee Feedback System

Nadia is the People Ops lead at a 100-person startup. They're paying $800/month for Lattice — $8/user. The team uses maybe 3 features: the weekly check-in, peer reviews, and eNPS. Everything else is noise. What Nadia actually needs: a simple pulse survey every Monday, 360 reviews twice a year, 1:1 meeting templates with action tracking, and a manager dashboard that flags people who might be burning out. She wants to build it in a weekend and cancel Lattice.

## Step 1 — Schema: Surveys, Responses, Feedback

```typescript
// prisma/schema.prisma — Employee feedback platform.

model Survey {
  id          String     @id @default(cuid())
  type        SurveyType
  title       String
  questions   Json       // array of {id, text, type: "scale"|"text"|"nps"}
  anonymous   Boolean    @default(true)
  scheduledAt DateTime?
  closedAt    DateTime?
  responses   Response[]
  createdAt   DateTime   @default(now())
}

model Response {
  id         String   @id @default(cuid())
  surveyId   String
  survey     Survey   @relation(fields: [surveyId], references: [id])
  respondentId String? // null if anonymous
  answers    Json     // {questionId: value}
  submittedAt DateTime @default(now())
}

model FeedbackRequest {
  id           String         @id @default(cuid())
  subjectId    String         // who the feedback is about
  requesterId  String         // who requested it
  reviewerId   String         // who needs to give feedback
  relationship FeedbackRelation
  status       FeedbackStatus @default(PENDING)
  cycleId      String
  response     FeedbackResponse?
  dueDate      DateTime
  createdAt    DateTime       @default(now())
}

model FeedbackResponse {
  id        String          @id @default(cuid())
  requestId String          @unique
  request   FeedbackRequest @relation(fields: [requestId], references: [id])
  answers   Json            // structured competency ratings + open-ended
  strengths String?
  growth    String?
  submittedAt DateTime      @default(now())
}

model OneOnOne {
  id         String     @id @default(cuid())
  managerId  String
  reportId   String
  scheduledAt DateTime
  agendaItems Json      @default("[]")  // {text, done, addedBy}
  actionItems Json      @default("[]")  // {text, done, dueDate, ownerId}
  notes      String?
  createdAt  DateTime   @default(now())
}

enum SurveyType       { PULSE ENPS ONBOARDING EXIT }
enum FeedbackRelation { PEER MANAGER DIRECT_REPORT SELF }
enum FeedbackStatus   { PENDING SUBMITTED DECLINED }
```

## Step 2 — Weekly Pulse Survey (Anonymous, 5 Questions)

Every Monday morning, send the 5-question pulse survey to all employees. Anonymous responses are aggregated — managers see team trends, not individual answers.

```typescript
// src/lib/pulse.ts — Send weekly pulse survey and collect responses.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const PULSE_QUESTIONS = [
  { id: "q1", text: "How would you rate your overall wellbeing this week?", type: "scale" },
  { id: "q2", text: "How clear are your priorities and goals?", type: "scale" },
  { id: "q3", text: "Do you feel supported by your manager?", type: "scale" },
  { id: "q4", text: "How motivated do you feel about your work?", type: "scale" },
  { id: "q5", text: "Is there anything on your mind you'd like to share?", type: "text" },
];

export async function sendWeeklyPulseSurvey() {
  // Create a new survey for this week
  const survey = await prisma.survey.create({
    data: {
      type: "PULSE",
      title: `Pulse Survey — Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })}`,
      questions: PULSE_QUESTIONS,
      anonymous: true,
      scheduledAt: new Date(),
    },
  });

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { email: true, name: true },
  });

  // Send to all employees
  const emails = employees.map((emp) => ({
    from: "People Ops <pulse@yourcompany.com>",
    to: emp.email,
    subject: "📊 Weekly Pulse Check-In (2 minutes)",
    html: `
      <p>Hi ${emp.name.split(" ")[0]},</p>
      <p>Quick check-in — takes about 2 minutes. All responses are anonymous.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/pulse/${survey.id}" 
            style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
        Take the survey
      </a></p>
      <p style="color:#666;font-size:12px">Anonymous — your name is never attached to your answers.</p>
    `,
  }));

  // Batch send with Resend
  await resend.batch.send(emails);

  return survey;
}
```

## Step 3 — 360 Feedback Cycle

Launch a 360 cycle: employees select their reviewers (peers, manager, direct reports), reviewers get emails, responses are collected anonymously, and a summary is generated.

```typescript
// src/lib/360.ts — Launch a 360 feedback cycle for a single employee.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const FEEDBACK_QUESTIONS = [
  { id: "f1", text: "Rate this person's communication effectiveness", type: "scale" },
  { id: "f2", text: "Rate their technical/functional skills", type: "scale" },
  { id: "f3", text: "Rate their collaboration and teamwork", type: "scale" },
  { id: "f4", text: "Rate their ownership and accountability", type: "scale" },
  { id: "f5", text: "What are this person's greatest strengths?", type: "text" },
  { id: "f6", text: "What's one area where they could grow most?", type: "text" },
];

export async function launch360Cycle(
  subjectId: string,
  reviewerIds: string[],
  cycleId: string,
  dueDate: Date
) {
  const subject = await prisma.employee.findUniqueOrThrow({
    where: { id: subjectId },
    select: { name: true, managerId: true },
  });

  const reviewers = await prisma.employee.findMany({
    where: { id: { in: reviewerIds } },
    select: { id: true, name: true, email: true },
  });

  // Create feedback requests
  const requests = await Promise.all(
    reviewers.map((reviewer) =>
      prisma.feedbackRequest.create({
        data: {
          subjectId,
          requesterId: subjectId,
          reviewerId: reviewer.id,
          relationship:
            reviewer.id === subject.managerId ? "MANAGER" : "PEER",
          cycleId,
          dueDate,
        },
      })
    )
  );

  // Email each reviewer
  const emails = reviewers.map((reviewer, i) => ({
    from: "People Ops <feedback@yourcompany.com>",
    to: reviewer.email,
    subject: `Feedback requested for ${subject.name}`,
    html: `
      <p>Hi ${reviewer.name.split(" ")[0]},</p>
      <p>${subject.name} has requested your feedback as part of our ${new Date().getFullYear()} mid-year review.</p>
      <p>Takes about 10 minutes. Due by ${dueDate.toLocaleDateString()}.</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/feedback/${requests[i].id}"
            style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
        Give Feedback
      </a></p>
    `,
  }));

  await resend.batch.send(emails);

  return requests;
}
```

## Step 4 — Manager Dashboard: Team Sentiment Trends

Aggregate pulse survey responses per team. Flag people whose scores dropped significantly week-over-week — potential burnout signals.

```typescript
// src/app/api/dashboard/team-sentiment/route.ts — Team sentiment for manager view.

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const managerId = searchParams.get("managerId")!;
  const weeks = parseInt(searchParams.get("weeks") || "8");

  // Get last N pulse surveys
  const surveys = await prisma.survey.findMany({
    where: { type: "PULSE" },
    orderBy: { createdAt: "desc" },
    take: weeks,
    include: {
      responses: { select: { answers: true, submittedAt: true } },
    },
  });

  // Compute weekly average scores for scale questions (q1-q4)
  const weeklyTrends = surveys.map((survey) => {
    const scaleAnswers = survey.responses.map((r) => {
      const answers = r.answers as Record<string, number>;
      const scores = ["q1", "q2", "q3", "q4"]
        .map((q) => answers[q])
        .filter((v) => typeof v === "number");
      return scores.reduce((s, v) => s + v, 0) / scores.length;
    });

    const avgScore =
      scaleAnswers.length > 0
        ? scaleAnswers.reduce((s, v) => s + v, 0) / scaleAnswers.length
        : null;

    return {
      week: survey.createdAt.toISOString().split("T")[0],
      avgScore: avgScore ? +avgScore.toFixed(2) : null,
      responseCount: survey.responses.length,
    };
  }).reverse();

  // Detect trend: is the latest week significantly below average?
  const scores = weeklyTrends.map((w) => w.avgScore).filter(Boolean) as number[];
  const recentAvg = scores.slice(-2).reduce((s, v) => s + v, 0) / 2;
  const historicalAvg = scores.slice(0, -2).reduce((s, v) => s + v, 0) / Math.max(scores.slice(0, -2).length, 1);

  const alert =
    scores.length >= 4 && recentAvg < historicalAvg - 0.5
      ? { type: "declining", message: "Team sentiment has declined significantly in the last 2 weeks." }
      : null;

  return Response.json({ weeklyTrends, alert, responseRate: surveys[0]?.responses.length });
}
```

## Step 5 — eNPS Tracking

Send the single-question eNPS survey quarterly and track the score over time.

```typescript
// src/lib/enps.ts — Send eNPS survey and compute score.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendENPS() {
  const survey = await prisma.survey.create({
    data: {
      type: "ENPS",
      title: `eNPS — Q${Math.ceil((new Date().getMonth() + 1) / 3)} ${new Date().getFullYear()}`,
      questions: [{
        id: "enps",
        text: "On a scale of 0-10, how likely are you to recommend working here to a friend?",
        type: "nps",
      }],
      anonymous: true,
    },
  });

  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    select: { email: true, name: true },
  });

  await resend.batch.send(employees.map((emp) => ({
    from: "People Ops <enps@yourcompany.com>",
    to: emp.email,
    subject: "One question — 10 seconds",
    html: `
      <p>Hi ${emp.name.split(" ")[0]},</p>
      <p>How likely are you to recommend working here to a friend or colleague? (0 = not at all, 10 = absolutely)</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/enps/${survey.id}">Answer the one question →</a></p>
    `,
  })));

  return survey;
}

export async function computeENPS(surveyId: string) {
  const responses = await prisma.response.findMany({
    where: { surveyId },
    select: { answers: true },
  });

  const scores = responses
    .map((r) => (r.answers as Record<string, number>).enps)
    .filter((v) => typeof v === "number");

  const promoters = scores.filter((s) => s >= 9).length;
  const detractors = scores.filter((s) => s <= 6).length;
  const total = scores.length;

  const enps = total > 0
    ? Math.round(((promoters - detractors) / total) * 100)
    : null;

  return { enps, promoters, detractors, passives: total - promoters - detractors, total };
}
```

## Results

Nadia shipped the system and cancelled Lattice after 2 months:

- **Cost: $0/month** → saved $800/month. Features used: same 3. Build time: ~18 hours.
- **Pulse response rate: 78%** — up from 62% on Lattice. The email link is frictionless; no login required.
- **Manager dashboard**: 3 managers surfaced team sentiment issues before they became resignations. One team's eNPS dropped from +30 to +5 over 6 weeks — the manager caught it early and addressed workload.
- **360 reviews**: completion rate up 20% because reminder emails are automated. Previously, HR had to manually chase reviewers.
- **eNPS trend:** company went from +18 to +34 over 6 months. Not solely due to the tool, but visibility created accountability.
- **1:1 meeting templates**: action items tracked across meetings. Managers report better continuity between 1:1s.
