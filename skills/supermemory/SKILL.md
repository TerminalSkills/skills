---
name: supermemory
description: >-
  Add persistent memory to AI agents using Supermemory API -- the #1 ranked AI memory engine.
  Use when: building AI assistants that remember users, adding long-term memory to chatbots,
  creating personalized AI products, storing conversation context across sessions.
license: Apache-2.0
compatibility: "Node.js 18+ or Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: [memory, ai-agents, rag, personalization, supermemory]
---

# Supermemory

## Overview

Supermemory is the memory and context layer for AI -- ranked #1 on LongMemEval, LoCoMo, and ConvoMem benchmarks. It automatically extracts facts from conversations, maintains user profiles with ~50ms retrieval, handles temporal changes and contradictions, and delivers the right context at the right time. Supports hybrid search (RAG + memory), connectors (Google Drive, Gmail, Notion, GitHub), and multi-modal input (PDFs, images, videos, code).

## Instructions

### Installation

```bash
npm install supermemory
# or
pip install supermemory
```

Get an API key at https://console.supermemory.ai

### Core Memory Operations

```typescript
import Supermemory from "supermemory";

const client = new Supermemory({ apiKey: process.env.SUPERMEMORY_API_KEY });

// Add a memory
const memory = await client.memories.add({
  content: "User prefers dark mode and uses TypeScript exclusively",
  userId: "user_123",
  metadata: { source: "conversation", timestamp: new Date().toISOString() },
});

// Search memories
const results = await client.memories.search({
  query: "user preferences",
  userId: "user_123",
  limit: 5,
});

// Delete a memory
await client.memories.delete(memory.id);
```

### User Profiles (Auto-maintained)

```typescript
const profile = await client.users.getProfile("user_123");
// Returns: { stable_facts, recent_activity, preferences }
```

### Adding Memory to AI Conversations

1. Retrieve relevant memories before each response
2. Include memory context in the system prompt
3. Store new information from each conversation turn

```typescript
async function chatWithMemory(userId: string, userMessage: string) {
  const memories = await client.memories.search({
    query: userMessage, userId, limit: 5,
  });

  const memoryContext = memories.results.map(m => `- ${m.content}`).join("\n");

  const response = await claude.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    system: `You know this about the user:\n${memoryContext}`,
    messages: [{ role: "user", content: userMessage }],
  });

  await client.memories.add({
    content: `User said: "${userMessage}"`,
    userId,
  });

  return response.content[0].text;
}
```

### Python Usage

```python
from supermemory import Supermemory

client = Supermemory(api_key="your_api_key")

client.memories.add(
    content="User is building a B2B SaaS targeting HR teams",
    user_id="user_123",
)

results = client.memories.search(query="what is the user building", user_id="user_123", limit=3)
for r in results.results:
    print(f"[{r.score:.2f}] {r.content}")
```

### Connectors (Auto-sync External Sources)

```typescript
await client.connectors.connect({
  type: "google_drive",
  userId: "user_123",
  credentials: { access_token: googleAccessToken },
});

// Search across Drive docs + memories together
const results = await client.memories.search({
  query: "project requirements",
  userId: "user_123",
  includeConnectors: true,
});
```

### MCP Integration (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "supermemory": {
      "command": "npx",
      "args": ["-y", "supermemory-mcp"],
      "env": { "SUPERMEMORY_API_KEY": "your_api_key" }
    }
  }
}
```

## Examples

### Example 1: Personal AI Assistant with Memory

Build a chatbot that remembers user preferences across sessions:

1. On first conversation: user mentions they work in fintech, prefer Python, and are building a payment API
2. `client.memories.add({ content: "Works in fintech, prefers Python, building payment API", userId })` stores this
3. Next session, user asks "help me with error handling" -- search returns their context
4. System prompt includes: "User works in fintech, prefers Python, is building a payment API"
5. Response is tailored: Python error handling examples specific to payment processing, not generic code
6. Profile auto-updates: `{ stable_facts: ["Works in fintech", "Prefers Python"], recent_activity: ["Building payment API"] }`

### Example 2: Knowledge Base with Connector Sync

Sync a team's Google Drive and let anyone search across all documents plus conversation history:

1. Connect Google Drive: `client.connectors.connect({ type: "google_drive", userId: "team_shared" })`
2. Supermemory indexes all Drive documents automatically
3. Team member asks: "What did we decide about the pricing model?"
4. Search with `includeConnectors: true` returns both the pricing doc from Drive and a memory from a previous conversation where the CEO said "let us go with usage-based"
5. Response synthesizes both sources: "The pricing doc outlines three tiers, and in your last discussion the team decided on usage-based pricing"

## Guidelines

- Always scope memories to a `userId` for multi-user applications
- Use `metadata` to tag memories with source and timestamp for traceability
- Search before adding to avoid duplicate memories -- Supermemory handles contradictions but duplicates waste quota
- Retrieve 3-5 memories per query for optimal context without noise
- User profiles are auto-maintained -- no need to manually build them
- Free tier: 1,000 memories, 100 searches/day. Pro: $20/month for 100k memories, unlimited search
- Keep API keys in environment variables, never hardcode them
- Connectors sync automatically after initial setup -- no polling required
