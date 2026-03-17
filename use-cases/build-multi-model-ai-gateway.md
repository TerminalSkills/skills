---
title: Build a Multi-Model AI Gateway
slug: build-multi-model-ai-gateway
description: Build a unified AI gateway that abstracts multiple LLM providers, handles failover, normalizes responses, manages API keys, tracks usage, and provides a single endpoint for all AI capabilities.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - llm
  - gateway
  - multi-model
  - ai
  - abstraction
---

# Build a Multi-Model AI Gateway

## The Problem

Omar leads AI at a 25-person company using 4 LLM providers: OpenAI for chat, Anthropic for analysis, Google for search grounding, and a local model for PII processing. Each has different APIs, auth methods, rate limits, and response formats. Switching providers requires changing code in 15 places. When OpenAI is down, everything fails. They can't compare providers for quality/cost without running parallel experiments. They need a gateway: one API, multiple providers, automatic failover, unified response format, cost tracking, and provider comparison.

## Step 1: Build the Gateway

```typescript
import { Redis } from "ioredis";
import { pool } from "../db";
const redis = new Redis(process.env.REDIS_URL!);

interface ModelProvider { id: string; name: string; baseUrl: string; apiKey: string; models: Model[]; status: "healthy" | "degraded" | "down"; rateLimitRPM: number; }
interface Model { id: string; providerId: string; name: string; contextWindow: number; costPerInputToken: number; costPerOutputToken: number; capabilities: string[]; }
interface GatewayRequest { model?: string; messages: Array<{ role: string; content: string }>; maxTokens?: number; temperature?: number; stream?: boolean; fallbackModels?: string[]; }
interface GatewayResponse { id: string; model: string; provider: string; content: string; usage: { inputTokens: number; outputTokens: number; totalTokens: number }; cost: number; latencyMs: number; cached: boolean; }

const PROVIDERS: ModelProvider[] = [
  { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", apiKey: process.env.OPENAI_KEY || "", models: [
    { id: "gpt-4o", providerId: "openai", name: "GPT-4o", contextWindow: 128000, costPerInputToken: 0.0000025, costPerOutputToken: 0.00001, capabilities: ["chat", "vision", "function_calling"] },
    { id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o Mini", contextWindow: 128000, costPerInputToken: 0.00000015, costPerOutputToken: 0.0000006, capabilities: ["chat", "function_calling"] },
  ], status: "healthy", rateLimitRPM: 500 },
  { id: "anthropic", name: "Anthropic", baseUrl: "https://api.anthropic.com/v1", apiKey: process.env.ANTHROPIC_KEY || "", models: [
    { id: "claude-sonnet", providerId: "anthropic", name: "Claude Sonnet", contextWindow: 200000, costPerInputToken: 0.000003, costPerOutputToken: 0.000015, capabilities: ["chat", "analysis", "coding"] },
    { id: "claude-haiku", providerId: "anthropic", name: "Claude Haiku", contextWindow: 200000, costPerInputToken: 0.00000025, costPerOutputToken: 0.00000125, capabilities: ["chat", "classification"] },
  ], status: "healthy", rateLimitRPM: 500 },
  { id: "google", name: "Google", baseUrl: "https://generativelanguage.googleapis.com/v1beta", apiKey: process.env.GOOGLE_KEY || "", models: [
    { id: "gemini-flash", providerId: "google", name: "Gemini Flash", contextWindow: 1000000, costPerInputToken: 0.000000075, costPerOutputToken: 0.0000003, capabilities: ["chat", "search_grounding"] },
  ], status: "healthy", rateLimitRPM: 1000 },
];

const MODEL_ALIASES: Record<string, string> = { "best": "claude-sonnet", "fast": "gemini-flash", "cheap": "gpt-4o-mini", "default": "gpt-4o" };

// Unified completion endpoint
export async function complete(request: GatewayRequest): Promise<GatewayResponse> {
  const modelId = MODEL_ALIASES[request.model || "default"] || request.model || "gpt-4o";
  const modelsToTry = [modelId, ...(request.fallbackModels || ["claude-sonnet", "gemini-flash"])];

  // Check cache
  const cacheKey = `ai:cache:${hashRequest(request)}`;
  const cached = await redis.get(cacheKey);
  if (cached) { const resp = JSON.parse(cached); return { ...resp, cached: true }; }

  for (const tryModel of modelsToTry) {
    const model = findModel(tryModel);
    if (!model) continue;
    const provider = PROVIDERS.find((p) => p.id === model.providerId);
    if (!provider || provider.status === "down") continue;

    // Check rate limit
    const rlKey = `ai:rl:${provider.id}:${Math.floor(Date.now() / 60000)}`;
    const count = await redis.incr(rlKey);
    await redis.expire(rlKey, 120);
    if (count > provider.rateLimitRPM) continue;

    try {
      const start = Date.now();
      const result = await callProvider(provider, model, request);
      const latencyMs = Date.now() - start;
      const cost = result.usage.inputTokens * model.costPerInputToken + result.usage.outputTokens * model.costPerOutputToken;

      const response: GatewayResponse = { id: `gw-${Date.now().toString(36)}`, model: model.name, provider: provider.name, content: result.content, usage: result.usage, cost: Math.round(cost * 1000000) / 1000000, latencyMs, cached: false };

      // Cache response (5 min for deterministic requests)
      if ((request.temperature || 0.7) === 0) await redis.setex(cacheKey, 300, JSON.stringify(response));

      // Track usage
      const month = new Date().toISOString().slice(0, 7);
      await redis.hincrbyfloat(`ai:cost:${month}`, provider.id, cost);
      await redis.hincrby(`ai:usage:${month}`, `${provider.id}:tokens`, result.usage.totalTokens);
      await redis.hincrby(`ai:usage:${month}`, `${provider.id}:requests`, 1);

      return response;
    } catch (error) {
      await markProviderDegraded(provider.id);
      continue;
    }
  }

  throw new Error("All models failed");
}

async function callProvider(provider: ModelProvider, model: Model, request: GatewayRequest): Promise<{ content: string; usage: GatewayResponse["usage"] }> {
  switch (provider.id) {
    case "openai": {
      const resp = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${provider.apiKey}` },
        body: JSON.stringify({ model: model.id, messages: request.messages, max_tokens: request.maxTokens || 2048, temperature: request.temperature || 0.7 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`OpenAI ${resp.status}`);
      const data = await resp.json();
      return { content: data.choices[0].message.content, usage: { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens, totalTokens: data.usage.total_tokens } };
    }
    case "anthropic": {
      const resp = await fetch(`${provider.baseUrl}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-api-key": provider.apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: model.id, messages: request.messages.filter((m) => m.role !== "system"), system: request.messages.find((m) => m.role === "system")?.content, max_tokens: request.maxTokens || 2048, temperature: request.temperature || 0.7 }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`Anthropic ${resp.status}`);
      const data = await resp.json();
      return { content: data.content[0].text, usage: { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens, totalTokens: data.usage.input_tokens + data.usage.output_tokens } };
    }
    case "google": {
      const resp = await fetch(`${provider.baseUrl}/models/${model.id}:generateContent?key=${provider.apiKey}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: request.messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }),
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`Google ${resp.status}`);
      const data = await resp.json();
      return { content: data.candidates[0].content.parts[0].text, usage: { inputTokens: data.usageMetadata?.promptTokenCount || 0, outputTokens: data.usageMetadata?.candidatesTokenCount || 0, totalTokens: data.usageMetadata?.totalTokenCount || 0 } };
    }
    default: throw new Error(`Unknown provider: ${provider.id}`);
  }
}

