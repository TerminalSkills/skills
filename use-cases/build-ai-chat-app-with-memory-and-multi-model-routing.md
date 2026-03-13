---
title: Build an AI Chat App with Persistent Memory and Multi-Model Routing
slug: build-ai-chat-app-with-memory-and-multi-model-routing
description: Build a production AI chat application using Mem0 for persistent user memory across sessions, OpenRouter for multi-model routing and fallbacks, Langfuse for LLM observability and cost tracking, and Convex for a reactive real-time backend — creating a personalized AI assistant that remembers users and optimizes model costs.
skills: [mem0, openrouter, langfuse, convex-sdk]
category: AI & Machine Learning
tags: [ai, chat, memory, personalization, multi-model, observability]
---

# Build an AI Chat App with Persistent Memory and Multi-Model Routing

Kai is building an AI customer success platform where each customer gets a personalized AI assistant. The assistant must remember past conversations, customer preferences, and account details across sessions — not just within a single chat thread. It should route simple questions to cheap models and complex ones to powerful models, while tracking quality and cost.

Kai uses Mem0 for persistent memory, OpenRouter for multi-model routing, Langfuse for observability, and Convex for the real-time backend.

## Step 1: Convex Backend with Real-Time Chat

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  conversations: defineTable({
    userId: v.string(),
    title: v.string(),
    lastMessageAt: v.number(),
  }).index("by_user", ["userId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    model: v.optional(v.string()),
    cost: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),
});
```

```typescript
// convex/chat.ts — Real-time chat with AI
import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const sendMessage = action({
  args: { conversationId: v.id("conversations"), content: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    // Save user message
    await ctx.runMutation(api.chat.addMessage, {
      conversationId: args.conversationId,
      role: "user",
      content: args.content,
    });

    // Step 1: Retrieve relevant memories
    const memoriesResponse = await fetch(`${process.env.API_URL}/api/memories/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: args.userId, query: args.content }),
    });
    const memories = await memoriesResponse.json();
    const memoryContext = memories.map((m: any) => `- ${m.memory}`).join("\n");

    // Step 2: Get recent messages for conversation context
    const recentMessages = await ctx.runQuery(api.chat.listMessages, {
      conversationId: args.conversationId,
      limit: 10,
    });

    // Step 3: Classify complexity for model routing
    const complexity = classifyComplexity(args.content, recentMessages);
    const model = complexity === "simple"
      ? "openai/gpt-4o-mini"              // $0.15/M tokens
      : complexity === "complex"
        ? "anthropic/claude-sonnet-4-20250514"       // $3/M tokens
        : "openai/gpt-4o";                // $2.50/M tokens (default)

    // Step 4: Generate AI response via OpenRouter
    const start = Date.now();
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: `You are a helpful customer success assistant.

What you know about this customer:
${memoryContext || "No prior context available."}

Be personalized and reference what you know about them naturally.` },
          ...recentMessages.map(m => ({ role: m.role, content: m.content })),
          { role: "user", content: args.content },
        ],
      }),
    });

    const data = await aiResponse.json();
    const assistantContent = data.choices[0].message.content;
    const latencyMs = Date.now() - start;

    // Step 5: Save assistant message
    await ctx.runMutation(api.chat.addMessage, {
      conversationId: args.conversationId,
      role: "assistant",
      content: assistantContent,
      model,
      latencyMs,
    });

    // Step 6: Store new memories from this exchange
    await fetch(`${process.env.API_URL}/api/memories/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: args.userId,
        messages: [
          { role: "user", content: args.content },
          { role: "assistant", content: assistantContent },
        ],
      }),
    });

    // Step 7: Log to Langfuse for observability
    await fetch(`${process.env.API_URL}/api/trace`, {
      method: "POST",
      body: JSON.stringify({
        userId: args.userId,
        model,
        complexity,
        latencyMs,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        memoriesUsed: memories.length,
      }),
    });

    return { content: assistantContent, model, latencyMs };
  },
});

function classifyComplexity(content: string, history: any[]): "simple" | "medium" | "complex" {
  const wordCount = content.split(" ").length;
  const hasCode = /```|function|const |import |class /.test(content);
  const hasAnalysis = /analyze|compare|explain why|debug|architect/i.test(content);

  if (hasCode || hasAnalysis || wordCount > 100) return "complex";
  if (wordCount > 30 || history.length > 5) return "medium";
  return "simple";
}
```

## Step 2: Memory API with Mem0

```python
# api/memories.py — Memory service
from mem0 import Memory
from langfuse.decorators import observe

memory = Memory.from_config({
    "llm": {"provider": "openai", "config": {"model": "gpt-4o-mini"}},
    "vector_store": {"provider": "qdrant", "config": {"host": "localhost", "port": 6333}},
})

@observe()
async def search_memories(user_id: str, query: str):
    results = memory.search(query, user_id=user_id, limit=5)
    return [{"memory": r["memory"], "score": r.get("score", 0)} for r in results]

@observe()
async def add_memories(user_id: str, messages: list):
    memory.add(messages, user_id=user_id)
```

## Step 3: Langfuse Observability

```python
# api/trace.py — Track LLM usage and quality
from langfuse import Langfuse

langfuse = Langfuse()

def log_trace(data):
    trace = langfuse.trace(
        name="chat-response",
        user_id=data["userId"],
        metadata={"model": data["model"], "complexity": data["complexity"]},
    )
    trace.generation(
        name="llm-call",
        model=data["model"],
        usage={"input": data["inputTokens"], "output": data["outputTokens"]},
        metadata={"latency_ms": data["latencyMs"], "memories_used": data["memoriesUsed"]},
    )
```

## Results

After 90 days, the platform serves 2,000 customers with personalized AI assistants.

- **Memory recall**: 89% of responses reference relevant customer context from past sessions
- **Model cost optimization**: 62% of requests routed to gpt-4o-mini ($0.15/M), 28% to gpt-4o ($2.50/M), 10% to Claude ($3/M)
- **Average cost per conversation**: $0.08 (vs $0.31 with always-GPT-4o)
- **Response latency**: p50 = 1.2s (mini), p50 = 2.8s (Claude) — tracked in Langfuse
- **Real-time UX**: Messages appear instantly for all session participants via Convex reactive queries
- **Memory growth**: Average 47 memories per customer after 90 days; auto-deduplication prevents bloat
- **Quality scores**: 4.2/5 user satisfaction (Langfuse evaluation), up from 3.6 without memory
