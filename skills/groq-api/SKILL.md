---
name: groq-api
description: >-
  Ultra-fast LLM inference using the Groq API (LPU hardware). Use when you need
  the lowest-latency LLM responses, real-time AI features, high-speed streaming,
  or a drop-in OpenAI-compatible replacement. Groq's LPU delivers significantly
  faster token generation than GPU-based providers.
license: Apache-2.0
compatibility: "Python 3.9+ with groq SDK, or any OpenAI-compatible client"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["groq", "llm", "inference", "fast", "llama", "openai-compatible"]
  use-cases:
    - "Build a real-time AI chat assistant with sub-second response times"
    - "Stream LLM completions at high speed for live coding assistance"
    - "Drop-in replace OpenAI calls with Groq for 10x faster inference"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Groq API

## Overview

Groq provides ultra-fast LLM inference powered by their custom Language Processing Units (LPUs). The API is fully OpenAI-compatible, making it a drop-in replacement for most OpenAI use cases. Groq excels at real-time applications where latency matters — chat, streaming, code generation, and agentic loops that require rapid tool call cycles.

## Setup

```bash
pip install groq
# or use openai SDK directly
pip install openai
```

```bash
export GROQ_API_KEY=gsk_...
```

## Available Models

| Model | Context | Best For |
|---|---|---|
| `llama-3.3-70b-versatile` | 128k | General purpose, best quality |
| `llama-3.1-8b-instant` | 128k | Fastest responses, simple tasks |
| `mixtral-8x7b-32768` | 32k | Longer context reasoning |
| `gemma2-9b-it` | 8k | Efficient, instruction-following |

## Instructions

### Basic Chat Completion

```python
from groq import Groq

client = Groq(api_key="gsk_...")  # or reads GROQ_API_KEY from env

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain quantum entanglement in simple terms."},
    ],
    temperature=0.7,
    max_tokens=1024,
)

print(response.choices[0].message.content)
print(f"Tokens/sec: {response.usage.completion_tokens / response.usage.total_time:.0f}")
```

### Streaming Responses

```python
from groq import Groq

client = Groq()

stream = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Write a Python quicksort."}],
    stream=True,
)

for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
print()  # newline at end
```

### OpenAI Drop-in Replacement

If you already use the `openai` SDK, just change the base URL and API key:

```python
from openai import OpenAI

client = OpenAI(
    api_key="gsk_...",
    base_url="https://api.groq.com/openai/v1",
)

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)
```

### Function Calling / Tool Use

```python
import json
from groq import Groq

client = Groq()

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get current weather for a city",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "City name"},
                    "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city"],
            },
        },
    }
]

messages = [{"role": "user", "content": "What's the weather in Tokyo?"}]

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=messages,
    tools=tools,
    tool_choice="auto",
)

tool_call = response.choices[0].message.tool_calls[0]
args = json.loads(tool_call.function.arguments)
print(f"Tool called: {tool_call.function.name}, args: {args}")

# Add assistant response + tool result and continue
messages.append(response.choices[0].message)
messages.append({
    "role": "tool",
    "tool_call_id": tool_call.id,
    "content": json.dumps({"temperature": 18, "condition": "partly cloudy"}),
})

final = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=messages,
    tools=tools,
)
print(final.choices[0].message.content)
```

### JSON Mode (Structured Output)

```python
from groq import Groq
import json

client = Groq()

response = client.chat.completions.create(
    model="llama-3.3-70b-versatile",
    messages=[
        {
            "role": "system",
            "content": "You are a data extractor. Always respond with valid JSON.",
        },
        {
            "role": "user",
            "content": "Extract: name, email, phone from: 'John Doe, john@example.com, +1-555-0100'",
        },
    ],
    response_format={"type": "json_object"},
)

data = json.loads(response.choices[0].message.content)
print(data)
# {"name": "John Doe", "email": "john@example.com", "phone": "+1-555-0100"}
```

### Async Usage

```python
import asyncio
from groq import AsyncGroq

client = AsyncGroq()

async def main():
    response = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": "Hello async world!"}],
    )
    print(response.choices[0].message.content)

asyncio.run(main())
```

## Speed Comparison

Groq consistently delivers the fastest inference among major cloud providers:

| Provider | Tokens/sec (approx) | Latency (TTFT) |
|---|---|---|
| Groq (LPU) | 800–1200 | ~200ms |
| OpenAI GPT-4o | 50–80 | ~400ms |
| Anthropic Claude | 60–100 | ~600ms |
| AWS Bedrock | 40–80 | ~500ms |

*TTFT = Time to First Token. Values vary by load and model size.*

## Error Handling

```python
from groq import Groq, RateLimitError, APIStatusError
import time

client = Groq()

def chat_with_retry(messages, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=messages,
            )
        except RateLimitError:
            wait = 2 ** attempt
            print(f"Rate limited. Waiting {wait}s...")
            time.sleep(wait)
        except APIStatusError as e:
            print(f"API error {e.status_code}: {e.message}")
            raise
    raise Exception("Max retries exceeded")
```

## Guidelines

- Use `llama-3.3-70b-versatile` for best quality; `llama-3.1-8b-instant` when maximum speed is critical.
- Groq's free tier has generous rate limits; upgrade for production workloads.
- Enable streaming for any user-facing feature — the UX improvement is significant.
- The API is stateless — you must send full conversation history each request.
- For very long documents (>32k tokens), Groq supports up to 128k context with Llama 3.3.
- JSON mode requires explicitly instructing the model to output JSON in the system prompt.
- Groq does not yet support image inputs — use Gemini or GPT-4o for multimodal tasks.
