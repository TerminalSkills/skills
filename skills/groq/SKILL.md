---
name: groq
description: Expert guidance for Groq, the LLM inference platform that provides the fastest token generation speeds available, powered by custom LPU (Language Processing Unit) hardware. Helps developers integrate Groq's API for real-time AI applications where latency matters — chatbots, code completion, and streaming responses.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+, a GroqCloud API key (GROQ_API_KEY)"
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/groq/groq-python
  category: data-ai
  tags: "llm, inference, api, fast-inference, chat"
---

# Groq — Ultra-Fast LLM Inference


## Overview


Groq, the LLM inference platform that provides the fastest token generation speeds available, powered by custom LPU (Language Processing Unit) hardware. Helps developers integrate Groq's API for real-time AI applications where latency matters — chatbots, code completion, and streaming responses.


## Instructions

### Basic Chat Completion

```typescript
// src/llm/groq-client.ts — Groq API (OpenAI-compatible)
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

// Basic completion — fastest LLM inference available
async function chat(prompt: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",     // Fast and capable
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant. Be concise and direct.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });

  return completion.choices[0].message.content ?? "";
}

// Streaming for real-time UI
async function streamChat(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const stream = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    stream: true,
  });

  let fullResponse = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content ?? "";
    fullResponse += text;
    onChunk(text);
  }
  return fullResponse;
}
```

### Structured Output (JSON Mode and JSON Schema)

```typescript
// src/llm/structured.ts — Get structured JSON responses from Groq
async function extractEntities(text: string) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      {
        role: "system",
        content: `Extract entities from the text. Return JSON with this structure:
          { "people": [string], "organizations": [string], "locations": [string], "dates": [string] }`,
      },
      { role: "user", content: text },
    ],
    response_format: { type: "json_object" },
    temperature: 0,                        // Deterministic for extraction
  });

  return JSON.parse(completion.choices[0].message.content!);
}

// Schema-enforced output: response_format { type: "json_schema", json_schema: { name, strict: true, schema } }
// guarantees the shape on the models that support it (see the Structured Outputs page). JSON mode above only guarantees valid JSON.

// Tool use / Function calling
async function chatWithTools(prompt: string, tools: any[]) {
  const completion = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        type: "function",
        function: {
          name: "get_weather",
          description: "Get the current weather for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["city"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "search_web",
          description: "Search the web for information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
            },
            required: ["query"],
          },
        },
      },
    ],
    tool_choice: "auto",
  });

  const toolCalls = completion.choices[0].message.tool_calls;
  if (toolCalls) {
    for (const call of toolCalls) {
      console.log(`Tool: ${call.function.name}, Args: ${call.function.arguments}`);
    }
  }
  return completion;
}
```

### Audio Transcription (Whisper)

```typescript
// src/audio/transcribe.ts — Fast audio transcription via Groq
import fs from "fs";

async function transcribeAudio(filePath: string) {
  // The SDK types only `text`; verbose_json also returns `segments` and `duration`.
  const transcription = (await groq.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-large-v3-turbo",       // Fastest Whisper model
    language: "en",                         // Optional: specify language
    response_format: "verbose_json",       // Includes timestamps
    temperature: 0,
  })) as { text: string; segments?: { start: number; end: number; text: string }[]; duration?: number };

  return {
    text: transcription.text,
    segments: transcription.segments?.map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text,
    })),
    duration: transcription.duration,
  };
}

// Translate audio to English
async function translateAudio(filePath: string) {
  const translation = await groq.audio.translations.create({
    file: fs.createReadStream(filePath),
    model: "whisper-large-v3",            // the turbo model does not support translation
    response_format: "text",
  });
  return translation;
}
```

### Model Selection

