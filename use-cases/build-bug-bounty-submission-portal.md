---
title: "Build a Bug Bounty Submission Portal"
description: "Launch your company's first bug bounty program. Researchers register, submit vulnerabilities with CVSS scores, security teams triage and validate, Stripe pays out rewards, and a public hall of fame celebrates top hunters."
skills: [stripe, prisma, resend]
difficulty: intermediate
time_estimate: "6 hours"
tags: [security, bug-bounty, vulnerability, stripe-payouts, infosec, saas]
---

# Build a Bug Bounty Submission Portal

HackerOne charges 20% per payout. Bugcrowd wants a $5k/month contract. You have 3 developers and want a simple, scrappy bug bounty portal you control.

**Build it yourself in a weekend.** Security researchers get paid. You get vulnerabilities fixed. Everyone wins.

## Who This Is For

A security team or CTO at a growing SaaS company launching their first bug bounty program. You want researchers to find your bugs before attackers do — without paying platform fees forever.

## What You'll Build

- 🔐 Researcher registration with identity verification
- 🐛 Vulnerability submission — severity, PoC, CVSS score
- 📋 Triage workflow — in-review → validated → rewarded → closed
- 💸 Stripe payouts to researchers on validation
- 🏆 Hall of fame — public leaderboard of top researchers

## Prerequisites

- Stripe account with payouts enabled
- Resend account for email notifications
- PostgreSQL database

---

## Step 1: Database Schema

```prisma
// schema.prisma
model Researcher {
  id              String        @id @default(cuid())
  email           String        @unique
  username        String        @unique
  fullName        String
  country         String?
  stripeAccountId String?       // Connected account for payouts
  verifiedAt      DateTime?
  totalEarned     Float         @default(0)
  totalFindings   Int           @default(0)
  createdAt       DateTime      @default(now())
  submissions     Submission[]
}

model Submission {
  id             String    @id @default(cuid())
  researcherId   String
  title          String
  description    String    // Full writeup
  stepsToReproduce String
  impact         String
  severity       String    // "critical" | "high" | "medium" | "low" | "informational"
  cvssScore      Float?    // 0.0 - 10.0
  cvssVector     String?   // e.g. CVSS:3.1/AV:N/AC:L/...
  affectedUrl    String?
  attachments    String[]  // S3 URLs for screenshots/PoC files
  status         String    @default("new") // new | triaging | in_review | validated | rewarded | duplicate | informational | not_applicable | closed
  bountyAmount   Float?
  stripePayoutId String?
  paidAt         DateTime?
  internalNotes  String?
  researcher     Researcher @relation(fields: [researcherId], references: [id])
  comments       SubmissionComment[]
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
}

model SubmissionComment {
  id           String     @id @default(cuid())
  submissionId String
  authorType   String     // "researcher" | "security_team"
  authorId     String
  body         String
  internal     Boolean    @default(false) // internal notes not visible to researcher
  createdAt    DateTime   @default(now())
  submission   Submission @relation(fields: [submissionId], references: [id])
}

model BountyTable {
  id          String @id @default(cuid())
  severity    String @unique
  minAmount   Float
  maxAmount   Float
  description String
}
```

```bash
npx prisma migrate dev --name init
# Seed bounty table
```

---

## Step 2: Seed Bounty Ranges

```typescript
// prisma/seed.ts
import { prisma } from '../lib/prisma';

async function main() {
  const bounties = [
    { severity: 'critical', minAmount: 1000, maxAmount: 5000, description: 'RCE, SQLi, auth bypass, data breach' },
    { severity: 'high',     minAmount: 500,  maxAmount: 1000, description: 'Privilege escalation, SSRF, stored XSS' },
    { severity: 'medium',   minAmount: 150,  maxAmount: 500,  description: 'Reflected XSS, IDOR, info disclosure' },
    { severity: 'low',      minAmount: 50,   maxAmount: 150,  description: 'Open redirect, minor info leaks' },
    { severity: 'informational', minAmount: 0, maxAmount: 50, description: 'Best practices, hardening suggestions' },
  ];

  for (const b of bounties) {
    await prisma.bountyTable.upsert({ where: { severity: b.severity }, update: b, create: b });
  }
  console.log('Bounty table seeded');
}

main();
```

---

## Step 3: Submission Handler

```typescript
// lib/submissions.ts
import { prisma } from './prisma';
import { sendSubmissionConfirmation, notifySecurityTeam } from './email';

export async function submitVulnerability(input: {
  researcherId: string;
  title: string; description: string;
  stepsToReproduce: string; impact: string;
  severity: string; cvssScore?: number; cvssVector?: string;
  affectedUrl?: string; attachments?: string[];
}) {
  const submission = await prisma.submission.create({
    data: {
      researcherId: input.researcherId,
      title: input.title,
      description: input.description,
      stepsToReproduce: input.stepsToReproduce,
      impact: input.impact,
      severity: input.severity,
      cvssScore: input.cvssScore,
      cvssVector: input.cvssVector,
      affectedUrl: input.affectedUrl,
      attachments: input.attachments ?? [],
      status: 'new',
    }
  });

  const researcher = await prisma.researcher.findUnique({ where: { id: input.researcherId } });
  if (researcher) {
    await sendSubmissionConfirmation(researcher.email, researcher.username, submission.id, input.title);
    await notifySecurityTeam(submission.id, input.title, input.severity, researcher.username);
  }

  return submission.id;
}

export async function updateSubmissionStatus(
  submissionId: string, status: string, internalNotes?: string, bountyAmount?: number
) {
  const submission = await prisma.submission.update({
    where: { id: submissionId },
    data: { status, internalNotes, ...(bountyAmount !== undefined && { bountyAmount }) },
    include: { researcher: true }
  });

  // Notify researcher of status change
  const { notifyResearcherStatusUpdate } = await import('./email');
  await notifyResearcherStatusUpdate(
    submission.researcher.email, submission.researcher.username,
    submission.id, submission.title, status, bountyAmount
  );

  return submission;
}
```

