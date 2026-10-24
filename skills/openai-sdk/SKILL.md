---
name: openai-sdk
description: >-
  Integrate OpenAI APIs into applications. Use when a user asks to add GPT or
  ChatGPT to an app, generate text with OpenAI, build a chatbot, use GPT-6 or
  reasoning models, generate embeddings, use function calling, stream
  responses, get structured JSON, moderate content, generate images, transcribe
  audio, or migrate from the Assistants API, Chat Completions, DALL-E or
  Whisper. Covers the Responses API, tools, streaming, vision, embeddings,
  moderation, image generation and transcription.
license: Apache-2.0
compatibility: 'Node.js 22+, Python 3.10+, OPENAI_API_KEY'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/openai/openai-node
  tags:
    - openai
    - gpt
    - llm
    - embeddings
    - function-calling
---

# OpenAI SDK

## Overview

The official `openai` packages (npm `openai`, PyPI `openai`) call the OpenAI API. New code uses the **Responses API** (`client.responses.create`); Chat Completions still works but the docs recommend Responses for all new projects, and the GPT-6 Astra and GPT-6.1 Sol models require Responses for tool calling. This skill covers setup, text generation, streaming, function calling, structured outputs, vision, embeddings, moderation, image generation and transcription, and lists what has been shut down so an agent does not reach for it.

