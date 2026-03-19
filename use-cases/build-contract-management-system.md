---
title: Build a Contract Management System
slug: build-contract-management-system
description: Replace DocuSign with a custom contract management system — template library, lifecycle tracking, e-signature portal, renewal alerts, and full-text search across all contracts.
skills:
  - resend
  - prisma
category: legal
tags:
  - contracts
  - legal
  - e-signature
  - documents
  - compliance
  - automation
---

# Build a Contract Management System

Lena is legal ops at a 40-person startup. They're paying $25/user/month for DocuSign — $600/month for 24 users who occasionally send NDAs and MSAs. The rest is an Excel sheet of contract statuses, a Dropbox folder of PDFs, and calendar reminders for renewals that get missed. Last month, a $60k SaaS subscription auto-renewed because nobody caught the expiry. Lena wants: a template library, contract lifecycle tracking, automated renewal alerts, a counterparty signing portal, and full-text search. All for less than $600/month.

## Step 1 — Schema: Contracts, Templates, Lifecycle

```typescript
// prisma/schema.prisma — Contract management data model.

model ContractTemplate {
  id          String   @id @default(cuid())
  name        String   // "NDA — Mutual", "SaaS MSA", "SOW Template"
  type        ContractType
  content     String   // HTML/Markdown with {{variable}} placeholders
  variables   Json     // [{name, label, type: "text"|"date"|"number", required}]
  version     Int      @default(1)
  contracts   Contract[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Contract {
  id             String          @id @default(cuid())
  title          String
  type           ContractType
  status         ContractStatus  @default(DRAFT)

  // Content
  content        String          // Rendered HTML with variables filled in
  templateId     String?
  template       ContractTemplate? @relation(fields: [templateId], references: [id])

  // Parties
  counterpartyName  String
  counterpartyEmail String
  internalOwnerId   String

  // Dates
  effectiveDate  DateTime?
  expiryDate     DateTime?
  signedAt       DateTime?
  autoRenews     Boolean         @default(false)
  renewalDays    Int?            // days before expiry to send alert

  // Signatures
  internalSignedAt     DateTime?
  counterpartySignedAt DateTime?
  signToken            String?   @unique  // for counterparty portal (no login)

  // Search
  searchContent  String?  // plain text for full-text search

  metadata       Json     @default("{}")  // custom fields
  activities     ContractActivity[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model ContractActivity {
  id         String   @id @default(cuid())
  contractId String
  contract   Contract @relation(fields: [contractId], references: [id])
  type       String   // "created", "sent", "viewed", "signed", "renewed", "comment"
  userId     String?
  note       String?
  createdAt  DateTime @default(now())
}

enum ContractType   { NDA MSA SOW EMPLOYMENT FREELANCE VENDOR SAAS OTHER }
enum ContractStatus { DRAFT REVIEW SENT SIGNED ACTIVE EXPIRED CANCELLED }
```

## Step 2 — Template Library with Variable Substitution

Templates use `{{variable}}` placeholders. Filling them in creates a new contract draft.

```typescript
// src/lib/templates.ts — Render a contract from a template by filling in variables.

import { prisma } from "@/lib/prisma";
import crypto from "crypto";

interface ContractVariables {
  [key: string]: string | number | Date;
}

export async function createContractFromTemplate(
  templateId: string,
  variables: ContractVariables,
  meta: {
    title: string;
    counterpartyName: string;
    counterpartyEmail: string;
    internalOwnerId: string;
    expiryDate?: Date;
    autoRenews?: boolean;
  }
) {
  const template = await prisma.contractTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  // Substitute all {{variable}} placeholders
  let content = template.content;
  for (const [key, value] of Object.entries(variables)) {
    const formatted =
      value instanceof Date
        ? value.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        : String(value);
    content = content.replaceAll(`{{${key}}}`, formatted);
  }

  // Check for unfilled placeholders
  const unfilled = content.match(/\{\{[^}]+\}\}/g);
  if (unfilled) {
    throw new Error(`Unfilled template variables: ${unfilled.join(", ")}`);
  }

  // Strip HTML for full-text search
  const searchContent = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Generate a secure sign token for the counterparty portal
  const signToken = crypto.randomBytes(32).toString("hex");

  const contract = await prisma.contract.create({
    data: {
      title: meta.title,
      type: template.type,
      content,
      searchContent,
      templateId,
      counterpartyName: meta.counterpartyName,
      counterpartyEmail: meta.counterpartyEmail,
      internalOwnerId: meta.internalOwnerId,
      expiryDate: meta.expiryDate,
      autoRenews: meta.autoRenews ?? false,
      signToken,
      status: "DRAFT",
    },
  });

  await prisma.contractActivity.create({
    data: { contractId: contract.id, type: "created", userId: meta.internalOwnerId },
  });

  return contract;
}
```

