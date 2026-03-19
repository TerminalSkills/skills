---
title: Build a Lightweight Sales CRM from Scratch
slug: build-sales-crm-from-scratch
description: Replace $150/user/month Salesforce with a custom CRM — contacts, deal pipeline, activity log, Gmail sync, and pipeline reports — built in a weekend.
skills:
  - prisma
  - resend
category: business
tags:
  - crm
  - sales
  - pipeline
  - contacts
  - email
  - productivity
---

# Build a Lightweight Sales CRM from Scratch

Marcus runs a 5-person sales team. They're paying $750/month for Salesforce — $150/user — and using maybe 10% of its features. The rest is bureaucracy: mandatory fields, nested menus, reports nobody reads. His team logs calls in Slack, tracks deals in a spreadsheet, and copies emails manually into Salesforce. He wants a CRM that doesn't get in the way — contacts, deals, activities, email threads, and a pipeline view. Nothing more.

## Step 1 — Schema: Contacts, Deals, Activities

Everything in a CRM traces back to a contact. Deals belong to contacts. Activities (calls, emails, meetings) belong to contacts and optionally to deals.

```typescript
// prisma/schema.prisma — CRM data model.
// Contacts are the center of gravity. Deals and activities orbit them.

model Contact {
  id          String     @id @default(cuid())
  email       String     @unique
  name        String
  company     String?
  title       String?
  phone       String?
  linkedinUrl String?

  // Enrichment from Clearbit/Apollo
  enrichedAt  DateTime?
  avatarUrl   String?
  companySize String?
  industry    String?

  deals       Deal[]
  activities  Activity[]

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Deal {
  id          String     @id @default(cuid())
  title       String
  value       Float      @default(0)
  currency    String     @default("USD")
  stage       DealStage  @default(LEAD)
  probability Int        @default(10)   // 0-100%
  closeDate   DateTime?
  notes       String?

  contactId   String
  contact     Contact    @relation(fields: [contactId], references: [id])
  ownerId     String
  activities  Activity[]

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Activity {
  id          String       @id @default(cuid())
  type        ActivityType
  subject     String
  body        String?
  occurredAt  DateTime     @default(now())

  contactId   String
  contact     Contact      @relation(fields: [contactId], references: [id])
  dealId      String?
  deal        Deal?        @relation(fields: [dealId], references: [id])
  userId      String       // who logged it

  createdAt   DateTime     @default(now())
}

enum DealStage {
  LEAD
  QUALIFIED
  PROPOSAL
  CLOSED_WON
  CLOSED_LOST
}

enum ActivityType {
  CALL
  EMAIL
  MEETING
  NOTE
  TASK
}
```

## Step 2 — Contact Enrichment with Apollo

When a contact is created via email address, hit Apollo to fill in company, title, LinkedIn, and avatar. No more manual data entry.

```typescript
// src/lib/enrich.ts — Enrich a contact using Apollo.io API.
// Called after contact creation. Updates the record in the background.

import { prisma } from "@/lib/prisma";

interface ApolloPersonResult {
  name: string;
  title: string;
  organization?: { name: string; employee_count: string; industry: string };
  photo_url: string;
  linkedin_url: string;
}

export async function enrichContact(contactId: string, email: string) {
  try {
    const res = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": process.env.APOLLO_API_KEY!,
      },
      body: JSON.stringify({ email, reveal_personal_emails: false }),
    });

    if (!res.ok) return;

    const data = await res.json();
    const person: ApolloPersonResult = data.person;
    if (!person) return;

    await prisma.contact.update({
      where: { id: contactId },
      data: {
        name: person.name || undefined,
        title: person.title || undefined,
        company: person.organization?.name || undefined,
        companySize: person.organization?.employee_count || undefined,
        industry: person.organization?.industry || undefined,
        avatarUrl: person.photo_url || undefined,
        linkedinUrl: person.linkedin_url || undefined,
        enrichedAt: new Date(),
      },
    });
  } catch (err) {
    console.error("Enrichment failed for", email, err);
  }
}
```

```typescript
// src/app/api/contacts/route.ts — Create contact and trigger enrichment.

import { prisma } from "@/lib/prisma";
import { enrichContact } from "@/lib/enrich";

export async function POST(request: Request) {
  const { email, name } = await request.json();

  const contact = await prisma.contact.create({
    data: { email, name },
  });

  // Enrich in background — don't await, don't block the response
  enrichContact(contact.id, email).catch(console.error);

  return Response.json(contact, { status: 201 });
}
```

## Step 3 — Kanban Pipeline View

The pipeline is a board: columns are stages, cards are deals. Drag a card right to advance the stage. The total pipeline value updates in real time.

