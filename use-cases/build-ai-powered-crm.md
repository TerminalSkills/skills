---
title: "Build an AI-Powered CRM"
description: "Build a CRM that auto-enriches contacts, summarizes email threads, scores deals, and turns meeting notes into CRM updates — without Salesforce's price tag."
skills: [anthropic-sdk, prisma, resend]
difficulty: advanced
time_estimate: "8 hours"
tags: [crm, ai, anthropic, prisma, resend, email, deal-scoring, automation, saas]
---

# Build an AI-Powered CRM

> **Persona:** You're a sales director at a 20-person startup. Salesforce costs $300/user/month — that's $72k/year for your team. Your reps spend more time logging than selling. You want AI that *does* the logging automatically, and actually helps predict which deals to prioritize.

This CRM auto-updates from emails and meeting notes, scores deals based on activity signals, and suggests the next best action for each contact.

## What You're Building

- Auto-enrich contacts from email signatures
- AI summaries of all email threads per contact
- Deal scoring based on activity (emails, meetings, response time)
- Next best action suggestions
- Meeting notes → CRM records automatically
- Email sequences with Resend

## Setup

```bash
npm install @anthropic-ai/sdk @prisma/client prisma resend
npx prisma init
```

## Prisma Schema

```prisma
model Contact {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String?
  company     String?
  title       String?
  phone       String?
  linkedinUrl String?
  notes       String?
  deals       Deal[]
  emails      Email[]
  meetings    Meeting[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Deal {
  id              String     @id @default(cuid())
  contactId       String
  contact         Contact    @relation(fields: [contactId], references: [id])
  title           String
  value           Float
  stage           DealStage  @default(PROSPECT)
  closeProbability Float?    // 0-100, AI-scored
  nextAction      String?
  lastActivityAt  DateTime?
  closeDateTarget DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

model Email {
  id          String   @id @default(cuid())
  contactId   String
  contact     Contact  @relation(fields: [contactId], references: [id])
  subject     String
  body        String
  direction   EmailDir // INBOUND | OUTBOUND
  sentAt      DateTime
  createdAt   DateTime @default(now())
}

model Meeting {
  id          String   @id @default(cuid())
  contactId   String
  contact     Contact  @relation(fields: [contactId], references: [id])
  title       String
  notes       String?
  summary     String?
  actionItems Json?
  meetingAt   DateTime
  createdAt   DateTime @default(now())
}

enum DealStage { PROSPECT QUALIFIED PROPOSAL NEGOTIATION CLOSED_WON CLOSED_LOST }
enum EmailDir  { INBOUND OUTBOUND }
```

## Auto-Enrich Contacts from Email Signatures

```typescript
// enrichment/signature.ts
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const client = new Anthropic();
const prisma = new PrismaClient();

export async function enrichFromEmailSignature(email: string, body: string) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Extract contact info from this email signature. Return JSON.
{
  "name": "...",
  "company": "...",
  "title": "...",
  "phone": "...",
  "linkedinUrl": "..."
}
Return null for missing fields.

EMAIL BODY:
${body.slice(-500)}` // Signature usually at bottom
    }]
  });

  const extracted = JSON.parse(
    response.content[0].type === 'text' ? response.content[0].text : '{}'
  );

  // Only update fields that were actually found
  const updateData = Object.fromEntries(
    Object.entries(extracted).filter(([, v]) => v !== null && v !== undefined)
  );

  if (Object.keys(updateData).length > 0) {
    await prisma.contact.upsert({
      where: { email },
      create: { email, ...updateData },
      update: updateData,
    });
    console.log(`Enriched ${email} with: ${Object.keys(updateData).join(', ')}`);
  }
}
```

## Summarize Email Threads per Contact

```typescript
// ai/summarize.ts
export async function summarizeContactEmails(contactId: string): Promise<string> {
  const emails = await prisma.email.findMany({
    where: { contactId },
    orderBy: { sentAt: 'asc' },
    take: 20,
  });

  if (emails.length === 0) return 'No email history.';

  const thread = emails.map(e =>
    `[${e.direction} - ${e.sentAt.toLocaleDateString()}] ${e.subject}\n${e.body.slice(0, 500)}`
  ).join('\n\n---\n\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Summarize this email thread with a contact in 3-4 sentences.
Focus on: what they need, where we are in the deal, any commitments made.

THREAD:
${thread}`
    }]
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

## Deal Scoring Engine

```typescript
// ai/score-deal.ts
export async function scoreDeal(dealId: string): Promise<{ score: number; reasoning: string; nextAction: string }> {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: { include: { emails: true, meetings: true } } },
  });

  if (!deal) throw new Error('Deal not found');

  // Calculate activity signals
  const now = new Date();
  const daysSinceLastActivity = deal.lastActivityAt
    ? (now.getTime() - deal.lastActivityAt.getTime()) / (1000 * 60 * 60 * 24)
    : 999;

  const emailCount = deal.contact.emails.length;
  const meetingCount = deal.contact.meetings.length;
  const inboundRatio = deal.contact.emails.filter(e => e.direction === 'INBOUND').length / Math.max(emailCount, 1);

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Score this sales deal (0-100 probability of closing).

