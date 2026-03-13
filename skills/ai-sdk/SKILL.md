---
name: ai-sdk
category: AI & Machine Learning
tags: [vercel, ai, llm, streaming, react, typescript, openai, anthropic]
version: 1.0.0
author: terminal-skills
---

# Vercel AI SDK — Build AI-Powered Apps in TypeScript

You are an expert in the Vercel AI SDK, the TypeScript toolkit for building AI-powered applications. You help developers integrate LLMs (OpenAI, Anthropic, Google, Mistral, Ollama) with React Server Components, streaming UI, tool calling, structured output with Zod schemas, RAG pipelines, multi-step agents, and edge-compatible AI features — the standard way to add AI to Next.js, Nuxt, SvelteKit, and any Node.js app.

## Core Capabilities

### Core AI Functions

```typescript
// AI SDK Core — works in any Node.js/Edge environment
import { generateText, generateObject, streamText, streamObject, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

// Simple text generation
const { text } = await generateText({
  model: openai("gpt-4o"),
  prompt: "Explain quantum computing in 3 sentences",
});

// Structured output with Zod schema
const { object: analysis } = await generateObject({
  model: anthropic("claude-sonnet-4-20250514"),
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    topics: z.array(z.string()),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  prompt: `Analyze this review: "${reviewText}"`,
});
// analysis.sentiment → "positive" (fully typed)

// Streaming text
const result = streamText({
  model: openai("gpt-4o"),
  messages: [{ role: "user", content: "Write a poem about TypeScript" }],
});
for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}

// Tool calling (agents)
const { text: answer, toolResults } = await generateText({
  model: openai("gpt-4o"),
  tools: {
    getWeather: tool({
      description: "Get weather for a city",
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => {
        const res = await fetch(`https://wttr.in/${city}?format=j1`);
        return res.json();
      },
    }),
    searchDatabase: tool({
      description: "Search products database",
      parameters: z.object({ query: z.string(), limit: z.number().default(5) }),
      execute: async ({ query, limit }) => db.products.search(query, limit),
    }),
  },
  maxSteps: 5,                            // Multi-step agent loop
  prompt: "What's the weather in Tokyo and find related travel products?",
});
```

### React / Next.js Integration

```tsx
// app/api/chat/route.ts — API route with streaming
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant.",
    messages,
  });

  return result.toDataStreamResponse();
}

// app/chat/page.tsx — Client component
"use client";
import { useChat } from "ai/react";

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div>
      {messages.map(m => (
        <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
          <p>{m.content}</p>
        </div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} placeholder="Ask anything..." />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}

// Streaming UI with RSC
import { streamUI } from "ai/rsc";

async function submitMessage(input: string) {
  "use server";
  const result = await streamUI({
    model: openai("gpt-4o"),
    messages: [{ role: "user", content: input }],
    tools: {
      showStockPrice: {
        description: "Show stock price chart",
        parameters: z.object({ symbol: z.string() }),
        generate: async function* ({ symbol }) {
          yield <Spinner />;
          const data = await getStockData(symbol);
          return <StockChart data={data} />;      // Stream React components!
        },
      },
    },
  });
  return result.value;
}
```

### Provider Switching

```typescript
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { createOllama } from "ollama-ai-provider";

const ollama = createOllama({ baseURL: "http://localhost:11434/api" });

// Same code, different providers
const models = {
  fast: openai("gpt-4o-mini"),
  smart: anthropic("claude-sonnet-4-20250514"),
  vision: google("gemini-2.0-flash"),
  local: ollama("llama3"),
};

const { text } = await generateText({
  model: models[selectedModel],           // Switch provider with zero code changes
  prompt: userQuery,
});
```

## Installation

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
# Provider packages: @ai-sdk/google, @ai-sdk/mistral, ollama-ai-provider
```

## Best Practices

1. **generateObject for structured data** — Use Zod schemas for type-safe AI output; no manual JSON parsing
2. **streamText for UX** — Always stream responses to users; time-to-first-token matters more than total time
3. **Tool calling for agents** — Define tools with Zod parameters; AI SDK handles the tool call loop automatically
4. **maxSteps for multi-step** — Set `maxSteps: 5-10` for agent loops; AI calls tools, gets results, reasons, repeats
5. **Provider abstraction** — Use AI SDK providers to swap models without changing app code; test with cheap models, deploy with smart ones
6. **useChat hook** — Use in React for chat UIs; handles streaming, message history, loading state, error handling
7. **Edge-compatible** — AI SDK works on Vercel Edge, Cloudflare Workers, Deno; stream from the edge for lower latency
8. **Telemetry** — Enable `experimental_telemetry` for OpenTelemetry traces; track token usage, latency, errors
