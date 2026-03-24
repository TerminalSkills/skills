---
title: Build an AI Assistant with Long-Term Memory
slug: build-long-term-ai-memory
description: >-
  Build a personal AI assistant that remembers everything across sessions — projects, preferences,
  past decisions — using Supermemory for storage and MCP for Claude Desktop integration.
skills:
  - supermemory
  - anthropic-sdk
  - mcp-server
category: data-ai
tags:
  - memory
  - agents
  - supermemory
  - mcp
  - personalization
---

## The Problem

A developer uses AI assistants constantly, but every conversation starts from zero. The assistant does not know she is building a SaaS product on Next.js, does not remember she prefers TypeScript over JavaScript, and does not know she already tried Supabase and switched to PlanetScale last month. She re-explains her context in every session. Existing "memory" features hold a few bullet points, not the rich context of months of work.

## The Solution

Use Supermemory as the memory backend — a semantic search layer for AI memory that stores facts, retrieves by relevance, and handles deduplication. Combine it with the Anthropic SDK for conversations and an MCP server so the memory works directly inside Claude Desktop.

## Step-by-Step Walkthrough

### Step 1: Set Up Supermemory

```bash
pip install supermemory anthropic
export SUPERMEMORY_API_KEY="your-key"
export ANTHROPIC_API_KEY="your-key"
```

Create a memory space (namespace) for your user:

```python
import supermemory
memory_client = supermemory.Supermemory(api_key=os.environ["SUPERMEMORY_API_KEY"])
space = memory_client.spaces.create(name="personal-assistant")
SPACE_ID = space.id
```

### Step 2: Memory Retrieval and Storage

Build two functions: `retrieve_relevant_memories(query, space_id)` searches Supermemory semantically and returns the top 8 matching facts. `extract_and_store_facts(user_msg, assistant_reply, space_id)` uses claude-haiku-4-5 to extract memorable facts (preferences, decisions, project details) from each conversation turn and stores them, capped at 5 facts per turn.

### Step 3: Conversation Loop with Memory

Each turn: retrieve relevant memories, inject them into the system prompt as "things I remember about you", call the main model, then asynchronously extract and store new facts. The user can also explicitly say `remember: I switched to PlanetScale` to store facts directly.

### Step 4: User Profile Maintenance

Periodically consolidate scattered facts into a coherent user profile. Fetch the top 50 memories, ask claude-haiku-4-5 to consolidate and deduplicate, then store the summary with `priority: high` metadata so it surfaces first in future retrievals.

### Step 5: Memory Pruning

Implement a pruning function that removes memories older than 90 days (except profile summaries). This prevents the memory store from growing unbounded and keeps context fresh.

### Step 6: MCP Server for Claude Desktop

Create an MCP server with two tools — `remember` (stores a fact) and `recall` (searches memory). Add it to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "python",
      "args": ["/path/to/memory_mcp_server.py"],
      "env": {
        "SUPERMEMORY_API_KEY": "your-key",
        "MEMORY_SPACE_ID": "your-space-id"
      }
    }
  }
}
```

Restart Claude Desktop — `remember` and `recall` tools are now available in every conversation.

## Real-World Example

Week 1: The developer tells the assistant about her stack (Next.js + Supabase + Stripe) and target market (European freelancers). These facts are extracted and stored automatically.

Week 2: She opens a new conversation and asks "What pricing model should I use?" The assistant retrieves her stored context and responds with advice specific to B2B invoicing SaaS targeting European freelancers — without her re-explaining anything.

Week 3: She says "We dropped Supabase, moving to PlanetScale." The memory system stores this new fact. On the next retrieval, the updated context surfaces and the old Supabase reference is deprioritized by semantic relevance.

After 3 months, the profile consolidation runs and produces a clean summary: "Building B2B invoicing SaaS on Next.js + PlanetScale + Stripe. Targeting freelancers in Europe. Prefers TypeScript, concise code, minimal comments."

## Related Skills

- [supermemory](/skills/supermemory) — semantic memory storage for AI agents
- [mcp-server](/skills/mcp-server) — build MCP servers for Claude Desktop integration
- [anthropic-sdk](/skills/anthropic-sdk) — direct Anthropic API integration
