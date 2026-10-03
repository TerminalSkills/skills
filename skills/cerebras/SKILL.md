---
name: cerebras
description: >-
  Cerebras Inference is a hosted LLM API that runs open models on Cerebras wafer-scale chips at thousands of tokens per
  second, through an OpenAI-compatible endpoint. Use when a user wants the lowest-latency chat, code completion or agent
  loop, asks how to call the Cerebras API or SDK, needs streaming, tool calling, strict JSON schema output or reasoning
  control, or hits a "model not found" error from a retired Cerebras model ID.
license: Apache-2.0
compatibility: "Cerebras API key (CEREBRAS_API_KEY); Python 3.9+ or Node.js 18+; any OpenAI-compatible SDK works"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags:
  - llm
  - inference
  - api
  - fast-inference
  - wafer-scale
  repository: https://github.com/Cerebras/cerebras-cloud-sdk-python
---

# Cerebras — Wafer-Scale LLM Inference

## Overview

Cerebras Inference serves open-weight models from its own hardware and exposes them at `https://api.cerebras.ai/v1`, compatible with the OpenAI chat-completions API. It is chosen for speed: time to first token and output rate are far above typical GPU hosting, which matters for interactive chat, autocomplete and multi-step agents.

The model catalog changes quickly and old IDs are removed. At the time of checking (October 2026) the Shared Inference models were:

| Model ID | Notes |
|----------|-------|
| `gpt-oss-120b` | about 3,000 tokens/s; context 65k on the free tier, 131k paid; reasoning efforts low/medium/high (default medium) |
| `qwen-3.8-27b` | about 1,850 tokens/s; context 64k free, 128k paid; reasoning effort none/low/medium/high (default high) |

Other models (for example `gemma-4-31b`) are Dedicated Inference only. Retired IDs include `llama3.1-8b`, `llama-3.3-70b` (the old skill text used `llama3.3-70b`), `qwen-3-32b`, `qwen-3-235b-a22b-instruct-2507`, `zai-glm-4.7` and the Llama 4 models; the docs recommend `gpt-oss-120b` as the replacement for most of them. Always check https://inference-docs.cerebras.ai/models/overview and the deprecations page before hard-coding an ID, or list models at runtime with `client.models.list()`.

## Instructions

### Install and authenticate

```bash
pip install --upgrade cerebras_cloud_sdk      # Python
npm install @cerebras/cerebras_cloud_sdk      # Node.js
export CEREBRAS_API_KEY="csk-..."             # key from cloud.cerebras.ai; keep it out of source control
```

The official SDKs read `CEREBRAS_API_KEY` automatically. Any OpenAI SDK also works by setting `base_url="https://api.cerebras.ai/v1"`.

### Chat and streaming (Python SDK)

```python
from cerebras.cloud.sdk import Cerebras

client = Cerebras()  # uses CEREBRAS_API_KEY

response = client.chat.completions.create(
    model="gpt-oss-120b",
    messages=[
        {"role": "system", "content": "You are a concise coding assistant."},
        {"role": "user", "content": "Write a Python function that merges overlapping intervals."},
    ],
    max_completion_tokens=800,
    temperature=0.3,
)
print(response.choices[0].message.content)
print(response.time_info.completion_time, response.usage.completion_tokens)  # seconds, tokens

stream = client.chat.completions.create(
    model="gpt-oss-120b",
    messages=[{"role": "user", "content": "Explain B-trees in five sentences."}],
    stream=True,
)
for chunk in stream:
    print(chunk.choices[0].delta.content or "", end="", flush=True)
```

Usage and `time_info` (`queue_time`, `prompt_time`, `completion_time`, `total_time`) arrive in the final streamed chunk. Output speed is `completion_tokens / completion_time`. `AsyncCerebras` is the async client; the SDK retries connection errors, timeouts and 429s twice by default (`max_retries` changes it).

### Chat with the OpenAI SDK (TypeScript)

```typescript
import OpenAI from "openai";

const cerebras = new OpenAI({
  apiKey: process.env.CEREBRAS_API_KEY!,
  baseURL: "https://api.cerebras.ai/v1",
});

const stream = await cerebras.chat.completions.create({
  model: "qwen-3.8-27b",
  messages: [{ role: "user", content: "Suggest three names for a log-search CLI." }],
  stream: true,
});
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
```

### Structured output

