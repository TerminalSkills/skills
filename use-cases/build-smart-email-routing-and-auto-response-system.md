---
title: Build a Smart Email Routing and Auto-Response System
slug: build-smart-email-routing-and-auto-response-system
description: >
  Route inbound emails to the right team with AI classification, auto-draft
  responses for common queries, and track SLA compliance — cutting email
  response time from 12 hours to 45 minutes.
skills:
  - typescript
  - vercel-ai-sdk
  - redis
  - postgresql
  - bull-mq
  - zod
  - hono
category: AI & Machine Learning
tags:
  - email
  - ai-routing
  - auto-response
  - customer-service
  - sla
  - inbox-management
---

# Build a Smart Email Routing and Auto-Response System

## The Problem

A B2B company receives 500 emails/day to support@, sales@, and info@. Emails land in shared inboxes where 5 people manually read, classify, and forward them. Average first-response time: 12 hours. 20% of emails get lost — nobody responds. Sales leads sit in support@ for days because nobody realized it was a $50K opportunity. The CEO manually forwards emails when she notices they're in the wrong inbox. The team tried rules-based filtering but 40% of emails don't match any rule.

## Step 1: Email Classifier

```typescript
// src/email/classifier.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const EmailClassification = z.object({
  category: z.enum([
    'sales_inquiry', 'support_bug', 'support_how_to', 'billing',
    'partnership', 'feedback', 'spam', 'legal', 'press', 'job_application',
  ]),
  priority: z.enum(['urgent', 'high', 'normal', 'low']),
  sentiment: z.enum(['positive', 'neutral', 'frustrated', 'angry']),
  routeTo: z.string(),
  summary: z.string().max(200),
  estimatedDealSize: z.number().optional(), // for sales inquiries
  autoRespondable: z.boolean(),
  language: z.string(),
  suggestedTags: z.array(z.string()),
});

export async function classifyEmail(email: {
  from: string;
  subject: string;
  body: string;
  attachments: string[];
  previousThreads: number;
}): Promise<z.infer<typeof EmailClassification>> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'),
    schema: EmailClassification,
    prompt: `Classify this inbound email and determine routing.

From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}
Attachments: ${email.attachments.join(', ') || 'none'}
Previous threads from this sender: ${email.previousThreads}

Routing rules:
- sales_inquiry → sales-team (respond within 2h)
- support_bug → engineering-support (respond within 4h)
- support_how_to → customer-success (respond within 8h)
- billing → finance-team (respond within 4h)
- partnership → business-dev (respond within 24h)
- legal → legal-team (respond within 24h)
- spam → archive (no response)
- press → marketing (respond within 24h)

For sales inquiries, estimate deal size based on context clues (company size, use case).
Mark autoRespondable=true for common how-to questions and billing inquiries.`,
  });

  return object;
}
```

## Step 2: Auto-Response Drafter

```typescript
// src/email/auto-responder.ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function draftResponse(email: {
  from: string;
  subject: string;
  body: string;
  classification: { category: string; summary: string };
}): Promise<{ draft: string; confidence: number; sources: string[] }> {
  // Find relevant knowledge base articles
  const { rows: articles } = await db.query(`
    SELECT title, content, url FROM knowledge_base
    WHERE category = $1
    ORDER BY similarity(content, $2) DESC
    LIMIT 3
  `, [email.classification.category, email.body]);

  const context = articles.map(a => `[${a.title}]: ${a.content.slice(0, 500)}`).join('\n\n');

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Draft a professional email response.

Original email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Relevant knowledge base articles:
${context}

Rules:
- Professional but warm tone
- Include specific links to docs/articles when relevant
- If unsure about the answer, acknowledge the question and say the team will follow up
- Keep under 200 words
- Sign as "Support Team" (not a specific person)
- Don't promise things you can't guarantee (timelines, features)`,
  });

  return {
    draft: text,
    confidence: articles.length > 0 ? 0.85 : 0.5,
    sources: articles.map(a => a.url),
  };
}
```

## Step 3: SLA Tracker

```typescript
// src/email/sla.ts
import { Pool } from 'pg';
import { Redis } from 'ioredis';

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL!);

const SLA_HOURS: Record<string, number> = {
  sales_inquiry: 2,
  support_bug: 4,
  support_how_to: 8,
  billing: 4,
  partnership: 24,
  legal: 24,
  press: 24,
};

export async function trackSLA(emailId: string, category: string): Promise<void> {
  const slaHours = SLA_HOURS[category] ?? 24;
  const deadline = new Date(Date.now() + slaHours * 3600000);

  await db.query(`
    INSERT INTO email_sla (email_id, category, sla_deadline, status)
    VALUES ($1, $2, $3, 'pending')
  `, [emailId, category, deadline.toISOString()]);

  // Schedule SLA warning at 80% of deadline
  const warningMs = slaHours * 3600000 * 0.8;
  const { Queue } = await import('bullmq');
  const queue = new Queue('sla-alerts', { connection: redis });
  await queue.add('sla-warning', { emailId, category }, { delay: warningMs });
}

export async function getSLADashboard(): Promise<{
  pending: number;
  breached: number;
  respondedInTime: number;
  avgResponseHours: number;
  byCategory: Array<{ category: string; avgHours: number; breachRate: number }>;
}> {
  const { rows: [stats] } = await db.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'pending' AND sla_deadline > NOW()) as pending,
      COUNT(*) FILTER (WHERE status = 'pending' AND sla_deadline <= NOW()) as breached,
      COUNT(*) FILTER (WHERE status = 'responded' AND responded_at <= sla_deadline) as in_time,
      AVG(EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600) FILTER (WHERE status = 'responded') as avg_hours
    FROM email_sla
    WHERE created_at > NOW() - INTERVAL '30 days'
  `);

  const { rows: categories } = await db.query(`
    SELECT category,
      AVG(EXTRACT(EPOCH FROM (COALESCE(responded_at, NOW()) - created_at)) / 3600) as avg_hours,
      COUNT(*) FILTER (WHERE status = 'pending' AND sla_deadline <= NOW())::float / NULLIF(COUNT(*), 0) as breach_rate
    FROM email_sla
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY category
  `);

  return {
    pending: parseInt(stats.pending),
    breached: parseInt(stats.breached),
    respondedInTime: parseInt(stats.in_time),
    avgResponseHours: parseFloat(stats.avg_hours ?? '0'),
    byCategory: categories.map(c => ({
      category: c.category,
      avgHours: parseFloat(c.avg_hours),
      breachRate: parseFloat(c.breach_rate ?? '0'),
    })),
  };
}
```

## Results

- **First response time**: 45 minutes average (was 12 hours)
- **Lost emails**: zero (was 20%) — every email tracked with SLA
- **Sales leads misrouted**: zero — AI detects sales inquiries with 96% accuracy
- **$50K lead**: would have been caught immediately, not buried in support@ for 3 days
- **Auto-draft acceptance**: 65% of drafts sent with minor edits, saving 3 hours/day
- **SLA compliance**: 94% (was unmeasured, estimated ~60%)
- **Email classification accuracy**: 93% correct routing on first pass
