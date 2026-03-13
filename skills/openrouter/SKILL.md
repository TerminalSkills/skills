---
name: openrouter
description: >-
   You are an expert in OpenRouter, the unified API gateway for accessing 200+
  LLMs through a single OpenAI-compatible endpoint. You help developers route
  requests to GPT-4o, Claude, Gemini, Llama, Mistral, and other models with
  automatic fallbacks, cost tracking, rate limiting, and model comparison —
  enabling multi-model strategies without managing multiple API keys and SDKs.
category: AI & Machine Learning
tags: [llm, api, gateway, multi-model, routing, openai-compatible, cost]
version: 1.0.0
author: terminal-skills
---

# OpenRouter — Unified LLM API Gateway

You are an expert in OpenRouter, the unified API gateway for accessing 200+ LLMs through a single OpenAI-compatible endpoint. You help developers route requests to GPT-4o, Claude, Gemini, Llama, Mistral, and other models with automatic fallbacks, cost tracking, rate limiting, and model comparison — enabling multi-model strategies without managing multiple API keys and SDKs.

## Core Capabilities

### OpenAI-Compatible API

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://myapp.com",  // Required for ranking
    "X-Title": "My App",                  // Shows in OpenRouter dashboard
  },
});

// Use any model with OpenAI SDK
const response = await openai.chat.completions.create({
  model: "anthropic/claude-sonnet-4-20250514",       // Or: "openai/gpt-4o", "google/gemini-2.0-flash"
  messages: [{ role: "user", content: "Hello!" }],
});

// Streaming
const stream = await openai.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Write a poem" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}

// Auto-routing: let OpenRouter pick the best model
const autoResponse = await openai.chat.completions.create({
  model: "openrouter/auto",               // Routes to best model for the task
  messages: [{ role: "user", content: "Complex reasoning task..." }],
});

// Cost-optimized routing
const cheapResponse = await openai.chat.completions.create({
  model: "openrouter/auto",
  route: "fallback",                      // Try cheapest first, fall back to better
  models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-20250514", "openai/gpt-4o"],
  messages: [{ role: "user", content: "Simple task" }],
});
```

### Model Comparison

```typescript
// Compare models side-by-side
const models = [
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4-20250514",
  "google/gemini-2.0-flash",
  "meta-llama/llama-3.1-70b-instruct",
];

const results = await Promise.all(
  models.map(async (model) => {
    const start = Date.now();
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: "user", content: testPrompt }],
      max_tokens: 500,
    });
    return {
      model,
      latency: Date.now() - start,
      tokens: response.usage,
      cost: response.usage?.total_tokens,   // OpenRouter returns cost info
      output: response.choices[0].message.content,
    };
  }),
);
```

### With Vercel AI SDK

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });

const { text } = await generateText({
  model: openrouter("anthropic/claude-sonnet-4-20250514"),
  prompt: "Explain quantum computing",
});
```

## Installation

```bash
npm install openai                        # Use OpenAI SDK
# Or: npm install @openrouter/ai-sdk-provider  # For Vercel AI SDK
```

## Best Practices

1. **One API, all models** — Single API key for GPT-4o, Claude, Gemini, Llama, Mistral; no vendor lock-in
2. **Fallback routing** — Configure model fallbacks; if primary is down or overloaded, auto-switch to backup
3. **Cost tracking** — OpenRouter dashboard shows per-model costs; optimize spend by routing simple tasks to cheap models
4. **OpenAI SDK compatible** — Just change `baseURL` and `apiKey`; all OpenAI SDK features work (tools, streaming, JSON mode)
5. **Free models** — Some models available for free (rate-limited); great for prototyping
6. **Auto routing** — Use `openrouter/auto` to let the system pick the best model based on task complexity
7. **Provider preferences** — Set model priorities and fallbacks; optimize for cost, speed, or quality
8. **Usage limits** — Set per-key spending limits in dashboard; prevent runaway costs in production