```typescript
// Production models listed at console.groq.com/docs/models (checked October 2026).
// llama-3.3-70b-versatile and llama-3.1-8b-instant were shut down on 2026-08-16 for free and developer-tier accounts (still listed for Enterprise contracts); Mixtral 8x7B and Gemma 2 9B are gone too; call GET https://api.groq.com/openai/v1/models for the live list.
const MODELS = {
  "openai/gpt-oss-120b":     { contextWindow: 131_072, speed: "~500 tok/s", bestFor: "general chat, coding, tool use, reasoning, built-in browser search and code execution" },
  "openai/gpt-oss-20b":      { contextWindow: 131_072, speed: "~1000 tok/s", bestFor: "classification, extraction, cheap fast tasks" },
  "whisper-large-v3-turbo":  { contextWindow: 0, speed: "audio", bestFor: "fast transcription only, no translation ($0.04 per hour)" },
  "whisper-large-v3":        { contextWindow: 0, speed: "audio", bestFor: "highest-accuracy transcription and translation" },
};
// Preview models (qwen/qwen3.8-27b, Orpheus text-to-speech, Prompt Guard) may be discontinued at short notice: do not rely on them in production.

function selectModel(task: "chat" | "extract" | "code" | "fast" | "reason"): string {
  switch (task) {
    case "chat": return "openai/gpt-oss-120b";
    case "extract": return "openai/gpt-oss-20b";
    case "code": return "openai/gpt-oss-120b";
    case "fast": return "openai/gpt-oss-20b";
    case "reason": return "openai/gpt-oss-120b";
  }
}
```

Model IDs are retired on a schedule: check https://console.groq.com/docs/deprecations and move off any ID listed there before its shutdown date.

### Python Integration

```python
# src/groq_client.py — Groq with Python (OpenAI-compatible)
import os
from groq import Groq

client = Groq(api_key=os.environ["GROQ_API_KEY"])

# Basic completion
response = client.chat.completions.create(
    model="openai/gpt-oss-120b",
    messages=[{"role": "user", "content": "Explain quantum computing in 3 sentences"}],
    temperature=0.7,
    max_tokens=200,
)
print(response.choices[0].message.content)

# With OpenAI SDK (drop-in replacement)
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["GROQ_API_KEY"],
    base_url="https://api.groq.com/openai/v1",
)
# Same API, Groq's speed
```

## Installation

```bash
# TypeScript/JavaScript
npm install groq-sdk

# Python
pip install groq

# Or use with any OpenAI-compatible SDK
# Just set base_url to https://api.groq.com/openai/v1
```


## Examples


### Example 1: Integrating Groq into an existing application

**User request:**

```
Add Groq to my Next.js app for the AI chat feature. I want streaming responses.
```

The agent installs the SDK, creates an API route that initializes the Groq client, configures streaming, selects an appropriate model, and wires up the frontend to consume the stream. It handles error cases and sets up proper environment variable management for the API key.

### Example 2: Optimizing structured output performance

**User request:**

```
My Groq calls are slow and expensive. Help me optimize the setup.
```

The agent reviews the current implementation, identifies issues (wrong model selection, missing caching, inefficient prompting, no batching), and applies optimizations specific to Groq's capabilities — adjusting model parameters, adding response caching, and implementing retry logic with exponential backoff.


## Guidelines

1. **Use Groq for latency-sensitive tasks** — Chatbots, autocomplete, real-time analysis; gpt-oss-120b runs at roughly 500 tokens per second
2. **openai/gpt-oss-20b for simple tasks** — Don't use the 120B model for classification or extraction; 20B is faster and cheaper
3. **JSON mode for structured output** — Use `response_format: { type: "json_object" }` for reliable structured responses
4. **Stream everything user-facing** — With Groq's speed, streaming feels instant; still use it for perceived responsiveness
5. **Whisper for audio** — Groq-hosted Whisper transcribes quickly; uploads are limited to 25 MB on the free tier and 100 MB on the developer tier (translation needs `whisper-large-v3`)
6. **Rate limits vary by model** — Check your rate limits in the Groq dashboard; smaller models have higher request limits
7. **OpenAI SDK compatibility** — Switch from OpenAI to Groq by changing the base URL; no code changes needed
8. **Check the model list before shipping** — Llama 3.x, Mixtral and Gemma 2 IDs from older tutorials no longer work on free and developer accounts; query `/openai/v1/models`
9. **Fallback to other providers** — Groq can have capacity constraints during peak; have a fallback to OpenAI or Anthropic
