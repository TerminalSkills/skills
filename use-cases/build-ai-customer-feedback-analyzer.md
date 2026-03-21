---
title: "Build an AI Customer Feedback Analyzer"
description: "Ingest feedback from NPS surveys, support tickets, reviews, and social mentions. Categorize with Claude, detect trends, score by priority, and deliver a weekly digest to your product team."
skills: [anthropic-sdk, prisma, resend]
difficulty: intermediate
time_estimate: "8 hours"
tags: [feedback-analysis, ai, nlp, product-management, sentiment-analysis, prisma, email, resend]
---

# Build an AI Customer Feedback Analyzer

500 feedback items arrive every week. 480 get ignored. The 20 that get read are the loudest, not the most important. Build a system that reads everything and tells you what actually matters.

## Persona

**Priya** is a PM at a B2B SaaS. She gets feedback from Intercom tickets, G2 reviews, NPS survey responses, and Twitter mentions. Reading it all takes 4 hours. Actionable patterns get buried under noise. She needs synthesis.

---

## Architecture

```
Feedback sources:
  ├── NPS survey webhooks
  ├── Intercom ticket webhooks
  ├── G2 reviews (scraped weekly)
  └── Twitter/X mentions (search API)
       ↓
  Prisma: store raw + analyzed
       ↓
  Claude: categorize + sentiment + extract features
       ↓
  Trend detection + priority scoring
       ↓
  Resend: weekly digest email to product team
```

---

## Step 1: Data Model with Prisma

```prisma
// schema.prisma
model Feedback {
  id          String   @id @default(cuid())
  source      String   // "nps" | "intercom" | "g2" | "twitter" | "email"
  rawText     String
  authorId    String?
  authorTier  String?  // "free" | "pro" | "enterprise"
  rating      Int?     // 0-10 for NPS, 1-5 for G2
  receivedAt  DateTime @default(now())

  // Analyzed fields
  category    String?  // "feature_request" | "bug" | "praise" | "complaint" | "question"
  sentiment   String?  // "positive" | "neutral" | "negative"
  sentimentScore Float? // -1.0 to 1.0
  features    String[] // Extracted feature/area mentions
  summary     String?  // 1-sentence AI summary
  priority    Float?   // Computed priority score

  @@index([source, receivedAt])
  @@index([category, receivedAt])
  @@index([sentimentScore])
}

model FeedbackTrend {
  id          String   @id @default(cuid())
  weekOf      DateTime
  category    String
  feature     String?
  count       Int
  avgSentiment Float
  topFeedbackIds String[]

  @@unique([weekOf, category, feature])
  @@index([weekOf])
}
```

---

## Step 2: Ingest from Multiple Sources

```typescript
// lib/ingest.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// NPS webhook (Typeform, Delighted, etc.)
export async function ingestNPS(payload: {
  responseId: string;
  score: number;
  comment?: string;
  userId?: string;
  userPlan?: string;
}) {
  if (!payload.comment) return; // Skip score-only responses

  await prisma.feedback.create({
    data: {
      source: 'nps',
      rawText: payload.comment,
      authorId: payload.userId,
      authorTier: payload.userPlan,
      rating: payload.score,
      receivedAt: new Date(),
    },
  });
}

// Intercom ticket closed webhook
export async function ingestIntercomTicket(payload: {
  conversationId: string;
  messages: Array<{ body: string; from: 'user' | 'agent' }>;
  userId?: string;
  userPlan?: string;
}) {
  // Extract only user messages
  const userText = payload.messages
    .filter(m => m.from === 'user')
    .map(m => m.body)
    .join('\n');

  if (userText.length < 20) return; // Skip trivial messages

  await prisma.feedback.create({
    data: {
      source: 'intercom',
      rawText: userText.slice(0, 2000), // Limit to 2k chars
      authorId: payload.userId,
      authorTier: payload.userPlan,
    },
  });
}
```

---

## Step 3: AI Analysis with Claude

```typescript
// lib/analyze.ts
import Anthropic from '@anthropic-ai/sdk';
import { PrismaClient } from '@prisma/client';

const anthropic = new Anthropic();
const prisma = new PrismaClient();

interface FeedbackAnalysis {
  category: 'feature_request' | 'bug' | 'praise' | 'complaint' | 'question';
  sentiment: 'positive' | 'neutral' | 'negative';
  sentimentScore: number; // -1.0 to 1.0
  features: string[];     // e.g., ["dashboard", "export", "API"]
  summary: string;        // 1 sentence
}

async function analyzeFeedback(text: string): Promise<FeedbackAnalysis> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5', // Fast + cheap for batch analysis
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: `Analyze this customer feedback for a SaaS product.

Feedback:
"""
${text}
"""

Return a JSON object with:
- category: one of "feature_request", "bug", "praise", "complaint", "question"
- sentiment: "positive", "neutral", or "negative"
- sentimentScore: float from -1.0 (very negative) to 1.0 (very positive)
- features: array of product areas mentioned (e.g., ["dashboard", "API", "notifications"])
- summary: one sentence summarizing the core feedback

