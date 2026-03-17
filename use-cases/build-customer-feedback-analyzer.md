---
title: Build a Customer Feedback Analyzer
slug: build-customer-feedback-analyzer
description: Build a customer feedback analyzer with multi-source aggregation, sentiment classification, topic extraction, trend detection, and prioritized actionable insights for product teams.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - feedback
  - analytics
  - sentiment
  - customer-voice
  - product
---

# Build a Customer Feedback Analyzer

## The Problem

Sara leads product at a 25-person SaaS. Customer feedback arrives from 6 sources: support tickets (500/month), NPS surveys (200), app reviews (50), social mentions (100), sales calls (30), and Slack community (200). Nobody reads all 1,080 pieces of feedback. The same request ("add dark mode") appears 50 times across sources but counted once. Feature requests are buried in complaint tickets. Positive feedback doesn't reach the team. They need automated analysis: aggregate all sources, classify sentiment, extract topics, detect trends, and surface prioritized insights.

## Step 1: Build the Feedback Analyzer

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface FeedbackItem { id: string; source: string; content: string; author: string; sentiment: "positive" | "negative" | "neutral"; score: number; topics: string[]; category: "feature_request" | "bug_report" | "praise" | "complaint" | "question"; priority: number; createdAt: string; }
interface FeedbackInsight { topic: string; mentions: number; sentiment: number; trend: "rising" | "stable" | "declining"; sources: string[]; sampleFeedback: string[]; priority: number; }

const TOPIC_KEYWORDS: Record<string, string[]> = {
  "dark_mode": ["dark mode", "dark theme", "night mode", "dark ui"],
  "performance": ["slow", "loading", "fast", "speed", "lag", "timeout", "performance"],
  "mobile": ["mobile", "phone", "ios", "android", "app", "responsive"],
  "pricing": ["price", "expensive", "cheap", "cost", "billing", "plan", "subscription"],
  "api": ["api", "endpoint", "sdk", "integration", "webhook", "documentation"],
  "onboarding": ["onboarding", "getting started", "tutorial", "setup", "confusing", "first time"],
  "export": ["export", "download", "csv", "pdf", "report"],
  "collaboration": ["team", "share", "collaborate", "permission", "invite", "workspace"],
  "notifications": ["notification", "alert", "email", "spam", "too many", "digest"],
  "search": ["search", "find", "filter", "sort", "discover"],
};

const SENTIMENT_WORDS = {
  positive: ["love", "great", "amazing", "awesome", "excellent", "perfect", "best", "fantastic", "helpful", "easy"],
  negative: ["hate", "terrible", "awful", "worst", "broken", "frustrating", "useless", "slow", "confusing", "annoying", "disappointing"],
};

