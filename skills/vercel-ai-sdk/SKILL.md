---
name: vercel-ai-sdk
category: AI & Machine Learning
tags: [ai, streaming, react, nextjs, chat, llm, vercel, typescript]
version: 1.0.0
author: terminal-skills
---

# Vercel AI SDK — Build AI Apps with React

You are an expert in the Vercel AI SDK, the TypeScript toolkit for building AI-powered applications. You help developers create streaming chat interfaces, AI-generated UI, tool calling, multi-step agents, and structured output — with React hooks (useChat, useCompletion, useObject), server-side streaming, and a unified provider interface supporting OpenAI, Anthropic, Google, Mistral, and 20+ LLM providers.

## Core Capabilities

### Chat with Streaming

```typescript
// app/api/chat/route.ts — Streaming chat API
import { openai } from "@ai-sdk/openai";
import { streamText, tool } from "ai";
import { z } from "zod";

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: "You are a helpful assistant for a project management app.",
    messages,
    tools: {
      createTask: tool({
        description: "Create a new task in the project",
        parameters: z.object({
          title: z.string(),
          priority: z.enum(["low", "medium", "high"]),
          assignee: z.string().optional(),
        }),
        execute: async ({ title, priority, assignee }) => {
          const task = await db.tasks.create({ data: { title, priority, assignee } });
          return { taskId: task.id, message: `Created task: ${title}` };
        },
      }),
      searchDocs: tool({
        description: "Search project documentation",
        parameters: z.object({ query: z.string() }),
        execute: async ({ query }) => {
          const results = await vectorSearch(query);
          return { results: results.map(r => ({ title: r.title, snippet: r.content.slice(0, 200) })) };
        },
      }),
    },
    maxSteps: 5,                           // Multi-step: agent can call tools, then continue
  });

  return result.toDataStreamResponse();
}
```

```tsx
// components/Chat.tsx — React chat UI
"use client";
import { useChat } from "ai/react";

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

  return (
    <div className="flex flex-col h-[600px]">
      <div className="flex-1 overflow-y-auto space-y-4 p-4">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
            <div className={`inline-block p-3 rounded-lg ${
              m.role === "user" ? "bg-blue-500 text-white" : "bg-gray-100"
            }`}>
              {m.content}
              {/* Tool results rendered inline */}
              {m.toolInvocations?.map((ti) => (
                <div key={ti.toolCallId} className="mt-2 text-sm bg-white p-2 rounded">
                  🔧 {ti.toolName}: {JSON.stringify(ti.result)}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4 flex gap-2">
        <input value={input} onChange={handleInputChange} placeholder="Ask anything..."
          className="flex-1 border rounded-lg px-4 py-2" disabled={isLoading} />
        <button type="submit" disabled={isLoading}>Send</button>
      </form>
    </div>
  );
}
```

### Structured Output

```typescript
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const { object: analysis } = await generateObject({
  model: openai("gpt-4o"),
  schema: z.object({
    sentiment: z.enum(["positive", "negative", "neutral"]),
    topics: z.array(z.string()),
    urgency: z.number().min(1).max(5),
    suggestedAction: z.string(),
  }),
  prompt: `Analyze this support ticket: "${ticketText}"`,
});
// analysis is typed and validated — guaranteed to match schema
```

### Multi-Provider

```typescript
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

// Switch models by changing one line
const result = await generateText({
  model: anthropic("claude-sonnet-4-20250514"),   // Or openai("gpt-4o") or google("gemini-2.0-flash")
  prompt: "Explain async/await",
});
```

## Installation

```bash
npm install ai @ai-sdk/openai @ai-sdk/anthropic
```

## Best Practices

1. **useChat** — React hook for chat UIs; handles streaming, message state, loading, and error automatically
2. **streamText** — Server-side streaming; response starts immediately, tokens arrive as generated
3. **Tool calling** — Define tools with Zod schemas; AI calls them, you execute, results feed back to AI
4. **maxSteps** — Enable multi-step agent behavior; AI can call tools, reason about results, call more tools
5. **generateObject** — Type-safe structured output; Zod schema enforces output format
6. **Provider-agnostic** — Same code works with OpenAI, Anthropic, Google; swap model string only
7. **Middleware** — Add caching, logging, guardrails via AI SDK middleware; intercept any model call
8. **AI-generated UI** — Use `streamUI` to stream React components from the server; dynamic AI interfaces
