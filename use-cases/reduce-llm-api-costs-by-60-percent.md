---
title: Reduce LLM API Costs by 60% with Smart Routing and Caching
slug: reduce-llm-api-costs-by-60-percent
description: Track LLM spending per feature, route simple tasks to cheap models, cache repeated queries semantically, and set budget alerts — without sacrificing quality.
skills:
  - llm-cost-optimizer
  - structured-output
  - agent-memory
category: data-ai
tags:
  - cost
  - optimization
  - llm
  - caching
  - routing
  - budget
---

## The Problem

Tomás runs a SaaS with three AI-powered features: a customer support chatbot, an email summarizer, and a document Q&A system. All three use GPT-4o for everything. The monthly bill is $4,200 and growing 20% month-over-month as users increase. The CFO wants AI costs under $2,000/month without degrading the user experience.

The problem is visibility. Tomás has no idea which feature costs the most, which queries could use a cheaper model, or how many responses are near-duplicates that could be cached. The OpenAI dashboard shows total spend but not spend-per-feature or spend-per-user.

## The Solution

Use llm-cost-optimizer for cost tracking, model routing, and semantic caching. Use structured-output for ensuring cheap models return reliable structured data. Use agent-memory for the caching layer.

## Step-by-Step Walkthrough

### Step 1: Add Cost Tracking to Every LLM Call

Before optimizing, measure. Wrap every LLM call with a cost tracker that logs model, tokens, feature, and user.

```typescript
// lib/llm.ts — Wrapped LLM client with cost tracking
/**
 * Drop-in replacement for direct OpenAI calls.
 * Logs every call with cost, tokens, and feature attribution.
 * Use this everywhere instead of calling OpenAI directly.
 */
import OpenAI from "openai";

const openai = new OpenAI();

interface LLMCallOptions {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  feature: string;         // "support-chat", "email-summary", "doc-qa"
  userId?: string;
  temperature?: number;
  maxTokens?: number;
}

interface LLMResponse {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
  cached: boolean;
}

// Cost per 1M tokens
const PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o":      { input: 2.50, output: 10.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
};

const callLog: LLMResponse[] = [];

export async function llm(options: LLMCallOptions): Promise<LLMResponse> {
  const start = Date.now();

  const response = await openai.chat.completions.create({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens,
  });

  const usage = response.usage!;
  const pricing = PRICING[options.model] || { input: 5.0, output: 15.0 };
  const costUsd =
    (usage.prompt_tokens * pricing.input + usage.completion_tokens * pricing.output) / 1_000_000;

  const result: LLMResponse = {
    content: response.choices[0].message.content || "",
    model: options.model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    costUsd,
    latencyMs: Date.now() - start,
    cached: false,
  };

  callLog.push(result);

  // Log for monitoring
  console.log(
    `[LLM] ${options.feature} | ${options.model} | ${usage.prompt_tokens}+${usage.completion_tokens} tokens | $${costUsd.toFixed(4)} | ${result.latencyMs}ms`
  );

  return result;
}

/**
 * Get spending breakdown by feature for the current month.
 */
export function getSpendByFeature(): Record<string, { calls: number; cost: number }> {
  const breakdown: Record<string, { calls: number; cost: number }> = {};
  for (const call of callLog) {
    // In production, group by feature from metadata
    const key = call.model;
    if (!breakdown[key]) breakdown[key] = { calls: 0, cost: 0 };
    breakdown[key].calls++;
    breakdown[key].cost += call.costUsd;
  }
  return breakdown;
}
```

### Step 2: Route Tasks to the Right Model

After a week of tracking, the data shows: 65% of support chat messages are FAQ-type questions that GPT-4o-mini handles perfectly. 80% of email summaries are straightforward extractions. Only document Q&A truly needs GPT-4o's reasoning.

