---
title: Build an AI Assistant with Long-Term Memory
slug: build-long-term-ai-memory
description: Build a personal AI assistant that remembers everything across sessions — projects you're working on, your preferences, past decisions, and conversation history — using Supermemory for persistent storage and MCP for Claude Desktop integration.
skills:
  - supermemory
  - anthropic-sdk
  - mcp-server
category: ai-agents
tags:
  - memory
  - agents
  - supermemory
  - mcp
  - personalization
  - claude
  - assistants
---

## The Problem

Lena is a developer who uses AI assistants constantly. But every conversation starts from zero — the assistant doesn't know she's building a SaaS product on Next.js, doesn't remember she prefers TypeScript over JavaScript, doesn't know she already tried Supabase and switched to PlanetScale last month. She re-explains her context in every session.

She's tried prompt templates and "memory" features in chat UIs, but they're superficial — they hold a few bullet points, not the rich context of months of work. She wants an AI that actually knows her: her projects, her preferences, her past decisions, her ongoing questions.

## The Solution

Use Supermemory as the memory backend — a semantic search layer purpose-built for AI memory that stores facts, retrieves by relevance, and handles deduplication. Combine it with the Anthropic SDK for conversations and an MCP server so the memory works directly inside Claude Desktop, no wrapper app needed.

## Step-by-Step Walkthrough

### Step 1: Set Up Supermemory

```bash
pip install supermemory anthropic
export SUPERMEMORY_API_KEY="your-supermemory-key"
export ANTHROPIC_API_KEY="your-anthropic-key"
```

