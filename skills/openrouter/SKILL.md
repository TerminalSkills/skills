---
name: openrouter
description: >-
  OpenRouter is a unified API gateway that reaches hundreds of LLMs from
  OpenAI, Anthropic, Google, Meta and others through one OpenAI-compatible
  endpoint and one API key. Use when a user wants to call several models from
  one codebase, add model fallbacks, route to the cheapest or fastest provider,
  compare model cost and latency, use free models, or cap spend per key.
license: Apache-2.0
compatibility: Needs an OpenRouter API key (OPENROUTER_API_KEY). Node.js 22+ for @openrouter/ai-sdk-provider 3.x
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - llm
    - api
    - gateway
    - routing
    - openai-compatible
  repository: https://github.com/OpenRouterTeam/ai-sdk-provider
---

# OpenRouter — Unified LLM API Gateway

## Overview

OpenRouter exposes one endpoint, `https://openrouter.ai/api/v1`, whose request and response format follows the OpenAI Chat Completions API. The model is picked with a `vendor/model` slug, and OpenRouter handles provider selection, fallbacks and billing. The catalog changes constantly: models are added and retired every month, so never hard-code a slug from memory. List the current ones with `GET https://openrouter.ai/api/v1/models` (public, no key needed).

Ways to call it:

- plain HTTP or the **OpenAI SDK** with a changed `baseURL` (existing code keeps working);
- the official client SDKs: `@openrouter/sdk` (TypeScript) and `openrouter` (Python);
- the **Agent SDK** `@openrouter/agent` (tool loops through `callModel`);
- the **Vercel AI SDK** provider `@openrouter/ai-sdk-provider`.

## Instructions

### 1. Get a key and install

Create a key at openrouter.ai/settings/keys and export it. Set a credit limit on the key at creation time.

```bash
export OPENROUTER_API_KEY="sk-or-v1-..."   # paste your real key; never commit it
npm install openai                          # or: npm install @openrouter/sdk
```

### 2. Call a model with the OpenAI SDK

```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://invoice-helper.dev",   // identifies your app for rankings
    "X-OpenRouter-Title": "Invoice Helper",         // display name; the old X-Title still works
  },
});

const response = await openai.chat.completions.create({
  model: "anthropic/claude-sonnet-4.5",
  messages: [{ role: "user", content: "Summarize this invoice dispute in two lines." }],
});
console.log(response.choices[0].message.content);
console.log(response.usage);   // tokens plus `cost` in credits (USD), always included
```

Both headers are optional. `HTTP-Referer` is what creates the app page and ranking entry; `X-OpenRouter-Title` alone does nothing.

Streaming works as in OpenAI: pass `stream: true` and iterate `for await (const chunk of stream)`, reading `chunk.choices[0]?.delta?.content`. The final chunk carries `usage`.

### 3. Aliases and auto-routing

- `~anthropic/claude-sonnet-latest`, `~openai/gpt-sol-latest`, `~google/gemini-flash-latest` are **latest aliases**: they resolve to the newest model of that family, so code does not need redeploying when a version ships. Pin an exact slug when you need reproducible output.
- `openrouter/auto` is the Auto Router. It classifies the prompt, then picks a model from what the community spends on for that task type. It has no fixed price (the `/models` list shows `-1`); the response reports which model answered. `openrouter/auto-beta` is the early-access track and takes `plugins: [{ id: "auto-beta-router", cost_tier: "medium" }]`. Each slug reads only its own plugin id.
- `openrouter/free` picks a free model at random from those currently available that support the features your request needs.

### 4. Model fallbacks

`models` is an ordered list. If the first model errors, is rate limited or refuses on moderation grounds, the next is tried. The `model` field is not needed.

```typescript
const completion = await openai.chat.completions.create({
  models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4o", "meta-llama/llama-3.3-70b-instruct"],
  messages: [{ role: "user", content: "Classify this ticket: refund not received after 10 days" }],
} as any);   // `models` is OpenRouter-specific, not in the OpenAI types
console.log(completion.model);   // the model that actually answered
```

The `models` array is what drives fallbacks, and the order you write is the order tried. Older examples that combine `openrouter/auto` with `route: "fallback"` to get "cheapest first" are not documented behaviour; do not rely on them.

### 5. Provider routing

By default OpenRouter load-balances across providers hosting the same model, favouring the lower price and skipping providers with recent outages. Override it with the `provider` object:

```typescript
await openai.chat.completions.create({
  model: "meta-llama/llama-3.3-70b-instruct",
  messages: [{ role: "user", content: "Hello" }],
  provider: {
    sort: "throughput",          // "price" | "throughput" | "latency"; turns off load balancing
    data_collection: "deny",     // skip providers that may store prompts
    require_parameters: true,    // only providers supporting every parameter you sent
    max_price: { prompt: 1, completion: 3 },   // dollars per million tokens
  },
} as any);
```

Other fields: `order`, `only`, `ignore`, `allow_fallbacks` (default `true`), `zdr` (zero-data-retention endpoints only), `quantizations`.

### 6. Compare models on cost and latency

`usage.cost` is the real charge in credits, so no price table is needed.

```typescript
const candidates = ["openai/gpt-4o-mini", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"];
const results = await Promise.all(candidates.map(async (model) => {
  const start = Date.now();
  const r = await openai.chat.completions.create({
    model, max_tokens: 300,
    messages: [{ role: "user", content: "Explain idempotency keys in payment APIs." }],
  });
  return { model, ms: Date.now() - start, cost: (r.usage as any)?.cost, text: r.choices[0].message.content };
}));
console.table(results.map(({ text, ...rest }) => rest));
```

### 7. Vercel AI SDK

Version 3.x of the provider requires `ai@^7`, Node.js 22+ and ESM. For `ai@6` install `@openrouter/ai-sdk-provider@2.9.1`; for `ai@5`, `@1.5.4`.

```typescript
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText } from "ai";

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const { text } = await generateText({
  model: openrouter("anthropic/claude-sonnet-4.5"),
  prompt: "Explain quantum computing in three sentences",
});
```

### 8. Client SDK (TypeScript)

```typescript
import { OpenRouter } from "@openrouter/sdk";

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const completion = await client.chat.send({
  chatRequest: { model: "~anthropic/claude-sonnet-latest", messages: [{ role: "user", content: "Hi" }] },
});
if (completion instanceof ReadableStream) throw new Error("expected a non-streaming response");
console.log(completion.choices[0].message.content);
```

Python: `pip install openrouter`, then `client.chat.send(model=..., messages=[...])` inside `with OpenRouter(api_key=...) as client:`.

## Examples

### Example 1: "Add a fallback so my support bot survives a provider outage"

Request: the bot calls one model and fails when it is overloaded. Use the fallback call from step 4 with a primary and two backups. Result: when the primary fails, the response still comes back and `completion.model` shows the backup that answered, so log it to spot how often failover happens.

### Example 2: "How much did that call cost, and what is left on my key?"

```bash
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $OPENROUTER_API_KEY"
```

The `data` object holds `limit`, `limit_remaining`, `usage_daily`, `usage_monthly`, `is_free_tier` and `free_model_daily_requests`. Per request, read `usage.cost` from the completion. Result: a team can alert at 80 percent of `limit` before the key stops working.

### Example 3: "Prototype for free"

Model slugs ending in `:free` cost nothing. Query `GET /api/v1/models`, filter ids with `:free`, and pick one with the tool support you need. Result: requests succeed until the free caps below are hit, then return HTTP 429.

## Guidelines

- **Model slugs expire.** Dated slugs such as `anthropic/claude-sonnet-4-20250514` and `google/gemini-2.0-flash-001` are gone from the catalog; Claude slugs now use dotted versions (`claude-sonnet-4.5`). Check `/models` or use a `~...-latest` alias.
- **Free-model limits**: 20 requests per minute, and 50 per day if you have bought under 10 credits in total, 1000 per day at 10 or more. Free models are often also rate limited by upstream providers, so add fallbacks.
- **Credits**: a request is charged when it finishes, and an estimated cost is held while it runs. Many parallel requests on a small balance can fail with `in_flight_budget_exhausted`; a `weight_exceeds_budget` error will not go away on retry, so lower `max_tokens` or add credits. Branch on `error.metadata.limit_source`, not on message text.
- **Usage accounting is automatic.** `usage: {include: true}` and `stream_options.include_usage` are deprecated and do nothing.
- **Privacy**: set `provider.data_collection: "deny"` or `zdr: true` for sensitive prompts, and note this narrows the provider pool and can cause errors for models without such providers.
- **Not every parameter is supported by every provider.** Tools, JSON schema output and `top_k` vary by model; use `require_parameters: true` rather than silently losing them.
- **Keys**: keep `OPENROUTER_API_KEY` server-side, give each service its own key with a credit limit, and rotate on leaks. Extra keys do not raise rate limits.
- Business and Enterprise accounts can pin regions with `https://eu.openrouter.ai/api/v1` or `https://us.openrouter.ai/api/v1`.
- Not the right tool if you need a single vendor's newest beta feature on day one (use that vendor's SDK) or an on-premises model server.