```typescript
// src/app/api/pipeline/route.ts — Return deals grouped by stage.
// Used by the kanban board. Each column is a stage with its deals and total value.

import { prisma } from "@/lib/prisma";

const STAGES = ["LEAD", "QUALIFIED", "PROPOSAL", "CLOSED_WON", "CLOSED_LOST"] as const;

export async function GET() {
  const deals = await prisma.deal.findMany({
    where: { stage: { notIn: ["CLOSED_LOST"] } },
    include: { contact: { select: { name: true, company: true, avatarUrl: true } } },
    orderBy: { updatedAt: "desc" },
  });

  const pipeline = STAGES.map((stage) => {
    const stageDeals = deals.filter((d) => d.stage === stage);
    return {
      stage,
      deals: stageDeals,
      totalValue: stageDeals.reduce((sum, d) => sum + d.value, 0),
      count: stageDeals.length,
    };
  });

  const totalPipelineValue = deals
    .filter((d) => d.stage !== "CLOSED_WON")
    .reduce((sum, d) => sum + d.value, 0);

  return Response.json({ pipeline, totalPipelineValue });
}

// PATCH /api/pipeline — Move a deal to a new stage (drag-and-drop)
export async function PATCH(request: Request) {
  const { dealId, stage } = await request.json();

  const probabilities: Record<string, number> = {
    LEAD: 10, QUALIFIED: 30, PROPOSAL: 60, CLOSED_WON: 100, CLOSED_LOST: 0,
  };

  const deal = await prisma.deal.update({
    where: { id: dealId },
    data: { stage, probability: probabilities[stage] ?? 10 },
  });

  return Response.json(deal);
}
```

## Step 4 — Gmail Thread Sync per Contact

Pull email threads from Gmail for a contact's email address. Shows the full conversation history without copy-pasting into the CRM.

```typescript
// src/lib/gmail.ts — Fetch Gmail threads for a contact's email address.
// Uses OAuth2 token stored per user. Returns threads as activity records.

import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export async function syncGmailForContact(contactId: string, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { gmailAccessToken: true, gmailRefreshToken: true },
  });
  if (!user?.gmailAccessToken) return;

  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    access_token: user.gmailAccessToken,
    refresh_token: user.gmailRefreshToken,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });

  // Search for threads involving this contact
  const { data } = await gmail.users.threads.list({
    userId: "me",
    q: `from:${contact.email} OR to:${contact.email}`,
    maxResults: 20,
  });

  const threads = data.threads || [];

  for (const thread of threads) {
    const { data: threadData } = await gmail.users.threads.get({
      userId: "me",
      id: thread.id!,
      format: "metadata",
      metadataHeaders: ["Subject", "Date", "From"],
    });

    const firstMsg = threadData.messages?.[0];
    const headers = firstMsg?.payload?.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const date = headers.find((h) => h.name === "Date")?.value;

    // Upsert activity so re-syncing doesn't create duplicates
    await prisma.activity.upsert({
      where: { gmailThreadId: thread.id! },
      create: {
        type: "EMAIL",
        subject,
        occurredAt: date ? new Date(date) : new Date(),
        contactId,
        userId,
        gmailThreadId: thread.id!,
        body: `${threadData.messages?.length ?? 1} messages`,
      },
      update: { body: `${threadData.messages?.length ?? 1} messages` },
    });
  }
}
```

## Step 5 — Pipeline Report Email with Resend

Every Monday at 9 AM, email the sales manager a pipeline summary: total value, deals by stage, conversion rate, and avg deal size.

```typescript
// src/lib/reports.ts — Generate and email the weekly pipeline report.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWeeklyPipelineReport(managerEmail: string) {
  const deals = await prisma.deal.findMany({
    include: { contact: { select: { name: true } } },
  });

  const won = deals.filter((d) => d.stage === "CLOSED_WON");
  const lost = deals.filter((d) => d.stage === "CLOSED_LOST");
  const active = deals.filter(
    (d) => !["CLOSED_WON", "CLOSED_LOST"].includes(d.stage)
  );

  const totalPipeline = active.reduce((s, d) => s + d.value, 0);
  const totalWon = won.reduce((s, d) => s + d.value, 0);
  const conversionRate =
    won.length + lost.length > 0
      ? ((won.length / (won.length + lost.length)) * 100).toFixed(1)
      : "0";
  const avgDealSize =
    won.length > 0 ? (totalWon / won.length).toFixed(0) : "0";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  await resend.emails.send({
    from: "CRM <reports@yourdomain.com>",
    to: managerEmail,
    subject: `Weekly Pipeline Report — ${fmt(totalPipeline)} in pipeline`,
    html: `
      <h2>Pipeline Summary</h2>
      <p><strong>Active Pipeline:</strong> ${fmt(totalPipeline)} across ${active.length} deals</p>
      <p><strong>Won This Quarter:</strong> ${fmt(totalWon)} (${won.length} deals)</p>
      <p><strong>Conversion Rate:</strong> ${conversionRate}%</p>
      <p><strong>Avg Deal Size:</strong> ${fmt(Number(avgDealSize))}</p>
      <hr/>
      <h3>Active Deals</h3>
      <ul>
        ${active.map((d) => `<li>${d.contact.name} — ${d.title} — ${fmt(d.value)} (${d.stage})</li>`).join("")}
      </ul>
    `,
  });
}
```

## Results

Marcus shipped the CRM in a weekend. Three months later:

- **Cost: $0/month** — Postgres on Neon free tier, Resend free tier, Next.js on Vercel. The Salesforce bill is gone.
- **Adoption: 5/5 reps use it daily** — the previous CRM had 3/5. The pipeline view matches how the team actually thinks about deals.
- **Activity logging up 3×** — because it's two clicks instead of five screens. Gmail sync means email is automatically in the CRM.
- **Pipeline visibility:** manager gets a Monday morning email instead of pulling Salesforce reports manually.
- **Enrichment saves 10 min/contact** — Apollo fills in title, company, and LinkedIn automatically on creation.
- **Total build time: ~20 hours** — schema, API, kanban UI, Gmail OAuth, report emails. Would've taken weeks with Salesforce customization.
