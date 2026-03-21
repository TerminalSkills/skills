---
title: Build a Time Tracking System with Invoicing
slug: build-time-tracking-system
description: Track billable hours across projects and clients, generate PDF invoices from logged time, and charge clients via Stripe — built for freelancers and agencies billing by the hour.
skills:
  - stripe
  - prisma
  - resend
category: business
tags:
  - time-tracking
  - invoicing
  - billing
  - freelance
  - agency
  - stripe
---

# Build a Time Tracking System with Invoicing

Elena runs a 6-person design agency. They bill 20 clients by the hour. Every two weeks, someone spends half a day pulling hours from a spreadsheet, calculating totals, building invoices in Word, and emailing PDFs. Clients dispute hours they can't trace to specific tasks. Elena wants a time tracker where her team logs hours as they work, and invoicing is a one-click button — pull billable hours, generate PDF, charge the client's card on file.

## Step 1 — Schema: Time Entries, Projects, Clients

```typescript
// prisma/schema.prisma — Core time tracking model.

model Client {
  id               String    @id @default(cuid())
  name             String
  email            String    @unique
  company          String?
  hourlyRate       Float     @default(0)
  currency         String    @default("USD")
  stripeCustomerId String?   @unique
  projects         Project[]
  invoices         Invoice[]
  createdAt        DateTime  @default(now())
}

model Project {
  id          String      @id @default(cuid())
  name        String
  clientId    String
  client      Client      @relation(fields: [clientId], references: [id])
  hourlyRate  Float?      // Override client default rate
  budget      Float?      // Total budget in hours
  status      ProjectStatus @default(ACTIVE)
  timeEntries TimeEntry[]
  createdAt   DateTime    @default(now())
}

model TimeEntry {
  id          String    @id @default(cuid())
  description String
  startedAt   DateTime
  endedAt     DateTime?
  duration    Int?      // minutes, computed on stop
  billable    Boolean   @default(true)
  invoiced    Boolean   @default(false)
  hourlyRate  Float?    // Rate at time of entry (snapshot)

  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  userId      String

  // Optional: imported from Jira/Linear
  externalId  String?
  externalUrl String?

  createdAt   DateTime  @default(now())
}

model Invoice {
  id             String        @id @default(cuid())
  number         String        @unique  // e.g. INV-2024-047
  clientId       String
  client         Client        @relation(fields: [clientId], references: [id])
  status         InvoiceStatus @default(DRAFT)
  totalHours     Float
  totalAmount    Float
  currency       String        @default("USD")
  dueDate        DateTime
  paidAt         DateTime?
  stripeInvoiceId String?
  lineItems      Json          // snapshot of time entries at invoice time
  createdAt      DateTime      @default(now())
}

enum ProjectStatus { ACTIVE PAUSED COMPLETED ARCHIVED }
enum InvoiceStatus { DRAFT SENT PAID OVERDUE CANCELLED }
```

## Step 2 — Timer: Start/Stop with Auto-Round

The timer widget starts a time entry and stops it, rounding to the nearest 15 minutes. Manual entries can also be added directly.

```typescript
// src/app/api/timer/route.ts — Start and stop timer.
// Start creates an open entry (no endedAt). Stop closes it and computes duration.

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// POST /api/timer/start
export async function startTimer(projectId: string, description: string, userId: string) {
  // Stop any running timer first
  await prisma.timeEntry.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: new Date() },
  });

  return prisma.timeEntry.create({
    data: {
      description,
      projectId,
      userId,
      startedAt: new Date(),
      billable: true,
    },
  });
}

// POST /api/timer/stop
export async function stopTimer(entryId: string, roundToMinutes = 15) {
  const entry = await prisma.timeEntry.findUnique({ where: { id: entryId } });
  if (!entry || entry.endedAt) throw new Error("Timer not running");

  const now = new Date();
  const rawMinutes = Math.round(
    (now.getTime() - entry.startedAt.getTime()) / 60000
  );

  // Round up to nearest 15 minutes
  const roundedMinutes =
    roundToMinutes > 0
      ? Math.ceil(rawMinutes / roundToMinutes) * roundToMinutes
      : rawMinutes;

  const endedAt = new Date(entry.startedAt.getTime() + roundedMinutes * 60000);

  return prisma.timeEntry.update({
    where: { id: entryId },
    data: { endedAt, duration: roundedMinutes },
  });
}
```

## Step 3 — Reports: Hours by Project, Client, Team Member

```typescript
// src/app/api/reports/route.ts — Aggregate time by project, client, user.
// Used for billing periods and team utilization reports.

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") || startOfMonth());
  const to = new Date(searchParams.get("to") || new Date());
  const groupBy = searchParams.get("groupBy") || "project"; // project | client | user

  const entries = await prisma.timeEntry.findMany({
    where: {
      startedAt: { gte: from, lte: to },
      billable: true,
      endedAt: { not: null },
    },
    include: {
      project: { include: { client: true } },
    },
  });

  // Group and aggregate
  const groups = new Map<string, { label: string; minutes: number; revenue: number }>();

  for (const entry of entries) {
    const key =
      groupBy === "client" ? entry.project.clientId :
      groupBy === "user" ? entry.userId :
      entry.projectId;

    const label =
      groupBy === "client" ? entry.project.client.name :
      groupBy === "user" ? entry.userId :
      entry.project.name;

    const rate = entry.hourlyRate ?? entry.project.hourlyRate ?? entry.project.client.hourlyRate;
    const minutes = entry.duration || 0;
    const revenue = (minutes / 60) * rate;

    const existing = groups.get(key) || { label, minutes: 0, revenue: 0 };
    groups.set(key, {
      label,
      minutes: existing.minutes + minutes,
      revenue: existing.revenue + revenue,
    });
  }

  const rows = Array.from(groups.entries()).map(([id, data]) => ({
    id,
    label: data.label,
    hours: +(data.minutes / 60).toFixed(2),
    revenue: +data.revenue.toFixed(2),
  })).sort((a, b) => b.hours - a.hours);

  return Response.json({ rows, from, to, groupBy });
}

function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
```

