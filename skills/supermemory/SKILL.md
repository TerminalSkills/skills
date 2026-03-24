---
name: supermemory
description: >-
  Add persistent memory to AI agents using Supermemory API — the #1 ranked AI memory engine.
  Use when: building AI assistants that remember users, adding long-term memory to chatbots,
  creating personalized AI products, storing conversation context across sessions.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: [memory, ai-agents, rag, personalization, context, supermemory]
  use-cases:
    - "Add persistent memory to a Claude/GPT chatbot so it remembers users"
    - "Build a personal AI assistant that learns over time"
    - "Store and retrieve user preferences, past conversations, and facts"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Supermemory

## Overview

Supermemory is the memory and context layer for AI — #1 on LongMemEval, LoCoMo, and ConvoMem benchmarks. Automatically extracts facts from conversations, maintains user profiles, handles temporal changes and contradictions, and delivers the right context at the right time.

**Key capabilities:**
- 🧠 **Memory** — extracts and stores facts from conversations, handles updates/contradictions
- 👤 **User Profiles** — auto-maintained user context, ~50ms retrieval
- 🔍 **Hybrid Search** — RAG + Memory in a single query
- 🔌 **Connectors** — Google Drive, Gmail, Notion, OneDrive, GitHub sync
- 📄 **Multi-modal** — PDFs, images, videos, code processing

## Installation

```bash
npm install supermemory
# or
pip install supermemory
```

Get API key: https://console.supermemory.ai

## Basic Memory Operations (TypeScript)

```typescript
import Supermemory from "supermemory";

const client = new Supermemory({
  apiKey: process.env.SUPERMEMORY_API_KEY,
});

// Add a memory
const memory = await client.memories.add({
  content: "User prefers dark mode and uses TypeScript exclusively",
  userId: "user_123",
  metadata: {
    source: "conversation",
    timestamp: new Date().toISOString(),
  },
});

// Search memories
const results = await client.memories.search({
  query: "user preferences",
  userId: "user_123",
  limit: 5,
});

console.log(results.results);
// [{ content: "...", score: 0.95, metadata: {...} }]

// Delete a memory
await client.memories.delete(memory.id);
```

## User Profile (Auto-maintained)

```typescript
// Get comprehensive user profile in ~50ms
const profile = await client.users.getProfile("user_123");
console.log(profile);
// {
//   stable_facts: ["Uses TypeScript", "Based in NYC", "Works on SaaS products"],
//   recent_activity: ["Asked about React hooks", "Discussed deployment"],
//   preferences: { theme: "dark", language: "TypeScript" }
// }
```

## Add Memory to AI Conversations

```typescript
import Anthropic from "@anthropic-ai/sdk";
import Supermemory from "supermemory";

const claude = new Anthropic();
const memory = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });

async function chatWithMemory(userId: string, userMessage: string): Promise<string> {
  // 1. Retrieve relevant memories
  const memories = await memory.memories.search({
    query: userMessage,
    userId,
    limit: 5,
  });

  const memoryContext = memories.results
    .map(m => `- ${m.content}`)
    .join("\n");

  // 2. Build prompt with memory context
  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You are a helpful assistant. Here is what you know about this user:
${memoryContext}

Use this context to personalize your responses.`,
    messages: [{ role: "user", content: userMessage }],
  });

  const assistantResponse = response.content[0].type === "text"
    ? response.content[0].text : "";

  // 3. Store new information from conversation
  await memory.memories.add({
    content: `User said: "${userMessage}". Assistant responded about: ${assistantResponse.slice(0, 100)}`,
    userId,
  });

  return assistantResponse;
}
```

## Python Example

```python
from supermemory import Supermemory

client = Supermemory(api_key="your_api_key")

# Add memory
client.memories.add(
    content="User is building a B2B SaaS product targeting HR teams",
    user_id="user_123",
)

# Search
results = client.memories.search(
    query="what is the user building",
    user_id="user_123",
    limit=3,
)

for r in results.results:
    print(f"[{r.score:.2f}] {r.content}")
```

## Connectors (Auto-sync External Sources)

```typescript
// Connect Google Drive — automatically indexes all documents
const connector = await client.connectors.connect({
  type: "google_drive",
  userId: "user_123",
  credentials: {
    access_token: googleAccessToken,
  },
});

// Now search across Drive docs + memories together
const results = await client.memories.search({
  query: "project requirements document",
  userId: "user_123",
  includeConnectors: true,
});
```

## MCP Integration (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supermemory": {
      "command": "npx",
      "args": ["-y", "supermemory-mcp"],
      "env": {
        "SUPERMEMORY_API_KEY": "your_api_key"
      }
    }
  }
}
```

## Pricing

- Free: 1,000 memories, 100 searches/day
- Pro: $20/month — 100k memories, unlimited search
- API: $0.001 per memory add, $0.0001 per search