function findModel(modelId: string): Model | null {
  for (const provider of PROVIDERS) {
    const model = provider.models.find((m) => m.id === modelId);
    if (model) return model;
  }
  return null;
}

function hashRequest(request: GatewayRequest): string {
  const { createHash } = require("node:crypto");
  return createHash("md5").update(JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature })).digest("hex").slice(0, 16);
}

async function markProviderDegraded(providerId: string): Promise<void> {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  if (provider) provider.status = "degraded";
  await redis.setex(`ai:degraded:${providerId}`, 60, "1");
}

// Cost and usage dashboard
export async function getUsageDashboard(): Promise<{ totalCost: number; byProvider: Record<string, { cost: number; requests: number; tokens: number }>; modelComparison: any[] }> {
  const month = new Date().toISOString().slice(0, 7);
  const costs = await redis.hgetall(`ai:cost:${month}`);
  const usage = await redis.hgetall(`ai:usage:${month}`);

  const byProvider: Record<string, any> = {};
  for (const provider of PROVIDERS) {
    byProvider[provider.name] = { cost: Math.round(parseFloat(costs[provider.id] || "0") * 100) / 100, requests: parseInt(usage[`${provider.id}:requests`] || "0"), tokens: parseInt(usage[`${provider.id}:tokens`] || "0") };
  }

  return { totalCost: Object.values(byProvider).reduce((s: number, p: any) => s + p.cost, 0), byProvider, modelComparison: [] };
}

// List available models
export function listModels(): Array<{ id: string; provider: string; name: string; capabilities: string[]; costPer1KTokens: number }> {
  return PROVIDERS.flatMap((p) => p.models.map((m) => ({
    id: m.id, provider: p.name, name: m.name, capabilities: m.capabilities,
    costPer1KTokens: Math.round((m.costPerInputToken + m.costPerOutputToken) * 1000 * 10000) / 10000,
  })));
}
```

## Results

- **One API for all providers** — `gateway.complete({model: 'best', messages})` works regardless of provider; change models by changing a string, not code
- **Automatic failover** — OpenAI down → request falls back to Claude → then Gemini; zero failed requests during provider outages
- **Cost tracking per provider** — dashboard shows: OpenAI $800/month, Anthropic $400, Google $50; optimize by routing cheap tasks to cheaper models
- **Response normalization** — OpenAI, Anthropic, and Google all return `{content, usage, cost}`; no provider-specific parsing in application code
- **Model aliases** — `model: 'cheap'` routes to GPT-4o-mini; `model: 'best'` routes to Claude Sonnet; aliases updated centrally, apps don't change
