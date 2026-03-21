---
title: Build an Expense Reporting and Approval Workflow for Teams
slug: build-expense-reporting-tool
description: Build a custom expense management system — submit expenses with receipt photos, AI-powered OCR auto-fill, multi-level approval workflow, Stripe payouts for reimbursement, and per-team budget tracking — replacing $50/user/month expense software.
skills:
  - anthropic-sdk
  - stripe
  - prisma
category: business
tags:
  - expenses
  - ai
  - ocr
  - approval-workflow
  - stripe
  - finance
---

# Build an Expense Reporting and Approval Workflow for Teams

David is the CFO of a 60-person startup. They pay $3,000/month for Expensify ($50/user). The expense submission UX is clunky, receipt scanning misidentifies amounts 30% of the time, and he can't customize the approval chain without calling their sales team. He wants to build a replacement: employees snap a receipt, Claude reads it, the manager approves, and the money lands in their bank account via Stripe. Total cost target: under $200/month.

## Step 1 — Data Model: Expenses, Approval Workflow, Budgets

```prisma
// prisma/schema.prisma — Expense reporting system data model.

model Expense {
  id           String    @id @default(cuid())
  submitterId  String
  submitter    User      @relation("ExpenseSubmitter", fields: [submitterId], references: [id])
  teamId       String
  team         Team      @relation(fields: [teamId], references: [id])
  amount       Int       // cents
  currency     String    @default("USD")
  category     String    // "travel", "meals", "software", "equipment", "other"
  merchant     String
  description  String
  expenseDate  Date
  receiptUrl   String?   // S3/R2 URL of uploaded receipt
  ocrData      Json?     // Raw Claude extraction result
  status       String    @default("pending") // "pending" | "approved" | "rejected" | "paid"
  approvals    ExpenseApproval[]
  payoutId     String?   // Stripe payout ID after reimbursement
  paidAt       DateTime?
  createdAt    DateTime  @default(now())
}

model ExpenseApproval {
  id         String   @id @default(cuid())
  expenseId  String
  expense    Expense  @relation(fields: [expenseId], references: [id])
  approverId String
  approver   User     @relation("ExpenseApprover", fields: [approverId], references: [id])
  level      Int      // 1 = manager, 2 = finance
  status     String   @default("pending") // "pending" | "approved" | "rejected"
  comment    String?
  reviewedAt DateTime?
  createdAt  DateTime @default(now())
}

model Team {
  id       String    @id @default(cuid())
  name     String
  managerId String
  manager  User      @relation("TeamManager", fields: [managerId], references: [id])
  members  User[]    @relation("TeamMember")
  expenses Expense[]
  budgets  TeamBudget[]
}

model TeamBudget {
  id        String   @id @default(cuid())
  teamId    String
  team      Team     @relation(fields: [teamId], references: [id])
  category  String?  // null = total budget across all categories
  monthYear String   // "2026-03"
  limitCents Int
  spentCents Int     @default(0) // Denormalized — updated on approval

  @@unique([teamId, category, monthYear])
}

model User {
  id                String    @id @default(cuid())
  name              String
  email             String    @unique
  role              String    @default("employee") // "employee" | "manager" | "finance" | "admin"
  teamId            String?
  team              Team?     @relation("TeamMember", fields: [teamId], references: [id])
  stripeAccountId   String?   // Stripe Connect account for payouts
  submittedExpenses Expense[] @relation("ExpenseSubmitter")
  approvals         ExpenseApproval[] @relation("ExpenseApprover")
  managedTeam       Team?     @relation("TeamManager")
}
```

## Step 2 — AI Receipt Scanning with Claude Vision

```typescript
// src/lib/ocr.ts — Extract expense data from receipt photos using Claude.
// Claude reads the receipt image and returns structured JSON.
// Saves the company $0.02 per receipt vs. dedicated OCR APIs.

import Anthropic from "@anthropic-sdk/sdk";
import { uploadToStorage, getSignedUrl } from "./storage";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

interface ExtractedReceiptData {
  amount: number | null;        // Detected total in cents
  currency: string | null;
  merchant: string | null;
  date: string | null;          // ISO date string
  category: string | null;      // Inferred category
  lineItems: { description: string; amount: number }[];
  confidence: "high" | "medium" | "low";
}

export async function extractReceiptData(imageBuffer: Buffer, mimeType: string): Promise<ExtractedReceiptData> {
  const base64 = imageBuffer.toString("base64");

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mimeType as any, data: base64 },
          },
          {
            type: "text",
            text: `Analyze this receipt and extract the following information as JSON:
{
  "amount": <total amount in cents as integer, null if unclear>,
  "currency": <3-letter currency code, e.g. "USD", "EUR", null if unclear>,
  "merchant": <merchant/vendor name, null if unclear>,
  "date": <date in ISO format YYYY-MM-DD, null if unclear>,
  "category": <one of: "travel", "meals", "software", "equipment", "other">,
  "lineItems": [{"description": "...", "amount": <cents>}],
  "confidence": <"high" if all fields clear, "medium" if some unclear, "low" if mostly unclear>
}

