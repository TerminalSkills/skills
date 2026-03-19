---
title: Build an Email Sequence Automation System
slug: build-email-sequence-automation
description: Build a full email automation engine — trigger sequences on user events, send personalized emails with delays, handle unsubscribes, and track open rates without paying for HubSpot or Mailchimp.
skills:
  - resend
  - prisma
tags:
  - email
  - marketing
  - automation
  - saas
  - onboarding
---

## The Problem

Lisa is building a SaaS. She gets 1000 signups a month. She knows she should be sending an onboarding sequence — welcome email, day 3 check-in, day 7 "are you getting value" nudge — but she's been sending one manual email to new users and then hoping for the best.

She looked at HubSpot ($800/month), Mailchimp ($350/month), and Drip ($400/month). They all work, but she doesn't need 95% of the features, and she'd rather own the data and build the integrations she actually needs.

Lisa wants to roll her own: a simple sequence engine that triggers on product events, handles delays, personalizes by user data, tracks opens and clicks, and respects unsubscribes.

## The Solution

Use prisma to store sequences, enrollments, scheduled jobs, and analytics. Use resend to send emails with open/click tracking and manage unsubscribes. A cron job processes the queue every 5 minutes.

## Step-by-Step Walkthrough

### Step 1: Define the Database Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Email sequences (e.g., "Onboarding", "Trial Expiry Nurture")
model Sequence {
  id          String         @id @default(cuid())
  name        String
  trigger     String         // 'signup', 'trial_started', 'feature_used', 'manual'
  active      Boolean        @default(true)
  createdAt   DateTime       @default(now())
  
  steps       SequenceStep[]
  enrollments Enrollment[]
}

// Individual emails in a sequence, with delays
model SequenceStep {
  id             String    @id @default(cuid())
  sequenceId     String
  sequence       Sequence  @relation(fields: [sequenceId], references: [id])
  stepNumber     Int       // 1, 2, 3...
  delayDays      Int       // days after previous step (or after enrollment for step 1)
  subject        String    // supports {{name}}, {{company}} placeholders
  bodyHtml       String    // HTML template with placeholders
  bodyText       String    // plain text version
  
  @@unique([sequenceId, stepNumber])
}

// Track which users are in which sequences
model Enrollment {
  id              String    @id @default(cuid())
  sequenceId      String
  sequence        Sequence  @relation(fields: [sequenceId], references: [id])
  userId          String
  email           String
  userData        Json      // name, company, any personalization data
  enrolledAt      DateTime  @default(now())
  currentStep     Int       @default(0)
  status          String    @default("active")  // active | completed | unsubscribed | paused
  completedAt     DateTime?
  
  jobs            EmailJob[]
  
  @@unique([sequenceId, userId])
  @@index([status])
}

// Scheduled email jobs — the queue
model EmailJob {
  id           String     @id @default(cuid())
  enrollmentId String
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
  stepNumber   Int
  scheduledFor DateTime
  status       String     @default("pending")  // pending | sent | failed | skipped
  sentAt       DateTime?
  resendId     String?    // Resend message ID for tracking
  error        String?
  
  @@index([status, scheduledFor])
}

// Unsubscribes — global, not per-sequence
model Unsubscribe {
  email       String   @id
  reason      String?
  createdAt   DateTime @default(now())
}

// Analytics events
model EmailEvent {
  id          String   @id @default(cuid())
  resendId    String
  event       String   // 'delivered', 'opened', 'clicked', 'bounced', 'complained'
  email       String
  metadata    Json?
  createdAt   DateTime @default(now())
  
  @@index([resendId])
  @@index([email, event])
}
```

### Step 2: Enroll Users in Sequences

```typescript
// enrollment/enroll.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface UserData {
  name?: string;
  company?: string;
  planType?: string;
  [key: string]: string | undefined;
}

/**
 * Enroll a user in a sequence. 
 * Idempotent — won't double-enroll.
 * Schedules the first email immediately.
 */