Return only valid JSON.`,
    }],
  });

  const text_content = message.content[0].type === 'text' ? message.content[0].text : '{}';
  return JSON.parse(text_content.replace(/```json\n?|\n?```/g, ''));
}

export async function processPendingFeedback(batchSize = 50) {
  const unanalyzed = await prisma.feedback.findMany({
    where: { category: null },
    take: batchSize,
    orderBy: { receivedAt: 'asc' },
  });

  console.log(`Analyzing ${unanalyzed.length} feedback items...`);

  // Process with concurrency limit to avoid rate limits
  const { default: pLimit } = await import('p-limit');
  const limit = pLimit(5);

  await Promise.all(
    unanalyzed.map(feedback =>
      limit(async () => {
        try {
          const analysis = await analyzeFeedback(feedback.rawText);
          await prisma.feedback.update({
            where: { id: feedback.id },
            data: {
              category: analysis.category,
              sentiment: analysis.sentiment,
              sentimentScore: analysis.sentimentScore,
              features: analysis.features,
              summary: analysis.summary,
            },
          });
        } catch (err) {
          console.error(`Failed to analyze ${feedback.id}:`, err);
        }
      })
    )
  );
}
```

---

## Step 4: Priority Scoring

```typescript
// lib/priority.ts
const TIER_WEIGHTS = { enterprise: 3, pro: 2, free: 1 };
const CATEGORY_WEIGHTS = { bug: 1.5, complaint: 1.3, feature_request: 1.0, question: 0.5, praise: 0.2 };

export function computePriority(feedback: {
  category: string;
  sentimentScore: number;
  authorTier?: string | null;
  rating?: number | null;
}): number {
  const tierWeight = TIER_WEIGHTS[feedback.authorTier as keyof typeof TIER_WEIGHTS] ?? 1;
  const categoryWeight = CATEGORY_WEIGHTS[feedback.category as keyof typeof CATEGORY_WEIGHTS] ?? 1;
  const negativity = Math.max(0, -feedback.sentimentScore); // 0-1, higher = more negative
  const ratingPenalty = feedback.rating !== null && feedback.rating !== undefined
    ? Math.max(0, (5 - feedback.rating) / 5) : 0;

  return tierWeight * categoryWeight * (0.5 + 0.3 * negativity + 0.2 * ratingPenalty);
}

// Batch update priorities
export async function updatePriorities() {
  const feedbacks = await prisma.feedback.findMany({
    where: { category: { not: null } },
    select: { id: true, category: true, sentimentScore: true, authorTier: true, rating: true },
  });

  for (const f of feedbacks) {
    const priority = computePriority({
      category: f.category!,
      sentimentScore: f.sentimentScore ?? 0,
      authorTier: f.authorTier,
      rating: f.rating,
    });
    await prisma.feedback.update({ where: { id: f.id }, data: { priority } });
  }
}
```

---

## Step 5: Weekly Digest Email with Resend

```typescript
// lib/digest.ts
import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';

const resend = new Resend(process.env.RESEND_API_KEY);
const prisma = new PrismaClient();

export async function sendWeeklyDigest(recipients: string[]) {
  const weekAgo = new Date(Date.now() - 7 * 86400_000);

  // Top issues by priority
  const topFeedback = await prisma.feedback.findMany({
    where: { receivedAt: { gte: weekAgo }, priority: { gte: 2 } },
    orderBy: { priority: 'desc' },
    take: 10,
  });

  // Category breakdown
  const breakdown = await prisma.feedback.groupBy({
    by: ['category'],
    where: { receivedAt: { gte: weekAgo } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  // Most mentioned features
  const allFeatures = (await prisma.feedback.findMany({
    where: { receivedAt: { gte: weekAgo } },
    select: { features: true },
  })).flatMap(f => f.features);

  const featureCounts = allFeatures.reduce((acc, f) => {
    acc[f] = (acc[f] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const topFeatures = Object.entries(featureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topFeedbackHtml = topFeedback
    .map(f => `<li><strong>[${f.category}]</strong> ${f.summary} <em>(${f.source}, ${f.authorTier ?? 'unknown'})</em></li>`)
    .join('\n');

  const breakdownHtml = breakdown
    .map(b => `<tr><td>${b.category}</td><td>${b._count.id}</td></tr>`)
    .join('\n');

  await resend.emails.send({
    from: 'product@yourapp.com',
    to: recipients,
    subject: `📊 Weekly Feedback Digest — ${new Date().toLocaleDateString()}`,
    html: `
      <h2>This Week's Top Feedback (by priority)</h2>
      <ol>${topFeedbackHtml}</ol>

      <h2>Category Breakdown</h2>
      <table border="1" cellpadding="4">
        <tr><th>Category</th><th>Count</th></tr>
        ${breakdownHtml}
      </table>

      <h2>Most Mentioned Areas</h2>
      <ul>${topFeatures.map(([f, n]) => `<li>${f}: ${n} mentions</li>`).join('\n')}</ul>
    `,
  });
}
```

---

## Results

Priya cut her weekly feedback review from 4 hours to 20 minutes. The analyzer surfaced a pattern she'd missed: enterprise customers were complaining about the export feature 3× more than others. That became sprint priority #1.

> "It's like having a research analyst who reads every single piece of feedback and summarizes it for me. But it never needs a 1:1." — Priya
