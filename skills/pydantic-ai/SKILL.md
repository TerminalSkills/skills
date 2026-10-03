---
name: pydantic-ai
description: >-
  Builds type-safe AI agents in Python with PydanticAI, the agent framework from the Pydantic team. Use when a user asks to create an LLM agent with validated structured output, add tools with dependency injection, stream responses, switch between OpenAI, Anthropic, Gemini or Ollama models, or test an agent without calling a real model.
license: Apache-2.0
compatibility: "Python 3.10 or newer; an API key for the chosen model provider (not needed for TestModel)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["agent", "pydantic", "python", "structured-output", "tools"]
  repository: https://github.com/pydantic/pydantic-ai
---

# PydanticAI — Agent Framework by Pydantic Team

## Overview

PydanticAI is a Python framework for agents whose inputs, tools and outputs are all typed with Pydantic. An `Agent` holds a model, instructions, optional tools and an `output_type`; the framework validates the model's answer against that type and asks the model to retry when validation fails. Dependencies (database handles, user ids, HTTP clients) are passed in per run through `deps_type`, so tools stay testable.

This page was checked against pydantic-ai 2.53 (October 2026). Code written for 0.x or 1.0 tutorials often uses names that no longer exist; see the migration notes in Guidelines.

## Instructions

### Installation

```bash
pip install pydantic-ai                      # full install, all providers
pip install "pydantic-ai-slim[openai]"       # minimal core plus one provider
```

Slim extras include `openai`, `anthropic`, `google`, `groq` and `logfire`. Set the provider's key in the environment (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`). A model is named `provider:model-id`, for example `openai:gpt-5` or `anthropic:claude-sonnet-4-5`; take ids from the provider's current model list.

### Structured output

```python
from pydantic import BaseModel
from pydantic_ai import Agent

class CityInfo(BaseModel):
    name: str
    country: str
    population: int

agent = Agent(
    "openai:gpt-5",
    output_type=CityInfo,
    instructions="Answer with accurate, current city facts.",
)
result = agent.run_sync("Tell me about Tokyo")
print(result.output)        # CityInfo(name='Tokyo', country='Japan', ...)
```

`output_type` also accepts plain types (`str`, `list[str]`), unions of models, and functions.

### Tools and dependencies

```python
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext

@dataclass
class SupportDeps:
    db: "Database"
    user_id: str

support_agent = Agent(
    "anthropic:claude-sonnet-4-5",
    deps_type=SupportDeps,
    instructions="You are a customer support agent. Use tools before answering.",
)

@support_agent.tool
async def get_order(ctx: RunContext[SupportDeps], order_id: str) -> dict:
    """Look up an order by its ID."""
    return await ctx.deps.db.orders.find(order_id, user_id=ctx.deps.user_id)

@support_agent.tool_plain
def business_hours() -> str:
    """Return the support team's opening hours."""
    return "Mon-Fri 09:00-18:00 CET"

result = await support_agent.run("Where is order ORD-1042?", deps=SupportDeps(db=db, user_id="u42"))
```

`@agent.tool` receives `RunContext` as its first argument; `@agent.tool_plain` does not. Type hints become the tool's JSON schema and the docstring becomes its description.

### Streaming

```python
async with agent.run_stream("Summarise the refund policy") as response:
    async for text in response.stream_text(delta=True):
        print(text, end="", flush=True)
```

For an agent with a structured `output_type`, use `response.stream_output()` to receive partially validated objects.

### Testing without a model

```python
from pydantic_ai.models.test import TestModel

with agent.override(model=TestModel()):
    result = agent.run_sync("anything", deps=SupportDeps(db=fake_db, user_id="u1"))
```

`TestModel` calls every registered tool and returns data that satisfies `output_type`, so no network or key is needed. For scripted replies use `FunctionModel`.

## Examples

### Example 1: Extract an invoice into a typed object

Request: "Pull the vendor, total and due date out of this invoice text and give me a Python object."

```python
from datetime import date
from pydantic import BaseModel
from pydantic_ai import Agent

class Invoice(BaseModel):
    vendor: str
    total_eur: float
    due: date

extractor = Agent("openai:gpt-5", output_type=Invoice)
text = "Hetzner Online GmbH, invoice 2026-10-114, total 48.30 EUR, pay by 2026-11-15"
print(extractor.run_sync(text).output)
```

Result: `Invoice(vendor='Hetzner Online GmbH', total_eur=48.3, due=datetime.date(2026, 11, 15))`. A malformed date makes Pydantic raise, and the model is asked to correct it up to the agent's retry limit.

### Example 2: Support agent with a database tool, tested offline

Request: "Add an agent that looks up orders for the signed-in customer, and a test that does not hit the API."

Use the `support_agent` above, then in `test_support.py`:

```python
def test_support_agent_calls_tools():
    with support_agent.override(model=TestModel()):
        result = support_agent.run_sync("Where is order ORD-1042?", deps=SupportDeps(db=FakeDb(), user_id="u42"))
    assert isinstance(result.output, str)
```

Result: the test passes in milliseconds, exercising `get_order` against `FakeDb`.

## Guidelines

- Renames since the early tutorials: `result_type` is now `output_type`, `result.data` is now `result.output`, and a plain-string `system_prompt` is usually written as `instructions` (instructions are not replayed from message history; `system_prompt` still works).
- Type the context as `RunContext[YourDeps]` so editors and type checkers see `ctx.deps`.
- Keep secrets in environment variables, never in prompts or tool results; tool return values are sent to the model.
- Give tools a docstring and narrow argument types; vague tools get called wrongly.
- Set a usage limit on agents that can loop through tools (`usage_limits=UsageLimits(request_limit=10)` in `run`).
- Observability is built in through Pydantic Logfire (`logfire.instrument_pydantic_ai()`), but any OpenTelemetry backend works.
- Not the tool for one-shot schema extraction from local open-weight models with guaranteed grammar; use Outlines for that.