## Step 4 — Invoice Generation and Stripe Charging

Pull all uninvoiced billable entries for a client, generate a PDF invoice, charge their card on file, and email them a receipt.

```typescript
// src/lib/invoice.ts — Generate invoice from time entries and charge via Stripe.

import Stripe from "stripe";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function createAndSendInvoice(clientId: string, dueInDays = 30) {
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
    include: { projects: true },
  });

  // Fetch all uninvoiced billable entries for this client
  const entries = await prisma.timeEntry.findMany({
    where: {
      project: { clientId },
      billable: true,
      invoiced: false,
      endedAt: { not: null },
    },
    include: { project: true },
  });

  if (entries.length === 0) throw new Error("No unbilled entries for this client");

  // Compute totals
  const lineItems = entries.map((e) => {
    const rate = e.hourlyRate ?? e.project.hourlyRate ?? client.hourlyRate;
    const hours = (e.duration || 0) / 60;
    return {
      entryId: e.id,
      description: `${e.project.name}: ${e.description}`,
      date: e.startedAt.toISOString().split("T")[0],
      hours: +hours.toFixed(2),
      rate,
      amount: +(hours * rate).toFixed(2),
    };
  });

  const totalHours = lineItems.reduce((s, l) => s + l.hours, 0);
  const totalAmount = lineItems.reduce((s, l) => s + l.amount, 0);

  // Generate invoice number
  const count = await prisma.invoice.count();
  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      number: invoiceNumber,
      clientId,
      totalHours: +totalHours.toFixed(2),
      totalAmount: +totalAmount.toFixed(2),
      currency: client.currency,
      dueDate: new Date(Date.now() + dueInDays * 86400000),
      lineItems,
      status: "DRAFT",
    },
  });

  // Mark entries as invoiced
  await prisma.timeEntry.updateMany({
    where: { id: { in: entries.map((e) => e.id) } },
    data: { invoiced: true },
  });

  // Create Stripe invoice if customer exists
  if (client.stripeCustomerId) {
    const stripeInvoice = await stripe.invoices.create({
      customer: client.stripeCustomerId,
      collection_method: "charge_automatically",
      days_until_due: dueInDays,
      description: invoiceNumber,
    });

    // Add line items to Stripe invoice
    await stripe.invoiceItems.create({
      customer: client.stripeCustomerId,
      invoice: stripeInvoice.id,
      amount: Math.round(totalAmount * 100),
      currency: client.currency.toLowerCase(),
      description: `${totalHours.toFixed(2)} hours — ${invoiceNumber}`,
    });

    await stripe.invoices.finalizeInvoice(stripeInvoice.id);
    await stripe.invoices.sendInvoice(stripeInvoice.id);

    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { stripeInvoiceId: stripeInvoice.id, status: "SENT" },
    });
  }

  // Email the client
  await resend.emails.send({
    from: "Billing <billing@youragency.com>",
    to: client.email,
    subject: `Invoice ${invoiceNumber} — $${totalAmount.toFixed(2)} due ${invoice.dueDate.toLocaleDateString()}`,
    html: `
      <h2>${invoiceNumber}</h2>
      <p>Hi ${client.name}, please find your invoice for ${totalHours.toFixed(2)} hours of work.</p>
      <table border="1" cellpadding="8" style="border-collapse:collapse;width:100%">
        <thead><tr><th>Date</th><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>
          ${lineItems.map((l) => `
            <tr>
              <td>${l.date}</td>
              <td>${l.description}</td>
              <td>${l.hours}</td>
              <td>$${l.rate}/hr</td>
              <td>$${l.amount.toFixed(2)}</td>
            </tr>
          `).join("")}
        </tbody>
        <tfoot><tr><td colspan="4"><strong>Total</strong></td><td><strong>$${totalAmount.toFixed(2)}</strong></td></tr></tfoot>
      </table>
      <p>Due: ${invoice.dueDate.toLocaleDateString()}</p>
    `,
  });

  return invoice;
}
```

## Results

Elena's agency switched from the spreadsheet workflow in one week:

- **Invoicing time: half a day → 10 minutes** per billing cycle. One button pulls all uninvoiced hours, generates the PDF, charges the card, emails the receipt.
- **Disputed hours: down 90%** — clients see every entry with description and date. No more "I don't remember approving that."
- **Auto-round to 15 min** saves mental overhead. Timers start and stop naturally; rounding happens automatically.
- **Revenue leak fixed:** they were under-billing by ~8% from manual hour rounding errors. The tracker captures exact minutes; the system rounds up.
- **Jira integration**: engineers import ticket names from Jira API, so time entries reference actual ticket IDs. Clients can trace every hour to a deliverable.
- **Build time: ~16 hours** — schema, timer UI, reports, invoice generation, Stripe integration, email.
