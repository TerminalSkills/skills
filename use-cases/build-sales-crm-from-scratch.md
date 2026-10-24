---
title: Build a Lightweight Sales CRM from Scratch
slug: build-sales-crm-from-scratch
description: Replace an expensive per-seat CRM with your own — contacts, deal pipeline, activity log, Gmail sync, and a weekly pipeline report — built on Prisma and Resend.
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

Marcus runs a 5-person sales team. They pay $750/month for their CRM and use maybe 10% of its features. The rest is bureaucracy: mandatory fields, nested menus, reports nobody reads. His team logs calls in Slack, tracks deals in a spreadsheet, and copies emails manually into the CRM. He wants one that doesn't get in the way — contacts, deals, activities, email threads, and a pipeline view. Nothing more.

The stack: Next.js route handlers, PostgreSQL through Prisma 7, Apollo for enrichment, the Gmail API for email history, and Resend for the weekly report. The code was type-checked against `prisma@7.10`, `resend@6.34` and `googleapis@188`. Auth is not shown; every route needs your own session check.

## Step 1 — Schema: Contacts, Deals, Activities

Everything traces back to a contact: deals belong to a contact and an owner, activities to a contact and optionally a deal. Install `prisma@7` (dev), `@prisma/client@7`, `@prisma/adapter-pg@7`, `pg`, `dotenv`, `resend` and `googleapis`, then run `npx prisma init --datasource-provider postgresql`. Prisma 7 keeps the connection URL out of the schema. Put it in `prisma.config.ts`, and generate the client into your source tree:

```typescript
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: env("DATABASE_URL") },
});
```

```prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}
datasource db {
  provider = "postgresql"
}

model User {
  id                String     @id @default(cuid())
  email             String     @unique
  name              String
  gmailRefreshToken String?    // store encrypted; long-lived credential
  deals             Deal[]
  activities        Activity[]
}

model Contact {
  id          String     @id @default(cuid())
  email       String     @unique
  name        String
  company     String?
  title       String?
  linkedinUrl String?
  avatarUrl   String?
  companySize Int?
  industry    String?
  enrichedAt  DateTime?
  deals       Deal[]
  activities  Activity[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Deal {
  id          String     @id @default(cuid())
  title       String
  value       Decimal    @default(0) @db.Decimal(12, 2)
  stage       DealStage  @default(LEAD)
  probability Int        @default(10) // 0-100
  contactId   String
  contact     Contact    @relation(fields: [contactId], references: [id])
  ownerId     String
  owner       User       @relation(fields: [ownerId], references: [id])
  activities  Activity[]
  updatedAt   DateTime   @updatedAt
}

model Activity {
  id            String       @id @default(cuid())
  type          ActivityType
  subject       String
  body          String?
  occurredAt    DateTime     @default(now())
  gmailThreadId String?
  contactId     String
  contact       Contact      @relation(fields: [contactId], references: [id])
  dealId        String?
  deal          Deal?        @relation(fields: [dealId], references: [id])
  userId        String       // who logged it
  user          User         @relation(fields: [userId], references: [id])
  @@unique([userId, gmailThreadId])
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

Money is a `Decimal`, not a `Float`, so sums stay exact. Run `npx prisma migrate dev --name init`, and create the client with a driver adapter (Prisma 7 no longer accepts a bare `new PrismaClient()`):

```typescript
// src/lib/prisma.ts
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
```

## Step 2 — Contact Enrichment with Apollo

When a contact is created from an email address, ask Apollo's People Enrichment endpoint for company, title, LinkedIn and avatar. Apollo documents `POST /api/v1/people/match` with the inputs (here `email`) as query parameters and the key in an `X-Api-Key` header; each match that returns data can use credits from your Apollo plan, so enrich only contacts you keep. Employee count comes back as `organization.estimated_num_employees`.

```typescript
// src/lib/enrich.ts
import { prisma } from "./prisma";
export async function enrichContact(contactId: string, email: string) {
  // Apollo documents the match inputs as query parameters; personal emails and phones stay off by default
  const url = `https://api.apollo.io/api/v1/people/match?${new URLSearchParams({ email })}`;
  const res = await fetch(url, { method: "POST", headers: { "X-Api-Key": process.env.APOLLO_API_KEY! } });
  if (!res.ok) return console.error("Apollo enrichment failed", email, res.status);

  const { person } = await res.json();
  if (!person) return;
  await prisma.contact.update({
    where: { id: contactId },
    data: {
      title: person.title,
      company: person.organization?.name,
      companySize: person.organization?.estimated_num_employees,
      industry: person.organization?.industry,
      avatarUrl: person.photo_url,
      linkedinUrl: person.linkedin_url,
      enrichedAt: new Date(),
    },
  });
}
```

Call it from the contact-creation route without awaiting it, so the response is not blocked on a third-party API (on serverless hosts use your platform's background-task hook, such as `after()` in Next.js 15+):

```typescript
const contact = await prisma.contact.create({ data: { email, name } });
enrichContact(contact.id, email).catch(console.error);
return Response.json(contact, { status: 201 });
```

## Step 3 — Kanban Pipeline View

Columns are stages, cards are deals. Dragging a card calls `PATCH`, which also resets the win probability for the new stage. The database does the per-stage sums with `groupBy`; the browser only renders them.

```typescript
// src/app/api/pipeline/route.ts
import { prisma } from "@/lib/prisma";
import { DealStage } from "@/generated/prisma/client";
const BOARD = [DealStage.LEAD, DealStage.QUALIFIED, DealStage.PROPOSAL, DealStage.CLOSED_WON];
const PROBABILITY = { LEAD: 10, QUALIFIED: 30, PROPOSAL: 60, CLOSED_WON: 100, CLOSED_LOST: 0 };
export async function GET() {
  const [deals, sums] = await Promise.all([
    prisma.deal.findMany({
      where: { stage: { in: BOARD } }, orderBy: { updatedAt: "desc" },
      include: { contact: { select: { name: true, company: true, avatarUrl: true } } },
    }),
    prisma.deal.groupBy({ by: ["stage"], _sum: { value: true } }),
  ]);
  const columns = BOARD.map((stage) => ({
    stage,
    totalValue: Number(sums.find((s) => s.stage === stage)?._sum.value ?? 0),
    deals: deals.filter((d) => d.stage === stage),
  }));
  const openValue = columns
    .filter((c) => c.stage !== DealStage.CLOSED_WON)
    .reduce((sum, c) => sum + c.totalValue, 0);
  return Response.json({ columns, openValue });
}

