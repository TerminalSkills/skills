---
name: ai-sdk
description: >-
  The Vercel AI SDK is a TypeScript toolkit for calling LLMs from Node.js,
  Next.js, Nuxt, SvelteKit and edge runtimes through one API. It covers text
  generation, streaming, structured output with Zod, tool calling, agents
  (ToolLoopAgent) and chat UIs with useChat. Use when asked to "add AI to my
  Next.js app", "stream a chat response", "get typed JSON from an LLM", "switch
  between OpenAI, Anthropic and Gemini", or "build a tool-calling agent".
license: Apache-2.0
compatibility: "Node.js 22+, ESM only; ai 7.x with provider packages 4.x; a provider API key or an AI Gateway key"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/vercel/ai
  tags: "vercel, llm, streaming, typescript, agents"
---

# Vercel AI SDK — Build AI-Powered Apps in TypeScript

## Overview

The AI SDK (`ai` on npm, version 7 at the time of writing) gives one API over many model providers. AI SDK Core (`generateText`, `streamText`, tools, agents) runs in any JavaScript runtime. AI SDK UI (`@ai-sdk/react`, plus Vue and Svelte packages) provides chat hooks that read the stream Core produces.

Version 7 requires Node.js 22 or later and ships ESM only (no `require()`). Many v4 and v5 snippets on the web no longer work: `maxSteps`, `parameters`, `toDataStreamResponse`, `ai/react` and `useChat().input` are gone, and several v6 names were renamed in v7 (listed under Guidelines). When a project pins an older major, check its `package.json` first and follow the migration guide at https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0 (`npx @ai-sdk/codemod v7` applies the mechanical renames).

## Instructions

### Install

```bash
npm install ai @ai-sdk/react zod
npm install @ai-sdk/openai @ai-sdk/anthropic @ai-sdk/google   # only the providers you use
```

Providers read their key from the environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`). Never hard-code keys.

### Choosing a model

Pass a provider model (`openai("gpt-5.4-mini")`) or a plain string such as `"anthropic/claude-sonnet-5.5"`, which goes through the Vercel AI Gateway and needs `AI_GATEWAY_API_KEY`. Model ids retire often; check the provider's model list before copying one.

### Core functions

- `generateText`: one call, returns `text`, `steps`, `usage`. Add `output: Output.object({ schema })` for typed JSON, read from `result.output`. `generateObject` and `streamObject` still exist but are deprecated in favor of this.
- `streamText`: returns immediately; consume `result.textStream` for text or `result.stream` for every event (text, tool calls, reasoning). `fullStream` is a deprecated alias.
- `tool({ description, inputSchema, execute })`: a function the model may call. The schema key is `inputSchema` (not `parameters`).
- Multi-step tool use: set `stopWhen: isStepCount(5)` on `generateText` or `streamText`. Without `stopWhen` those functions stop after one step.
- `ToolLoopAgent`: reusable agent holding `model`, `instructions`, `tools`; call `agent.generate({ prompt })` or `agent.stream({ prompt })`. It stops after 20 steps unless you set `stopWhen` (`isLoopFinished()` removes the cap).
- The system prompt option is called `instructions` in v7 (it was `system`). System messages inside `messages` are rejected by default.

### Chat UI with Next.js

The route converts UI messages to model messages, streams, and returns a UI message stream. The client uses `useChat` with a transport; it no longer manages the input field, so keep that in `useState`.

### Switching providers and local models

Models are values, so a map of `openai(...)`, `anthropic(...)`, `google(...)` works with the same call. For Ollama use the community package `ollama-ai-provider-v2` (the older `ollama-ai-provider` targets old SDK versions).

### Telemetry

OpenTelemetry moved out of `ai`. Install `@ai-sdk/otel` and call `registerTelemetry(new OpenTelemetry())` once at startup (in Next.js, `instrumentation.ts`). After that every call emits telemetry; `experimental_telemetry` is now `telemetry`.

## Examples

### Example 1: "Classify support tickets into typed JSON"

```typescript
import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const ticketText = "My invoice INV-20418 was charged twice and support has not replied in 3 days.";

const { output } = await generateText({
  model: anthropic("claude-sonnet-5-5"),
  output: Output.object({
    schema: z.object({
      category: z.enum(["billing", "bug", "feature-request", "other"]),
      urgency: z.enum(["low", "normal", "high"]),
      summary: z.string(),
    }),
  }),
  prompt: `Classify this ticket:\n${ticketText}`,
});

console.log(output.category, output.urgency); // "billing" "high", fully typed
```

The result is validated against the schema; a response that does not match throws `NoObjectGeneratedError`.

### Example 2: "Streaming chat in Next.js"

```typescript
// app/api/chat/route.ts
import { convertToModelMessages, createUIMessageStreamResponse, streamText, toUIMessageStream, type UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: openai("gpt-5.4-mini"),
    instructions: "You are a concise support assistant for an online bike shop.",
    messages: await convertToModelMessages(messages),
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}
```

```tsx
// app/chat/page.tsx
"use client";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState } from "react";

export default function Chat() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const [input, setInput] = useState("");

  return (
    <form onSubmit={(e) => { e.preventDefault(); sendMessage({ text: input }); setInput(""); }}>
      {messages.map((m) => (
        <div key={m.id}>
          {m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}
        </div>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)} disabled={status !== "ready"} />
    </form>
  );
}
```

Text appears token by token; render `message.parts`, because tool calls and reasoning arrive as separate part types.

### Example 3: "An agent that looks up weather"

```typescript
import { ToolLoopAgent, tool, isStepCount } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const getWeather = tool({
  description: "Current temperature for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);
    const data = await res.json();
    return { city, tempC: Number(data.current_condition[0].temp_C) };
  },
});

const agent = new ToolLoopAgent({
  model: openai("gpt-5.4"),
  instructions: "Answer travel questions; use tools for live data.",
  tools: { getWeather },
  stopWhen: isStepCount(10),
});

const { text } = await agent.generate({ prompt: "Is it warmer in Tokyo or Oslo right now?" });
```

The model calls `getWeather` twice, reads both results, then writes the answer.

## Guidelines

- Renames from v6 to v7: `system` to `instructions`, `stepCountIs` to `isStepCount`, `fullStream` to `stream`, `experimental_output` to `output`, `onFinish` to `onEnd`, `onStepFinish` to `onStepEnd`, `experimental_telemetry` to `telemetry`. Results of `generateText` and `streamText` now cover all steps, with last-step values under `finalStep`.
- The `streamText` result methods `toUIMessageStreamResponse()` and `toTextStreamResponse()` still work in v7 but are deprecated; use `createUIMessageStreamResponse`, `toUIMessageStream`, `createTextStreamResponse`, `toTextStream`.
- `streamText` does not throw on stream errors; pass `onError` or you will see nothing.
- Always set a step limit on agents that call paid APIs, and validate tool input with a strict Zod schema because the model, not your code, produces it.
- Request and response bodies are excluded from step results by default; opt in through `include` when debugging.
- `streamUI` and the rest of AI SDK RSC (`@ai-sdk/rsc`) are experimental; prefer AI SDK UI with `useChat` for production.
- Not for training or fine-tuning models, and not a replacement for a provider's own SDK when you need an API feature the unified interface does not expose (use `providerOptions` first).
