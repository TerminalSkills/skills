---
name: mistral-api
description: >-
  Mistral AI API gives access to Mistral's chat, code, embedding, OCR and speech
  models from a Paris-based provider, with an optional EU regional endpoint. Use
  when you need chat completions, streaming, function calling, JSON output,
  Codestral fill-in-the-middle, embeddings, or EU-region inference.
license: Apache-2.0
compatibility: "Python 3.10+ (mistralai 2.x/3.x) or Node.js 18+ (@mistralai/mistralai)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/mistralai/client-python
  tags: "mistral, llm, european-ai, gdpr, code-generation"
  use-cases: "Generate code completions and fill-in-the-middle with Codestral, Run GDPR-compliant AI workloads with EU data residency, Build multilingual NLP pipelines with strong French/European language support"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Mistral AI API

## Overview

Mistral AI is a French AI company whose API serves chat, reasoning, code (Codestral), embedding, OCR and speech models. The chat endpoint (`/v1/chat/completions`) follows OpenAI conventions. Requests go to `api.mistral.ai` by default; EU or US processing is available through paid regional endpoints (see Regional inference). The official SDKs are `mistralai` (2.x and 3.x; 3.3.0 is current) for Python and `@mistralai/mistralai` for TypeScript.

## Setup

```bash
# Python 3.10+
pip install mistralai

# TypeScript/Node
npm install @mistralai/mistralai
```

```bash
export MISTRAL_API_KEY=...
```

## Available Models

| Model (alias) | Context | Best for |
|---|---|---|
| `mistral-large-latest` | 256k | Large 3, flagship general model (Large 4 is `mistral-large-4`, 1M context) |
| `mistral-medium-latest` | 256k | Medium 3.5, multimodal, agentic and coding work |
| `mistral-small-latest` | 256k | Small 4, cheapest everyday chat, reasoning and code |
| `codestral-latest` | 128k | Code generation and fill-in-the-middle |
| `mistral-embed` | 8k | Text embeddings (1024 dimensions) |

Aliases move to newer versions; pin a dated name (`mistral-small-2603`, `codestral-2508`) in production. `open-mistral-nemo` was deprecated in May 2026 with retirement scheduled for 2026-07-31 (docs.mistral.ai/models still lists it as Deprecated). The full list with status and retirement dates is at `docs.mistral.ai/models`.

## Instructions

### Basic Chat Completion (Python)

In `mistralai` 2.x and later the import is `from mistralai.client import Mistral`; `from mistralai import Mistral` raises ImportError. On the old 1.x line pin `pip install "mistralai<2"`.

```python
import os
from mistralai.client import Mistral

client = Mistral(api_key=os.environ["MISTRAL_API_KEY"])

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
import { Mistral } from "@mistralai/mistralai";   // named export; there is no default export

const client = new Mistral({ apiKey: process.env.MISTRAL_API_KEY });

const response = await client.chat.complete({
  model: "mistral-large-latest",
  messages: [{ role: "user", content: "Hello from TypeScript!" }],
});

console.log(response.choices[0].message.content);
```

### Streaming

```python
from mistralai.client import Mistral

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
from mistralai.client import Mistral

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

messages = [{"role": "user", "content": "Find laptops under 1000 dollars"}]

response = client.chat.complete(
    model="mistral-large-latest",
    messages=messages,
    tools=tools,
    tool_choice="auto",   # default; "any" forces a call, "none" forbids one
)

if response.choices[0].finish_reason == "tool_calls":
    tool_call = response.choices[0].message.tool_calls[0]
    args = json.loads(tool_call.function.arguments)
    print(f"Function: {tool_call.function.name}, Args: {args}")

    # Add tool result and continue
    messages.append(response.choices[0].message)   # keep the assistant message with its tool_calls
    messages.append({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "name": tool_call.function.name,
        "content": json.dumps([{"name": "ThinkPad X1", "price": 899}]),
    })

    final = client.chat.complete(model="mistral-large-latest", messages=messages)
    print(final.choices[0].message.content)
```

### JSON Mode

```python
from mistralai.client import Mistral
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

JSON mode only guarantees valid JSON, not your field names. For a guaranteed schema use structured outputs: define a Pydantic model and call `client.chat.parse(model=..., messages=..., response_format=Book)`; the parsed object is on `response.choices[0].message.parsed`.

### Text Embeddings

```python
from mistralai.client import Mistral

client = Mistral()

response = client.embeddings.create(
    model="mistral-embed",
    inputs=["Machine learning is transforming industries.", "AI is the future of technology."],
)

embeddings = [item.embedding for item in response.data]
print(f"Embedding dimension: {len(embeddings[0])}")  # 1024
```

### Codestral for Code Completion

```python
from mistralai.client import Mistral

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

## Examples

### Example 1: Summarise support tickets in French with EU processing

Request: "Summarise these three support tickets in French and keep inference in the EU."

```python
import os
from mistralai.client import Mistral

client = Mistral(api_key=os.environ["MISTRAL_API_KEY"], server="eu")
tickets = "1) Facture en double\n2) Mot de passe oublie\n3) Livraison en retard"
r = client.chat.complete(
    model="mistral-small-latest",
    messages=[{"role": "user", "content": f"Resume ces tickets en une phrase chacun:\n{tickets}"}],
)
print(r.choices[0].message.content)
print(r.usage.total_tokens)
```

Result: three one-line French summaries from `api.eu.mistral.ai`, and a token count to track cost at the 1.1x regional rate.

### Example 2: Complete a function with Codestral

Request: "Fill in the body of this function between the signature and the test call."

```python
r = client.fim.complete(
    model="codestral-latest",
    prompt="def slugify(title: str) -> str:\n    ",
    suffix="\n\nprint(slugify('Hello, World!'))",
)
print(r.choices[0].message.content)
```

Result: only the missing middle (for example `return re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")`), ready to splice between prompt and suffix. Add `import re` yourself if the model does not.

## Regional inference and GDPR

The default endpoint `api.mistral.ai` makes no commitment about where requests are processed. For EU processing use the regional endpoint, billed at 1.1x list price:

```python
client = Mistral(api_key=os.environ["MISTRAL_API_KEY"], server="eu")   # api.eu.mistral.ai; TypeScript: { server: "eu" }
```

Regional endpoints serve only models hosted in that region (check with `client.models.list()`), support function calling as the only tool, and do not offer Agents, Batch or the Files API. Account data, API keys and billing metadata are not regional. Zero data retention and data-processing terms are arranged with Mistral for your organization; read the DPA rather than assuming a default.

## Guidelines

- Use `mistral-large-latest` or `mistral-medium-latest` for complex tasks, `mistral-small-latest` for cost savings.
- Codestral is specialised for code and for fill-in-the-middle (`client.fim.complete`).
- The `mistral-embed` model produces 1024-dimensional vectors.
- Mistral models have strong multilingual performance, especially in French, Spanish, Italian, German, and Portuguese.
- `tool_choice` defaults to `"auto"`; always send the tool result back with `tool_call_id`.
- In JSON mode also ask for JSON in the prompt and name the fields you expect.
- Read the API key from `MISTRAL_API_KEY`; never hard-code it.
- Aliases such as `*-latest` change under you; pin dated model names for reproducible output.