---

## Step 4: Stripe Payout to Researcher

```typescript
// lib/payouts.ts
import Stripe from 'stripe';
import { prisma } from './prisma';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function setupResearcherStripeAccount(researcherId: string, email: string) {
  // Create Express connected account for the researcher
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: { transfers: { requested: true } },
  });

  await prisma.researcher.update({
    where: { id: researcherId },
    data: { stripeAccountId: account.id }
  });

  // Return onboarding link
  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.APP_URL}/researcher/stripe/refresh`,
    return_url: `${process.env.APP_URL}/researcher/stripe/complete`,
    type: 'account_onboarding',
  });

  return link.url;
}

export async function payoutBounty(submissionId: string) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { researcher: true }
  });

  if (!submission?.bountyAmount) throw new Error('No bounty amount set');
  if (!submission.researcher.stripeAccountId) throw new Error('Researcher Stripe account not connected');
  if (submission.status !== 'validated') throw new Error('Submission must be validated before payout');

  // Transfer from platform to researcher
  const transfer = await stripe.transfers.create({
    amount: Math.round(submission.bountyAmount * 100), // cents
    currency: 'usd',
    destination: submission.researcher.stripeAccountId,
    description: `Bug bounty payout for submission ${submissionId}`,
    metadata: { submissionId, researcherId: submission.researcherId },
  });

  await prisma.submission.update({
    where: { id: submissionId },
    data: { status: 'rewarded', stripePayoutId: transfer.id, paidAt: new Date() }
  });

  // Update researcher stats
  await prisma.researcher.update({
    where: { id: submission.researcherId },
    data: {
      totalEarned: { increment: submission.bountyAmount },
      totalFindings: { increment: 1 },
    }
  });

  return transfer.id;
}
```

---

## Step 5: Email Notifications

```typescript
// lib/email.ts
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendSubmissionConfirmation(email: string, username: string, subId: string, title: string) {
  await resend.emails.send({
    from: 'security@yourcompany.com',
    to: email,
    subject: `Submission received: ${title}`,
    html: `<p>Hi ${username},</p><p>We've received your submission <strong>${title}</strong> (ID: ${subId.slice(0, 8)}).</p><p>Our security team will review it within 5 business days.</p><a href="${process.env.APP_URL}/submissions/${subId}">View submission</a>`,
  });
}

export async function notifySecurityTeam(subId: string, title: string, severity: string, researcher: string) {
  const severityEmoji = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢', informational: '⚪' }[severity] ?? '⚪';
  await resend.emails.send({
    from: 'bugbounty@yourcompany.com',
    to: process.env.SECURITY_TEAM_EMAIL!,
    subject: `${severityEmoji} New ${severity} submission from ${researcher}`,
    html: `<p><strong>${title}</strong></p><p>Researcher: ${researcher}</p><a href="${process.env.APP_URL}/admin/submissions/${subId}">Review now</a>`,
  });
}

export async function notifyResearcherStatusUpdate(
  email: string, username: string, subId: string, title: string, status: string, bounty?: number
) {
  const messages: Record<string, string> = {
    validated: `Your submission "${title}" has been validated! ${bounty ? `You'll receive a $${bounty} payout.` : ''}`,
    rewarded: `💰 Your bounty of $${bounty} for "${title}" has been paid!`,
    duplicate: `Your submission "${title}" was marked as a duplicate.`,
    not_applicable: `Your submission "${title}" was marked as not applicable.`,
    in_review: `Your submission "${title}" is now under review.`,
  };

  const message = messages[status] ?? `Your submission "${title}" status changed to ${status}.`;

  await resend.emails.send({
    from: 'security@yourcompany.com',
    to: email,
    subject: `Submission update: ${title}`,
    html: `<p>Hi ${username},</p><p>${message}</p><a href="${process.env.APP_URL}/submissions/${subId}">View details</a>`,
  });
}
```

---

## Step 6: Hall of Fame (Public Leaderboard)

```typescript
// api/hall-of-fame.ts
import { prisma } from '../lib/prisma';

export async function getHallOfFame() {
  return prisma.researcher.findMany({
    where: { totalFindings: { gt: 0 } },
    select: {
      username: true,
      country: true,
      totalEarned: true,
      totalFindings: true,
      submissions: {
        where: { status: 'rewarded', severity: { in: ['critical', 'high'] } },
        select: { severity: true },
      }
    },
    orderBy: { totalEarned: 'desc' },
    take: 50,
  });
}

// Usage in frontend:
// const leaderboard = await getHallOfFame()
// Render: rank, username, country flag, critical/high count, total earned
```

---

## Admin Triage Workflow

```typescript
// Triage states and transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  new:          ['triaging'],
  triaging:     ['in_review', 'duplicate', 'not_applicable'],
  in_review:    ['validated', 'informational', 'not_applicable'],
  validated:    ['rewarded'],
  rewarded:     ['closed'],
  duplicate:    ['closed'],
  not_applicable: ['closed'],
  informational: ['closed'],
};

export function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
```

---

## Next Steps

- Add PGP encryption for sensitive submission content
- Build a researcher reputation score based on signal/noise ratio
- Add scope definition — list of in-scope domains and out-of-scope targets
- Implement duplicate detection using similarity search on title/description
- Add Slack/Discord integration to notify security channel on critical submissions