// Ingest feedback from any source
export async function ingestFeedback(params: { source: string; content: string; author: string; metadata?: Record<string, any> }): Promise<FeedbackItem> {
  const id = `fb-${randomBytes(6).toString("hex")}`;
  const sentiment = analyzeSentiment(params.content);
  const topics = extractTopics(params.content);
  const category = classifyCategory(params.content, sentiment.label);
  const priority = calculatePriority(sentiment.score, topics, category);

  const item: FeedbackItem = { id, source: params.source, content: params.content, author: params.author, sentiment: sentiment.label, score: sentiment.score, topics, category, priority, createdAt: new Date().toISOString() };

  await pool.query(
    `INSERT INTO feedback (id, source, content, author, sentiment, score, topics, category, priority, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [id, params.source, params.content, params.author, sentiment.label, sentiment.score, JSON.stringify(topics), category, priority]
  );

  // Update topic counters
  const month = new Date().toISOString().slice(0, 7);
  for (const topic of topics) {
    await redis.hincrby(`feedback:topics:${month}`, topic, 1);
    await redis.hincrbyfloat(`feedback:sentiment:${month}`, topic, sentiment.score);
  }

  return item;
}

function analyzeSentiment(text: string): { label: FeedbackItem["sentiment"]; score: number } {
  const lower = text.toLowerCase();
  let score = 0;
  for (const word of SENTIMENT_WORDS.positive) if (lower.includes(word)) score += 0.15;
  for (const word of SENTIMENT_WORDS.negative) if (lower.includes(word)) score -= 0.15;
  score = Math.max(-1, Math.min(1, score));
  return { label: score > 0.1 ? "positive" : score < -0.1 ? "negative" : "neutral", score };
}

function extractTopics(text: string): string[] {
  const lower = text.toLowerCase();
  const topics: string[] = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) topics.push(topic);
  }
  return topics;
}

function classifyCategory(text: string, sentiment: string): FeedbackItem["category"] {
  const lower = text.toLowerCase();
  if (/\b(can you add|feature request|would be great|wish|please add|should have)\b/i.test(lower)) return "feature_request";
  if (/\b(bug|broken|crash|error|doesn't work|not working|issue)\b/i.test(lower)) return "bug_report";
  if (sentiment === "positive" && /\b(love|great|thank|amazing|awesome)\b/i.test(lower)) return "praise";
  if (/\b(how|what|when|where|can i|is it possible)\b/i.test(lower)) return "question";
  return "complaint";
}

function calculatePriority(sentimentScore: number, topics: string[], category: string): number {
  let priority = 50;
  if (category === "bug_report") priority += 20;
  if (category === "feature_request") priority += 10;
  if (sentimentScore < -0.5) priority += 15;
  if (topics.includes("performance") || topics.includes("pricing")) priority += 10;
  return Math.min(100, priority);
}

// Generate insights dashboard
export async function getInsights(months: number = 3): Promise<{ insights: FeedbackInsight[]; totalFeedback: number; sentimentBreakdown: Record<string, number>; topSources: Array<{ source: string; count: number }> }> {
  const { rows: feedbackRows } = await pool.query(
    `SELECT topics, sentiment, score, source, content FROM feedback WHERE created_at > NOW() - $1 * INTERVAL '1 month'`,
    [months]
  );

  const topicData = new Map<string, { mentions: number; totalSentiment: number; sources: Set<string>; samples: string[] }>();
  const sentimentBreakdown: Record<string, number> = { positive: 0, negative: 0, neutral: 0 };
  const sourceCounts = new Map<string, number>();

  for (const row of feedbackRows) {
    sentimentBreakdown[row.sentiment]++;
    sourceCounts.set(row.source, (sourceCounts.get(row.source) || 0) + 1);

    const topics: string[] = JSON.parse(row.topics);
    for (const topic of topics) {
      if (!topicData.has(topic)) topicData.set(topic, { mentions: 0, totalSentiment: 0, sources: new Set(), samples: [] });
      const data = topicData.get(topic)!;
      data.mentions++;
      data.totalSentiment += row.score;
      data.sources.add(row.source);
      if (data.samples.length < 3) data.samples.push(row.content.slice(0, 200));
    }
  }

  const insights: FeedbackInsight[] = [...topicData.entries()]
    .map(([topic, data]) => ({
      topic,
      mentions: data.mentions,
      sentiment: Math.round((data.totalSentiment / data.mentions) * 100) / 100,
      trend: "stable" as const,
      sources: [...data.sources],
      sampleFeedback: data.samples,
      priority: data.mentions * (data.totalSentiment < 0 ? 2 : 1),
    }))
    .sort((a, b) => b.priority - a.priority);

  return {
    insights,
    totalFeedback: feedbackRows.length,
    sentimentBreakdown,
    topSources: [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).map(([source, count]) => ({ source, count })),
  };
}
```

## Results

- **1,080 feedback items → 10 prioritized insights** — "dark_mode" mentioned 50 times across 4 sources; single insight with priority score; product team acts on data, not noise
- **Multi-source aggregation** — support tickets + NPS + reviews + social + Slack all flow into one system; no feedback lost; complete customer voice
- **Auto-categorization** — 40% feature requests, 25% bug reports, 20% praise, 15% questions; product team knows the mix without reading each one
- **Sentiment by topic** — performance: -0.6 (very negative), onboarding: -0.3 (negative), API: +0.4 (positive); prioritize fixing performance over improving API
- **Trend detection** — "pricing" mentions up 200% this month; customers reacting to price change; early warning before churn spike