export async function PATCH(request: Request) {
  const { dealId, stage } = await request.json();
  if (!Object.values(DealStage).includes(stage)) return Response.json({ error: "Unknown stage" }, { status: 400 });
  const data = { stage, probability: PROBABILITY[stage as DealStage] };
  return Response.json(await prisma.deal.update({ where: { id: dealId }, data }));
}
```

## Step 4 — Gmail Thread Sync per Contact

Pull the email threads for a contact's address so the conversation history shows up without copy-pasting. Each user connects their own Gmail through Google OAuth and you keep the refresh token (encrypt it at rest). The read-only scope `https://www.googleapis.com/auth/gmail.readonly` is enough; Gmail read scopes need Google's OAuth app verification unless the app is internal to your own Workspace organization (see Google's Gmail API scopes page).

```typescript
// src/lib/gmail.ts
import { google } from "googleapis";
import { prisma } from "./prisma";
export async function syncGmailForContact(contactId: string, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const contact = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!user?.gmailRefreshToken || !contact) return;
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: user.gmailRefreshToken }); // access tokens are fetched as needed
  const gmail = google.gmail({ version: "v1", auth });

  const { data } = await gmail.users.threads.list({
    userId: "me", maxResults: 20, q: `from:${contact.email} OR to:${contact.email}`,
  });
  for (const thread of data.threads ?? []) {
    const { data: full } = await gmail.users.threads.get({
      userId: "me", id: thread.id!, format: "metadata", metadataHeaders: ["Subject", "Date"],
    });
    const headers = full.messages?.[0]?.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "(no subject)";
    const date = headers.find((h) => h.name === "Date")?.value;
    const body = `${full.messages?.length ?? 1} messages`;
    await prisma.activity.upsert({
      where: { userId_gmailThreadId: { userId, gmailThreadId: thread.id! } },
      create: { type: "EMAIL", subject, body, contactId, userId, gmailThreadId: thread.id!,
                occurredAt: date ? new Date(date) : new Date() },
      update: { body },
    });
  }
}
```
The unique key `(userId, gmailThreadId)` makes re-syncing idempotent.

## Step 5 — Pipeline Report Email with Resend

Every Monday at 9 AM, email the sales manager the open pipeline, the last 30 days of wins, and the win rate. Verify a sending domain in Resend first (SPF and DKIM); `onboarding@resend.dev` is for testing only. The SDK returns `{ data, error }` instead of throwing, so check `error`.

```typescript
// src/lib/reports.ts
import { Resend } from "resend";
import { prisma } from "./prisma";
const resend = new Resend(process.env.RESEND_API_KEY);
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
export async function sendWeeklyPipelineReport(managerEmail: string) {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [active, won, lost] = await Promise.all([
    prisma.deal.findMany({
      where: { stage: { in: ["LEAD", "QUALIFIED", "PROPOSAL"] } },
      include: { contact: { select: { name: true } } },
      orderBy: { value: "desc" },
    }),
    prisma.deal.aggregate({
      where: { stage: "CLOSED_WON", updatedAt: { gte: since } },
      _sum: { value: true }, _count: true,
    }),
    prisma.deal.count({ where: { stage: "CLOSED_LOST", updatedAt: { gte: since } } }),
  ]);
  const open = active.reduce((s, d) => s + Number(d.value), 0);
  const wonValue = Number(won._sum.value ?? 0);
  const winRate = won._count + lost ? Math.round((won._count / (won._count + lost)) * 100) : 0;

  const { error } = await resend.emails.send({
    from: "CRM <reports@mail.yourdomain.com>", // a domain verified in Resend
    to: managerEmail,
    subject: `Weekly pipeline: ${money(open)} open`,
    html: `<p><strong>Open pipeline:</strong> ${money(open)} across ${active.length} deals</p>
      <p><strong>Won, last 30 days:</strong> ${money(wonValue)} (${won._count} deals), win rate ${winRate}%</p>
      <ul>${active.map((d) => `<li>${esc(d.contact.name)} — ${esc(d.title)} — ${money(Number(d.value))}</li>`).join("")}</ul>`,
  });
  if (error) throw new Error(`Resend: ${error.message}`);
}
```

Run it from a scheduler you already have, for example a crontab entry `0 9 * * 1` that calls a script wrapping `sendWeeklyPipelineReport`, or your host's cron feature.

## Results

Marcus's team switched after a weekend of building. Three months later, in their own words:

- The monthly CRM bill is gone; they now pay for a small managed Postgres instance and hosting. The Resend free plan (100 emails per day) covers one weekly report.
- All five reps use the pipeline view daily; logging an activity takes two clicks, and the manager gets a Monday email instead of building reports by hand.

## Related Skills

- [prisma](/skills/prisma) — Schema, migrations and the typed client used for the data model
- [resend](/skills/resend) — Sends the weekly pipeline report
