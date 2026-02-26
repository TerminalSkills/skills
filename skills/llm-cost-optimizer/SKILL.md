---
name: llm-cost-optimizer
description: >-
  Track, analyze, and reduce LLM API costs — model routing, prompt caching,
  semantic caching, and budget alerts. Use when someone asks to "reduce AI
  costs", "track LLM spending", "optimize API costs", "set up model routing",
  "cache LLM responses", "compare model costs", "set budget limits for AI",
  or "my OpenAI bill is too high". Covers cost tracking per feature/user,
  smart model routing (expensive model for hard tasks, cheap for easy),
  semantic caching, prompt compression, and budget alerting.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.10+. Any LLM provider."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["cost", "optimization", "llm", "caching", "routing"]
---

# LLM Cost Optimizer

## Overview

LLM API costs grow fast — a chatbot doing 10K conversations/day at $0.01 each is $3K/month. This skill builds cost controls: track spending per feature and user, route simple tasks to cheap models, cache repeated queries, compress prompts, and alert before budgets blow up.

## When to Use

- Monthly LLM bill is growing and you need visibility into what's driving it
- Some features use GPT-4o when GPT-4o-mini would work fine
- Users ask the same questions repeatedly — cache those responses
- Need budget limits per team, feature, or API key
- Comparing total cost of ownership between providers

## Instructions

### Strategy 1: Cost Tracking Middleware

Wrap every LLM call to log tokens, cost, model, and feature. Know exactly where money goes.

```typescript
// cost-tracker.ts — Track LLM costs per feature, model, and user
/**
 * Middleware that wraps LLM API calls, logs token usage
 * and estimated cost, and enforces budget limits.
 * Drop-in replacement for direct API calls.
 */

interface CostEntry {
  timestamp: string;
  model: string;
  feature: string;         // Which product feature made this call
  userId?: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  latencyMs: number;
}

// Pricing per 1M tokens (input / output) — update as providers change
const PRICING: Record<string, { input: number; output: number; cached?: number }> = {
  "gpt-4o":                  { input: 2.50,  output: 10.00, cached: 1.25 },
  "gpt-4o-mini":             { input: 0.15,  output: 0.60,  cached: 0.075 },
  "claude-sonnet-4-20250514":   { input: 3.00,  output: 15.00, cached: 0.30 },
  "claude-haiku-3-20250722": { input: 0.25,  output: 1.25,  cached: 0.025 },
  "llama-3.1-8b":            { input: 0.05,  output: 0.05 },  // Self-hosted estimate
};

export class CostTracker {
  private entries: CostEntry[] = [];
  private budgets: Map<string, number> = new Map();  // feature → monthly limit USD

  /**
   * Calculate cost for a single LLM call.
   */
  calculateCost(model: string, inputTokens: number, outputTokens: number, cachedTokens: number = 0): number {
    const pricing = PRICING[model];
    if (!pricing) return 0;

    const inputCost = ((inputTokens - cachedTokens) * pricing.input) / 1_000_000;
    const cachedCost = pricing.cached
      ? (cachedTokens * pricing.cached) / 1_000_000
      : 0;
    const outputCost = (outputTokens * pricing.output) / 1_000_000;

    return inputCost + cachedCost + outputCost;
  }

  /**
   * Log an LLM call and check budget.
   */
  track(entry: Omit<CostEntry, "costUsd" | "timestamp">): CostEntry {
    const costUsd = this.calculateCost(
      entry.model, entry.inputTokens, entry.outputTokens, entry.cachedTokens
    );

    const full: CostEntry = {
      ...entry,
      costUsd,
      timestamp: new Date().toISOString(),
    };

    this.entries.push(full);

    // Check budget
    const monthlySpend = this.getMonthlySpend(entry.feature);
    const budget = this.budgets.get(entry.feature);
    if (budget && monthlySpend > budget) {
      console.warn(`⚠️ Budget exceeded for "${entry.feature}": $${monthlySpend.toFixed(2)} / $${budget}`);
    }

    return full;
  }

  setBudget(feature: string, monthlyLimitUsd: number): void {
    this.budgets.set(feature, monthlyLimitUsd);
  }

  getMonthlySpend(feature?: string): number {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return this.entries
      .filter((e) => new Date(e.timestamp) >= monthStart)
      .filter((e) => !feature || e.feature === feature)
      .reduce((sum, e) => sum + e.costUsd, 0);
  }

  /**
   * Generate a cost report grouped by feature and model.
   */
  report(): Record<string, { calls: number; tokens: number; cost: number }> {
    const groups: Record<string, { calls: number; tokens: number; cost: number }> = {};

    for (const entry of this.entries) {
      const key = `${entry.feature} → ${entry.model}`;
      if (!groups[key]) groups[key] = { calls: 0, tokens: 0, cost: 0 };
      groups[key].calls++;
      groups[key].tokens += entry.inputTokens + entry.outputTokens;
      groups[key].cost += entry.costUsd;
    }

    return groups;
  }
}
```

### Strategy 2: Smart Model Router

Route tasks to the cheapest model that can handle them. Hard tasks → expensive model. Easy tasks → cheap model.

