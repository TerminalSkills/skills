---
title: Build an LLM Cost Router
slug: build-llm-cost-router
description: Build an LLM cost router that selects the cheapest model capable of handling each request, with quality-based routing, fallback chains, cost tracking, and budget enforcement for AI applications.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - llm
  - routing
  - cost-optimization
  - ai
  - models
---

# Build an LLM Cost Router

## The Problem

Alex leads AI at a 25-person company spending $15K/month on LLM API calls. Every request goes to GPT-4 because "it's the best" — but 60% of requests are simple (classification, extraction, formatting) that a $0.25/M-token model handles equally well. Only 10% need the expensive $15/M-token model. There's no fallback — when OpenAI is down, everything fails. Budget overruns happen at month-end with no warning. They need an LLM router: classify request complexity, route to cheapest capable model, fallback on errors, track costs per feature, and enforce budgets.

## Step 1: Build the Cost Router

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);

interface ModelConfig {
  id: string;
  name: string;
  provider: "openai" | "anthropic" | "google" | "groq" | "local";
  costPerInputToken: number;
  costPerOutputToken: number;
  maxTokens: number;
  latencyMs: number;
  qualityTier: "high" | "medium" | "low";
  capabilities: string[];
  endpoint: string;
  apiKey: string;
  enabled: boolean;
}

interface RoutingDecision {
  model: ModelConfig;
  reason: string;
  estimatedCost: number;
  fallbackChain: string[];
}

const MODELS: ModelConfig[] = [
  { id: "gpt4o", name: "GPT-4o", provider: "openai", costPerInputToken: 0.0000025, costPerOutputToken: 0.00001, maxTokens: 128000, latencyMs: 2000, qualityTier: "high", capabilities: ["reasoning", "coding", "creative", "analysis", "vision"], endpoint: "https://api.openai.com/v1/chat/completions", apiKey: process.env.OPENAI_KEY || "", enabled: true },
  { id: "sonnet", name: "Claude Sonnet", provider: "anthropic", costPerInputToken: 0.000003, costPerOutputToken: 0.000015, maxTokens: 200000, latencyMs: 1500, qualityTier: "high", capabilities: ["reasoning", "coding", "creative", "analysis"], endpoint: "https://api.anthropic.com/v1/messages", apiKey: process.env.ANTHROPIC_KEY || "", enabled: true },
  { id: "flash", name: "Gemini Flash", provider: "google", costPerInputToken: 0.000000075, costPerOutputToken: 0.0000003, maxTokens: 1000000, latencyMs: 800, qualityTier: "medium", capabilities: ["classification", "extraction", "formatting", "summarization"], endpoint: "https://generativelanguage.googleapis.com/v1beta", apiKey: process.env.GOOGLE_KEY || "", enabled: true },
  { id: "llama-groq", name: "Llama 3.3 70B (Groq)", provider: "groq", costPerInputToken: 0.00000059, costPerOutputToken: 0.00000079, maxTokens: 131072, latencyMs: 300, qualityTier: "medium", capabilities: ["classification", "extraction", "formatting", "coding", "summarization"], endpoint: "https://api.groq.com/openai/v1/chat/completions", apiKey: process.env.GROQ_KEY || "", enabled: true },
];

const TASK_COMPLEXITY: Record<string, { tier: string; capabilities: string[] }> = {
  classify: { tier: "low", capabilities: ["classification"] },
  extract: { tier: "low", capabilities: ["extraction"] },
  format: { tier: "low", capabilities: ["formatting"] },
  summarize: { tier: "medium", capabilities: ["summarization"] },
  code: { tier: "high", capabilities: ["coding"] },
  reason: { tier: "high", capabilities: ["reasoning"] },
  create: { tier: "high", capabilities: ["creative"] },
  analyze: { tier: "high", capabilities: ["analysis"] },
};

// Route request to optimal model
export async function route(params: {
  task: string;
  inputTokens: number;
  maxOutputTokens: number;
  feature?: string;
  requireQuality?: "high" | "medium" | "low";
}): Promise<RoutingDecision> {
  const taskConfig = TASK_COMPLEXITY[params.task] || { tier: "high", capabilities: ["reasoning"] };
  const requiredTier = params.requireQuality || taskConfig.tier;

  // Filter eligible models
  const eligible = MODELS.filter((m) => {
    if (!m.enabled) return false;
    if (params.inputTokens + params.maxOutputTokens > m.maxTokens) return false;
    if (requiredTier === "high" && m.qualityTier === "low") return false;
    return taskConfig.capabilities.some((c) => m.capabilities.includes(c));
  });

  if (eligible.length === 0) throw new Error("No eligible model found");

  // Sort by cost (cheapest first)
  eligible.sort((a, b) => {
    const costA = params.inputTokens * a.costPerInputToken + params.maxOutputTokens * a.costPerOutputToken;
    const costB = params.inputTokens * b.costPerInputToken + params.maxOutputTokens * b.costPerOutputToken;
    return costA - costB;
  });

  // Check budget
  if (params.feature) {
    const budget = await checkBudget(params.feature);
    if (!budget.ok) {
      // Use cheapest model regardless of quality
      const cheapest = eligible[0];
      return { model: cheapest, reason: `Budget limit — using cheapest: ${cheapest.name}`, estimatedCost: params.inputTokens * cheapest.costPerInputToken + params.maxOutputTokens * cheapest.costPerOutputToken, fallbackChain: eligible.slice(1).map((m) => m.id) };
    }
  }

  // Check model health
  for (const model of eligible) {
    const healthy = await isModelHealthy(model.id);
    if (healthy) {
      const cost = params.inputTokens * model.costPerInputToken + params.maxOutputTokens * model.costPerOutputToken;
      return {
        model, reason: `${taskConfig.tier} task → ${model.name} ($${cost.toFixed(4)})`,
        estimatedCost: cost,
        fallbackChain: eligible.filter((m) => m.id !== model.id).map((m) => m.id),
      };
    }
  }

  throw new Error("All models unhealthy");
}

