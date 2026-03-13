---
name: mem0
description: >-
   You are an expert in Mem0, the memory infrastructure for AI applications.
  You help developers add persistent, personalized memory to LLM-powered apps
  and agents — storing user preferences, conversation history, facts, and
  context that persists across sessions, enabling AI that remembers users,
  learns from interactions, and provides increasingly personalized responses.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - memory
    - ai
    - agents
    - personalization
    - rag
    - context
    - long-term
---

# Mem0 — Memory Layer for AI Agents

You are an expert in Mem0, the memory infrastructure for AI applications. You help developers add persistent, personalized memory to LLM-powered apps and agents — storing user preferences, conversation history, facts, and context that persists across sessions, enabling AI that remembers users, learns from interactions, and provides increasingly personalized responses.

## Core Capabilities

### Memory Management

```python
# memory_service.py — Add persistent memory to any AI app
from mem0 import Memory

# Initialize with vector store
memory = Memory.from_config({
    "llm": {
        "provider": "openai",
        "config": {"model": "gpt-4o-mini"},
    },
    "embedder": {
        "provider": "openai",
        "config": {"model": "text-embedding-3-small"},
    },
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333, "collection_name": "memories"},
    },
})

# Add memories from conversation
messages = [
    {"role": "user", "content": "I'm allergic to peanuts and I'm training for a marathon"},
    {"role": "assistant", "content": "I'll keep your peanut allergy in mind! For marathon training, nutrition is key..."},
]

memory.add(messages, user_id="user_42")
# Mem0 extracts: "User is allergic to peanuts", "User is training for a marathon"

# Add explicit memory
memory.add("User prefers Python over JavaScript for backend work", user_id="user_42")

# Search memories
results = memory.search("What dietary restrictions?", user_id="user_42")
# → [{"memory": "User is allergic to peanuts", "score": 0.94}]

# Get all memories for a user
all_memories = memory.get_all(user_id="user_42")

# Update memory
memory.update(memory_id="mem_abc123", data="User completed their first marathon in March 2026")

# Delete specific memory
memory.delete(memory_id="mem_abc123")

# Delete all user memories (GDPR compliance)
memory.delete_all(user_id="user_42")
```

### AI Chat with Memory

```python
from openai import OpenAI
from mem0 import Memory

client = OpenAI()
memory = Memory()

async def chat_with_memory(user_id: str, user_message: str) -> str:
    # Retrieve relevant memories
    relevant = memory.search(user_message, user_id=user_id, limit=5)
    memory_context = "\n".join([f"- {m['memory']}" for m in relevant])

    # Generate response with memory context
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"""You are a personal assistant.
You know these things about the user:
{memory_context}

Use this context to personalize your responses."""},
            {"role": "user", "content": user_message},
        ],
    )

    assistant_message = response.choices[0].message.content

    # Store new memories from this conversation
    memory.add(
        [
            {"role": "user", "content": user_message},
            {"role": "assistant", "content": assistant_message},
        ],
        user_id=user_id,
    )

    return assistant_message

# Session 1
await chat_with_memory("user_42", "I just moved to Berlin and I love Italian food")
# Stores: "User lives in Berlin", "User loves Italian food"

# Session 2 (days later)
await chat_with_memory("user_42", "Recommend a restaurant for tonight")
# → Remembers Berlin + Italian food → suggests Italian restaurants in Berlin
```

### Organization-Level Memory

```python
# Shared knowledge across an organization
memory.add(
    "Our refund policy allows returns within 30 days with receipt",
    user_id="agent_support",
    metadata={"type": "policy", "department": "support"},
)

# Agent-specific memory
memory.add(
    "Customer prefers email over phone for follow-ups",
    user_id="user_42",
    agent_id="support_agent",
)

# Search with filters
results = memory.search(
    "refund policy",
    user_id="agent_support",
    filters={"type": "policy"},
)
```

## Installation

```bash
pip install mem0ai
```

## Best Practices

1. **User-scoped memories** — Always pass `user_id`; memories are isolated per user for privacy
2. **Automatic extraction** — Pass full conversations; Mem0 extracts facts automatically using LLM
3. **Search before generate** — Query relevant memories before LLM call; inject as system prompt context
4. **Memory hygiene** — Periodically review and prune outdated memories; users' preferences change
5. **GDPR compliance** — Use `delete_all(user_id=...)` for right-to-erasure requests
6. **Metadata for filtering** — Add metadata tags (type, department, source) for precise memory retrieval
7. **Conflict resolution** — Mem0 handles contradictions (e.g., "moved from NYC to Berlin" updates location)
8. **Self-hosted option** — Use Qdrant/Chroma locally for data sovereignty; no data leaves your infrastructure
