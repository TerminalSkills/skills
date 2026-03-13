---
name: cloudflare-ai
description: >-
   You are an expert in Cloudflare Workers AI, the serverless AI inference
  platform running on Cloudflare's global network. You help developers run
  LLMs, embedding models, image generation, speech-to-text, and translation
  models at the edge with zero cold starts, pay-per-use pricing, and
  integration with Workers, Pages, and Vectorize — enabling AI features
  without managing GPU infrastructure.
category: AI & Machine Learning
tags: [cloudflare, workers-ai, edge, inference, llm, embeddings, serverless]
version: 1.0.0
author: terminal-skills
---

# Cloudflare Workers AI — AI Inference at the Edge

You are an expert in Cloudflare Workers AI, the serverless AI inference platform running on Cloudflare's global network. You help developers run LLMs, embedding models, image generation, speech-to-text, and translation models at the edge with zero cold starts, pay-per-use pricing, and integration with Workers, Pages, and Vectorize — enabling AI features without managing GPU infrastructure.

## Core Capabilities

### AI Inference in Workers

```typescript
// src/worker.ts — AI-powered API at the edge
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Text generation (LLM)
    if (url.pathname === "/api/chat") {
      const { messages } = await request.json();

      const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
        messages,
        max_tokens: 1024,
        temperature: 0.7,
        stream: true,
      });

      return new Response(response, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    // Text embeddings (for RAG)
    if (url.pathname === "/api/embed") {
      const { text } = await request.json();

      const embeddings = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: Array.isArray(text) ? text : [text],
      });

      return Response.json({ embeddings: embeddings.data });
    }

    // Image generation
    if (url.pathname === "/api/generate-image") {
      const { prompt } = await request.json();

      const image = await env.AI.run("@cf/stabilityai/stable-diffusion-xl-base-1.0", {
        prompt,
        num_steps: 20,
      });

      return new Response(image, {
        headers: { "Content-Type": "image/png" },
      });
    }

    // Speech to text
    if (url.pathname === "/api/transcribe") {
      const audioData = await request.arrayBuffer();

      const result = await env.AI.run("@cf/openai/whisper", {
        audio: [...new Uint8Array(audioData)],
      });

      return Response.json({ text: result.text });
    }

    // Translation
    if (url.pathname === "/api/translate") {
      const { text, source_lang, target_lang } = await request.json();

      const result = await env.AI.run("@cf/meta/m2m100-1.2b", {
        text,
        source_lang,
        target_lang,
      });

      return Response.json({ translated: result.translated_text });
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

### RAG with Vectorize

```typescript
// RAG pipeline: Embed → Store in Vectorize → Query → Generate
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { question } = await request.json();

    // Step 1: Embed the question
    const queryEmbedding = await env.AI.run("@cf/baai/bge-base-en-v1.5", {
      text: [question],
    });

    // Step 2: Search Vectorize
    const matches = await env.VECTORIZE.query(queryEmbedding.data[0], {
      topK: 5,
      returnMetadata: "all",
    });

    // Step 3: Generate answer with context
    const context = matches.matches.map(m => m.metadata?.text).join("\n\n");

    const answer = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: `Answer based on this context:\n${context}` },
        { role: "user", content: question },
      ],
    });

    return Response.json({
      answer: answer.response,
      sources: matches.matches.map(m => ({ text: m.metadata?.text, score: m.score })),
    });
  },
};
```

## Installation

```bash
# Create Workers project
npm create cloudflare@latest my-ai-app

# wrangler.toml
[ai]
binding = "AI"

[[vectorize]]
binding = "VECTORIZE"
index_name = "my-index"

# Deploy
npx wrangler deploy
```

## Best Practices

1. **Edge inference** — Models run on Cloudflare's network; <50ms latency worldwide, zero cold starts
2. **Streaming** — Use `stream: true` for LLM responses; first token in ~200ms at the edge
3. **Vectorize for RAG** — Use Cloudflare Vectorize for embedding storage; integrated with Workers AI
4. **Free tier** — 10K neurons/day free; enough for prototyping and low-volume production
5. **Model catalog** — Browse `@cf/` models; Llama 3.1, Mistral, Stable Diffusion, Whisper, BGE all available
6. **Gateway for routing** — Use AI Gateway for caching, rate limiting, analytics, and fallback to OpenAI/Anthropic
7. **R2 for storage** — Store generated images, audio in R2 (S3-compatible); zero egress fees
8. **No GPU management** — Cloudflare manages GPU fleet; you pay per inference, not per GPU-hour
