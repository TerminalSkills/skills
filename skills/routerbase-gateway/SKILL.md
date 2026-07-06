---
name: routerbase-gateway
description: >-
  Integrate AI applications with RouterBase as an OpenAI-compatible gateway.
  Use when a user wants to migrate OpenAI SDK calls to RouterBase, configure
  ROUTERBASE_API_KEY, choose model IDs, design model fallback routes, call chat
  completions, stream responses, use tool calling or JSON mode, or generate
  image, video, or audio media through RouterBase endpoints.
license: Apache-2.0
compatibility: "Requires a RouterBase account, ROUTERBASE_API_KEY, and an OpenAI-compatible client or HTTP client."
metadata:
  author: zenlee123
  version: "1.0.0"
  category: data-ai
  tags: ["routerbase", "openai-compatible", "model-routing", "llm", "media-generation"]
---

# RouterBase Gateway

## Overview

Use [routerbase](https://routerbase.com/) as an OpenAI-compatible gateway for chat, model routing, and media generation. This skill helps an AI agent update existing OpenAI-style integrations, keep credentials server-side, choose RouterBase model IDs, and add practical fallback handling.

## Instructions

When a user asks to integrate or debug RouterBase, follow these steps:

### 1. Identify the workflow

Classify the request as one of:

- **API migration**: changing an existing OpenAI-compatible app to RouterBase.
- **New integration**: adding RouterBase to a backend, script, CLI, or agent.
- **Model routing**: choosing primary and fallback models for cost, latency, quality, or modality.
- **Media generation**: calling image, video, speech, or audio generation endpoints.
- **Debugging**: fixing auth, endpoint, model ID, streaming, or response-shape issues.

### 2. Keep credentials safe

- Use `ROUTERBASE_API_KEY` in server-side environment variables.
- Never paste, print, log, or commit a real API key.
- Do not place RouterBase keys in browser code, mobile apps, public repos, screenshots, or client-side configuration.
- Mask secrets in reports, for example `sk-rb-...abcd`.

### 3. Use the OpenAI-compatible base URL

For most chat and SDK migrations, preserve the OpenAI request shape and change only the API key, base URL, and model.

```python
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["ROUTERBASE_API_KEY"],
    base_url="https://routerbase.com/v1",
)

response = client.chat.completions.create(
    model="google/gemini-2.5-flash",
    messages=[{"role": "user", "content": "Summarize model routing in one sentence."}],
)

print(response.choices[0].message.content)
```

```js
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ROUTERBASE_API_KEY,
  baseURL: "https://routerbase.com/v1",
});

const response = await client.chat.completions.create({
  model: "google/gemini-2.5-flash",
  messages: [{ role: "user", content: "Write a short RouterBase smoke test." }],
});

console.log(response.choices[0].message.content);
```

### 4. Verify model IDs before production

RouterBase model availability and pricing can change as upstream providers change. When credentials are available, check the live catalog before recommending final production settings.

```bash
curl "https://routerbase.com/api/v1/models?task=chat" \
  -H "Authorization: Bearer $ROUTERBASE_API_KEY"
```

For routing plans, document:

- Primary model.
- Fallback model.
- Why each model fits.
- Feature assumptions to test, such as streaming, tool calling, JSON mode, vision, or context length.
- A minimal smoke test request.

### 5. Add conservative fallback handling

Fallback only on transient failures such as timeouts, network errors, `429`, or `5xx`. Do not retry blindly on invalid credentials, invalid model IDs, validation errors, or policy errors.

```js
const modelPlan = [
  "anthropic/claude-sonnet-4-6",
  "google/gemini-2.5-flash",
];

for (const model of modelPlan) {
  try {
    return await client.chat.completions.create({ model, messages });
  } catch (error) {
    if (!isRetryableRouterBaseError(error)) throw error;
  }
}
```

### 6. Handle media endpoints by modality

Choose the endpoint based on the requested media type:

- Image: `POST https://routerbase.com/v1/images/generations`
- Video: `POST https://routerbase.com/v1/videos/generations`
- Speech: `POST https://routerbase.com/v1/audio/speech`
- Audio generation: `POST https://routerbase.com/v1/audio/generations`

Image requests are typically synchronous. Video and audio generation may be asynchronous, so persist the task ID, poll with backoff, or use a callback URL when the app has a durable webhook receiver.

## Examples

### Example 1: Migrate an OpenAI SDK call

**User request:** "Move our existing OpenAI chat integration to RouterBase."

**Output:**

```
Changes made:
- Set base URL to https://routerbase.com/v1
- Read API key from ROUTERBASE_API_KEY
- Kept the existing chat.completions request shape
- Swapped the model to google/gemini-2.5-flash for the smoke test

Validation:
- Run the backend-only smoke test with ROUTERBASE_API_KEY set
- Confirm the selected production model against the live RouterBase catalog
```

### Example 2: Design fallback routing

**User request:** "Pick a low-latency primary model and a stronger fallback for support chat."

**Output:**

```
Routing plan:
- Primary: google/gemini-2.5-flash for fast support replies
- Fallback: anthropic/claude-sonnet-4-6 for harder cases or transient failures
- Retry only on network errors, 429, and 5xx
- Do not retry invalid model IDs or authentication failures

Smoke test:
- Send 20 representative support questions
- Track latency, refusal rate, JSON validity, and escalation quality
```

### Example 3: Create an image generation request

**User request:** "Generate a product-style image through RouterBase."

**Output:**

```bash
curl -X POST https://routerbase.com/v1/images/generations \
  -H "Authorization: Bearer $ROUTERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "google/imagen-4",
    "prompt": "A clean product illustration of an AI model routing dashboard",
    "aspect_ratio": "1:1",
    "resolution": "1K"
  }'
```

## Guidelines

- Prefer small smoke tests before changing production traffic.
- Preserve OpenAI-compatible request shapes unless the selected model requires model-specific fields.
- For tool calling, keep standard `tools` payloads and test the exact schema.
- For JSON outputs, use `response_format` when supported and validate the result in application code.
- For async media jobs, store the task ID, status, request hash, result URL, and error details.
- Tell the user when model IDs, pricing, or feature support need a live catalog check.
- Keep logs free of API keys, private prompts, customer data, and temporary media URLs.