Get your API key at [supermemory.ai](https://supermemory.ai).

```python
import supermemory
import os

# Initialize client
memory_client = supermemory.Supermemory(
    api_key=os.environ["SUPERMEMORY_API_KEY"]
)

# Create a space for your user
space = memory_client.spaces.create(name="lena-personal-assistant")
print(f"Space ID: {space.id}")
# Store this ID — it's your memory namespace
SPACE_ID = space.id
```

### Step 2: Integrate Memory into the Conversation Loop

```python
from anthropic import Anthropic
import json

anthropic = Anthropic()

def retrieve_relevant_memories(query: str, space_id: str, limit: int = 8) -> str:
    """Fetch memories semantically relevant to the current message."""
    results = memory_client.search.execute(
        q=query,
        spaces=[space_id],
        limit=limit
    )

    if not results.results:
        return ""

    memories = []
    for r in results.results:
        memories.append(f"- {r.chunks[0].content if r.chunks else r.document.content[:200]}")

    return "\n".join(memories)


def extract_and_store_facts(user_message: str, assistant_response: str, space_id: str):
    """Extract memorable facts from the conversation and store them."""
    extraction = anthropic.messages.create(
        model="claude-haiku-4-5",
        max_tokens=512,
        system="Extract factual information worth remembering long-term from this conversation. Focus on: user preferences, technical decisions, project details, personal context. Return JSON array of strings, or empty array if nothing worth storing.",
        messages=[{
            "role": "user",
            "content": f"User said: {user_message}\nAssistant said: {assistant_response}\n\nExtract memorable facts as JSON array:"
        }]
    )

    try:
        facts = json.loads(extraction.content[0].text)
        for fact in facts[:5]:  # Cap at 5 facts per turn
            if fact and len(fact) > 10:
                memory_client.documents.add(
                    content=fact,
                    spaces=[space_id],
                    metadata={"source": "conversation", "auto_extracted": True}
                )
    except (json.JSONDecodeError, Exception):
        pass  # Silent failure — memory is enhancement, not critical path
```

### Step 3: Build the Conversation Loop

```python
def chat_with_memory(space_id: str):
    """Main conversation loop with long-term memory."""
    conversation_history = []

    print("AI Assistant with Long-Term Memory")
    print("Type 'quit' to exit, 'remember: <fact>' to store something explicitly\n")

    while True:
        user_input = input("You: ").strip()
        if not user_input or user_input.lower() == "quit":
            break

        # Handle explicit memory commands
        if user_input.lower().startswith("remember:"):
            fact = user_input[9:].strip()
            memory_client.documents.add(
                content=fact,
                spaces=[space_id],
                metadata={"source": "explicit", "user_requested": True}
            )
            print("Assistant: Got it, I'll remember that.\n")
            continue

        # Retrieve relevant memories
        relevant_memories = retrieve_relevant_memories(user_input, space_id)

        # Build system prompt with memory context
        system_prompt = "You are a personal AI assistant with long-term memory.\n\n"
        if relevant_memories:
            system_prompt += f"## Relevant things I remember about you:\n{relevant_memories}\n\n"
        system_prompt += "Use this context naturally — don't announce that you're using memory, just be contextually aware."

        conversation_history.append({"role": "user", "content": user_input})

        # Get response
        response = anthropic.messages.create(
            model="claude-opus-4-5",
            max_tokens=2048,
            system=system_prompt,
            messages=conversation_history[-20:]  # Keep last 20 turns
        )

        assistant_reply = response.content[0].text
        conversation_history.append({"role": "assistant", "content": assistant_reply})

        print(f"Assistant: {assistant_reply}\n")

        # Background: extract and store new facts
        extract_and_store_facts(user_input, assistant_reply, space_id)


# Run
chat_with_memory(SPACE_ID)
```

### Step 4: User Profile Maintenance

```python
def update_user_profile(space_id: str):
    """Periodically consolidate scattered facts into a coherent user profile."""

    # Fetch all user facts
    all_memories = memory_client.search.execute(
        q="user preferences projects technology decisions",
        spaces=[space_id],
        limit=50
    )

    if not all_memories.results:
        return

    memory_text = "\n".join([
        r.chunks[0].content if r.chunks else r.document.content[:200]
        for r in all_memories.results
    ])

    # Ask LLM to consolidate into a profile
    profile_response = anthropic.messages.create(
        model="claude-haiku-4-5",
        max_tokens=1024,
        system="Consolidate these user facts into a structured profile. Remove duplicates. Be concise.",
        messages=[{
            "role": "user",
            "content": f"Facts to consolidate:\n{memory_text}\n\nWrite a concise user profile:"
        }]
    )

    profile = profile_response.content[0].text

    # Store consolidated profile (with tag for easy retrieval)
    memory_client.documents.add(
        content=f"USER PROFILE SUMMARY:\n{profile}",
        spaces=[space_id],
        metadata={"type": "profile_summary", "priority": "high"}
    )

    return profile
```

### Step 5: Memory Relevance and Decay

```python
from datetime import datetime, timedelta

def prune_stale_memories(space_id: str, days_threshold: int = 90):
    """Remove or de-prioritize memories older than threshold."""

    # Fetch memories with metadata
    all_docs = memory_client.documents.list(space_id=space_id, limit=100)
    cutoff = datetime.now() - timedelta(days=days_threshold)

    pruned = 0
    for doc in all_docs.results:
        created_at = doc.created_at
        if created_at and created_at < cutoff:
            # Check if it's a factual/ephemeral memory (not a profile summary)
            if doc.metadata.get("type") != "profile_summary":
                memory_client.documents.delete(document_id=doc.id)
                pruned += 1

    print(f"Pruned {pruned} stale memories older than {days_threshold} days")
```

### Step 6: MCP Server for Claude Desktop

Create `memory_mcp_server.py` to expose your memory as MCP tools:

```python
import asyncio
import json
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types
import supermemory
import os

memory_client = supermemory.Supermemory(api_key=os.environ["SUPERMEMORY_API_KEY"])
SPACE_ID = os.environ["MEMORY_SPACE_ID"]

server = Server("personal-memory")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="remember",
            description="Store a new fact or piece of information to long-term memory",
            inputSchema={
                "type": "object",
                "properties": {
                    "content": {"type": "string", "description": "The fact or information to remember"}
                },
                "required": ["content"]
            }
        ),
        types.Tool(
            name="recall",
            description="Search long-term memory for relevant information",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "What to search for in memory"}
                },
                "required": ["query"]
            }
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "remember":
        memory_client.documents.add(
            content=arguments["content"],
            spaces=[SPACE_ID],
            metadata={"source": "claude_desktop"}
        )
        return [types.TextContent(type="text", text=f"Stored: {arguments['content']}")]

    elif name == "recall":
        results = memory_client.search.execute(
            q=arguments["query"],
            spaces=[SPACE_ID],
            limit=5
        )
        if not results.results:
            return [types.TextContent(type="text", text="No relevant memories found.")]

        memories = "\n".join([
            f"- {r.chunks[0].content if r.chunks else r.document.content[:200]}"
            for r in results.results
        ])
        return [types.TextContent(type="text", text=f"Relevant memories:\n{memories}")]

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

asyncio.run(main())
```

Add to `~/.claude/claude_desktop_config.json`:

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

Restart Claude Desktop — you now have `remember` and `recall` tools available in every conversation.

## Tips & Extensions

- **Namespace by project**: Create separate Supermemory spaces for different projects to keep context clean.
- **Priority tagging**: Tag memories with `priority: high` for things like "prefers TypeScript" that should always be surfaced.
- **Cross-device sync**: Supermemory is cloud-based, so the same space works from your laptop, phone, and any Claude interface.
- **Memory export**: Periodically dump memories to a local JSON file as backup with `memory_client.documents.list()`.
- **Semantic deduplication**: Before storing, run a similarity search — skip storage if a near-duplicate already exists (similarity > 0.95).
