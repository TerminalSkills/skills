---
name: cloudflare-ai
description: >-
  Cloudflare Workers AI runs open-source AI models (LLMs, embeddings, image
  generation, speech-to-text, translation) on Cloudflare's GPU network and calls
  them from a Worker binding, a REST API or an OpenAI-compatible endpoint. Use
  when a user asks to add serverless AI inference to a Worker, call
  env.AI.run, build RAG with Vectorize, stream LLM output, transcribe audio
  or generate images without managing GPUs, or estimate Neuron costs.
license: Apache-2.0
compatibility: 'Cloudflare account, Node.js 18+, Wrangler 4 (npm create cloudflare@latest)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  tags: "cloudflare, workers-ai, inference, embeddings, vectorize"
---

# Cloudflare Workers AI

## Overview

Workers AI is Cloudflare's serverless inference service. A Worker gets an `AI` binding and calls `env.AI.run(model, input)`; the same models are reachable over REST (`https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/<model>`) and, for chat and embedding models, through OpenAI-compatible `/ai/v1/chat/completions` and `/ai/v1/embeddings` endpoints. Models are named `@cf/<vendor>/<model>` and the catalog changes often, so check it before you pick one.

Billing is in Neurons: $0.011 per 1,000 Neurons, with 10,000 Neurons per day free on both the Free and Paid Workers plans (resets 00:00 UTC). Past the free allocation you need the Workers Paid plan. Some large frontier models need a paid billing method even for the first call.

## Instructions

### Step 1: Create the project and the binding

```bash
npm create cloudflare@latest -- support-bot-ai
cd support-bot-ai
npx wrangler vectorize create support-docs --dimensions=768 --metric=cosine
```

The 768 dimensions match `@cf/baai/bge-base-en-v1.5`; the dimension and metric of an index cannot be changed later. Add the bindings to `wrangler.jsonc`:

```jsonc
{
  "ai": { "binding": "AI" },
  "vectorize": [{ "binding": "VECTORIZE", "index_name": "support-docs" }]
}
```

`wrangler.toml` works too (`[ai]` with `binding = "AI"`, and `[[vectorize]]`). Run `npx wrangler types` to generate the `Env` type, then `npx wrangler dev` to test (inference calls hit the real service and use your Neurons even in dev) and `npx wrangler deploy` to ship.

### Step 2: Pick a model from the catalog

Read the current list at https://developers.cloudflare.com/workers-ai/models/ (or `/workers-ai/llms.txt`) and the Pricing page. Models seen there in October 2026 and used below: `@cf/meta/llama-3.1-8b-instruct-fp8` (chat), `@cf/baai/bge-base-en-v1.5` (embeddings), `@cf/black-forest-labs/flux-1-schnell` (images), `@cf/openai/whisper-large-v3-turbo` (speech to text), `@cf/meta/m2m100-1.2b` (translation). Older and larger entries such as Llama 3.3 70B, gpt-oss-120b and Qwen3 are also listed. Do not guess model names: an unknown id fails at run time.

### Step 3: Call the models

```typescript
// src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/chat") {
      const { messages } = await request.json<{ messages: { role: string; content: string }[] }>();
      const stream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
        messages,
        max_tokens: 1024, // default is 256
        stream: true,
      });
      return new Response(stream as ReadableStream, {
        headers: { "content-type": "text/event-stream" },
      });
    }

    if (url.pathname === "/api/image") {
      const { prompt } = await request.json<{ prompt: string }>();
      // flux-1-schnell: prompt up to 2048 chars, steps max 8, returns { image: base64 JPEG }
      const out = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", { prompt, steps: 4 });
      const bytes = Uint8Array.from(atob(out.image), (c) => c.charCodeAt(0));
      return new Response(bytes, { headers: { "content-type": "image/jpeg" } });
    }

    if (url.pathname === "/api/transcribe") {
      const audio = btoa(String.fromCharCode(...new Uint8Array(await request.arrayBuffer())));
      const out = await env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio }); // base64 string
      return Response.json({ text: out.text });
    }

    if (url.pathname === "/api/translate") {
      const { text } = await request.json<{ text: string }>();
      const out = await env.AI.run("@cf/meta/m2m100-1.2b", {
        text,
        source_lang: "english",
        target_lang: "french",
      });
      return Response.json(out);
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
```

Without `stream: true` a chat call resolves to an object with a `response` string. The `String.fromCharCode(...)` spread above is fine for short clips only; for long audio, chunk the file (Cloudflare has a Whisper chunking tutorial).

### Step 4: RAG with Vectorize

```typescript
async function ingest(env: Env, docs: { id: string; text: string }[]) {
  const emb = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: docs.map((d) => d.text) });
  await env.VECTORIZE.upsert(
    docs.map((d, i) => ({ id: d.id, values: emb.data[i], metadata: { text: d.text } })),
  );
}

async function answer(env: Env, question: string) {
  const q = await env.AI.run("@cf/baai/bge-base-en-v1.5", { text: [question] });
  const hits = await env.VECTORIZE.query(q.data[0], { topK: 5, returnMetadata: "all" });
  const context = hits.matches.map((m) => m.metadata?.text).join("\n\n");
  const res = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8", {
    messages: [
      { role: "system", content: `Answer only from this context:\n${context}` },
      { role: "user", content: question },
    ],
  });
  return { answer: res.response, sources: hits.matches.map((m) => ({ id: m.id, score: m.score })) };
}
```

With `returnMetadata: "all"` Vectorize caps `topK` at 50 (100 otherwise). Vectorize writes are asynchronous, so a vector may take a moment to show up in queries.

### Step 5: Outside a Worker

```bash
curl https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8 \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -d '{"messages":[{"role":"user","content":"Summarize what a Worker binding is in one sentence."}]}'
```

For the OpenAI SDK set `baseURL` to `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/ai/v1` and `apiKey` to the API token. The API token needs the Workers AI permission.

## Examples

### Example 1: Streaming chat endpoint
**User prompt:** "Add a /api/chat route to my Worker that streams answers from a Llama model."

Add the `ai` binding, paste the `/api/chat` handler from Step 3, run `npx wrangler dev`, then:

```bash
curl -N localhost:8787/api/chat -d '{"messages":[{"role":"user","content":"Explain Neurons in two sentences."}]}'
```

The result is a series of `data: {"response":"..."}` server-sent events streamed token by token.

### Example 2: Docs search for a help center
**User prompt:** "Embed our 200 help articles and answer customer questions from them."

Create the 768-dimension cosine index (Step 1), call `ingest` once with the articles in batches of 50, then expose `answer` on `/api/ask`. A reply looks like `{"answer":"Refunds take 5 business days...","sources":[{"id":"refunds-policy","score":0.81}]}`.

## Guidelines

- Check the Pricing and Models pages before shipping: models are added and retired, and a retired id breaks the route.
- Heavy models burn the 10,000 daily free Neurons fast (a 70B model costs about 205,000 Neurons per million output tokens). Set `max_tokens` and cap input length.
- Keep the embedding model identical for ingestion and queries, and match the Vectorize index dimensions to it.
- Never put the API token in client code; browsers should call your Worker, which uses the binding.
- Requests can queue when capacity is short; for latency-critical calls Cloudflare documents `rejectIfBusy` to fail fast.
- Use AI Gateway in front of Workers AI when you need caching, rate limits or logs.