Return ONLY valid JSON, no explanation.`,
          },
        ],
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  try {
    return JSON.parse(content.text) as ExtractedReceiptData;
  } catch {
    return {
      amount: null, currency: null, merchant: null, date: null,
      category: null, lineItems: [], confidence: "low",
    };
  }
}
```

```typescript
// src/app/api/expenses/upload-receipt/route.ts
// Upload receipt → Claude extracts data → return pre-filled form values.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadToStorage } from "@/lib/storage";
import { extractReceiptData } from "@/lib/ocr";
import { nanoid } from "nanoid";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("receipt") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `receipts/${session.user.id}/${nanoid()}-${file.name}`;
  const receiptUrl = await uploadToStorage(buffer, key, file.type);

  // Extract data with Claude — ~1 second average
  const extracted = await extractReceiptData(buffer, file.type);

  return NextResponse.json({ receiptUrl, extracted });
}
```

## Step 3 — Multi-Level Approval Workflow

```typescript
// src/lib/approvals.ts — Approval workflow engine.
// Level 1: direct manager. Level 2: finance team (for amounts > $500).
// Each level must approve before the next is notified.

import { db } from "@/lib/db";
import { sendApprovalRequest, sendApprovalNotification } from "./email";

const FINANCE_THRESHOLD_CENTS = 50_000; // $500 — requires finance sign-off

export async function initiateApprovalWorkflow(expenseId: string) {
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { submitter: { include: { team: { include: { manager: true } } } } },
  });

  const manager = expense.submitter.team?.manager;
  if (!manager) throw new Error("Employee has no manager assigned");

  // Always create level 1 (manager) approval
  const level1 = await db.expenseApproval.create({
    data: {
      expenseId,
      approverId: manager.id,
      level: 1,
      status: "pending",
    },
  });

  // Create level 2 (finance) if above threshold
  if (expense.amount >= FINANCE_THRESHOLD_CENTS) {
    const financeUsers = await db.user.findMany({ where: { role: "finance" } });
    for (const financeUser of financeUsers) {
      await db.expenseApproval.create({
        data: { expenseId, approverId: financeUser.id, level: 2, status: "pending" },
      });
    }
  }

  // Notify level 1 approver
  await sendApprovalRequest(manager, expense, 1);
}

export async function processApproval(
  approvalId: string,
  decision: "approved" | "rejected",
  approverId: string,
  comment?: string
) {
  const approval = await db.expenseApproval.findUniqueOrThrow({
    where: { id: approvalId },
    include: { expense: { include: { submitter: true, approvals: true } } },
  });

  if (approval.approverId !== approverId) {
    throw new Error("Not authorized to approve this expense");
  }

  // Update this approval
  await db.expenseApproval.update({
    where: { id: approvalId },
    data: { status: decision, comment, reviewedAt: new Date() },
  });

  if (decision === "rejected") {
    // Reject the whole expense
    await db.expense.update({ where: { id: approval.expenseId }, data: { status: "rejected" } });
    await sendApprovalNotification(approval.expense.submitter, approval.expense, "rejected", comment);
    return;
  }

  // Check if all approvals at this level are done
  const siblingsAtLevel = approval.expense.approvals.filter((a) => a.level === approval.level);
  const allLevelApproved = siblingsAtLevel.every(
    (a) => a.id === approvalId ? true : a.status === "approved"
  );

  if (!allLevelApproved) return; // Wait for other approvers at this level

  // Check if there's a next level
  const nextLevelPending = approval.expense.approvals.find(
    (a) => a.level === approval.level + 1 && a.status === "pending"
  );

  if (nextLevelPending) {
    // Notify level 2 approvers
    const level2Approvers = await db.user.findMany({
      where: { id: { in: approval.expense.approvals.filter((a) => a.level === 2).map((a) => a.approverId) } },
    });
    for (const approver of level2Approvers) {
      await sendApprovalRequest(approver, approval.expense, 2);
    }
  } else {
    // All levels approved — mark expense as approved
    await db.expense.update({ where: { id: approval.expenseId }, data: { status: "approved" } });
    await sendApprovalNotification(approval.expense.submitter, approval.expense, "approved");
    // Update team budget
    await updateTeamBudget(approval.expense);
  }
}

async function updateTeamBudget(expense: any) {
  const monthYear = expense.expenseDate.toISOString().slice(0, 7);
  await db.teamBudget.upsert({
    where: { teamId_category_monthYear: { teamId: expense.teamId, category: expense.category, monthYear } },
    create: { teamId: expense.teamId, category: expense.category, monthYear, limitCents: 0, spentCents: expense.amount },
    update: { spentCents: { increment: expense.amount } },
  });
}
```