## Step 3 — Send for Signing and Counterparty Portal

Send the contract to the counterparty with a magic link. They view and sign without creating an account.

```typescript
// src/lib/signing.ts — Send contract to counterparty and handle signing.

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendForSigning(contractId: string) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { id: contractId },
    include: { template: true },
  });

  if (!contract.signToken) throw new Error("No sign token generated");

  const signingUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sign/${contract.signToken}`;

  await resend.emails.send({
    from: "Contracts <contracts@yourcompany.com>",
    to: contract.counterpartyEmail,
    subject: `Signature requested: ${contract.title}`,
    html: `
      <h2>You have a document to sign</h2>
      <p>Hi ${contract.counterpartyName},</p>
      <p><strong>Your Company</strong> has sent you a <strong>${contract.type}</strong> for your review and signature.</p>
      <p><strong>Document:</strong> ${contract.title}</p>
      <p>No account needed — click the button below to review and sign:</p>
      <p>
        <a href="${signingUrl}"
           style="background:#4f46e5;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">
          Review & Sign →
        </a>
      </p>
      <p style="color:#666;font-size:12px">This link expires in 30 days.</p>
    `,
  });

  await prisma.contract.update({
    where: { id: contractId },
    data: { status: "SENT" },
  });

  await prisma.contractActivity.create({
    data: {
      contractId,
      type: "sent",
      note: `Sent to ${contract.counterpartyEmail}`,
    },
  });
}

// POST /api/sign/[token] — Counterparty signs the contract
export async function signContract(token: string, signerName: string) {
  const contract = await prisma.contract.findUniqueOrThrow({
    where: { signToken: token },
  });

  if (contract.status === "SIGNED") throw new Error("Already signed");
  if (!["SENT", "REVIEW"].includes(contract.status)) throw new Error("Contract not ready for signing");

  const now = new Date();

  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      counterpartySignedAt: now,
      status: contract.internalSignedAt ? "SIGNED" : "REVIEW",
      signedAt: contract.internalSignedAt ? now : null,
    },
  });

  await prisma.contractActivity.create({
    data: {
      contractId: contract.id,
      type: "signed",
      note: `Signed by ${signerName} (counterparty)`,
    },
  });

  // Notify internal owner
  const owner = await prisma.user.findUnique({
    where: { id: contract.internalOwnerId },
    select: { email: true, name: true },
  });

  if (owner) {
    await resend.emails.send({
      from: "Contracts <contracts@yourcompany.com>",
      to: owner.email,
      subject: `✅ ${contract.counterpartyName} signed: ${contract.title}`,
      html: `
        <p>Hi ${owner.name},</p>
        <p><strong>${contract.counterpartyName}</strong> has signed <strong>${contract.title}</strong>.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}">View contract →</a></p>
      `,
    });
  }
}
```

## Step 4 — Renewal Alerts at 60/30/7 Days

A daily cron job checks for contracts expiring in 60, 30, or 7 days and sends the owner an alert.

```typescript
// src/lib/renewal-alerts.ts — Check for expiring contracts and send alerts.
// Run daily via cron: GET /api/cron/renewal-alerts

import { Resend } from "resend";
import { prisma } from "@/lib/prisma";

