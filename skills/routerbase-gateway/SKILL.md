---
name: routerbase-gateway
description: >-
  Integrate AI applications with RouterBase as an OpenAI-compatible gateway.
  Use when a user wants to migrate OpenAI SDK calls to RouterBase, configure
  ROUTERBASE_API_KEY, choose model IDs, design model fallback routes, call chat
  completions, stream responses, use tool calling or JSON mode, or generate
  image, video, or audio media through RouterBase endpoints.
license: Apache-2.0
compatibility: "Requires a RouterBase account, a ROUTERBASE_API_KEY (sk-rb-...), and an OpenAI-compatible client or HTTP client. Docs: https://docs.routerbase.com"
metadata:
  author: zenlee123
  version: "1.1.0"
  category: data-ai
  tags: ["routerbase", "openai-compatible", "model-routing", "llm", "media-generation"]
---

# RouterBase Gateway

## Overview

Use [RouterBase](https://routerbase.com/) as an OpenAI-compatible gateway for chat, image, video, and audio models. The base URL is `https://routerbase.com/v1`; documentation is at https://docs.routerbase.com. This skill helps an AI agent update existing OpenAI-style integrations, keep credentials server-side, choose RouterBase model IDs from the live catalog, and add practical fallback handling.

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
- RouterBase has three key kinds: the API key `sk-rb-...` (calls models), a Management key `sk-rb-prov-...` (creates and revokes API keys, cannot call models), and BYOK credentials (your own upstream provider key). Per API key you can set rate limits, credit caps (hourly, daily, total) and an IP allow-list.

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

Model IDs have the form `vendor/name` (for example `google/gemini-2.5-flash`, `anthropic/claude-sonnet-4.5`; note the dot in Anthropic versions). The `model` field also accepts the vendor's own name (`claude-opus-4-8`) or a listed alias, but not dated snapshot IDs such as `claude-sonnet-4-5-20250929`, which return 404. IDs and prices change, and some IDs shown in docs examples are not served, so check the live catalog before recommending final production settings. The OpenAI-format list answers without a key:

```bash
curl -s https://routerbase.com/v1/models | python3 -c "import sys,json; [print(m['id'], m['modality'], m.get('pricing')) for m in json.load(sys.stdin)['data']]"
```

Each entry has `modality` (chat, image, video, embedding), `context_length`, `supported_parameters` (look for `tools`, `reasoning`) and `pricing`. `GET /v1/models/{id}` returns one model. A separate dashboard catalog at `/api/v1/models` uses different IDs (`chat.deepseek_v4_1_flash`) that do not work in the `model` field.

For routing plans, document:

- Primary model.
- Fallback model.
- Why each model fits.
- Feature assumptions to test, such as streaming, tool calling, JSON mode, vision, or context length.
- A minimal smoke test request.

### 5. Add conservative fallback handling

Fall back only on transient failures: network errors, `429` (rate limited), `455` (upstream outage or timeout; the same status also carries `insufficient_quota`, so stop if the error body says credits are out) and `5xx`. Do not retry `400` (bad parameters or content policy), `401`, `402` (out of credits), `404` (unknown model) or `422`. Rejected requests are not queued, so add exponential backoff on `429`. The default limit is 20 new requests per 10 seconds per API key.

```js
const modelPlan = ["anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"];

const isTransient = (error) =>
  error.status === undefined || [429, 455].includes(error.status) || error.status >= 500;

async function chatWithFallback(messages) {
  let lastError;
  for (const model of modelPlan) {
    try {
      return await client.chat.completions.create({ model, messages });
    } catch (error) {
      if (!isTransient(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}
```

Every response carries an `x-request-id` header; quote it when contacting support.

### 6. Handle media endpoints by modality

Choose the endpoint based on the requested media type:

- Image: `POST https://routerbase.com/v1/images/generations`
- Video: `POST https://routerbase.com/v1/videos/generations`
- Speech: `POST https://routerbase.com/v1/audio/speech`
- Audio generation: `POST https://routerbase.com/v1/audio/generations`

Parameters differ per model (GPT Image 2 takes `size` and `quality`, others take `aspect_ratio` and `resolution`), so read the model's page on docs.routerbase.com before building the request. Video and audio are always asynchronous: the POST returns `{ "id": "...", "status": "pending" }`; poll `GET /v1/videos/generations/{id}` (or `/v1/audio/generations/{id}`, `/v1/images/generations/{id}`) every 3 to 5 seconds until `status` is `success` (read `data[0].url`) or `failed`, or pass an HTTPS `callback_url`. Some image models answer immediately and others return a pending id the same way, so handle both. Send an `Idempotency-Key` header (or `client_request_id` in the body) on every media request: a generation is charged on success, and a retry with the same key replays the original task instead of creating and charging a second one; `GET .../generations?client_request_id=...` recovers a task after a dropped connection. Result files are kept 14 days, so download them.

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
- Fallback: anthropic/claude-sonnet-4.5 for harder cases or transient failures
- Retry only on network errors, 429, 455, and 5xx
- Do not retry invalid model IDs, 402 (no credits) or authentication failures

Smoke test:
- Send 20 representative support questions
- Track latency, refusal rate, JSON validity, and escalation quality
```

### Example 3: Create an image generation request

**User request:** "Generate a product-style image through RouterBase."

**Output:** add an `Idempotency-Key` header, then poll `GET /v1/images/generations/{id}` if the response holds `status: "pending"` instead of `data`.

```bash
curl -X POST https://routerbase.com/v1/images/generations \
  -H "Authorization: Bearer $ROUTERBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "model": "openai/gpt-image-2-t2i",
    "prompt": "A clean product illustration of an AI model routing dashboard",
    "quality": "medium",
    "size": "1024x1024"
  }'
```

## Guidelines

- Prefer small smoke tests before changing production traffic.
- Preserve OpenAI-compatible request shapes unless the selected model requires model-specific fields.
- For tool calling, keep standard `tools` payloads and test the exact schema.
- For JSON outputs, use `response_format` (`{ "type": "json_object" }`) when supported and validate the result in application code.
- Reasoning models return their thinking in `reasoning_content` and bill those tokens as output, so a small `max_tokens` truncates the thought rather than shortening the answer; `include_reasoning: false` only hides the field. `n` must be 1.
- For async media jobs, store the task ID, status, request hash, result URL, and error details.
- Tell the user when model IDs, pricing, or feature support need a live catalog check.
- Keep logs free of API keys, private prompts, customer data, and temporary media URLs.