export async function enrollUser(
  triggerName: string,
  userId: string,
  email: string,
  userData: UserData
): Promise<void> {
  // Check unsubscribe status first
  const unsub = await prisma.unsubscribe.findUnique({ where: { email } });
  if (unsub) {
    console.log(`Skipping enrollment for unsubscribed ${email}`);
    return;
  }

  // Find active sequences for this trigger
  const sequences = await prisma.sequence.findMany({
    where: { trigger: triggerName, active: true },
    include: { steps: { orderBy: { stepNumber: 'asc' } } },
  });

  for (const sequence of sequences) {
    if (!sequence.steps.length) continue;

    // Check for existing enrollment
    const existing = await prisma.enrollment.findUnique({
      where: { sequenceId_userId: { sequenceId: sequence.id, userId } },
    });
    if (existing) continue;  // already enrolled

    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        sequenceId: sequence.id,
        userId,
        email,
        userData,
        currentStep: 0,
      },
    });

    // Schedule all steps upfront
    let totalDelayDays = 0;
    for (const step of sequence.steps) {
      totalDelayDays += step.delayDays;
      const scheduledFor = new Date();
      scheduledFor.setDate(scheduledFor.getDate() + totalDelayDays);
      scheduledFor.setHours(9, 0, 0, 0);  // 9 AM delivery

      await prisma.emailJob.create({
        data: {
          enrollmentId: enrollment.id,
          stepNumber: step.stepNumber,
          scheduledFor,
          status: 'pending',
        },
      });
    }

    console.log(`Enrolled ${email} in "${sequence.name}" (${sequence.steps.length} emails)`);
  }
}
```

### Step 3: Process the Email Queue

```typescript
// queue/processor.ts
import { PrismaClient } from '@prisma/client';
import { Resend } from 'resend';

const prisma = new PrismaClient();
const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Interpolate template placeholders.
 * {{name}} → "Lisa", {{company}} → "Acme Inc"
 */
function interpolate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => data[key] || '');
}

/**
 * Process all pending emails due to be sent.
 * Run this every 5 minutes via cron.
 */
export async function processQueue(): Promise<void> {
  const now = new Date();

  const jobs = await prisma.emailJob.findMany({
    where: {
      status: 'pending',
      scheduledFor: { lte: now },
    },
    include: {
      enrollment: {
        include: {
          sequence: {
            include: { steps: true },
          },
        },
      },
    },
    take: 50,  // process 50 at a time
    orderBy: { scheduledFor: 'asc' },
  });

  console.log(`Processing ${jobs.length} email jobs...`);

  for (const job of jobs) {
    const { enrollment } = job;

    // Skip if unsubscribed or enrollment cancelled
    if (enrollment.status !== 'active') {
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { status: 'skipped' },
      });
      continue;
    }

    // Check unsubscribe list
    const unsub = await prisma.unsubscribe.findUnique({
      where: { email: enrollment.email },
    });
    if (unsub) {
      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'unsubscribed' },
      });
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { status: 'skipped' },
      });
      continue;
    }

    // Find the step
    const step = enrollment.sequence.steps.find(s => s.stepNumber === job.stepNumber);
    if (!step) {
      await prisma.emailJob.update({ where: { id: job.id }, data: { status: 'skipped' } });
      continue;
    }

    // Interpolate templates
    const userData = enrollment.userData as Record<string, string>;
    const subject = interpolate(step.subject, userData);
    const html = interpolate(step.bodyHtml, userData);
    const text = interpolate(step.bodyText, userData);

    try {
      const result = await resend.emails.send({
        from: process.env.FROM_EMAIL!,
        to: enrollment.email,
        subject,
        html: `${html}\n<br/><br/><a href="${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(enrollment.email)}" style="color:#999;font-size:12px;">Unsubscribe</a>`,
        text: `${text}\n\nUnsubscribe: ${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(enrollment.email)}`,
        tags: [
          { name: 'sequence', value: enrollment.sequence.name.replace(/\s+/g, '-').toLowerCase() },
          { name: 'step', value: `step-${job.stepNumber}` },
          { name: 'enrollment', value: enrollment.id },
        ],
      });

      await prisma.emailJob.update({
        where: { id: job.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          resendId: result.data?.id,
        },
      });

      await prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { currentStep: job.stepNumber },
      });

      console.log(`✓ Sent "${subject}" to ${enrollment.email}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Failed to send to ${enrollment.email}:`, message);
      await prisma.emailJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: message },
      });
    }
  }
}
```

### Step 4: Handle Unsubscribes and Analytics

```typescript
// webhooks/resend.ts — Process Resend webhooks for analytics
import { PrismaClient } from '@prisma/client';
import type { Request, Response } from 'express';

