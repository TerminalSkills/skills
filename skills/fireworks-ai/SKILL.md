---
name: fireworks-ai
description: Fireworks AI runs open-weight LLMs (Kimi, GLM, DeepSeek, Qwen, gpt-oss and others) through an OpenAI-compatible serverless API and dedicated deployments. Use when integrating Fireworks inference, streaming chat, tool calling, JSON-schema structured output, prompt caching, batch inference, or fine-tuning a model with firectl and serving the result.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.1.0
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

Fireworks AI serves open-weight models behind an OpenAI-compatible API at `https://api.fireworks.ai/inference/v1`. Serverless is billed per token and needs no setup; dedicated deployments give you GPUs for consistent latency or for your own fine-tuned models. The catalog turns over quickly (Fireworks gives at least two weeks of notice before removing a serverless model), so pick model IDs from the current "Which model should I use?" guide and the Model Library, never from an old tutorial.

## Instructions

### Setup

Create a key in the Fireworks dashboard, then export it. Any OpenAI SDK works with a different base URL; Fireworks also ships its own SDK (alpha, needs `--pre`) and an Anthropic-compatible endpoint at `https://api.fireworks.ai/inference`.

```bash
export FIREWORKS_API_KEY="$(pass show fireworks/api-key)"   # key created at https://app.fireworks.ai/settings/users/api-keys
npm install openai          # or: pip install openai
pip install --pre fireworks-ai   # optional native SDK: from fireworks import Fireworks
```

Model IDs have the form `accounts/fireworks/models/<slug>`. Slugs named in the current docs include `glm-5p3-flash` (quickstart), `glm-5p3`, `kimi-k3`, `deepseek-v4p1-flash-1017`, `minimax-m3`, `qwen3p7-plus`, `gpt-oss-120b` and `qwen3-8b` (small and cheap). Older slugs such as `llama-v3p3-70b-instruct`, `firefunction-v2` or `mixtral-8x22b-instruct` are not in the current guides: check the Model Library before relying on them.

### Chat Completions and Streaming

```typescript
// src/llm/fireworks.ts
import OpenAI from "openai";

const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY!,
  baseURL: "https://api.fireworks.ai/inference/v1",
});

const MODEL = "accounts/fireworks/models/glm-5p3-flash";

async function chat(prompt: string, model = MODEL) {
  const response = await fireworks.chat.completions.create({
    model,
    messages: [
      { role: "system", content: "You answer questions about our shipping policy in two sentences." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });
  return response.choices[0].message.content;
}

async function streamChat(prompt: string, onChunk: (text: string) => void) {
  const stream = await fireworks.chat.completions.create({
    model: MODEL,
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

### Structured Output

`json_schema` is the recommended mode; `json_object` forces any valid JSON. In both cases also tell the model in the prompt to answer in JSON, or it may emit whitespace until the token limit. If `finish_reason` is `length` the JSON is truncated, so raise `max_tokens`.

```typescript
async function analyzeReview(text: string) {
  const response = await fireworks.chat.completions.create({
    model: "accounts/fireworks/models/deepseek-v4p1-flash-1017",
    messages: [
      { role: "system", content: "Classify the review. Reply in JSON with sentiment, confidence and keywords." },
      { role: "user", content: text },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "ReviewAnalysis",
        schema: {
          type: "object",
          properties: {
            sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
            confidence: { type: "number" },
            keywords: { type: "array", items: { type: "string" } },
          },
          required: ["sentiment", "confidence", "keywords"],
        },
      },
    },
    temperature: 0,
    max_tokens: 512,
  });
  return JSON.parse(response.choices[0].message.content!);
}
```

Supported schema keywords include `properties`, `required`, `enum`, `anyOf`/`allOf`/`oneOf`, `pattern` (best effort), length and size limits, and in-document `$ref`/`$defs`. External `$ref` URIs are not supported. Custom BNF grammars are available as a second mode (see the Structured Outputs docs).

### Tool Calling

Standard OpenAI `tools` format. Use a low temperature (0.0 to 0.3) to reduce invented parameter values.

```typescript
async function findProducts(prompt: string) {
  const response = await fireworks.chat.completions.create({
    model: "accounts/fireworks/models/kimi-k3",
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
    temperature: 0.1,
  });
  // response.choices[0].message.tool_calls: run each call, then send the result back
  // as a { role: "tool", tool_call_id, content } message for the final answer.
  return response.choices[0].message;
}
```

### Fine-Tuning

Managed supervised fine-tuning (SFT) trains a LoRA on a tunable base model; DPO/ORPO and an RL Training API also exist. Trained models are served from a dedicated deployment. Install `firectl` (`brew tap fw-ai/firectl && brew install firectl`; Linux builds are on the firectl docs page) and authenticate it as described in the firectl authentication docs.

```bash
# Check the base model is tunable (look for Tunable: true)
firectl model get -a fireworks qwen3-8b

