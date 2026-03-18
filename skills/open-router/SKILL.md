---
name: open-router
description: >-
  Route AI requests across 100+ LLMs via a single API (OpenRouter). Use when
  switching between models, comparing outputs, using any LLM with an
  OpenAI-compatible API, optimizing costs across providers, or building
  applications that need model flexibility.
license: Apache-2.0
compatibility: "Any OpenAI-compatible client, Python 3.9+, Node.js 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["openrouter", "llm", "routing", "multi-model", "openai-compatible"]
  use-cases:
    - "Switch from GPT-4o to Claude 3.5 Sonnet with a one-line change"
    - "Route expensive requests to cheaper models automatically"
    - "Compare outputs from 5 models side-by-side with the same prompt"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OpenRouter

## Overview

OpenRouter provides a single unified API for 100+ LLMs — GPT-4o, Claude 3.5, Gemini, Llama, Mistral, and more. It's 100% OpenAI API compatible: just change `base_url` and add your `OR_API_KEY`. Features include automatic fallbacks, cost tracking, provider routing, and a credits-based billing system.

## Setup

Get your API key at [openrouter.ai/keys](https://openrouter.ai/keys).

```bash
export OPENROUTER_API_KEY="sk-or-..."
```

## Basic Usage

### Python (with openai library)

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-...",  # or os.environ["OPENROUTER_API_KEY"]
)

response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Explain quantum entanglement simply."}]
)
print(response.choices[0].message.content)
```

### TypeScript (with openai library)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://yourapp.com",   // Optional: shown in rankings
    "X-Title": "Your App Name",              // Optional: shown in dashboard
  },
});

const response = await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "Hello!" }],
});
```

### With fetch (no SDK)

```typescript
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "meta-llama/llama-3.1-8b-instruct",
    messages: [{ role: "user", content: "Hello!" }],
  }),
});
const data = await response.json();
```

## Model Selection

### Popular Models

```python
MODELS = {
    # Frontier models
    "gpt-4o":           "openai/gpt-4o",
    "gpt-4o-mini":      "openai/gpt-4o-mini",
    "claude-sonnet":    "anthropic/claude-3.5-sonnet",
    "claude-haiku":     "anthropic/claude-3-haiku",
    "gemini-pro":       "google/gemini-pro-1.5",
    "gemini-flash":     "google/gemini-flash-1.5",

    # Open source (often free or very cheap)
    "llama-3.1-8b":     "meta-llama/llama-3.1-8b-instruct",
    "llama-3.1-70b":    "meta-llama/llama-3.1-70b-instruct",
    "mistral-7b":       "mistralai/mistral-7b-instruct",
    "mixtral-8x7b":     "mistralai/mixtral-8x7b-instruct",
    "deepseek-chat":    "deepseek/deepseek-chat",
    "qwen-2.5-72b":     "qwen/qwen-2.5-72b-instruct",
}
```

### List Available Models

```python
import httpx

def list_models():
    resp = httpx.get(
        "https://openrouter.ai/api/v1/models",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"}
    )
    models = resp.json()["data"]
    for m in sorted(models, key=lambda x: x.get("pricing", {}).get("prompt", 0)):
        price = float(m.get("pricing", {}).get("prompt", 0)) * 1_000_000
        print(f"{m['id']:<50} ${price:.2f}/M tokens")
```

## Fallback Models

Automatically retry with a different model if the primary fails or rate-limits:

```python
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "..."}],
    extra_body={
        "route": "fallback",
        "models": [
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
            "google/gemini-pro-1.5",
        ]
    }
)
```

```typescript
const response = await client.chat.completions.create({
  model: "openai/gpt-4o",
  messages: [{ role: "user", content: "..." }],
  // @ts-ignore - OpenRouter extension
  models: ["openai/gpt-4o", "anthropic/claude-3.5-sonnet"],
  route: "fallback",
});
```

## Provider Routing

Control which provider serves the request (some models are available via multiple providers):

