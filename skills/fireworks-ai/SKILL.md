---
name: fireworks-ai
description: Expert guidance for Fireworks AI, the platform for running open-source LLMs (Llama, Mixtral, Qwen, etc.) with enterprise-grade speed and reliability. Helps developers integrate Fireworks' inference API, fine-tune models, and deploy custom model endpoints with function calling and structured output support.
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
  - fine-tuning
  - serverless
---

# Fireworks AI — Fast Open-Source Model Inference


## Overview


Fireworks AI, the platform for running open-source LLMs (Llama, Mixtral, Qwen, etc.) with enterprise-grade speed and reliability. Helps developers integrate Fireworks' inference API, fine-tune models, and deploy custom model endpoints with function calling and structured output support.


## Instructions

### Chat Completions

```typescript
// src/llm/fireworks.ts — Fireworks AI inference (OpenAI-compatible)
import OpenAI from "openai";

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY!,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

// Chat completion with open-source models
async function chat(prompt: string, model = "accounts/fireworks/models/llama-v3p3-70b-instruct") {
  const response = await fireworks.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });
  return response.choices[0].message.content;
}

// Streaming
async function streamChat(prompt: string, onChunk: (text: string) => void) {
  const stream = await fireworks.chat.completions.create({
    model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
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
```

### Structured Output (JSON Mode & Grammar)

```typescript
// Force structured JSON output
async function extractData(text: string) {
  const response = await fireworks.chat.completions.create({
    model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    messages: [
      {
        role: "system",
        content: `Extract product information. Return JSON: { "name": string, "price": number, "category": string, "features": string[] }`,
      },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });
  return JSON.parse(response.choices[0].message.content!);
}

// Grammar-constrained generation (Fireworks-specific)
async function generateWithGrammar(prompt: string) {
  const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "accounts/fireworks/models/llama-v3p3-70b-instruct",
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_object",
        schema: {
          type: "object",
          properties: {
            sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            keywords: { type: "array", items: { type: "string" } },
          },
          required: ["sentiment", "confidence", "keywords"],
        },
      },
    }),
  });
  return response.json();
}
```

### Function Calling

```typescript
// Tool use with Fireworks
async function agentWithTools(prompt: string) {
  const response = await fireworks.chat.completions.create({
    model: "accounts/fireworks/models/firefunction-v2",  // Optimized for function calling
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "search_database",
          description: "Search the product database",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              category: { type: "string", enum: ["electronics", "clothing", "books"] },
              max_price: { type: "number" },
            },
            required: ["query"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });
  return response;
}
```

### Fine-Tuning

```python
# fine_tune.py — Fine-tune a model on Fireworks
import requests

FIREWORKS_API_KEY = os.environ["FIREWORKS_API_KEY"]
BASE_URL = "https://api.fireworks.ai/inference/v1"

# Upload training data (JSONL format)
def upload_dataset(filepath: str):
    with open(filepath, "rb") as f:
        response = requests.post(
            f"{BASE_URL}/files",
            headers={"Authorization": f"Bearer {FIREWORKS_API_KEY}"},
            files={"file": (filepath, f, "application/jsonl")},
            data={"purpose": "fine-tune"},
        )
    return response.json()["id"]

# Start fine-tuning job
def create_fine_tune(dataset_id: str, base_model: str = "accounts/fireworks/models/llama-v3p1-8b-instruct"):
    response = requests.post(
        f"{BASE_URL}/fine_tuning/jobs",
        headers={
            "Authorization": f"Bearer {FIREWORKS_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": base_model,
            "training_file": dataset_id,
            "hyperparameters": {
                "n_epochs": 3,
                "learning_rate_multiplier": 1.0,
                "batch_size": 8,
            },
        },
    )
    return response.json()

# Training data format (JSONL):
# {"messages": [{"role": "system", "content": "..."}, {"role": "user", "content": "..."}, {"role": "assistant", "content": "..."}]}
```

### Available Models

```markdown
## Popular Models on Fireworks
- **llama-v3p3-70b-instruct** — Best open-source general-purpose model
- **llama-v3p1-8b-instruct** — Fast, cheap, good for simple tasks
- **mixtral-8x22b-instruct** — Strong multilingual, large context
- **qwen2p5-72b-instruct** — Excellent for coding and math
- **firefunction-v2** — Optimized for function calling / tool use
- **deepseek-v3** — Strong reasoning and code generation
- **gemma-2-27b-it** — Google's compact model
```

## Installation

```bash
# Use any OpenAI-compatible SDK
npm install openai
# Set baseURL to https://api.fireworks.ai/inference/v1

pip install openai
# Set base_url to https://api.fireworks.ai/inference/v1
```


## Examples


### Example 1: Integrating Fireworks Ai into an existing application

**User request:**

```
Add Fireworks Ai to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Fireworks Ai client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing structured output performance

**User request:**

```
My Fireworks Ai calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Fireworks Ai's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **OpenAI SDK compatibility** — Use the standard OpenAI SDK with a different base URL; zero code changes to switch
2. **firefunction-v2 for tools** — Use the function-calling-optimized model for reliable tool use
3. **JSON schema for structure** — Fireworks supports JSON schema constraints; use them for reliable structured output
4. **Fine-tune 8B for cost** — Fine-tune Llama 3.1 8B for domain-specific tasks; cheaper and faster than using 70B
5. **Batch API for throughput** — Use Fireworks' batch API for bulk processing at lower cost
6. **Model routing** — Use 8B for simple tasks, 70B for complex reasoning; route based on query complexity
7. **Serverless vs dedicated** — Start with serverless; switch to dedicated endpoints for consistent latency at scale
8. **Monitor token usage** — Fireworks pricing is per-token; track usage per feature to optimize costs
