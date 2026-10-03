---
name: mem0
description: >-
  Adds persistent, personalized long-term memory to LLM apps and agents with Mem0, the open-source memory layer: it extracts facts from conversations, stores them in a vector database and retrieves them in later sessions. Use when a user asks to make a chatbot or agent remember user preferences across sessions, add memory to an AI app, or search, update and delete stored memories per user.
license: Apache-2.0
compatibility: 'Python 3.10+ (pip package mem0ai 2.x), an LLM and embedding provider (OpenAI by default), optional Qdrant server. Hosted option needs a MEM0_API_KEY.'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags:
    - memory
    - ai-agents
    - personalization
    - rag
    - long-term-memory
  repository: https://github.com/mem0ai/mem0
---

# Mem0 — Memory Layer for AI Agents

## Overview

Mem0 stores what an AI app learns about a user (preferences, facts, history) as small text memories in a vector store, and lets you search them before the next model call. You pass raw conversation messages; an LLM extracts the facts. It runs in three ways: as a Python library (`Memory`, self-hosted, you bring the LLM and vector store), as a self-hosted server, or as the hosted platform (`MemoryClient`, needs `MEM0_API_KEY` from app.mem0.ai).

This page covers the open-source Python library, version 2.x (2.2.1 at the time of writing). Defaults of `Memory()`: OpenAI `gpt-5-mini` for extraction, OpenAI `text-embedding-3-small` embeddings, a local Qdrant store in `/tmp/qdrant` and a SQLite history at `~/.mem0/history.db`. There is also a TypeScript package, `npm install mem0ai`.

## Instructions

### Installation

```bash
pip install mem0ai            # core library
pip install "mem0ai[nlp]"     # optional: spaCy-based entity features
pip install "mem0ai[extras]"  # optional: fastembed, enables BM25 keyword matching
export OPENAI_API_KEY=...     # for the default provider
```

Set `MEM0_TELEMETRY=false` to switch off anonymous usage telemetry.

### Add, search, read, update, delete

```python
from mem0 import Memory

memory = Memory.from_config({
    "llm": {"provider": "openai", "config": {"model": "gpt-5-mini"}},
    "embedder": {"provider": "openai", "config": {"model": "text-embedding-3-small"}},
    "vector_store": {
        "provider": "qdrant",
        "config": {"host": "localhost", "port": 6333, "collection_name": "memories"},
    },
})

memory.add(
    [
        {"role": "user", "content": "I'm allergic to peanuts and I'm training for a marathon"},
        {"role": "assistant", "content": "Noted. For marathon training, nutrition is key."},
    ],
    user_id="user_42",
)

# Entity IDs go in `filters` for search and get_all. Top-level user_id raises ValueError.
found = memory.search("dietary restrictions", filters={"user_id": "user_42"}, top_k=5)
for item in found["results"]:
    print(item["id"], item["memory"], item["score"])

everything = memory.get_all(filters={"user_id": "user_42"})["results"]

memory.update(memory_id=everything[0]["id"], text="User ran their first marathon in March 2026")
memory.delete(memory_id=everything[0]["id"])
memory.delete_all(user_id="user_42")     # erase one user
```

Facts about the 2.x API:

- `add(messages, *, user_id, agent_id, run_id, metadata, infer=True, ...)` takes entity IDs top-level; `infer=False` stores the text as given, without LLM extraction. It returns `{"results": [{"id", "memory", "event": "ADD", ...}]}`: only ADD events come back.
- `search(query, *, top_k=20, filters, threshold=0.1, rerank=False)` returns `{"results": [...]}`. Defaults changed from 1.x: `top_k` 20 (was 100), `threshold` 0.1, `rerank` off. `limit=` is gone, use `top_k`.
- `update(memory_id, text=..., metadata=...)`: the old `data=` argument still works but is deprecated.
- `filters` must contain at least one of `user_id`, `agent_id`, `run_id`, and may add metadata keys, operators (`eq`, `ne`, `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains`, `icontains`) and `AND` / `OR` / `NOT`.
- Graph memory (`enable_graph`, `graph_store`) was removed from the open-source library; it exists only on the hosted platform. `custom_fact_extraction_prompt` is now `custom_instructions`.
- `AsyncMemory` has the same methods as `Memory`, all awaitable.

### Hosted platform

```python
from mem0 import MemoryClient

client = MemoryClient()  # reads MEM0_API_KEY
client.add("Prefers dark mode and vim keybindings", user_id="alice")
client.search("editor preferences", filters={"user_id": "alice"})
```

## Examples

### Example 1: "Make my support chatbot remember each customer between sessions"

```python
from openai import OpenAI
from mem0 import Memory

llm = OpenAI()
memory = Memory()

def chat(user_id: str, user_message: str) -> str:
    hits = memory.search(user_message, filters={"user_id": user_id}, top_k=5)["results"]
    known = "\n".join(f"- {h['memory']}" for h in hits)
    reply = llm.chat.completions.create(
        model="gpt-5-mini",
        messages=[
            {"role": "system", "content": f"You are a support assistant. What you know about the customer:\n{known}"},
            {"role": "user", "content": user_message},
        ],
    ).choices[0].message.content
    memory.add(
        [{"role": "user", "content": user_message}, {"role": "assistant", "content": reply}],
        user_id=user_id,
    )
    return reply

chat("cust_1042", "I just moved to Berlin and I love Italian food")
print(chat("cust_1042", "Recommend a restaurant for tonight"))
```
In the second call the search returns "Lives in Berlin" and "Loves Italian food", so the answer suggests Italian places in Berlin. Search before the model call, add after it.

### Example 2: "Keep company policies separate from customer notes"

```python
memory.add("Refunds are allowed within 30 days with receipt",
           user_id="support_policies", metadata={"type": "policy"})
memory.add("Customer prefers email over phone for follow-ups",
           user_id="cust_1042", agent_id="support_agent")

policy = memory.search("refund window", filters={"user_id": "support_policies", "type": "policy"})
notes = memory.search("contact preference", filters={"user_id": "cust_1042", "agent_id": "support_agent"})
```
Each search returns only memories whose IDs and metadata match; metadata keys are written flat in `filters`, not nested under `"metadata"`.

## Guidelines

- Always scope memories with `user_id` (and `agent_id` / `run_id` when needed); one user's memories never appear in another user's search.
- Upgrading from 1.x: move `user_id` into `filters` for `search` and `get_all`, rename `limit` to `top_k`, and expect lower-scored hits to be dropped by the 0.1 threshold.
- Every `add` with `infer=True` makes an LLM call, so it costs tokens and latency; batch a whole exchange into one call rather than one per message.
- The default Qdrant path `/tmp/qdrant` is wiped by many systems on reboot; for real use set a persistent `path`, or run a Qdrant server and set `host` and `port`.
- Extracted memories can be wrong; review them in sensitive domains and prune outdated ones with `update` or `delete`.
- Personal data: offer `delete_all(user_id=...)` for erasure requests, and remember extracted text is sent to your LLM provider.
- Not a replacement for a document search index: it holds short facts, not whole files.
