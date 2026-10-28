---
title: Build an AI Assistant with Long-Term Memory
slug: build-long-term-ai-memory
description: >-
  Build a personal AI assistant that remembers everything across sessions — projects, preferences,
  past decisions — using Supermemory for storage and MCP for Claude Desktop integration.
skills:
  - supermemory
  - anthropic-sdk
  - mcp-server-builder
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

Use Supermemory as the memory backend — a semantic search layer for AI memory that extracts facts from conversations, keeps a profile, and retrieves by relevance. Combine it with the Anthropic SDK for conversations and an MCP server so the memory works directly inside Claude Desktop.

## Step-by-Step Walkthrough

### Step 1: Set Up Supermemory

```bash
pip install supermemory anthropic "mcp[cli]"
export SUPERMEMORY_API_KEY=...   # console.supermemory.ai, API Keys
export ANTHROPIC_API_KEY=...
```

Supermemory scopes everything by a namespace (a user or project id); there is nothing to create, you pass it as the first argument of every call (SDK v5; code written for 4.x with `containerTag` or `q` does not run against it):

```python
from supermemory import Supermemory

sm = Supermemory()               # reads SUPERMEMORY_API_KEY from the environment
NAMESPACE = "personal-assistant"
```

### Step 2: Memory Retrieval and Storage

Supermemory extracts the facts, preferences and decisions from what you send it, so you do not need a second model call. Store each session as one document under a stable `id`; sending the same `id` again processes only the new part. Retrieval combines the maintained profile with a search for the current message:

```python
def retrieve(query: str, limit: int = 8) -> list[str]:
    profile = sm.profile(NAMESPACE).profile            # .static and .dynamic: lists of {id, memory}
    found = sm.search(NAMESPACE, query=query, limit=limit)
    facts = [m.memory for m in profile.static + profile.dynamic]
    facts += [r.memory or r.chunk or "" for r in found.results]
    return list(dict.fromkeys(f for f in facts if f))

def store_session(session_id: str, transcript: str):
    sm.add(NAMESPACE, content=transcript, id=f"chat_{session_id}",
           metadata={"type": "conversation"})
```

`add` returns at once with `status: "queued"`; extraction finishes in the background, so a fact from this session may take a short while to appear in search. To save a fact directly (`remember: I switched to PlanetScale`), send it as a short document with its own `id`.

### Step 3: Conversation Loop with Memory

Each turn: retrieve relevant memories, inject them into the system prompt, call the model, then re-send the transcript under the session id.

```python
import anthropic

claude = anthropic.Anthropic()

def chat(session_id: str, history: list[dict], message: str) -> str:
    memories = retrieve(message)
    system = "Things I remember about you:\n" + "\n".join(f"- {m}" for m in memories)
    history.append({"role": "user", "content": message})
    res = claude.messages.create(
        model="claude-sonnet-5-5", max_tokens=1024, system=system, messages=history,
    )
    answer = res.content[0].text
    history.append({"role": "assistant", "content": answer})
    store_session(session_id, "\n".join(f"{m['role']}: {m['content']}" for m in history))
    return answer
```

### Step 4: User Profile Maintenance

Supermemory already keeps a profile: `sm.profile(NAMESPACE).profile.static` holds long-lived facts ("Prefers TypeScript") and `.dynamic` the recent context ("Moving from Supabase to PlanetScale"). Print both for a quick summary of what the assistant believes, and add `sm.search(NAMESPACE, query="...")` for anything specific. There is no separate consolidation job to write.

### Step 5: Memory Pruning

Delete stale conversation documents and forget wrong memories:

```python
from datetime import datetime, timedelta, timezone

def prune_old_sessions(days: int = 90):
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    old, page = [], 1
    while True:
        res = sm.list(NAMESPACE, "documents", page=page, limit=100)
        old += [d.id for d in res.documents if d.system.created_at < cutoff]
        if page >= res.pagination.total_pages:
            break
        page += 1
    if old:
        sm.documents.delete(NAMESPACE, ids=old)   # permanent

sm.memories.forget(NAMESPACE, ids=["mem_..."])    # hide one memory from recall
```

`sm.memories.forget_matching(NAMESPACE, query="old pricing plans", dry_run=True)` previews a natural-language forget before you run it for real. Deleting a document removes its source; memories already extracted from it stay until you forget them.

### Step 6: MCP Server for Claude Desktop

Supermemory runs a hosted MCP server at `https://mcp.supermemory.ai/mcp` (OAuth, no key in a config file): in Claude Desktop or claude.ai open Settings, Connectors, and add a custom connector with that URL. That gives you tools such as `search_memory`, `get_profile`, `add_memory` and `forget_memory` with no code.

If you want your own tools and your own namespace rules, build a small server as described in the `mcp-server-builder` skill (Python SDK 2.x, `MCPServer`):

```python
# memory_mcp_server.py
import os
from mcp.server import MCPServer
from supermemory import Supermemory

mcp = MCPServer("personal-memory")
sm = Supermemory()
NAMESPACE = os.environ.get("MEMORY_NAMESPACE", "personal-assistant")

@mcp.tool()
def remember(fact: str, fact_id: str) -> str:
    """Store a fact about the user. Reuse fact_id to update the same fact."""
    sm.add(NAMESPACE, content=fact, id=f"fact_{fact_id}")
    return "Stored."

@mcp.tool()
def recall(query: str) -> str:
    """Search stored memories relevant to the query."""
    found = sm.search(NAMESPACE, query=query, limit=8)
    return "\n".join(f"- {r.memory or r.chunk}" for r in found.results) or "Nothing found."

if __name__ == "__main__":
    mcp.run()   # stdio
```

Register it in Claude Desktop (Settings, Developer, Edit Config opens `claude_desktop_config.json`), using absolute paths and the Python from the environment where you installed the packages:

```json
{
  "mcpServers": {
    "personal-memory": {
      "command": "/home/you/memory-mcp/.venv/bin/python",
      "args": ["/home/you/memory-mcp/memory_mcp_server.py"],
      "env": {
        "SUPERMEMORY_API_KEY": "<your key>",
        "MEMORY_NAMESPACE": "personal-assistant"
      }
    }
  }
}
```

Restart Claude Desktop; `remember` and `recall` appear in every conversation. For Claude Code use `claude mcp add personal-memory -- /home/you/memory-mcp/.venv/bin/python /home/you/memory-mcp/memory_mcp_server.py`. Test with `mcp dev memory_mcp_server.py` before registering.

## Real-World Example

Week 1: The developer tells the assistant about her stack (Next.js + Supabase + Stripe) and target market (European freelancers). These facts are extracted and stored automatically.

Week 2: She opens a new conversation and asks "What pricing model should I use?" The assistant retrieves her stored context and responds with advice specific to B2B invoicing SaaS targeting European freelancers — without her re-explaining anything.

Week 3: She says "We dropped Supabase, moving to PlanetScale." The memory system stores this new fact. On the next retrieval, the updated context surfaces and the old Supabase reference is deprioritized by semantic relevance.

After 3 months, her profile holds a clean summary: "Building B2B invoicing SaaS on Next.js + PlanetScale + Stripe. Targeting freelancers in Europe. Prefers TypeScript, concise code, minimal comments."

## Related Skills

- [supermemory](/skills/supermemory) — semantic memory storage for AI agents
- [mcp-server-builder](/skills/mcp-server-builder) — build MCP servers for Claude Desktop integration
- [anthropic-sdk](/skills/anthropic-sdk) — direct Anthropic API integration