## Step 4 — Reimbursement via Stripe Connect Payouts

```typescript
// src/lib/payouts.ts — Reimburse employees via Stripe Connect.
// Each employee needs a Stripe Connect account (Express onboarding — ~5 minutes).
// Finance clicks "Pay" → money arrives in 1–2 business days.

import { stripe } from "./stripe";
import { db } from "./db";

export async function onboardEmployeeForPayouts(userId: string): Promise<string> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });

  let accountId = user.stripeAccountId;

  if (!accountId) {
    // Create Stripe Express account
    const account = await stripe.accounts.create({
      type: "express",
      email: user.email,
      capabilities: { transfers: { requested: true } },
      business_type: "individual",
      settings: { payouts: { schedule: { interval: "manual" } } },
    });

    accountId = account.id;
    await db.user.update({ where: { id: userId }, data: { stripeAccountId: account.id } });
  }

  // Generate onboarding link
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payouts`,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/payouts?connected=true`,
    type: "account_onboarding",
  });

  return link.url;
}

export async function reimburseExpense(expenseId: string) {
  const expense = await db.expense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { submitter: true },
  });

  if (expense.status !== "approved") throw new Error("Expense not approved");
  if (!expense.submitter.stripeAccountId) throw new Error("Employee not onboarded for payouts");

  // Transfer from platform account to employee's Stripe account
  const transfer = await stripe.transfers.create({
    amount: expense.amount,
    currency: expense.currency.toLowerCase(),
    destination: expense.submitter.stripeAccountId,
    description: `Expense reimbursement: ${expense.merchant} — ${expense.description}`,
    metadata: { expenseId: expense.id },
  });

  // Trigger payout to employee's bank account
  const payout = await stripe.payouts.create(
    { amount: expense.amount, currency: expense.currency.toLowerCase() },
    { stripeAccount: expense.submitter.stripeAccountId }
  );

  await db.expense.update({
    where: { id: expenseId },
    data: { status: "paid", payoutId: payout.id, paidAt: new Date() },
  });

  return { transferId: transfer.id, payoutId: payout.id };
}
```

## Step 5 — Budget Dashboard and CSV Export

```typescript
// src/app/api/finance/budgets/route.ts — Budget overview for finance dashboard.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  const { searchParams } = new URL(req.url);
  const monthYear = searchParams.get("month") ?? new Date().toISOString().slice(0, 7);

  const teams = await db.team.findMany({
    include: {
      budgets: { where: { monthYear } },
      expenses: {
        where: {
          status: { in: ["approved", "paid"] },
          expenseDate: {
            gte: new Date(`${monthYear}-01`),
            lt: new Date(new Date(`${monthYear}-01`).setMonth(new Date(`${monthYear}-01`).getMonth() + 1)),
          },
        },
      },
    },
  });

  const summary = teams.map((team) => {
    const totalApproved = team.expenses.reduce((sum, e) => sum + e.amount, 0);
    const budgetLimit = team.budgets.find((b) => !b.category)?.limitCents ?? null;

    return {
      teamId: team.id,
      teamName: team.name,
      totalApproved,
      budgetLimit,
      utilizationPct: budgetLimit ? Math.round((totalApproved / budgetLimit) * 100) : null,
      byCategory: Object.entries(
        team.expenses.reduce((acc: Record<string, number>, e) => {
          acc[e.category] = (acc[e.category] ?? 0) + e.amount;
          return acc;
        }, {})
      ).map(([category, amount]) => ({ category, amount })),
    };
  });

  return NextResponse.json(summary);
}
```

## Results

David rolled out the system to all 60 employees in week 2.

- **Cost: ~$180/month** — Anthropic API ($40 for ~2,000 receipt scans), Stripe fees (1% transfer fee on payouts), hosting ($30), Resend ($0 on free tier). Saved $2,820/month vs. Expensify.
- **OCR accuracy: 94%** — Claude correctly extracts amount, merchant, and date 94% of the time (vs. 70% for Expensify's OCR on their receipts). Employees still review and can correct; it's a time-saver, not autopilot.
- **Approval time dropped from 4 days to 14 hours** — managers get an email with approve/reject buttons. 73% of approvals happen within 2 hours of the notification.
- **Reimbursement time: 1–2 business days** — Stripe Connect payouts directly to employee bank accounts. Previously, reimbursements went through payroll (monthly delay) or Expensify debit card.
- **Budget visibility** — the finance dashboard shows real-time spend vs. budget for each team. David caught that the engineering team was on track to overspend by $4,000 in March — mid-month, before it happened.
- **Stripe onboarding** — 58 of 60 employees completed Connect onboarding in the first week. The 2 who didn't get paid via the old process (ACH from payroll).
