---
name: openrouter
description: |
  Unified API gateway for accessing multiple LLM providers through a single endpoint.
  Supports OpenAI, Anthropic, Google, Meta, Mistral and dozens more. Provides automatic
  fallbacks, model routing, cost tracking, and OpenAI-compatible API format.
license: Apache-2.0
compatibility:
  - python 3.8+
  - typescript/node 18+
  - any OpenAI-compatible client
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - llm-gateway
    - multi-provider
    - model-routing
    - openai-compatible
    - fallbacks
---

# OpenRouter

## Basic Usage (OpenAI SDK)

```python
# basic_usage.py — Use OpenRouter as a drop-in replacement for OpenAI
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-xxxxxxxxxxxx",
)

response = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum computing briefly."},
    ],
    max_tokens=500,
    temperature=0.7,
)

print(response.choices[0].message.content)
print(f"Cost: ${response.usage.prompt_tokens * 0.000003 + response.usage.completion_tokens * 0.000015:.6f}")
```

## Model Selection and Routing

```python
# model_routing.py — Access different providers through the same API
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-xxxxxxxxxxxx",
)

models = [
    "openai/gpt-4o",
    "anthropic/claude-3.5-sonnet",
    "google/gemini-pro-1.5",
    "meta-llama/llama-3.1-405b-instruct",
    "mistralai/mistral-large",
]

for model in models:
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": "Say hello in one word."}],
        max_tokens=10,
    )
    print(f"{model}: {response.choices[0].message.content}")
```

## Automatic Fallbacks

```python
# fallbacks.py — Configure model fallbacks for reliability
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-xxxxxxxxxxxx",
)

# Use route parameter for fallback behavior
response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello!"}],
    extra_body={
        "route": "fallback",  # Auto-fallback to other providers if primary fails
        "models": [
            "openai/gpt-4o",
            "anthropic/claude-3.5-sonnet",
            "google/gemini-pro-1.5",
        ],
    },
)
print(f"Used model: {response.model}")
```

## Streaming

```python
# streaming.py — Stream responses for real-time output
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-xxxxxxxxxxxx",
)

stream = client.chat.completions.create(
    model="anthropic/claude-3.5-sonnet",
    messages=[{"role": "user", "content": "Write a short poem about APIs."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

## Provider Preferences

```python
# provider_prefs.py — Control which providers and parameters are used
from openai import OpenAI

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key="sk-or-v1-xxxxxxxxxxxx",
)

response = client.chat.completions.create(
    model="openai/gpt-4o",
    messages=[{"role": "user", "content": "Hello"}],
    extra_body={
        "provider": {
            "order": ["Azure", "OpenAI"],  # Prefer Azure, fallback to OpenAI
            "allow_fallbacks": True,
            "require_parameters": True,
        },
        "transforms": ["middle-out"],  # Context compression for long inputs
    },
)
```

## Node.js / TypeScript

```typescript
// openrouter_node.ts — Use OpenRouter with the Node.js OpenAI SDK
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": "https://myapp.com",
    "X-Title": "My App",
  },
});

const response = await client.chat.completions.create({
  model: "anthropic/claude-3.5-sonnet",
  messages: [{ role: "user", content: "Hello from Node!" }],
});

console.log(response.choices[0].message.content);
```

## List Available Models

```python
# list_models.py — Query available models and their pricing
import requests

response = requests.get("https://openrouter.ai/api/v1/models")
models = response.json()["data"]

# Sort by price (prompt cost per token)
for model in sorted(models, key=lambda m: float(m.get("pricing", {}).get("prompt", "999")))[:10]:
    pricing = model.get("pricing", {})
    print(f"{model['id']}: ${float(pricing.get('prompt', 0))*1_000_000:.2f}/M input, "
          f"${float(pricing.get('completion', 0))*1_000_000:.2f}/M output, "
          f"context: {model.get('context_length', 'N/A')}")
```

## Check Usage and Credits

```python
# check_credits.py — Monitor your API usage and remaining balance
import requests

response = requests.get(
    "https://openrouter.ai/api/v1/auth/key",
    headers={"Authorization": "Bearer sk-or-v1-xxxxxxxxxxxx"},
)
data = response.json()["data"]
print(f"Label: {data.get('label')}")
print(f"Usage: ${data.get('usage', 0):.4f}")
print(f"Limit: ${data.get('limit', 'unlimited')}")
```

## Key Concepts

- **OpenAI-compatible**: Use any OpenAI SDK by changing `base_url` — zero code changes needed
- **Multi-provider**: Access 200+ models from OpenAI, Anthropic, Google, Meta, Mistral, etc.
- **Fallbacks**: Automatic provider failover for high availability
- **Route modes**: `fallback` for reliability, `lowest-cost` for cheapest available provider
- **Transforms**: `middle-out` compresses long contexts to fit smaller context windows
- **Credits**: Pay-as-you-go with per-model pricing; no provider accounts needed
