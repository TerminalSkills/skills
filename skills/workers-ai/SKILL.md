---
name: workers-ai
description: >-
  Run ML inference at the edge with Cloudflare Workers AI — no cold starts, no
  servers. Use when: building low-latency AI features on Cloudflare Workers,
  text generation, embeddings, image classification, speech-to-text, or
  image generation at the edge.
license: Apache-2.0
compatibility: "Requires Cloudflare Workers with AI binding. Use wrangler 3+."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["cloudflare", "workers-ai", "edge-ai", "inference", "serverless"]
  use-cases:
    - "Add LLM text generation to a Cloudflare Worker with no external API calls"
    - "Generate vector embeddings for semantic search at the edge"
    - "Transcribe audio uploads with Whisper running on Cloudflare's network"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Cloudflare Workers AI

## Overview

Workers AI lets you run machine learning inference directly on Cloudflare's global edge network — inside a Worker — with zero cold starts and no infrastructure to manage. Models run close to users, reducing latency. You only pay per inference request.

Supported model categories:
- **Text generation** — Llama 3, Mistral, Phi-3, Gemma
- **Text embeddings** — BAAI/bge, mxbai-embed-large
- **Image classification** — SqueezeNet, ResNet
- **Image generation** — Stable Diffusion XL
- **Speech recognition** — Whisper
- **Translation** — NLLB-200
- **Summarization** — BART

## Setup

### 1. Create or update `wrangler.toml`

```toml
name = "my-ai-worker"
main = "src/index.ts"
compatibility_date = "2024-09-23"

[ai]
binding = "AI"
```

### 2. Install Cloudflare types (TypeScript)

```bash
npm install -D @cloudflare/workers-types
```

Add to `tsconfig.json`:

```json
{
  "compilerOptions": {
    "types": ["@cloudflare/workers-types"]
  }
}
```

## Instructions

### Step 1: Text generation

```typescript
export interface Env {
  AI: Ai
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "What is the capital of France?" },
    ]

    const result = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages,
      max_tokens: 512,
    })

    return Response.json(result)
  },
}
```

### Step 2: Streaming text generation

For chat interfaces, stream the response token by token:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { prompt } = await request.json() as { prompt: string }

    const stream = await env.AI.run("@cf/meta/llama-3-8b-instruct", {
      messages: [{ role: "user", content: prompt }],
      stream: true,
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    })
  },
}
```

### Step 3: Text embeddings

Generate vector embeddings for semantic search or RAG:

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { texts } = await request.json() as { texts: string[] }

    const result = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: texts,
    })

    // result.data is an array of float32 arrays
    return Response.json({
      embeddings: result.data,
      dimensions: result.data[0].length,
    })
  },
}
```

### Step 4: Image classification

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Expect image as binary body
    const imageBytes = await request.arrayBuffer()

    const result = await env.AI.run("@cf/microsoft/resnet-50", {
      image: [...new Uint8Array(imageBytes)],
    })

    // result is an array of { label, score }
    const top = result.sort((a, b) => b.score - a.score).slice(0, 3)
    return Response.json({ classifications: top })
  },
}
```

### Step 5: Image generation (Stable Diffusion)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { prompt, negative_prompt } = await request.json() as {
      prompt: string
      negative_prompt?: string
    }

    const result = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
      prompt,
      negative_prompt,
      num_steps: 20,
    })

    // result is a ReadableStream of PNG bytes
    return new Response(result, {
      headers: { "Content-Type": "image/png" },
    })
  },
}
```

### Step 6: Speech-to-text (Whisper)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const audioData = await request.arrayBuffer()

    const result = await env.AI.run("@cf/openai/whisper", {
      audio: [...new Uint8Array(audioData)],
    })

    return Response.json({
      text: result.text,
      word_count: result.word_count,
    })
  },
}
```

### Step 7: Embeddings + Vectorize integration (RAG)

Combine Workers AI embeddings with Cloudflare Vectorize for semantic search:

```typescript
export interface Env {
  AI: Ai
  VECTORIZE_INDEX: VectorizeIndex
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === "/index" && request.method === "POST") {
      const { id, text } = await request.json() as { id: string; text: string }

      // Embed the text
      const embedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [text],
      })

      // Insert into Vectorize
      await env.VECTORIZE_INDEX.insert([{
        id,
        values: embedding.data[0],
        metadata: { text },
      }])

      return Response.json({ success: true })
    }

    if (url.pathname === "/search" && request.method === "POST") {
      const { query, topK = 5 } = await request.json() as { query: string; topK?: number }

      // Embed the query
      const queryEmbedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [query],
      })

      // Search Vectorize
      const results = await env.VECTORIZE_INDEX.query(queryEmbedding.data[0], {
        topK,
        returnMetadata: true,
      })

      return Response.json({ matches: results.matches })
    }

    return new Response("Not found", { status: 404 })
  },
}
```

## Available Models (Selected)

| Task | Model ID |
|------|----------|
| Text generation | `@cf/meta/llama-3-8b-instruct` |
| Text generation | `@cf/meta/llama-3.1-70b-instruct` |
| Text generation | `@cf/mistral/mistral-7b-instruct-v0.2` |
| Text embeddings | `@cf/baai/bge-base-en-v1.5` |
| Text embeddings | `@cf/baai/bge-large-en-v1.5` |
| Image generation | `@cf/stabilityai/stable-diffusion-xl-base-1.0` |
| Speech-to-text | `@cf/openai/whisper` |
| Image classification | `@cf/microsoft/resnet-50` |
| Translation | `@cf/meta/m2m-100-1.2b` |

Full list: https://developers.cloudflare.com/workers-ai/models/

## Deploy

```bash
# Development
npx wrangler dev

# Production
npx wrangler deploy
```

## Guidelines

- Always declare the `AI` binding in `wrangler.toml` under `[ai]` — without it the binding is `undefined`.
- Use `stream: true` for text generation in user-facing UIs to avoid waiting for the full response.
- Embeddings with `bge-base-en-v1.5` produce 768-dimensional vectors; check dimensions match your Vectorize index.
- Image generation is slow (~5–15s) — use a loading state or stream progress if exposed to users.
- Workers AI requests count against your Workers compute budget; large models and image generation cost more.
- For low-latency production use, prefer smaller models (8B params) over 70B unless quality demands it.
- Combine with KV, D1, or Vectorize for stateful AI applications that persist data between requests.
