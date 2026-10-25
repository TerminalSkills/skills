---
name: anthropic-sdk
description: >-
  The Anthropic SDK (Python `anthropic`, TypeScript `@anthropic-ai/sdk`) calls
  Claude models through the Messages API. Use when a user asks to add Claude to
  an app, build a chatbot, stream Claude responses, give Claude tools (function
  calling), send images or PDFs, turn on adaptive thinking, count tokens, or
  pick a current Claude model id. Covers client setup, streaming, tool use,
  vision, thinking and effort, and current model ids and breaking changes.
license: Apache-2.0
compatibility: "Node.js (current LTS) with @anthropic-ai/sdk 1.x, or Python 3.10+ with anthropic 2.x; an ANTHROPIC_API_KEY"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/anthropics/anthropic-sdk-typescript
  tags: "anthropic, claude, llm, tool-use, streaming"
---

# Anthropic SDK

## Overview

The official SDKs wrap `POST /v1/messages`. Everything (text, tools, images, thinking) goes through that one endpoint. Current SDK majors: `@anthropic-ai/sdk` 1.x on npm and `anthropic` 2.x on PyPI (Python 3.10+; its HTTP layer is `httpx2`, not `httpx`). Models retire: `claude-sonnet-4-20250514`, `claude-opus-4-20250514` and `claude-opus-4-1-20250805` are retired and return errors, and `claude-sonnet-4-5-20250929` retires on 2026-11-30. Check the model status table in the Anthropic docs before hardcoding an id.

## Instructions

### Current model ids (October 2026)

