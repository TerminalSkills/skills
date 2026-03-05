---
name: cerebras
description: Expert guidance for Cerebras Inference, the ultra-fast LLM inference service powered by the world's largest chip (Wafer-Scale Engine). Helps developers integrate Cerebras' API for applications requiring the fastest possible token generation — real-time chat, code completion, and interactive AI experiences.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
  - llm
  - inference
  - api
  - fast-inference
  - wafer-scale
---

# Cerebras — Wafer-Scale LLM Inference


## Overview

You are an expert in Cerebras Inference, the ultra-fast LLM inference service powered by the world's largest chip (Wafer-Scale Engine). You help developers integrate Cerebras' API for applications requiring the fastest possible token generation — real-time chat, code completion, and interactive AI experiences.

## Instructions

### Chat Completions

```typescript
// src/llm/cerebras.ts — Cerebras API (OpenAI-compatible)
import OpenAI from "openai";

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseURL: "https://api.cerebras.ai/v1",
});

// Basic completion — up to 2000+ tokens/second
async function chat(prompt: string) {
  const response = await cerebras.chat.completions.create({
    model: "llama3.3-70b",                // Llama 3.3 70B on Cerebras hardware
    messages: [
      { role: "system", content: "You are a helpful coding assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
    top_p: 1,
  });

  // Response includes usage with Cerebras-specific speed metrics
  console.log(`Tokens/sec: ${response.usage?.completion_tokens! / (response.usage as any).completion_time}`);

  return response.choices[0].message.content;
}

// Streaming — first token in <200ms
async function streamChat(prompt: string, onChunk: (text: string) => void) {
  const stream = await cerebras.chat.completions.create({
    model: "llama3.3-70b",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let full = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    full += text;
    onChunk(text);
  }
  return full;
}

// JSON mode
async function structuredOutput(prompt: string) {
  const response = await cerebras.chat.completions.create({
    model: "llama3.3-70b",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  return JSON.parse(response.choices[0].message.content!);
}
```

### Tool Use / Function Calling

```typescript
async function chatWithTools(prompt: string) {
  const response = await cerebras.chat.completions.create({
    model: "llama3.3-70b",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_stock_price",
          description: "Get the current stock price for a ticker symbol",
          parameters: {
            type: "object",
            properties: {
              ticker: { type: "string", description: "Stock ticker (e.g., AAPL)" },
            },
            required: ["ticker"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  const msg = response.choices[0].message;
  if (msg.tool_calls) {
    // Execute the tool and send results back
    const toolResults = await Promise.all(
      msg.tool_calls.map(async (call) => {
        const args = JSON.parse(call.function.arguments);
        const result = await executeFunction(call.function.name, args);
        return {
          role: "tool" as const,
          tool_call_id: call.id,
          content: JSON.stringify(result),
        };
      })
    );

    // Get final response with tool results
    const final = await cerebras.chat.completions.create({
      model: "llama3.3-70b",
      messages: [
        { role: "user", content: prompt },
        msg,
        ...toolResults,
      ],
    });
    return final.choices[0].message.content;
  }

  return msg.content;
}
```

### Python Integration

```python
# src/cerebras_client.py — Cerebras with Python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["CEREBRAS_API_KEY"],
    base_url="https://api.cerebras.ai/v1",
)

# Chat completion
response = client.chat.completions.create(
    model="llama3.3-70b",
    messages=[{"role": "user", "content": "Write a Python quicksort implementation"}],
    temperature=0.3,
    max_tokens=500,
)
print(response.choices[0].message.content)

# Streaming
stream = client.chat.completions.create(
    model="llama3.3-70b",
    messages=[{"role": "user", "content": "Explain transformers in 5 sentences"}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

### Available Models

```markdown
## Cerebras Models
- **llama3.3-70b** — Llama 3.3 70B, best quality, ~2000 tok/s output
- **llama3.1-8b** — Llama 3.1 8B, fastest option, ~2500+ tok/s output
- **llama3.1-70b** — Llama 3.1 70B, large context (128K tokens)

## Speed Comparison (approximate)
- Cerebras: 2000+ tok/s (70B model)
- Groq: 300-400 tok/s (70B model)
- Cloud GPU (A100): 50-80 tok/s (70B model)
- Local (M3 Max): 20-40 tok/s (70B quantized)
```

## Installation

```bash
# Use any OpenAI-compatible SDK
npm install openai
pip install openai

# Set base_url to https://api.cerebras.ai/v1
```


## Examples

### Example 1

**User request:** "Help me set up Cerebras"

The agent follows the instructions above to configure Cerebras with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Cerebras configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Use for latency-critical applications** — Cerebras is the fastest inference available; ideal for real-time chat and autocomplete
2. **OpenAI SDK drop-in** — Change base URL from OpenAI to Cerebras; your code works unchanged
3. **8B for simple tasks** — Use llama3.1-8b for classification, extraction, and simple Q&A; save 70B for complex reasoning
4. **Stream everything** — First-token latency is <200ms; streaming gives users instant feedback
5. **JSON mode for structured output** — Use `response_format: { type: "json_object" }` for reliable parsing
6. **Batch simple requests** — For bulk processing, send multiple independent prompts in parallel
7. **Monitor rate limits** — Free tier has request limits; check headers for remaining quota
8. **Fallback strategy** — Have a fallback to Groq or OpenAI; Cerebras can have capacity constraints during high demand