```python
response = client.chat.completions.create(
    model="meta-llama/llama-3.1-70b-instruct",
    messages=[{"role": "user", "content": "..."}],
    extra_body={
        "provider": {
            "order": ["Fireworks", "Together"],  # Prefer Fireworks, fall back to Together
            "allow_fallbacks": True,
        }
    }
)
```

## Model Comparison

```python
import asyncio
from openai import AsyncOpenAI

async_client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.environ["OPENROUTER_API_KEY"],
)

async def query_model(model: str, prompt: str) -> dict:
    response = await async_client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
    )
    return {
        "model": model,
        "response": response.choices[0].message.content,
        "tokens": response.usage.total_tokens,
    }

async def compare_models(prompt: str, models: list[str]) -> list[dict]:
    results = await asyncio.gather(*[query_model(m, prompt) for m in models])
    return list(results)

# Run comparison
results = asyncio.run(compare_models(
    prompt="What is the capital of France? Answer in one word.",
    models=[
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku",
        "google/gemini-flash-1.5",
        "meta-llama/llama-3.1-8b-instruct",
    ]
))

for r in results:
    print(f"{r['model']:<45} → {r['response']!r:<15} ({r['tokens']} tokens)")
```

## Cost Tracking

```python
def get_usage_stats() -> dict:
    resp = httpx.get(
        "https://openrouter.ai/api/v1/auth/key",
        headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"}
    )
    key_info = resp.json()["data"]
    return {
        "usage": key_info["usage"],       # USD spent
        "limit": key_info.get("limit"),   # Monthly limit if set
        "is_free_tier": key_info.get("is_free_tier", False),
    }

# Per-request cost is in the response
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "..."}],
)
# Cost in USD (may be in usage_data header or response)
print(response.usage)
```

## Streaming

```typescript
const stream = await client.chat.completions.create({
  model: "anthropic/claude-3.5-sonnet",
  messages: [{ role: "user", content: "Write a short story about a robot." }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

## Environment-Based Model Selection

```python
import os

def get_model(tier: str = "default") -> str:
    """Select model based on environment or cost tier."""
    overrides = {
        "fast":    os.getenv("FAST_MODEL",    "google/gemini-flash-1.5"),
        "default": os.getenv("DEFAULT_MODEL", "anthropic/claude-3.5-sonnet"),
        "smart":   os.getenv("SMART_MODEL",   "openai/gpt-4o"),
        "cheap":   os.getenv("CHEAP_MODEL",   "meta-llama/llama-3.1-8b-instruct"),
    }
    return overrides.get(tier, overrides["default"])

# Usage
model = get_model("fast")       # Quick, cheap tasks
model = get_model("smart")      # Complex reasoning
model = get_model("cheap")      # Bulk processing
```

## Rate Limits

OpenRouter enforces rate limits per API key and per model. Handle them gracefully:

```python
import time
from openai import RateLimitError

def call_with_backoff(client, model: str, messages: list, max_retries: int = 3):
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(
                model=model, messages=messages
            )
        except RateLimitError as e:
            if attempt == max_retries - 1:
                raise
            wait = 2 ** attempt  # 1s, 2s, 4s
            print(f"Rate limited. Waiting {wait}s...")
            time.sleep(wait)
```

## Guidelines

- OpenRouter is fully OpenAI API compatible — drop-in replacement, just change `base_url` and API key
- Model IDs always follow `provider/model-name` format (e.g., `anthropic/claude-3.5-sonnet`)
- Free models exist (check `:free` suffix) — useful for dev/testing
- Set `HTTP-Referer` header to your app URL to appear in OpenRouter's public rankings
- Use fallback model arrays for production resilience — don't rely on a single model
- Compare costs at [openrouter.ai/models](https://openrouter.ai/models) — prices vary 100x between models
- Streaming works identically to OpenAI SDK streaming
- For rate-heavy workloads, distribute across multiple models to avoid hitting per-model limits
