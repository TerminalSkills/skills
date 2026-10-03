---
name: portkey
description: >-
  Portkey is an AI gateway that sits between an app and LLM providers,
  adding fallbacks, load balancing, retries, caching, guardrails and request
  observability behind one OpenAI-compatible API. Use when someone asks to
  "add fallbacks between OpenAI and Anthropic", "cache LLM responses", "load
  balance LLM providers", "log LLM costs and latency" or "set up Portkey".
license: Apache-2.0
compatibility: 'Node.js or Python with the portkey-ai package; Portkey account for the hosted gateway'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
    - llm
    - gateway
    - observability
    - routing
    - guardrails
  repository: https://github.com/Portkey-AI/gateway
---

# Portkey — AI Gateway for Production LLM Apps

## Overview

Portkey routes LLM calls through one endpoint (`https://api.portkey.ai/v1`) that speaks the OpenAI API and reaches 250+ models across 40+ providers. Behaviour is controlled by a config object: routing strategy (`single`, `fallback`, `loadbalance`, `conditional`), `retry`, `cache`, `request_timeout` and guardrails. The dashboard logs latency, cost, tokens and errors per request. The gateway itself is open source and can run locally with `npx @portkey-ai/gateway` (listens on `http://localhost:8787/v1`, console at `/public/`). Portkey's docs now brand the hosted product as part of Palo Alto Networks' Prisma AIRS AI Gateway; the API and SDKs are unchanged.

## Instructions

### Install and call a model

```bash
npm install portkey-ai      # or: pip install portkey-ai
```

Add provider credentials once in the Model Catalog (dashboard), which gives each provider a slug such as `openai-prod`. Then address models as `@slug/model`:

```typescript
import { Portkey } from "portkey-ai";

const portkey = new Portkey({ apiKey: process.env.PORTKEY_API_KEY });

const response = await portkey.chat.completions.create({
  model: "@openai-prod/gpt-4o",
  messages: [{ role: "user", content: "Explain microservices in two sentences." }],
});
console.log(response.choices[0].message.content);
```

Python is the same shape: `Portkey(api_key=os.environ["PORTKEY_API_KEY"])` and `portkey.chat.completions.create(model="@openai-prod/gpt-4o", ...)`. The official OpenAI SDK also works with `baseURL: "https://api.portkey.ai/v1"` and your Portkey key as `apiKey`. Virtual keys still work via `virtual_key` in configs, but Model Catalog slugs are the recommended way.

### Routing config

Create a config in the dashboard (it gets an ID like `pc-...`) or pass the object inline. Per-request, pass it as a second argument or header.

```typescript
const fallbackConfig = {
  strategy: { mode: "fallback" },
  targets: [
    { provider: "@openai-prod", override_params: { model: "gpt-4o" },
      retry: { attempts: 2, on_status_codes: [429, 500, 503] } },
    { provider: "@anthropic-prod", override_params: { model: "claude-sonnet-4-5" } },
  ],
  request_timeout: 30000,
  cache: { mode: "simple", max_age: 3600 },
};

const portkey = new Portkey({ apiKey: process.env.PORTKEY_API_KEY, config: fallbackConfig });
// or: config: "pc-fallback-1a2b3c"  (saved config ID)
```

- `fallback` tries targets in order; `loadbalance` splits traffic by each target's `weight`; `conditional` routes on request metadata; `single` uses one target.
- Target fields: `provider` (or `virtual_key`), `api_key`, `override_params` (always replaces), `default_params` (only if absent), `drop_params`, `weight`.
- `override_params.model` accepts any model ID your provider currently offers; check the provider's list rather than copying this one.

### Caching

`cache: { mode: "simple", max_age: 3600 }` serves identical prompts from cache. `max_age` is seconds, minimum 60, maximum 90 days, default 7 days. `mode: "semantic"` matches similar prompts but is limited to select Enterprise plans. Bypass per request with the header `x-portkey-cache-force-refresh: true`; partition by user with `x-portkey-cache-namespace`.

### Guardrails

Create guardrail checks in the dashboard (PII, regex, JSON validity, word lists and others) and attach their IDs in the config:

```json
{
  "input_guardrails": ["pg-no-pii-4f2a1c"],
  "output_guardrails": ["pg-json-valid-9d3b7e"]
}
```

`before_request_hooks` and `after_request_hooks` with `{ "id": "..." }` still work identically. With deny enabled, a failed check returns HTTP 446; with deny off, the request continues and returns 246 with the verdicts.

## Examples

### Example 1: Survive an OpenAI outage

Request: "If OpenAI returns 429 or 5xx, fall back to Claude automatically."

Use `fallbackConfig` above. Result: a failed first target is retried twice, then the call goes to `@anthropic-prod`; both attempts appear in the Portkey logs and the caller still gets an OpenAI-shaped response.

### Example 2: Split traffic and cut repeat cost

Request: "Send 80% of traffic to gpt-4o-mini and 20% to gpt-4o, and cache repeats for an hour."

```json
{
  "strategy": { "mode": "loadbalance" },
  "targets": [
    { "provider": "@openai-prod", "override_params": { "model": "gpt-4o-mini" }, "weight": 0.8 },
    { "provider": "@openai-prod", "override_params": { "model": "gpt-4o" }, "weight": 0.2 }
  ],
  "cache": { "mode": "simple", "max_age": 3600 }
}
```

Result: roughly 8 in 10 requests use the smaller model; identical prompts within the hour are answered from cache and flagged as cache hits in the logs.

## Guidelines

- `weight` only matters for `loadbalance`; do not combine it with `fallback`.
- Keep `PORTKEY_API_KEY` server-side. Provider keys belong in the Model Catalog, not in application code.
- Semantic caching, budget limits and some guardrails depend on plan; confirm in the dashboard before promising them.
- Budget and rate limits are set in the dashboard per key or workspace, not in the config object.
- A gateway adds a network hop; for latency-critical paths run the open-source gateway close to the app.
