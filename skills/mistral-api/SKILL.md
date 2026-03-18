---
name: mistral-api
description: >-
  Mistral AI API — European LLM provider with strong code and reasoning models.
  Use when you need GDPR-compliant AI inference, code generation with Codestral,
  multilingual tasks, cost-efficient inference, or a European data-residency option.
license: Apache-2.0
compatibility: "Python 3.9+ or Node.js 18+ with mistralai SDK"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["mistral", "llm", "european-ai", "gdpr", "code-generation"]
  use-cases:
    - "Generate code completions and fill-in-the-middle with Codestral"
    - "Run GDPR-compliant AI workloads with EU data residency"
    - "Build multilingual NLP pipelines with strong French/European language support"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Mistral AI API

## Overview

Mistral AI is a French AI company providing high-quality, cost-efficient language models with EU data residency and GDPR compliance. Their models excel at code generation (Codestral), multilingual tasks, and reasoning. Mistral's API follows OpenAI conventions closely, making integration straightforward.

## Setup

```bash
# Python
pip install mistralai

# TypeScript/Node
npm install @mistralai/mistralai
```

```bash
export MISTRAL_API_KEY=...
```

## Available Models

| Model | Context | Best For |
|---|---|---|
| `mistral-large-latest` | 128k | Most capable, complex reasoning |
| `mistral-small-latest` | 128k | Cost-efficient, everyday tasks |
| `codestral-latest` | 256k | Code generation & completion |
| `mistral-embed` | 8k | Text embeddings |
| `open-mistral-nemo` | 128k | Open-weight, edge deployment |

## Instructions

### Basic Chat Completion (Python)

```python
from mistralai import Mistral

client = Mistral(api_key="your_api_key")  # or reads MISTRAL_API_KEY

response = client.chat.complete(
    model="mistral-large-latest",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain the difference between async and sync programming."},
    ],
)

print(response.choices[0].message.content)
print(f"Prompt tokens: {response.usage.prompt_tokens}")
print(f"Completion tokens: {response.usage.completion_tokens}")
```

### TypeScript/Node.js

```typescript
import Mistral from "@mistralai/mistralai";

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const response = await client.chat.complete({
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Hello from TypeScript!" }],
});

console.log(response.choices[0].message.content);
```

### Streaming

```python
from mistralai import Mistral

client = Mistral()

stream = client.chat.stream(
    model="mistral-small-latest",
    messages=[{"role": "user", "content": "Write a haiku about programming."}],
)

for event in stream:
    chunk = event.data.choices[0].delta.content
    if chunk:
        print(chunk, end="", flush=True)
print()
```

### Function Calling

```python
import json
from mistralai import Mistral

client = Mistral()

tools = [
    {
        "type": "function",
        "function": {
            "name": "search_products",
            "description": "Search for products in a catalog",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string"},
                    "max_price": {"type": "number"},
                    "category": {"type": "string"},
                },
                "required": ["query"],
            },
        },
    }
]

messages = [{"role": "user", "content": "Find laptops under $1000"}]

response = client.chat.complete(
    model="mistral-large-latest",
    messages=messages,
    tools=tools,
    tool_choice="auto",
)

if response.choices[0].finish_reason == "tool_calls":
    tool_call = response.choices[0].message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    print(f"Function: {tool_call.function.name}, Args: {args}")

    # Add tool result and continue
    messages.append(response.choices[0].message)
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": json.dumps([{"name": "ThinkPad X1", "price": 899}]),
    })

    final = client.chat.complete(model="mistral-large-latest", messages=messages)
    print(final.choices[0].message.content)
```

### JSON Mode

```python
from mistralai import Mistral
import json

client = Mistral()

response = client.chat.complete(
    model="mistral-small-latest",
    messages=[
        {
            "role": "user",
            "content": "Return a JSON object with fields: title, author, year for the book '1984'",
        }
    ],
    response_format={"type": "json_object"},
)

data = json.loads(response.choices[0].message.content)
print(data)  # {"title": "1984", "author": "George Orwell", "year": 1949}
```

### Text Embeddings

```python
from mistralai import Mistral

client = Mistral()

response = client.embeddings.create(
    model="mistral-embed",
    inputs=["Machine learning is transforming industries.", "AI is the future of technology."],
)

embeddings = [item.embedding for item in response.data]
print(f"Embedding dimension: {len(embeddings[0])}")  # 1024

# Compute cosine similarity
import numpy as np

def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))

similarity = cosine_similarity(embeddings[0], embeddings[1])
print(f"Similarity: {similarity:.3f}")
```

### Codestral for Code Completion

```python
from mistralai import Mistral

client = Mistral()

# Fill-in-the-middle (FIM) — Codestral's signature feature
response = client.fim.complete(
    model="codestral-latest",
    prompt="def fibonacci(n):\n    if n <= 1:\n        return n\n    ",
    suffix="\n\nresult = fibonacci(10)\nprint(result)",
)

print(response.choices[0].message.content)
# Returns the middle code that connects prompt to suffix
```

```python
# Standard code generation
response = client.chat.complete(
    model="codestral-latest",
    messages=[
        {
            "role": "user",
            "content": "Write a Python class for a rate limiter using token bucket algorithm.",
        }
    ],
)
print(response.choices[0].message.content)
```

## GDPR Compliance Notes

- All API data processed in EU data centers by default.
- Mistral AI is headquartered in Paris, France — subject to EU/GDPR jurisdiction.
- For enterprise data residency guarantees, use Mistral's Azure or GCP deployments.
- No training on user data by default — check your plan's DPA for details.

## Guidelines

- Use `mistral-large-latest` for complex tasks, `mistral-small-latest` for cost savings.
- Codestral is specialized for code and significantly outperforms general models on FIM tasks.
- The `mistral-embed` model produces 1024-dimensional vectors.
- Mistral models have strong multilingual performance, especially in French, Spanish, Italian, German, and Portuguese.
- Function calling requires `tool_choice` to be set — use `"auto"` for model-driven decisions.
- JSON mode requires the system or user prompt to explicitly mention JSON output.
