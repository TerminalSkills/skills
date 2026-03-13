---
name: pydantic-ai
description: >-
   You are an expert in PydanticAI, the Python agent framework built by the
  Pydantic team. You help developers create type-safe AI agents with
  structured outputs, dependency injection, tool definitions, streaming, and
  model-agnostic design — leveraging Pydantic for validation and type safety
  throughout the agent lifecycle.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - agent
    - pydantic
    - python
    - type-safe
    - tools
    - structured-output
---

# PydanticAI — Agent Framework by Pydantic Team

You are an expert in PydanticAI, the Python agent framework built by the Pydantic team. You help developers create type-safe AI agents with structured outputs, dependency injection, tool definitions, streaming, and model-agnostic design — leveraging Pydantic for validation and type safety throughout the agent lifecycle.

## Core Capabilities

```python
from pydantic_ai import Agent
from pydantic import BaseModel

class CityInfo(BaseModel):
    name: str
    country: str
    population: int
    famous_for: list[str]

agent = Agent("openai:gpt-4o", result_type=CityInfo,
    system_prompt="You provide accurate city information.")

result = agent.run_sync("Tell me about Tokyo")
print(result.data)  # CityInfo(name='Tokyo', country='Japan', population=13960000, ...)

# With tools and dependencies
from dataclasses import dataclass

@dataclass
class Deps:
    db: Database
    user_id: str

support_agent = Agent("openai:gpt-4o", deps_type=Deps,
    system_prompt="You are a customer support agent.")

@support_agent.tool
async def get_order(ctx, order_id: str) -> dict:
    """Look up an order by ID."""
    return await ctx.deps.db.orders.find(order_id)

@support_agent.tool
async def create_ticket(ctx, title: str, priority: str) -> str:
    """Create a support ticket."""
    ticket = await ctx.deps.db.tickets.create(title=title, priority=priority, user_id=ctx.deps.user_id)
    return f"Created ticket {ticket.id}"

result = await support_agent.run("Where is my order ORD-123?", deps=Deps(db=db, user_id="u42"))

# Streaming
async with support_agent.run_stream("Help me with billing", deps=deps) as stream:
    async for chunk in stream.stream():
        print(chunk, end="", flush=True)
```

## Installation

```bash
pip install pydantic-ai
```

## Best Practices

1. **result_type** — Use Pydantic models for structured output; validated automatically
2. **Dependency injection** — Pass deps (DB, auth, config) via `deps_type`; clean, testable architecture
3. **@agent.tool** — Decorate functions as tools; type hints become the schema; docstring becomes description
4. **Model-agnostic** — Works with OpenAI, Anthropic, Gemini, Groq, Mistral, Ollama
5. **Streaming** — `run_stream()` for real-time token delivery; structured result available at end
6. **Testing** — Use `TestModel` for deterministic testing without API calls
7. **Logfire integration** — Built-in observability via Pydantic Logfire; trace every agent step
8. **System prompts** — Dynamic system prompts via `@agent.system_prompt` decorator; context-aware