# Dataset: JSONL, 3 to 3 million lines, one {"messages": [...]} object per line (optional "tools")
firectl dataset create support-tickets-v1 ./support-tickets.jsonl

firectl sftj create --base-model qwen3-8b --dataset support-tickets-v1 --output-model ticket-triage-v1
firectl sftj get ticket-triage-v1-job   # use the job ID printed by the create command
firectl model list

# Serve it
firectl deployment create ticket-triage-v1 --deployment-shape default
```

Each training line looks like `{"messages": [{"role": "user", "content": "Refund for order 8841?"}, {"role": "assistant", "content": "Refunds ..."}]}`. Roles are `system`, `user`, `assistant`, `tool`; a per-message `weight` of `0` excludes that message from the loss. Use `Render Samples` on the job page to check tokenization when the tuned model ignores your answers.

## Examples

### Example 1: Streaming chat in a Next.js app

**User request:** "Add Fireworks to my Next.js app for the support chat, with streaming."

The agent installs `openai`, adds `FIREWORKS_API_KEY` to `.env.local`, and creates `app/api/chat/route.ts` that builds the client above, calls `chat.completions.create({ stream: true })` with `accounts/fireworks/models/glm-5p3-flash`, and pipes the deltas to the browser as a `ReadableStream`. The key stays on the server; the page reads the stream and appends text as it arrives.

### Example 2: Cutting cost on a slow, expensive classifier

**User request:** "Our ticket classifier on Fireworks is slow and costs too much."

The agent checks the model first (a large reasoning model for a three-label task is the usual cause) and moves it to `qwen3-8b` with `response_format` set to a `json_schema` and `temperature: 0`. It keeps the system prompt identical across requests and passes `x-session-affinity` per customer so prompt caching hits (cached input tokens cost 50% of the input rate by default). Offline backfills go to the Batch API at 50% of serverless rates. If accuracy drops, it fine-tunes the 8B model with `firectl sftj create` instead of going back to the big one.

## Guidelines

1. **OpenAI compatibility** — only the base URL, key and model ID change; check `usage` in responses for billed tokens.
2. **Verify model IDs** — the serverless catalog changes; deprecated models fail with an error. Read the models guide before pinning.
3. **Prefer `json_schema`** — and mention JSON in the prompt; handle `finish_reason: "length"`.
4. **Low temperature for tools** — 0.0 to 0.3.
5. **Prompt caching is automatic** — keep the stable prefix first and send a stable `x-session-affinity` (or `user`) value so repeats land on the same replica.
6. **Serverless modes** — Standard by default; set `service_tier: "priority"` for peak-hour reliability at a premium.
7. **Batch inference** — asynchronous jobs at 50% of serverless prices for bulk work.
8. **Serverless vs dedicated** — start serverless; fine-tuned models and guaranteed latency need a dedicated deployment, which bills for GPU time while it runs, so delete idle deployments.
9. **Secrets** — keep `FIREWORKS_API_KEY` in server-side environment variables only.
