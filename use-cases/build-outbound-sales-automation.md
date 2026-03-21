---
title: "Build Outbound Sales Automation"
description: "Build your first outbound motion — prospect enrichment, multi-touch email sequences, a call task queue for SDRs, and reply detection that pauses sequences automatically when a prospect responds."
skills: [resend, prisma, anthropic-sdk]
difficulty: advanced
time_estimate: "10 hours"
tags: [sales, outbound, email-sequences, b2b, crm, automation, sdr, prospecting]
---

# Build Outbound Sales Automation

You have 200 leads and no system. You're sending cold emails manually from Gmail, forgetting follow-ups, and missing replies buried in your inbox. This builds the outbound engine you need: enriched prospects, automated multi-touch sequences, and automatic pause when someone replies.

## What You'll Build

- Prospect list with Apollo/Clearbit enrichment
- Email sequences: day 0 intro → day 3 follow-up → day 7 breakup
- Claude-personalized email body per prospect
- Reply detection: pause sequence automatically
- SDR call task queue: prioritized by engagement score
- Sequence analytics: open rate, reply rate, meeting booked

## Architecture

```
Import prospect list (CSV or API)
  → Enrich via Clearbit/Apollo
  → Segment by ICP fit
  → Enroll in sequence
  → Cron: send due emails via Resend
  → Webhooks: open/click/reply events → update DB
  → Reply detected → pause sequence, notify SDR
  → Call queue: hot leads surfaced for SDRs
```

## Step 1: Prisma Schema

```prisma
model Prospect {
  id            String   @id @default(cuid())
  email         String   @unique
  firstName     String
  lastName      String
  company       String
  title         String?
  linkedinUrl   String?
  website       String?
  industry      String?
  companySize   String?
  icpScore      Int      @default(0)  // 0-100
  enrichedAt    DateTime?
  enrollments   SequenceEnrollment[]
  activities    ProspectActivity[]
}

model Sequence {
  id          String           @id @default(cuid())
  name        String
  steps       SequenceStep[]
  enrollments SequenceEnrollment[]
}

model SequenceStep {
  id          String   @id @default(cuid())
  sequenceId  String
  sequence    Sequence @relation(fields: [sequenceId], references: [id])
  stepNumber  Int
  channel     String   // email | call_task | linkedin
  delayDays   Int      // days after previous step
  subject     String?
  bodyTemplate String  // Handlebars template
  emails      SentEmail[]
}

model SequenceEnrollment {
  id           String     @id @default(cuid())
  prospectId   String
  prospect     Prospect   @relation(fields: [prospectId], references: [id])
  sequenceId   String
  sequence     Sequence   @relation(fields: [sequenceId], references: [id])
  status       EnrollStatus @default(ACTIVE)
  currentStep  Int        @default(0)
  nextSendAt   DateTime?
  pausedReason String?
  enrolledAt   DateTime   @default(now())
  @@unique([prospectId, sequenceId])
}

model SentEmail {
  id           String       @id @default(cuid())
  enrollmentId String
  stepId       String
  step         SequenceStep @relation(fields: [stepId], references: [id])
  resendId     String       @unique
  subject      String
  sentAt       DateTime     @default(now())
  openedAt     DateTime?
  clickedAt    DateTime?
  repliedAt    DateTime?
}

model ProspectActivity {
  id         String   @id @default(cuid())
  prospectId String
  prospect   Prospect @relation(fields: [prospectId], references: [id])
  type       String   // email_opened | email_clicked | replied | call_made | meeting_booked
  metadata   Json?
  createdAt  DateTime @default(now())
}

enum EnrollStatus { ACTIVE PAUSED COMPLETED UNSUBSCRIBED REPLIED }
```

## Step 2: Clearbit Enrichment

```typescript
// lib/enrich.ts
export async function enrichProspect(email: string) {
  const res = await fetch(`https://person.clearbit.com/v2/combined/find?email=${email}`, {
    headers: { Authorization: `Bearer ${process.env.CLEARBIT_API_KEY}` },
  });
  if (!res.ok) return null;
  const data = await res.json();

  return {
    firstName: data.person?.name?.givenName,
    lastName: data.person?.name?.familyName,
    title: data.person?.title,
    linkedinUrl: data.person?.linkedin?.handle
      ? `https://linkedin.com/in/${data.person.linkedin.handle}`
      : undefined,
    company: data.company?.name,
    industry: data.company?.category?.industry,
    companySize: data.company?.metrics?.employeesRange,
    website: data.company?.domain,
  };
}