const prisma = new PrismaClient();

interface ResendWebhookEvent {
  type: string;
  data: {
    email_id: string;
    to?: string[];
    click?: { link: string };
  };
}

export async function handleResendWebhook(req: Request, res: Response): Promise<void> {
  const event = req.body as ResendWebhookEvent;

  await prisma.emailEvent.create({
    data: {
      resendId: event.data.email_id,
      event: event.type.replace('email.', ''),
      email: event.data.to?.[0] || '',
      metadata: event.data as any,
    },
  });

  res.json({ received: true });
}

// api/unsubscribe.ts
export async function handleUnsubscribe(email: string, reason?: string): Promise<void> {
  await prisma.unsubscribe.upsert({
    where: { email },
    create: { email, reason },
    update: { reason },
  });

  // Cancel all pending jobs for this email
  const enrollments = await prisma.enrollment.findMany({
    where: { email, status: 'active' },
  });

  for (const enrollment of enrollments) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'unsubscribed' },
    });
  }

  console.log(`Unsubscribed: ${email}`);
}
```

### Step 5: Seed Sequences and Wire It All Together

```typescript
// setup/seed-sequences.ts — Create your sequences
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedSequences() {
  // Onboarding sequence — triggered on 'signup'
  const onboarding = await prisma.sequence.create({
    data: {
      name: 'New User Onboarding',
      trigger: 'signup',
      steps: {
        create: [
          {
            stepNumber: 1,
            delayDays: 0,  // send immediately
            subject: 'Welcome to the app, {{name}} 👋',
            bodyHtml: `<p>Hi {{name}},</p><p>Welcome! Here's how to get started in 5 minutes...</p>`,
            bodyText: `Hi {{name}}, Welcome! Here's how to get started...`,
          },
          {
            stepNumber: 2,
            delayDays: 3,
            subject: 'How\'s it going, {{name}}?',
            bodyHtml: `<p>Hi {{name}},</p><p>You signed up 3 days ago. Have you had a chance to try {{feature}}?</p>`,
            bodyText: `Hi {{name}}, You signed up 3 days ago...`,
          },
          {
            stepNumber: 3,
            delayDays: 4,  // day 7 total
            subject: 'Quick question about your goals',
            bodyHtml: `<p>Hi {{name}}, What's the #1 thing you're trying to accomplish?</p>`,
            bodyText: `Hi {{name}}, What's the #1 thing you're trying to accomplish?`,
          },
        ],
      },
    },
  });

  console.log(`Created sequence: ${onboarding.name}`);
}

seedSequences();

// index.ts — Integration point
import { enrollUser } from './enrollment/enroll';
import { processQueue } from './queue/processor';

// Call this when a user signs up
export async function onUserSignup(userId: string, email: string, name: string, company?: string) {
  await enrollUser('signup', userId, email, { name, company: company || '' });
}

// Call this from cron (every 5 minutes)
export async function runQueueProcessor() {
  await processQueue();
}
```

## What You've Built

A full email sequence engine: trigger-based enrollment, scheduled delivery queue, personalization with template variables, unsubscribe handling, and open/click analytics via Resend webhooks — all for the cost of Resend's API (free up to 3000 emails/month, then $20/month).

**Next steps:** Add a visual sequence builder UI to create and edit sequences without code changes. Build an analytics dashboard showing open rates and conversion per sequence step. Add A/B testing support — split users between two subject lines and track which wins.