| Model | Id | Context | $ per 1M in/out |
|---|---|---|---|
| Claude Fable 5.1 (hardest reasoning, long agentic work) | `claude-fable-5-1` | 1M | 10 / 50 |
| Claude Opus 5.5 (Anthropic's suggested starting point) | `claude-opus-5-5` | 1M | 4 / 20 |
| Claude Sonnet 5.5 (speed and intelligence) | `claude-sonnet-5-5` | 1M | 2 / 10 |
| Claude Haiku 5.5 (classification, extraction, routing) | `claude-haiku-5-5` | 1M | from 0.10 / 0.50 |

Use these exact strings; do not append dates. Older active ids include `claude-opus-4-8` and `claude-sonnet-4-6`; `claude-haiku-4-5-20251001` is active but its retirement is not sooner than 2026-10-15.

### Install and create the client

```bash
npm install @anthropic-ai/sdk
pip install anthropic
```

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment
```

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY
```

### Messages

```typescript
const message = await anthropic.messages.create({
  model: "claude-sonnet-5-5",
  max_tokens: 4096,
  system: "You are a senior backend engineer. Answer with working code and one paragraph of explanation.",
  messages: [{ role: "user", content: "Write a sliding-window rate limiter middleware for Express." }],
});

for (const block of message.content) {
  if (block.type === "text") console.log(block.text);
}
console.log(message.usage.input_tokens, message.usage.output_tokens, message.stop_reason);
```

```python
message = client.messages.create(
    model="claude-sonnet-5-5",
    max_tokens=4096,
    system="You are a senior backend engineer.",
    messages=[{"role": "user", "content": "Write a sliding-window rate limiter for Flask."}],
)
print(next(b.text for b in message.content if b.type == "text"))
```

`message.content` is a list of blocks (`text`, `thinking`, `tool_use`, ...), so check `block.type` before reading `.text`. The API is stateless: send the whole history each time, appending the assistant's `message.content` as the next assistant turn. Assistant prefill (ending `messages` with an assistant turn) is rejected on current models; steer format with the system prompt or structured outputs (`output_config: { format }`). Do not send `temperature`, `top_p` or `top_k`: current models reject them with a 400 error.

### Streaming

Stream any request with long output or a large `max_tokens` to avoid HTTP timeouts:

```typescript
const stream = anthropic.messages.stream({
  model: "claude-sonnet-5-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: "Explain how B-trees stay balanced." }],
});
stream.on("text", (t) => process.stdout.write(t));
const final = await stream.finalMessage(); // complete Message with usage and stop_reason
```

```python
with client.messages.stream(model="claude-sonnet-5-5", max_tokens=16000,
                            messages=[{"role": "user", "content": "Explain B-trees."}]) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
    final = stream.get_final_message()
```

### Tool use

Define tools with a JSON Schema; when `stop_reason` is `"tool_use"`, run every `tool_use` block and return all results together in one user message:

```typescript
const tools: Anthropic.Tool[] = [{
  name: "get_order_status",
  description: "Look up the shipping status of an order by its id. Use when the customer asks where their order is.",
  input_schema: { type: "object", properties: { order_id: { type: "string", description: "e.g. ORD-20417" } }, required: ["order_id"] },
}];

const messages: Anthropic.MessageParam[] = [{ role: "user", content: "Where is order ORD-20417?" }];
while (true) {
  const res = await anthropic.messages.create({ model: "claude-sonnet-5-5", max_tokens: 4096, tools, messages });
  messages.push({ role: "assistant", content: res.content });
  if (res.stop_reason !== "tool_use") break;

  const results: Anthropic.ToolResultBlockParam[] = [];
  for (const block of res.content) {
    if (block.type !== "tool_use") continue;
    const status = await lookupOrder((block.input as { order_id: string }).order_id); // your function
    results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(status) });
  }
  messages.push({ role: "user", content: results });
}
```

Return `is_error: true` on a `tool_result` for a failed call rather than dropping it. Parse `block.input` as JSON, never match on its serialized text. Forced `tool_choice` (`any` / `tool`) is rejected on Fable 5.1, Opus 5.5 and Sonnet 5.5: use `auto` and name the tool in the prompt, or `strict: true` on the tool for schema-valid arguments. The SDKs also ship a beta tool runner (`client.beta.messages.tool_runner` in Python, `toolRunner` in TypeScript) that runs this loop for you.

### Vision and PDFs

```typescript
import { readFileSync } from "node:fs";

const res = await anthropic.messages.create({
  model: "claude-sonnet-5-5",
  max_tokens: 2048,
  messages: [{ role: "user", content: [
    { type: "image", source: { type: "base64", media_type: "image/png", data: readFileSync("q3-revenue.png").toString("base64") } },
    { type: "text", text: "Summarize the trend in this chart and flag any outliers." },
  ] }],
});
```

An image can also be `{ type: "image", source: { type: "url", url } }`. A PDF is a `document` block (`media_type: "application/pdf"`, base64), placed before the text. Large or repeated files go through the Files API (`client.files.upload`, then `source: { type: "file", file_id }`).

### Thinking and effort

Thinking is adaptive: Claude decides whether and how much to think. `budget_tokens` is rejected on Fable 5.1, Opus 5.5 and Sonnet 5.5. Control depth with `effort`; Opus 5.5 and Haiku 5.5 default to `medium`, the others to `high`:

```typescript
const res = await anthropic.messages.create({
  model: "claude-opus-5-5",
  max_tokens: 16000,
  thinking: { type: "adaptive", display: "summarized" }, // default display is "omitted" (empty thinking text)
  output_config: { effort: "high" },                      // low | medium | high | xhigh | max
  messages: [{ role: "user", content: "Find the race condition in this worker pool and propose a fix." }],
});
```

Thinking cannot be disabled on Opus 5.5 or Fable 5.1 (`{type: "disabled"}` returns 400; lower the effort). On Sonnet 5.5, use `{ type: "between_tools" }` at effort `high` or below to turn up-front thinking off. Pass thinking blocks back unchanged in later turns.

## Examples

**"Add a Claude-powered /summarize endpoint to my Express app."** Install the SDK, create one module-level `new Anthropic()`, and call `messages.create` with `claude-sonnet-5-5`, a system prompt that fixes the output format, and `max_tokens: 1024`. Return the first `text` block. Result: the endpoint answers in a few seconds and `usage` shows the token cost for logging.

**"My old code uses claude-sonnet-4-20250514 and now fails."** That id is retired. Replace it with `claude-sonnet-5-5` (or `claude-sonnet-4-6` to stay close), remove `thinking: { type: "enabled", budget_tokens }` in favor of `thinking: { type: "adaptive" }` plus `output_config.effort`, delete any assistant prefill and any `temperature`/`top_p`/`top_k`, and re-run the tests.

## Guidelines

- Keep the API key in an environment variable or secret manager, never in client-side code.
- Always check `stop_reason`: `end_turn` is done, `tool_use` needs your result, `max_tokens` means truncated (raise the limit or stream), `refusal` means a safety classifier declined and `content` may be empty.
- Typed errors (`Anthropic.RateLimitError`, `anthropic.APIStatusError`, ...) are retried by the SDK for 408, 409, 429 and 5xx, twice by default (`maxRetries` / `max_retries`). Log `message._request_id` when reporting a problem.
- Default timeout is 10 minutes; units are milliseconds in TypeScript and seconds in Python.
- Prompt caching: add top-level `cache_control: { type: "ephemeral" }` and keep the stable prefix (tools, system prompt) first. Check `usage.cache_read_input_tokens`.
- Count tokens with `messages.count_tokens` instead of estimating; token counts differ by model.
- Pick the cheapest model that passes your own evaluation set; do not assume the largest model is needed.
