---
title: Build a Structured LLM Output Parser
slug: build-structured-output-parser
description: Build a structured output parser for LLMs with JSON schema validation, retry with correction, streaming extraction, type coercion, and fallback strategies for reliable AI data extraction.
skills:
  - typescript
  - redis
  - hono
  - zod
category: data-ai
tags:
  - llm
  - structured-output
  - json-schema
  - parsing
  - validation
---

# Build a Structured LLM Output Parser

## The Problem

Diego leads AI engineering at a 20-person company using LLMs to extract structured data from emails, invoices, and support tickets. Prompting for "valid JSON" works most of the time, but some responses still arrive wrapped in prose, with trailing commas, wrong types (`"42"` instead of `42`), or missing required fields. Each failure lands in a manual review queue, and a bare `JSON.parse()` throws on the first syntax error. They need extraction that is schema-checked on every path, retried with a precise error when it fails, and cheap to repeat on documents they have already seen.

## The Solution

Use two layers. First, ask the model for schema-constrained output where the provider supports it: Claude's structured outputs (`output_config.format`, generally available) compile your JSON schema into a grammar, so the response is valid JSON that matches the schema. Second, keep a small validating parser with retry for everything that has no constrained decoding (a local model, an older model, a provider without the feature). Zod 4 defines the schema once, gives the TypeScript type, and produces the JSON Schema. Redis caches results by a hash of the input, and Hono exposes the extractor as an HTTP endpoint.

Constrained output is not a guarantee in every case. Per the Anthropic docs, a response can still miss the schema when `stop_reason` is `"refusal"` (HTTP 200, the refusal text takes precedence over the schema) or `"max_tokens"` (output cut off), enum values can come back with different capitalization, and complex schemas can be rejected with a 400 "Schema is too complex for compilation" (limits: 24 optional parameters and 16 union-typed parameters across a request). Citations cannot be combined with `output_config.format`.

## Step-by-Step Walkthrough

### Step 1: Install and define the schema

```bash
npm install zod @anthropic-ai/sdk hono @hono/node-server ioredis
npm install -D typescript @types/node
export ANTHROPIC_API_KEY=...   # from the Anthropic Console, never commit it
```

```typescript
import { z } from "zod";

export const Invoice = z.object({
  vendor: z.string(),
  invoiceNumber: z.string(),
  currency: z.enum(["USD", "EUR", "GBP"]),
  total: z.number(),
  dueDate: z.iso.date().nullable(),
  lineItems: z.array(
    z.object({ description: z.string(), quantity: z.number(), unitPrice: z.number() }),
  ),
});
export type Invoice = z.infer<typeof Invoice>;
```

The code below was type-checked against `zod@4.6.7`, `@anthropic-ai/sdk@1.3.0`, `hono@4.13` and `ioredis@6`.

### Step 2: Extract with constrained output

`client.messages.parse()` sends the schema, validates the response, and returns it typed in `parsed_output`. Check `stop_reason` first, because a refusal or truncation is not a schema-valid result.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { createHash } from "node:crypto";
import { Redis } from "ioredis";
import { Invoice } from "./schema.js";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY
const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379");
const MODEL = "claude-sonnet-5-5";

export async function extractInvoice(text: string): Promise<Invoice> {
  const key = "invoice:" + createHash("sha256").update(text).digest("hex");
  const hit = await redis.get(key);
  if (hit) return Invoice.parse(JSON.parse(hit));

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    messages: [{ role: "user", content: `Extract the invoice fields from this document:\n\n${text}` }],
    output_config: { format: zodOutputFormat(Invoice) },
  });

  // The schema is only guaranteed when the model finished normally.
  if (response.stop_reason === "refusal") throw new Error("Model refused the request");
  if (response.stop_reason === "max_tokens") throw new Error("Output truncated: raise max_tokens");
  if (!response.parsed_output) throw new Error("No parsed output");

  await redis.set(key, JSON.stringify(response.parsed_output), "EX", 86_400);
  return response.parsed_output;
}
```

`parse()` throws an `AnthropicError` when the response fails Zod validation, so a refusal or truncated reply can surface as an exception rather than as a `stop_reason`; catch it and route the document to review. One checked quirk: in `@anthropic-ai/sdk@1.3.0` the `zodOutputFormat()` helper moves `enum` (and Zod's date regex) into the field `description` instead of the grammar, so the `currency` list is enforced by the Zod check after the response, not by constrained decoding. Compare enum values after parsing, as the Zod check does.

The cache key is a SHA-256 of the document text, so reprocessing the same email costs no tokens. Validate cached JSON on read, as above, so a schema change never serves stale shapes.

### Step 3: Add a validating parser with retry for other models

For providers without constrained decoding, parse defensively and send the exact validation error back to the model. Keep the repairs minimal: pulling JSON out of a fenced block or surrounding prose and dropping trailing commas are safe, but regex "fixes" for quotes, unquoted keys or truncated output can silently corrupt string values, so let the retry handle those. Coercion belongs in the schema (`z.coerce.number()`), not in code that inspects Zod internals, which changed in Zod 4.

```typescript
import { z } from "zod";