Removed or being removed (check https://developers.openai.com/api/docs/deprecations before choosing a model):

- Assistants API: shut down 2026-08-26. Use Responses plus Conversations.
- `dall-e-2` / `dall-e-3`: shut down 2026-05-12. Use the `gpt-image-*` models.
- `gpt-3.5-turbo`, `gpt-4`, `gpt-4-turbo`, `o1`, `o3-mini`, `o4-mini`: shut down 2026-10-23.
- `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `o3`: shut down 2026-12-11.
- `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini` snapshots: shut down 2027-01-14.
- `whisper-1`, `gpt-4o-transcribe*`: shut down 2027-02-26. `tts-1`, `gpt-4o-mini-tts`: 2027-01-06.

## Instructions

### Step 1: Install and configure

```bash
npm install openai      # Node.js 22+ (see engines in package.json)
pip install openai      # Python
export OPENAI_API_KEY="sk-proj-..."   # the SDKs read this variable themselves
```

Models in the current docs: `gpt-6-astra` (most capable), `gpt-6.1-sol` (balanced), `gpt-6-luna` (cheapest, high volume). Read the model list at https://developers.openai.com/api/docs/models rather than hard-coding an old name; set the model from an environment variable so a shutdown is a config change.

### Step 2: Generate text

```typescript
import OpenAI from 'openai'

const openai = new OpenAI()   // reads OPENAI_API_KEY

const response = await openai.responses.create({
  model: 'gpt-6-luna',
  instructions: 'You are a helpful coding assistant.',   // system-level guidance
  input: 'Write a Python function to merge two sorted lists.',
})
console.log(response.output_text)

// Multi-turn: chain on the previous response (stored server-side by default)
const followUp = await openai.responses.create({
  model: 'gpt-6-luna',
  previous_response_id: response.id,
  input: 'Now add type hints and a docstring.',
})
```

```python
from openai import OpenAI

client = OpenAI()
response = client.responses.create(
    model="gpt-6-luna",
    instructions="You are a data analysis assistant.",
    input="Explain what a p-value is in two sentences.",
)
print(response.output_text)
```

Reasoning models take `reasoning: { effort: 'low' | 'medium' | 'high' }` (GPT-6.1 Sol also accepts `xhigh` and `max`, and rejects `none` and `minimal`).

### Step 3: Stream

```typescript
const stream = await openai.responses.create({
  model: 'gpt-6-luna',
  input: 'Explain quantum computing in simple terms.',
  stream: true,
})

for await (const event of stream) {
  if (event.type === 'response.output_text.delta') process.stdout.write(event.delta)
  else if (event.type === 'response.completed') console.log('\nDone.')
  else if (event.type === 'error') console.error(event.message)
}
```

For a Next.js route, return a `ReadableStream` built from these events (or use the Vercel AI SDK's OpenAI provider); the old `OpenAIStream` / `StreamingTextResponse` helpers no longer exist in the `ai` package.

### Step 4: Function calling

Responses tools are flat: `name`, `description`, `parameters` sit beside `type: 'function'`. Keep the model's output items in the input, then append a `function_call_output` with the same `call_id`.

```typescript
import { toResponseInputItems } from 'openai/lib/responses/ResponseInputItems'

const tools = [{
  type: 'function' as const,
  name: 'get_order_status',
  description: 'Look up the status of a customer order',
  parameters: {
    type: 'object',
    properties: { order_id: { type: 'string', description: 'Order number, e.g. ORD-10482' } },
    required: ['order_id'],
    additionalProperties: false,
  },
  strict: true,
}]

const input: any[] = [{ role: 'user', content: 'Where is order ORD-10482?' }]
let response = await openai.responses.create({ model: 'gpt-6-luna', tools, input })
input.push(...toResponseInputItems(response.output))

for (const item of response.output) {
  if (item.type !== 'function_call') continue
  const { order_id } = JSON.parse(item.arguments)
  const status = await lookupOrder(order_id)          // your code
  input.push({ type: 'function_call_output', call_id: item.call_id, output: JSON.stringify(status) })
}

response = await openai.responses.create({ model: 'gpt-6-luna', tools, input })
console.log(response.output_text)
```

Built-in tools (`web_search`, `file_search`, `code_interpreter`, `image_generation`, remote MCP) go in the same `tools` array and run inside one request.

### Step 5: Structured outputs

```typescript
import { zodTextFormat } from 'openai/helpers/zod'
import { z } from 'zod'

const Person = z.object({ name: z.string(), age: z.number(), company: z.string() })

const response = await openai.responses.parse({
  model: 'gpt-6-luna',
  input: 'Extract: Maria Lopez, 35, works at Northwind Traders',
  text: { format: zodTextFormat(Person, 'person') },
})
console.log(response.output_parsed)   // { name: 'Maria Lopez', age: 35, company: 'Northwind Traders' }
```

```python
from pydantic import BaseModel

class Person(BaseModel):
    name: str
    age: int
    company: str

response = client.responses.parse(
    model="gpt-6-luna",
    input="Extract: Maria Lopez, 35, works at Northwind Traders",
    text_format=Person,
)
print(response.output_parsed)
```

### Step 6: Vision

```typescript
import fs from 'fs'

const base64Image = fs.readFileSync('receipt.jpg', 'base64')
const response = await openai.responses.create({
  model: 'gpt-6-luna',
  input: [{
    role: 'user',
    content: [
      { type: 'input_text', text: 'Extract the merchant, date and total from this receipt.' },
      { type: 'input_image', image_url: `data:image/jpeg;base64,${base64Image}`, detail: 'auto' },
    ],
  }],
})
console.log(response.output_text)
```

An `https://` URL works in `image_url` too.

### Step 7: Embeddings

```typescript
const result = await openai.embeddings.create({
  model: 'text-embedding-3-small',   // 1536 dims; text-embedding-3-large is 3072
  input: ['How to deploy a Node.js app', 'Rolling back a failed release'],
  encoding_format: 'float',
})
const vector = result.data[0].embedding
```

Pass `dimensions` to shorten vectors (smaller index, slightly lower recall).

### Step 8: Moderation, images, transcription

```typescript
// Moderation is free; omni-moderation-latest takes text and images
const mod = await openai.moderations.create({
  model: 'omni-moderation-latest',
  input: 'user comment to check',
})
console.log(mod.results[0].flagged)

// Image generation (gpt-image-*; DALL-E is gone)
const img = await openai.images.generate({
  model: 'gpt-image-2.5-sunburst',
  prompt: 'A flat vector logo of a lighthouse at dusk',
})
fs.writeFileSync('logo.png', Buffer.from(img.data![0].b64_json!, 'base64'))

// File transcription
const transcript = await openai.audio.transcriptions.create({
  file: fs.createReadStream('standup-2026-10-22.wav'),
  model: 'gpt-transcribe',
})
console.log(transcript.text)
```

For live microphone or phone audio use the Realtime API (`gpt-live-transcribe`, `gpt-realtime-2.1`); see the `openai-realtime` skill.

## Examples

### Example 1: Customer support bot with tools

**User prompt:** "Build a chatbot for our shop that checks order status and searches products."

The agent defines `get_order_status` and `search_products` as flat function tools, runs the Step 4 loop until the response has no `function_call` items, streams the final answer to the browser, and keeps context with `previous_response_id`. Result: the user asks "Where is ORD-10482?", the server logs one tool call, and the reply says the parcel shipped with the carrier's tracking number.

### Example 2: Contract summary from scanned pages

**User prompt:** "Users upload scanned contracts. Pull out the parties, dates and renewal terms as JSON."

The agent sends each page as an `input_image`, uses `responses.parse` with a Zod schema (`parties`, `effective_date`, `renewal_terms`), and returns `output_parsed`. A refusal or schema mismatch is checked before the data is stored.

## Guidelines

- Use `responses.create` for new code. Do not use the Assistants API, `dall-e-*`, `whisper-1` or `gpt-4o-*` in new work; they are shut down or scheduled to be.
- Look at the deprecations page before pinning a model; snapshots disappear on fixed dates.
- Chat Completions code you inherit keeps working: use `max_completion_tokens` (not `max_tokens`) there, and move tool-using code to Responses before switching to GPT-6 Astra or GPT-6.1 Sol.
- Keep the API key on the server. Never ship it in browser code or commit it; use a per-environment secret.
- Use `strict: true` function schemas and structured outputs instead of parsing free-text JSON.
- Responses are stored by default; set `store: false` for sensitive prompts.
- Read `response.usage` and log it; retry 429 and 5xx with backoff (the SDK retries twice by default).
- Moderation does not replace your own policy checks, and never send suspected CSAM to it.
