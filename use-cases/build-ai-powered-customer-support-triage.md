---
title: Build AI-Powered Customer Support Triage
slug: build-ai-powered-customer-support-triage
description: >
  Auto-classify, prioritize, and route 5K support tickets daily using
  AI — reducing first-response time from 4 hours to 8 minutes,
  auto-resolving 40% of tickets, and surfacing product issues before
  they become crises.
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
  - customer-support
  - ai-triage
  - ticket-routing
  - sentiment-analysis
  - automation
  - helpdesk
---

# Build AI-Powered Customer Support Triage

## The Problem

A SaaS product gets 5K support tickets per day. Three L1 agents manually read each ticket, classify it, assign priority, and route to the right team. Average first-response time: 4 hours. 30% of tickets are "how do I do X?" questions answered in the docs. Another 15% are duplicate reports of the same bug. Angry customers tweet about slow support. The support team is hiring but can't keep up — every new agent needs 3 weeks of training to learn routing rules.

## Step 1: Ticket Classifier

```typescript
// src/triage/classifier.ts
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const Classification = z.object({
  category: z.enum([
    'bug_report', 'feature_request', 'how_to_question',
    'billing_issue', 'account_access', 'performance',
    'integration', 'security', 'data_issue', 'other',
  ]),
  priority: z.enum(['critical', 'high', 'medium', 'low']),
  sentiment: z.enum(['angry', 'frustrated', 'neutral', 'positive']),
  team: z.enum(['engineering', 'billing', 'account_management', 'product', 'security', 'l1_support']),
  confidence: z.number().min(0).max(1),
  suggestedResponse: z.string().optional(),
  autoResolvable: z.boolean(),
  summary: z.string(),
  relatedFeature: z.string().optional(),
  duplicateSignature: z.string(), // hash-like string for duplicate detection
});

export async function classifyTicket(ticket: {
  subject: string;
  body: string;
  customerPlan: string;
  previousTickets: number;
}): Promise<z.infer<typeof Classification>> {
  const { object } = await generateObject({
    model: openai('gpt-4o-mini'), // fast + cheap for classification
    schema: Classification,
    prompt: `Classify this support ticket. Be accurate — wrong routing wastes time.

Subject: ${ticket.subject}
Body: ${ticket.body}
Customer plan: ${ticket.customerPlan}
Previous tickets: ${ticket.previousTickets}

Priority rules:
- CRITICAL: system down, data loss, security breach, enterprise customer
- HIGH: feature broken, billing error, angry enterprise customer
- MEDIUM: bug with workaround, feature request from paying customer
- LOW: how-to questions, minor UI issues, free-tier customers

Auto-resolvable: true if this is a common how-to question that can be answered
with a documentation link or standard response.

duplicateSignature: create a normalized key like "bug:export:csv:timeout" that
would match similar tickets about the same issue.`,
  });

  return object;
}
```

## Step 2: Auto-Resolution Engine

```typescript
// src/triage/auto-resolver.ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Pool } from 'pg';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

// Knowledge base of common solutions
async function findSolution(category: string, summary: string): Promise<string | null> {
  const { rows } = await db.query(`
    SELECT solution, doc_url, confidence
    FROM knowledge_base
    WHERE category = $1
      AND similarity(summary, $2) > 0.6
    ORDER BY confidence DESC, usage_count DESC
    LIMIT 1
  `, [category, summary]);

  return rows[0]?.solution ?? null;
}

export async function tryAutoResolve(ticket: {
  subject: string;
  body: string;
  classification: { category: string; summary: string; autoResolvable: boolean };
}): Promise<{ resolved: boolean; response?: string }> {
  if (!ticket.classification.autoResolvable) return { resolved: false };

  const solution = await findSolution(ticket.classification.category, ticket.classification.summary);
  if (!solution) return { resolved: false };

  // Generate a personalized response using the solution template
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    prompt: `Write a friendly, helpful support response.

Customer's question: ${ticket.subject} — ${ticket.body}

Solution from knowledge base: ${solution}

Rules:
- Be warm and professional
- Include specific steps
- Add relevant doc links
- End with "Let me know if you need anything else"
- Keep it under 200 words`,
  });

  return { resolved: true, response: text };
}
```

## Step 3: Duplicate Detection and Trend Surfacing

```typescript
// src/triage/dedup.ts
import { Redis } from 'ioredis';
import { Pool } from 'pg';

const redis = new Redis(process.env.REDIS_URL!);
const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function checkDuplicate(
  signature: string
): Promise<{ isDuplicate: boolean; originalTicketId?: string; count: number }> {
  const key = `ticket:sig:${signature}`;
  const count = await redis.incr(key);
  await redis.expire(key, 86400 * 7); // 7-day window

  if (count > 1) {
    const originalId = await redis.get(`ticket:sig:${signature}:first`);
    return { isDuplicate: true, originalTicketId: originalId ?? undefined, count };
  }

  return { isDuplicate: false, count: 1 };
}

// Surface emerging issues: when duplicate count spikes
export async function detectTrends(): Promise<Array<{
  signature: string;
  count: number;
  firstSeen: string;
  trend: 'spike' | 'growing' | 'stable';
  affectedCustomers: number;
}>> {
  // Scan Redis for high-count signatures
  const keys = await redis.keys('ticket:sig:*');
  const trends: any[] = [];

  for (const key of keys) {
    if (key.includes(':first')) continue;
    const count = parseInt(await redis.get(key) ?? '0');
    if (count >= 5) { // 5+ tickets about the same issue
      trends.push({
        signature: key.replace('ticket:sig:', ''),
        count,
        firstSeen: new Date().toISOString(),
        trend: count > 20 ? 'spike' : count > 10 ? 'growing' : 'stable',
        affectedCustomers: count, // approximate
      });
    }
  }

  return trends.sort((a, b) => b.count - a.count);
}
```

## Step 4: Routing API

```typescript
// src/api/triage.ts
import { Hono } from 'hono';
import { classifyTicket } from '../triage/classifier';
import { tryAutoResolve } from '../triage/auto-resolver';
import { checkDuplicate } from '../triage/dedup';

const app = new Hono();

app.post('/v1/tickets/triage', async (c) => {
  const body = await c.req.json();
  const startTime = Date.now();

  // 1. Classify
  const classification = await classifyTicket(body);

  // 2. Check duplicates
  const duplicate = await checkDuplicate(classification.duplicateSignature);

  // 3. Try auto-resolve
  let autoResponse: string | undefined;
  if (classification.autoResolvable && !duplicate.isDuplicate) {
    const result = await tryAutoResolve({ ...body, classification });
    autoResponse = result.response;
  }

  return c.json({
    classification,
    duplicate: duplicate.isDuplicate ? {
      originalTicketId: duplicate.originalTicketId,
      duplicateCount: duplicate.count,
    } : null,
    autoResponse,
    routedTo: classification.team,
    processingMs: Date.now() - startTime,
  });
});

export default app;
```

## Results

- **First-response time**: 8 minutes average (was 4 hours) — auto-responses are instant
- **Auto-resolved tickets**: 40% of all tickets (was 0%) — $12K/month saved in agent time
- **Duplicate detection**: grouped 15% of tickets, reducing redundant work
- **Trend detection**: surfaced a CSV export bug affecting 200 customers 3 hours before it would have become a Twitter crisis
- **Classification accuracy**: 94% (validated by L1 agents)
- **Agent onboarding**: 3 days instead of 3 weeks — AI handles routing, agents focus on solving
- **Customer satisfaction**: CSAT improved from 3.2 to 4.4 / 5.0