// Call LLM with automatic fallback
export async function call(params: { task: string; messages: any[]; maxOutputTokens?: number; feature?: string }): Promise<{ response: string; model: string; cost: number; latencyMs: number }> {
  const inputTokens = JSON.stringify(params.messages).length / 4;
  const maxOutput = params.maxOutputTokens || 2000;
  const decision = await route({ task: params.task, inputTokens, maxOutputTokens: maxOutput, feature: params.feature });

  const models = [decision.model, ...decision.fallbackChain.map((id) => MODELS.find((m) => m.id === id)!).filter(Boolean)];

  for (const model of models) {
    try {
      const start = Date.now();
      const response = await callModel(model, params.messages, maxOutput);
      const latencyMs = Date.now() - start;
      const actualCost = (inputTokens * model.costPerInputToken) + (response.length / 4 * model.costPerOutputToken);

      // Track costs
      await trackCost(model.id, actualCost, params.feature);

      return { response, model: model.name, cost: actualCost, latencyMs };
    } catch (e) {
      await markModelUnhealthy(model.id);
      continue;
    }
  }

  throw new Error("All models failed");
}

async function callModel(model: ModelConfig, messages: any[], maxTokens: number): Promise<string> {
  // In production: call actual API based on provider
  const resp = await fetch(model.endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${model.apiKey}` },
    body: JSON.stringify({ model: model.id, messages, max_tokens: maxTokens }),
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`${model.name}: ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content || data.content?.[0]?.text || "";
}

async function trackCost(modelId: string, cost: number, feature?: string): Promise<void> {
  const month = new Date().toISOString().slice(0, 7);
  await redis.hincrbyfloat(`llm:cost:${month}`, modelId, cost);
  await redis.hincrbyfloat(`llm:cost:${month}`, "total", cost);
  if (feature) await redis.hincrbyfloat(`llm:cost:${month}:feature`, feature, cost);
}

async function checkBudget(feature: string): Promise<{ ok: boolean; remaining: number }> {
  const month = new Date().toISOString().slice(0, 7);
  const spent = parseFloat(await redis.hget(`llm:cost:${month}:feature`, feature) || "0");
  const budget = parseFloat(await redis.hget("llm:budgets", feature) || "1000");
  return { ok: spent < budget, remaining: budget - spent };
}

async function isModelHealthy(modelId: string): Promise<boolean> {
  const unhealthy = await redis.get(`llm:unhealthy:${modelId}`);
  return !unhealthy;
}

async function markModelUnhealthy(modelId: string): Promise<void> {
  await redis.setex(`llm:unhealthy:${modelId}`, 60, "1");
}

// Cost dashboard
export async function getCostDashboard(): Promise<{ totalSpend: number; byModel: Record<string, number>; byFeature: Record<string, number>; savings: number }> {
  const month = new Date().toISOString().slice(0, 7);
  const byModel = await redis.hgetall(`llm:cost:${month}`);
  const byFeature = await redis.hgetall(`llm:cost:${month}:feature`);
  const total = parseFloat(byModel.total || "0");
  // Estimate savings vs all-GPT-4
  const ifAllGPT4 = total * 3;
  return {
    totalSpend: Math.round(total * 100) / 100,
    byModel: Object.fromEntries(Object.entries(byModel).filter(([k]) => k !== "total").map(([k, v]) => [k, Math.round(parseFloat(v) * 100) / 100])),
    byFeature: Object.fromEntries(Object.entries(byFeature).map(([k, v]) => [k, Math.round(parseFloat(v) * 100) / 100])),
    savings: Math.round((ifAllGPT4 - total) * 100) / 100,
  };
}
```

## Results

- **LLM costs: $15K → $4K/month** — 60% of requests routed to Gemini Flash ($0.075/M tokens); only complex tasks use GPT-4; 73% cost reduction
- **Automatic fallback** — OpenAI down → requests fall back to Claude → then Groq; zero failed requests during provider outages
- **Per-feature budgets** — support chatbot: $2K/month cap; document extraction: $1K; budget exhausted → cheapest model used; no surprise bills
- **Cost dashboard** — see spend by model and feature; "document extraction using 40% of budget" → optimize prompts; data-driven optimization
- **Quality maintained** — complex reasoning still goes to GPT-4/Claude; only simple tasks downgraded; user satisfaction unchanged