DEAL:
- Stage: ${deal.stage}
- Value: $${deal.value.toLocaleString()}
- Days since last activity: ${daysSinceLastActivity.toFixed(0)}
- Emails sent/received: ${emailCount} (${(inboundRatio * 100).toFixed(0)}% inbound)
- Meetings held: ${meetingCount}
- Target close date: ${deal.closeDateTarget?.toLocaleDateString() || 'not set'}

Return JSON: {"score": 0-100, "reasoning": "brief", "nextAction": "specific suggestion"}`
    }]
  });

  const result = JSON.parse(
    response.content[0].type === 'text' ? response.content[0].text : '{}'
  );

  // Update deal in DB
  await prisma.deal.update({
    where: { id: dealId },
    data: {
      closeProbability: result.score,
      nextAction: result.nextAction,
    },
  });

  return result;
}
```

## Meeting Notes → CRM Update

```typescript
// ai/meeting-notes.ts
export async function processMeetingNotes(meetingId: string, rawNotes: string) {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Extract structured info from these meeting notes. Return JSON:
{
  "summary": "2-3 sentence meeting summary",
  "actionItems": [{"owner": "...", "task": "...", "dueDate": "YYYY-MM-DD or null"}],
  "dealStageUpdate": "PROSPECT|QUALIFIED|PROPOSAL|NEGOTIATION|null",
  "nextMeetingDate": "YYYY-MM-DD or null",
  "contactUpdates": {"title": "...", "company": "..."}
}

NOTES:
${rawNotes}`
    }]
  });

  const parsed = JSON.parse(
    response.content[0].type === 'text' ? response.content[0].text : '{}'
  );

  // Update meeting record
  await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      summary: parsed.summary,
      actionItems: parsed.actionItems,
    },
  });

  // Auto-update deal stage if changed
  if (parsed.dealStageUpdate) {
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId },
      include: { contact: { include: { deals: { where: { stage: { not: 'CLOSED_WON' } } } } } },
    });
    const activeDeal = meeting?.contact.deals[0];
    if (activeDeal) {
      await prisma.deal.update({
        where: { id: activeDeal.id },
        data: { stage: parsed.dealStageUpdate, lastActivityAt: new Date() },
      });
    }
  }

  return parsed;
}
```

## Automated Follow-Up Emails with Resend

```typescript
// email/follow-up.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendFollowUp(dealId: string) {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    include: { contact: true },
  });

  // Draft follow-up email with AI
  const draft = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    messages: [{
      role: 'user',
      content: `Write a brief, natural follow-up email for this deal.
Contact: ${deal!.contact.name} at ${deal!.contact.company}
Deal: ${deal!.title} ($${deal!.value.toLocaleString()})
Next action: ${deal!.nextAction}
Keep it under 100 words, friendly and specific.`
    }]
  });

  const body = draft.content[0].type === 'text' ? draft.content[0].text : '';

  await resend.emails.send({
    from: 'sales@yourcompany.com',
    to: deal!.contact.email,
    subject: `Re: ${deal!.title}`,
    text: body,
  });

  // Log the email
  await prisma.email.create({
    data: {
      contactId: deal!.contactId,
      subject: `Re: ${deal!.title}`,
      body,
      direction: 'OUTBOUND',
      sentAt: new Date(),
    },
  });
}
```

## What to Build Next

- **Gmail sync:** Poll Gmail API to auto-import emails into contact threads
- **Pipeline view:** Kanban board showing deals by stage with AI-suggested priorities
- **Revenue forecasting:** Aggregate deal scores × values to forecast monthly close
- **Duplicate detection:** Use embeddings to find duplicate contacts before inserting