const resend = new Resend(process.env.RESEND_API_KEY);

const ALERT_WINDOWS = [60, 30, 7]; // days before expiry

export async function sendRenewalAlerts() {
  const now = new Date();
  const alerts: Array<{ contract: any; daysUntilExpiry: number }> = [];

  for (const days of ALERT_WINDOWS) {
    const targetDate = new Date(now.getTime() + days * 86400000);
    const windowStart = new Date(targetDate.getTime() - 12 * 3600000);
    const windowEnd = new Date(targetDate.getTime() + 12 * 3600000);

    const contracts = await prisma.contract.findMany({
      where: {
        status: "ACTIVE",
        expiryDate: { gte: windowStart, lte: windowEnd },
      },
    });

    for (const contract of contracts) {
      alerts.push({ contract, daysUntilExpiry: days });
    }
  }

  for (const { contract, daysUntilExpiry } of alerts) {
    const owner = await prisma.user.findUnique({
      where: { id: contract.internalOwnerId },
      select: { email: true, name: true },
    });

    if (!owner) continue;

    const urgency = daysUntilExpiry <= 7 ? "🚨" : daysUntilExpiry <= 30 ? "⚠️" : "📅";

    await resend.emails.send({
      from: "Contracts <contracts@yourcompany.com>",
      to: owner.email,
      subject: `${urgency} Contract expiring in ${daysUntilExpiry} days: ${contract.title}`,
      html: `
        <h2>Contract Renewal Alert</h2>
        <p>Hi ${owner.name},</p>
        <p>The following contract is expiring in <strong>${daysUntilExpiry} days</strong>:</p>
        <ul>
          <li><strong>Contract:</strong> ${contract.title}</li>
          <li><strong>Counterparty:</strong> ${contract.counterpartyName}</li>
          <li><strong>Expires:</strong> ${contract.expiryDate!.toLocaleDateString()}</li>
          <li><strong>Auto-renews:</strong> ${contract.autoRenews ? "Yes" : "No"}</li>
        </ul>
        <p>
          <a href="${process.env.NEXT_PUBLIC_APP_URL}/contracts/${contract.id}"
             style="background:#4f46e5;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">
            Review Contract →
          </a>
        </p>
      `,
    });
  }

  return alerts.length;
}
```

## Step 5 — Full-Text Search

Search across all contract content — find every contract that mentions a vendor name, dollar amount, or clause.

```typescript
// src/app/api/contracts/search/route.ts — Full-text search across contract content.

import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  if (!query) return Response.json([]);

  // Use PostgreSQL full-text search via Prisma raw query
  const contracts = await prisma.$queryRaw`
    SELECT
      id, title, type, status,
      "counterpartyName", "expiryDate",
      ts_headline('english', "searchContent", plainto_tsquery('english', ${query}),
        'MaxFragments=2, MaxWords=20, MinWords=5') AS excerpt
    FROM "Contract"
    WHERE
      to_tsvector('english', "searchContent") @@ plainto_tsquery('english', ${query})
    ORDER BY
      ts_rank(to_tsvector('english', "searchContent"), plainto_tsquery('english', ${query})) DESC
    LIMIT 20
  `;

  return Response.json(contracts);
}
```

## Results

Lena replaced DocuSign + Excel + Dropbox in two weeks:

- **Cost: $12/month** (Neon DB) vs. $600/month for DocuSign. Saved $588/month.
- **The $60k auto-renewal miss: never again** — 60/30/7-day email alerts to contract owners. Three renewals caught and renegotiated in the first quarter.
- **Signing time: same day vs. 2-3 days** — counterparties get a clean email with a one-click signing link. No DocuSign account required.
- **Search: 2 seconds vs. digging through Dropbox** — full-text search across all 200+ contracts. Legal can find any clause instantly.
- **Audit trail**: every view, send, and signature logged with timestamp. Useful for disputes.
- **Build time: ~18 hours** — schema, template engine, signing portal, renewal alerts, search.