```typescript
// lib/router.ts — Route to the cheapest model that can handle the task
/**
 * Classifies task complexity and routes to the appropriate model.
 * GPT-4o-mini handles ~70% of requests at 6% of the cost.
 */

type ModelTier = "mini" | "full";

interface RouteResult {
  model: string;
  tier: ModelTier;
  reason: string;
}

export function routeRequest(feature: string, userMessage: string): RouteResult {
  // Feature-specific routing rules learned from cost tracking data
  switch (feature) {
    case "support-chat":
      return routeSupportChat(userMessage);
    case "email-summary":
      // Email summaries are always extraction — mini model handles it
      return { model: "gpt-4o-mini", tier: "mini", reason: "Email summary is extraction" };
    case "doc-qa":
      return routeDocQA(userMessage);
    default:
      return { model: "gpt-4o", tier: "full", reason: "Unknown feature — default to full" };
  }
}

function routeSupportChat(message: string): RouteResult {
  const lower = message.toLowerCase();

  // FAQ patterns → mini
  const faqPatterns = [
    "how do i", "how to", "what is", "where can i",
    "reset password", "cancel", "refund", "pricing",
    "sign up", "log in", "delete account",
  ];

  if (faqPatterns.some((p) => lower.includes(p))) {
    return { model: "gpt-4o-mini", tier: "mini", reason: "FAQ-pattern question" };
  }

  // Short messages → mini (usually simple questions)
  if (message.length < 100) {
    return { model: "gpt-4o-mini", tier: "mini", reason: "Short message" };
  }

  // Complex complaints, multi-step issues → full model
  return { model: "gpt-4o", tier: "full", reason: "Complex support request" };
}

function routeDocQA(question: string): RouteResult {
  const lower = question.toLowerCase();

  // Factual lookup → mini
  if (lower.includes("what") || lower.includes("when") || lower.includes("who")) {
    return { model: "gpt-4o-mini", tier: "mini", reason: "Factual lookup" };
  }

  // Analytical questions → full
  if (lower.includes("why") || lower.includes("compare") || lower.includes("analyze")) {
    return { model: "gpt-4o", tier: "full", reason: "Analytical question needs reasoning" };
  }

  return { model: "gpt-4o-mini", tier: "mini", reason: "Default to mini for doc-qa" };
}
```

### Step 3: Add Semantic Caching

The support chat gets the same questions repeatedly. "How do I reset my password?" and "I forgot my password, how to reset?" should return the same cached answer.

```typescript
// lib/cache.ts — Semantic LLM response cache
/**
 * Caches LLM responses using embedding similarity.
 * Same question asked differently → cache hit.
 * Saves 30-40% on repetitive support workloads.
 */
import OpenAI from "openai";

const openai = new OpenAI();

interface CacheEntry {
  query: string;
  response: string;
  embedding: number[];
  feature: string;
  timestamp: number;
  costSaved: number;
}

const cache: CacheEntry[] = [];
const SIMILARITY_THRESHOLD = 0.93;  // High threshold — avoid wrong answers
const TTL_MS = 4 * 60 * 60 * 1000;  // 4 hour cache TTL

export async function cachedLLM(
  query: string,
  feature: string,
  fallback: () => Promise<{ content: string; costUsd: number }>
): Promise<{ content: string; cached: boolean; costSaved: number }> {
  // Generate embedding for the query
  const queryEmb = await embed(query);

  // Search cache for similar queries
  const now = Date.now();
  for (const entry of cache) {
    if (entry.feature !== feature) continue;
    if (now - entry.timestamp > TTL_MS) continue;

    const similarity = cosine(queryEmb, entry.embedding);
    if (similarity >= SIMILARITY_THRESHOLD) {
      return { content: entry.response, cached: true, costSaved: entry.costSaved };
    }
  }

  // Cache miss — call the LLM
  const result = await fallback();

  cache.push({
    query,
    response: result.content,
    embedding: queryEmb,
    feature,
    timestamp: now,
    costSaved: result.costUsd,
  });

  return { content: result.content, cached: false, costSaved: 0 };
}

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",  // $0.02/1M tokens — negligible
    input: text,
  });
  return res.data[0].embedding;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] ** 2;
    normB += b[i] ** 2;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

## The Outcome

After two weeks of optimization:

- **Support chat**: 65% of requests routed to GPT-4o-mini, 25% served from cache. Cost dropped from $2,100/month to $650/month.
- **Email summary**: 100% on GPT-4o-mini (no quality difference for extraction). Cost dropped from $800/month to $50/month.
- **Document Q&A**: 40% on mini (factual lookups), 60% on GPT-4o. Cost dropped from $1,300/month to $780/month.

**Total: $4,200/month → $1,480/month (65% reduction)**, with no measurable quality degradation on the metrics that matter. The CFO is happy, and Tomás has a cost dashboard that shows exactly where every dollar goes.
