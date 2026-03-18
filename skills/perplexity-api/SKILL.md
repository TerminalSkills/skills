---
name: perplexity-api
description: >-
  Perplexity API for real-time web-search-augmented LLM responses. Use when you
  need up-to-date information in AI responses, research assistants, fact-checking,
  current events coverage, or any task requiring knowledge beyond an LLM's training cutoff.
  Returns cited sources alongside answers.
license: Apache-2.0
compatibility: "Python 3.9+ with openai SDK (OpenAI-compatible API)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["perplexity", "web-search", "llm", "real-time", "citations"]
  use-cases:
    - "Build a research assistant that cites current web sources"
    - "Fact-check content against up-to-date web information"
    - "Answer questions about recent news, events, or product updates"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Perplexity API

## Overview

Perplexity AI provides LLM inference augmented with real-time web search. Unlike standard LLMs limited to training data, Perplexity's online models fetch and synthesize current web information on every query. Responses include citations to source URLs. The API is fully OpenAI-compatible — use the `openai` SDK with a custom `base_url`.

## Setup

```bash
pip install openai  # Perplexity uses OpenAI-compatible API
```

```bash
export PERPLEXITY_API_KEY=pplx-...
```

## Available Models

| Model | Type | Best For |
|---|---|---|
| `sonar` | Online | Fast web-augmented answers |
| `sonar-pro` | Online | Deep research, complex queries |
| `sonar-reasoning` | Online | Step-by-step reasoning + search |
| `sonar-reasoning-pro` | Online | Advanced reasoning + deep search |
| `r1-1776` | Offline | No search, uncensored reasoning |

**Online models** search the web on every request. **Offline models** use only training data.

## Instructions

### Basic Query with Web Search

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",  # or os.environ["PERPLEXITY_API_KEY"]
    base_url="https://api.perplexity.ai",
)

response = client.chat.completions.create(
    model="sonar",
    messages=[
        {
            "role": "system",
            "content": "Be precise and concise. Always cite your sources.",
        },
        {
            "role": "user",
            "content": "What are the latest developments in quantum computing as of today?",
        },
    ],
)

print(response.choices[0].message.content)
```

### Accessing Citations

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

response = client.chat.completions.create(
    model="sonar-pro",
    messages=[{"role": "user", "content": "What is the current price of Bitcoin?"}],
)

# Main answer
print(response.choices[0].message.content)

# Citations are in the extra_fields / model_extra
if hasattr(response, "citations"):
    for i, citation in enumerate(response.citations, 1):
        print(f"[{i}] {citation}")

# Or access via model_extra
citations = getattr(response, "citations", [])
for url in citations:
    print(f"Source: {url}")
```

### Streaming with Citations

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

stream = client.chat.completions.create(
    model="sonar",
    messages=[{"role": "user", "content": "Summarize the top tech news today."}],
    stream=True,
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
print()
```

### Deep Research with sonar-pro

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

# sonar-pro performs more web searches for comprehensive answers
response = client.chat.completions.create(
    model="sonar-pro",
    messages=[
        {
            "role": "system",
            "content": "You are a research analyst. Provide detailed, well-sourced analysis.",
        },
        {
            "role": "user",
            "content": (
                "Provide a comprehensive analysis of the current state of "
                "AI regulation globally, including recent legislation and upcoming proposals."
            ),
        },
    ],
    max_tokens=2000,
)

print(response.choices[0].message.content)
```

### Reasoning with sonar-reasoning

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

# sonar-reasoning shows chain-of-thought + searches web
response = client.chat.completions.create(
    model="sonar-reasoning",
    messages=[
        {
            "role": "user",
            "content": (
                "Based on current market data, should I invest in NVIDIA or AMD stock? "
                "Consider recent earnings and market trends."
            ),
        }
    ],
)

print(response.choices[0].message.content)
# Response includes <think> blocks with reasoning process
```

### Multi-Turn Research Session

```python
from openai import OpenAI

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

messages = [
    {
        "role": "system",
        "content": "You are a research assistant with access to current web information. "
                   "Always cite sources and indicate when information may be time-sensitive.",
    }
]

def research_chat(user_message: str) -> str:
    messages.append({"role": "user", "content": user_message})
    
    response = client.chat.completions.create(
        model="sonar-pro",
        messages=messages,
    )
    
    answer = response.choices[0].message.content
    messages.append({"role": "assistant", "content": answer})
    return answer

# Multi-turn research
print(research_chat("What are the main AI labs releasing models in 2025?"))
print(research_chat("Which of those models are available via API right now?"))
print(research_chat("Compare their pricing per million tokens."))
```

### Rate Limiting & Error Handling

```python
from openai import OpenAI, RateLimitError
import time

client = OpenAI(
    api_key="pplx-...",
    base_url="https://api.perplexity.ai",
)

def search_with_retry(query: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            response = client.chat.completions.create(
                model="sonar",
                messages=[{"role": "user", "content": query}],
                timeout=30,
            )
            return response.choices[0].message.content
        except RateLimitError:
            wait = 2 ** attempt
            print(f"Rate limited. Retrying in {wait}s...")
            time.sleep(wait)
    raise Exception("Max retries exceeded")
```

## Online vs Offline Models

| Feature | Online (sonar*) | Offline (r1-1776) |
|---|---|---|
| Web search | ✅ Real-time | ❌ Training data only |
| Citations | ✅ URL sources | ❌ Not applicable |
| Current events | ✅ Up to today | ❌ Training cutoff |
| Latency | Higher (~2–5s) | Lower (~0.5s) |
| Cost | Higher | Lower |

Use **online models** when freshness matters. Use **offline models** for tasks that don't need current data (reasoning, creative writing, code).

## Guidelines

- Online models search the web on every request — expect 2–5 second latency.
- Citations appear in the `response.citations` list (URLs).
- `sonar` is fastest for simple lookups; `sonar-pro` does multiple searches for complex topics.
- Perplexity's search is English-centric but supports other languages.
- For real-time price data or stock quotes, combine Perplexity with direct API calls for accuracy.
- The system prompt cannot disable web search for online models — use offline models if you need pure LLM responses.
- Token costs include search overhead — budget accordingly for high-volume use.