export type LooseResult<T> =
  | { ok: true; data: T; attempts: number }
  | { ok: false; error: string; attempts: number };

// Pull the JSON out of a fenced block or surrounding prose.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  return start >= 0 && end > start ? text.slice(start, end + 1) : text.trim();
}

// Parse + validate. `ask` re-prompts the model with the exact error.
export async function parseLoose<S extends z.ZodType>(
  raw: string,
  schema: S,
  ask: (badOutput: string, error: string) => Promise<string>,
  maxRetries = 2,
): Promise<LooseResult<z.infer<S>>> {
  let output = raw;
  let error = "";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const json = extractJson(output).replace(/,\s*([}\]])/g, "$1"); // trailing commas
      const result = schema.safeParse(JSON.parse(json));
      if (result.success) return { ok: true, data: result.data, attempts: attempt + 1 };
      error = z.prettifyError(result.error);
    } catch (e) {
      error = `Invalid JSON: ${(e as Error).message}`;
    }
    if (attempt < maxRetries) output = await ask(output, error);
  }
  return { ok: false, error, attempts: maxRetries + 1 };
}
```

`ask` is whatever call re-prompts your model, for example a second `client.messages.create` that includes the bad output and the message from `z.prettifyError`. Run on the input `Sure!` followed by a fenced block containing `{"n": "42", "tags": ["a",],}` with the schema `z.object({ n: z.coerce.number(), tags: z.array(z.string()) })`, it returns `{ n: 42, tags: ["a"] }` on the first attempt. A bad `n` triggers one `ask` call with the Zod error text, then succeeds on attempt 2.

### Step 4: Serve it with Hono

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { extractInvoice } from "./extract.js";

const app = new Hono();

app.post("/extract", async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  if (!text) return c.json({ error: "text is required" }, 400);
  try {
    return c.json(await extractInvoice(text));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 422);
  }
});

serve({ fetch: app.fetch, port: 3000, hostname: "127.0.0.1" });
```

Bind to `127.0.0.1` unless the service sits behind your own authentication; this endpoint spends model tokens for every uncached request.

```console
$ curl -s 127.0.0.1:3000/extract -H 'content-type: application/json' \
    -d '{"text":"Invoice INV-2041 from Northwind Ltd, due 2026-11-15. 3 x Widget at 40.00 EUR. Total 120.00 EUR"}'
```

The response is a JSON object with the `Invoice` fields, for example `currency: "EUR"` and `total: 120`.

### Step 5: Streaming

Structured outputs work with streaming, but the JSON is only valid once complete: accumulate the stream (the SDK's `client.messages.stream(...).finalMessage()` does this) and validate at the end. Do not try to `JSON.parse` partial buffers; if the UI needs progressive fields, use a partial-JSON parser library and treat every partial value as unvalidated.

## Real-World Example

Diego's team routes invoices through `/extract`. Claude handles the bulk through constrained output, while a cheaper local model for internal tickets goes through `parseLoose` with two retries. Documents that fail all attempts, or that return `refusal` or `max_tokens`, are written to a review table together with the raw output and the error message, so reviewers see why a document failed rather than guessing. Duplicate documents, which are common in forwarded email chains, are answered from Redis.

## Related Skills

- [zod](/skills/zod) - schemas, `safeParse`, coercion and JSON Schema output
- [typescript](/skills/typescript) - strict typing for the parser and its result types
- [hono](/skills/hono) - the HTTP layer
- [redis](/skills/redis) - caching extraction results by input hash