export function scoreIcpFit(prospect: {
  industry?: string;
  companySize?: string;
  title?: string;
}): number {
  let score = 50;
  const targetIndustries = ["SaaS", "Technology", "Software"];
  const targetSizes = ["11-50", "51-200", "201-500"];
  const targetTitles = ["CTO", "VP Engineering", "Head of", "Director"];

  if (prospect.industry && targetIndustries.some(i => prospect.industry!.includes(i))) score += 20;
  if (prospect.companySize && targetSizes.includes(prospect.companySize)) score += 15;
  if (prospect.title && targetTitles.some(t => prospect.title!.includes(t))) score += 15;

  return Math.min(score, 100);
}
```

## Step 3: Personalize Emails with Claude

```typescript
// lib/personalize.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function personalizeEmail(params: {
  template: string;
  prospect: { firstName: string; company: string; title?: string; industry?: string };
  stepNumber: number;
}) {
  const prompt = `Personalize this cold email template for the prospect below. Keep it concise and human-sounding. Do NOT change the core message or offer. Just weave in relevant details naturally.

Template:
${params.template}

Prospect:
- Name: ${params.prospect.firstName}
- Company: ${params.prospect.company}
- Title: ${params.prospect.title ?? "unknown"}
- Industry: ${params.prospect.industry ?? "technology"}

Return only the personalized email body. No subject line. No additional commentary.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  return message.content[0].type === "text" ? message.content[0].text : params.template;
}
```

## Step 4: Send Sequence Emails via Resend

```typescript
// lib/sequence-runner.ts — called by cron every 15 min
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function processDueEmails() {
  const due = await prisma.sequenceEnrollment.findMany({
    where: {
      status: "ACTIVE",
      nextSendAt: { lte: new Date() },
    },
    include: {
      prospect: true,
      sequence: { include: { steps: { orderBy: { stepNumber: "asc" } } } },
    },
    take: 50,
  });

  for (const enrollment of due) {
    const step = enrollment.sequence.steps[enrollment.currentStep];
    if (!step || step.channel !== "email") continue;

    const body = await personalizeEmail({
      template: step.bodyTemplate,
      prospect: enrollment.prospect,
      stepNumber: step.stepNumber,
    });

    const { data } = await resend.emails.send({
      from: process.env.SENDER_EMAIL!,
      to: enrollment.prospect.email,
      subject: step.subject!,
      text: body,
      headers: {
        "X-Enrollment-Id": enrollment.id, // used by reply webhook
      },
    });

    const nextStep = enrollment.sequence.steps[enrollment.currentStep + 1];

    await prisma.$transaction([
      prisma.sentEmail.create({
        data: {
          enrollmentId: enrollment.id,
          stepId: step.id,
          resendId: data!.id,
          subject: step.subject!,
        },
      }),
      prisma.sequenceEnrollment.update({
        where: { id: enrollment.id },
        data: {
          currentStep: enrollment.currentStep + 1,
          status: nextStep ? "ACTIVE" : "COMPLETED",
          nextSendAt: nextStep
            ? new Date(Date.now() + nextStep.delayDays * 86400000)
            : null,
        },
      }),
    ]);
  }
}
```

## Step 5: Reply Detection — Pause Sequence

```typescript
// POST /api/webhooks/resend — handle reply events
export async function POST(req: Request) {
  const event = await req.json();

  if (event.type === "email.delivered") {
    // update sentAt confirmation
  }

  if (event.type === "email.opened") {
    await prisma.sentEmail.updateMany({
      where: { resendId: event.data.email_id },
      data: { openedAt: new Date() },
    });
  }

  if (event.type === "email.replied") {
    const sentEmail = await prisma.sentEmail.findUnique({
      where: { resendId: event.data.email_id },
      include: { enrollment: { include: { prospect: true } } },
    });

    if (sentEmail) {
      // Pause the sequence
      await prisma.sequenceEnrollment.update({
        where: { id: sentEmail.enrollmentId },
        data: { status: "REPLIED", pausedReason: "prospect_replied" },
      });

      // Log activity
      await prisma.prospectActivity.create({
        data: {
          prospectId: sentEmail.enrollment.prospectId,
          type: "replied",
          metadata: { emailId: sentEmail.id },
        },
      });

      // TODO: Notify SDR via Slack/email
    }
  }

  return Response.json({ ok: true });
}
```

## Step 6: SDR Call Task Queue

```typescript
// GET /api/tasks/calls — hot leads for SDRs today
export async function GET() {
  // Prospects who: opened email 2+ times, clicked, replied, or high ICP score
  const hotLeads = await prisma.prospect.findMany({
    where: {
      enrollments: {
        some: { status: { in: ["ACTIVE", "REPLIED"] } },
      },
      activities: {
        some: { type: { in: ["email_opened", "email_clicked"] } },
      },
      icpScore: { gte: 70 },
    },
    include: {
      enrollments: { include: { sequence: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 5 },
    },
    orderBy: { icpScore: "desc" },
    take: 20,
  });

  return Response.json(hotLeads);
}
```

## Environment Variables

```bash
RESEND_API_KEY=re_...
CLEARBIT_API_KEY=...
ANTHROPIC_API_KEY=sk-ant-...
SENDER_EMAIL=outbound@yourcompany.com
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] Import prospects from CSV
- [ ] Enrichment working (Clearbit or Apollo)
- [ ] ICP scoring configured for your target market
- [ ] Sequence created with 3 steps and delay days
- [ ] Cron job running every 15 min in production
- [ ] Resend webhooks: opened, clicked, replied
- [ ] Reply detected → SDR notified in Slack

## What's Next

- A/B test subject lines per sequence step
- Unsubscribe link with one-click opt-out
- Meeting booked via Calendly → mark as converted
- Warm handoff: AI drafts reply suggestions for SDRs