```typescript
// model-router.ts — Route LLM calls to the cheapest capable model
/**
 * Analyzes task complexity and routes to the appropriate model.
 * Simple classification/extraction → mini model (~95% cheaper).
 * Complex reasoning/coding → full model.
 */

interface RouteDecision {
  model: string;
  reason: string;
  estimatedCostRatio: number;  // 1.0 = full price, 0.1 = 10% of full price
}

export function routeModel(task: string, context?: string): RouteDecision {
  const taskLower = task.toLowerCase();
  const contextLength = (context || "").length;

  // Simple extraction / classification → mini model
  if (
    taskLower.includes("extract") ||
    taskLower.includes("classify") ||
    taskLower.includes("categorize") ||
    taskLower.includes("summarize") ||
    taskLower.includes("translate") ||
    taskLower.includes("format")
  ) {
    return {
      model: "gpt-4o-mini",
      reason: "Simple extraction/classification task",
      estimatedCostRatio: 0.06,  // ~6% of GPT-4o cost
    };
  }

  // Short context + simple question → mini
  if (contextLength < 2000 && !requiresReasoning(taskLower)) {
    return {
      model: "gpt-4o-mini",
      reason: "Short context, simple task",
      estimatedCostRatio: 0.06,
    };
  }

  // Code generation / debugging → full model
  if (
    taskLower.includes("write code") ||
    taskLower.includes("debug") ||
    taskLower.includes("refactor") ||
    taskLower.includes("architect")
  ) {
    return {
      model: "claude-sonnet-4-20250514",
      reason: "Code generation requires strong reasoning",
      estimatedCostRatio: 1.0,
    };
  }

  // Complex reasoning → full model
  return {
    model: "gpt-4o",
    reason: "Complex task requiring strong reasoning",
    estimatedCostRatio: 0.8,
  };
}

function requiresReasoning(task: string): boolean {
  const reasoningKeywords = [
    "analyze", "compare", "evaluate", "design", "architect",
    "debug", "optimize", "explain why", "trade-off", "recommend",
  ];
  return reasoningKeywords.some((k) => task.includes(k));
}
```

### Strategy 3: Semantic Cache

Cache LLM responses by meaning, not exact match. "What's the weather?" and "How's the weather today?" should hit the same cache.

```python
# semantic_cache.py — Cache LLM responses by semantic similarity
"""
Caches LLM responses using embedding similarity.
If a new query is semantically similar to a cached one,
return the cached response instead of calling the API.
Saves 30-60% on repetitive workloads.
"""
import hashlib
import json
import time
from typing import Optional
import numpy as np
import openai

class SemanticCache:
    """LLM response cache using embedding similarity."""

    def __init__(self, similarity_threshold: float = 0.92, ttl_seconds: int = 3600):
        """
        Args:
            similarity_threshold: Min cosine similarity to consider a cache hit (0.92 = very similar)
            ttl_seconds: Cache entry expiration time
        """
        self.threshold = similarity_threshold
        self.ttl = ttl_seconds
        self.cache: list[dict] = []  # In production, use Redis or a vector DB
        self.client = openai.OpenAI()
        self.stats = {"hits": 0, "misses": 0, "saved_usd": 0.0}

    def get(self, query: str) -> Optional[str]:
        """Check cache for a semantically similar query.

        Args:
            query: The user's query

        Returns:
            Cached response if found, None otherwise
        """
        query_embedding = self._embed(query)
        now = time.time()

        best_match = None
        best_score = 0.0

        for entry in self.cache:
            # Skip expired entries
            if now - entry["timestamp"] > self.ttl:
                continue

            score = self._cosine_similarity(query_embedding, entry["embedding"])
            if score > best_score:
                best_score = score
                best_match = entry

        if best_match and best_score >= self.threshold:
            self.stats["hits"] += 1
            self.stats["saved_usd"] += best_match.get("cost_usd", 0.01)
            return best_match["response"]

        self.stats["misses"] += 1
        return None

    def set(self, query: str, response: str, cost_usd: float = 0.01) -> None:
        """Store a query-response pair in the cache."""
        self.cache.append({
            "query": query,
            "response": response,
            "embedding": self._embed(query),
            "cost_usd": cost_usd,
            "timestamp": time.time(),
        })

    def _embed(self, text: str) -> list[float]:
        response = self.client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        a_arr, b_arr = np.array(a), np.array(b)
        return float(np.dot(a_arr, b_arr) / (np.linalg.norm(a_arr) * np.linalg.norm(b_arr)))
```

## Examples

### Example 1: Cut chatbot costs by 60%

**User prompt:** "Our support chatbot costs $3K/month on GPT-4o. Most questions are FAQs. Help me reduce costs without hurting quality."

The agent will:
- Add cost tracking middleware to identify which question types cost the most
- Set up semantic cache for FAQ-type questions (covers ~40% of volume)
- Route simple questions to GPT-4o-mini (covers ~30% more)
- Keep GPT-4o only for complex, novel questions
- Result: ~60% cost reduction while maintaining quality on hard questions

### Example 2: Set up budget alerts

**User prompt:** "I want to cap our AI spending at $500/month per team and get alerts at 80%."

The agent will use CostTracker with per-team budgets, add webhook alerts at 80% threshold, and generate weekly cost reports broken down by team and feature.

## Guidelines

- **Track before optimizing** — you can't reduce what you don't measure
- **Mini models handle 70% of tasks** — GPT-4o-mini and Haiku are dramatically cheaper
- **Semantic cache threshold 0.92+** — lower risks returning wrong answers
- **Cache TTL depends on data freshness** — static FAQs: hours. Dynamic data: minutes.
- **Prompt caching is free money** — OpenAI and Anthropic cache system prompts automatically
- **Batch API = 50% off** — OpenAI's Batch API halves cost for non-realtime workloads
- **Shorter prompts = lower costs** — remove examples and instructions the model already knows
- **Monitor cost per user** — detect abuse early, especially on free tiers
- **Self-hosted models for high volume** — at 1M+ calls/month, Llama on your own GPU can be cheaper