Prefer strict JSON schema (constrained decoding) over plain JSON mode:

```python
ticket_schema = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "enum": ["billing", "bug", "feature"]},
        "urgency": {"type": "integer"},
    },
    "required": ["category", "urgency"],
    "additionalProperties": False,
}
response = client.chat.completions.create(
    model="gpt-oss-120b",
    messages=[{"role": "user", "content": "Customer was charged twice for the March invoice, please fix today."}],
    response_format={"type": "json_schema", "json_schema": {"name": "ticket", "strict": True, "schema": ticket_schema}},
)
```

Schema limits: root must be an object, `additionalProperties: false` on every object, at most 5,000 characters and 10 nesting levels, arrays need `items`. `{"type": "json_object"}` only guarantees valid JSON and cannot be combined with streaming.

### Tool calling

Supported by both shared models, with `tool_choice` of `none`, `auto`, `required` or a named function, optional `"strict": true` on a function, and `parallel_tool_calls=True`.

```python
tools = [{
    "type": "function",
    "function": {
        "name": "get_order_status",
        "description": "Look up the shipping status of an order",
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": {"order_id": {"type": "string"}},
            "required": ["order_id"],
            "additionalProperties": False,
        },
    },
}]
messages = [{"role": "user", "content": "Where is order ORD-48213?"}]
msg = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools).choices[0].message
while msg.tool_calls:
    messages.append(msg)
    for call in msg.tool_calls:
        result = lookup_order(**json.loads(call.function.arguments))  # your function
        messages.append({"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)})
    msg = client.chat.completions.create(model="gpt-oss-120b", messages=messages, tools=tools).choices[0].message
print(msg.content)
```

Loop until a response has no `tool_calls`. Do not combine `tools` with `response_format` unless the docs say it works for your model.

### Reasoning control

Pass `reasoning_effort` (`"low"`, `"medium"`, `"high"`; Qwen also `"none"` to skip thinking for simple requests). `reasoning_format` can be `parsed` (reasoning in `choices[0].message.reasoning`), `raw`, `hidden` or `none`. Via the OpenAI SDK, put Cerebras-only fields such as `reasoning_format` and `clear_thinking` in `extra_body`. Reasoning tokens count toward `max_completion_tokens`, so raise the limit for hard problems.

### Prompt caching

Automatic, no flags: prefixes are cached in 128-token blocks (guaranteed 5 minutes, sometimes up to an hour). Put system prompts, tool definitions and documents first and the user's turn last, and read `usage.prompt_tokens_details.cached_tokens`. Cached tokens do not count against the uncached TPM limit.

## Examples

### Example 1: Replace a retired model ID

**User request:** "Our service started returning 404 model_not_found from Cerebras with `llama3.3-70b`."

Check https://inference-docs.cerebras.ai/support/deprecation, then switch the model string to `gpt-oss-120b`, set `reasoning_effort="low"` where the old model was used for quick answers, and run one request to compare latency. Result: calls succeed again; replies may include reasoning, so use `reasoning_format="hidden"` or `"parsed"` if the old output shape must be preserved.

### Example 2: Fast ticket triage endpoint

**User request:** "Classify incoming support emails into billing, bug or feature and return JSON in under a second."

Use the strict `json_schema` call above with `qwen-3.8-27b`, `reasoning_effort="none"`, `temperature=0` and a fixed system prompt first so the prefix is cached. Result: a schema-valid object such as `{"category": "billing", "urgency": 2}` on every call, with typical latency dominated by network time.

## Guidelines

- Rate limits: the free trial allows 5 requests/minute, 30K uncached and 90K total tokens/minute and $5 of credit expiring after 30 days; pay-as-you-go raises this (for example 1,000 RPM and 1M uncached TPM on `gpt-oss-120b`, 300 RPM and 150K on `qwen-3.8-27b`). A 429 says which bucket was exceeded; back off and retry, or raise cache hit rates.
- Differences from OpenAI: `n` must be 1; images must be base64 data URIs, not external URLs; use `stream: true` rather than `tool_stream`.
- `max_tokens` is an alias of `max_completion_tokens`; send only one.
- Do not hard-code speed claims or model lists; both change. Measure `time_info` on your own prompts.
- Use it when latency or tokens per second dominate. For proprietary frontier models, very long context beyond the listed limits, or image generation, use another provider.
- Keep a fallback provider for outages and rate-limit bursts, and never log the API key.
