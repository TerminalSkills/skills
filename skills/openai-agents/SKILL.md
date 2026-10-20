---
name: openai-agents
description: >-
  The OpenAI Agents SDK is a Python framework (openai-agents) for building agents that call tools,
  hand work to other agents, run guardrails and stream results, with built-in tracing and MCP support.
  Use when building a multi-agent workflow with OpenAI models, adding function tools, handoffs, input
  guardrails or sessions, or when the user mentions openai-agents, Runner.run, or the Agents SDK
  (the successor to Swarm).
license: Apache-2.0
compatibility: "Python 3.10+, OPENAI_API_KEY"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["openai", "agents", "tools", "guardrails", "multi-agent"]
  repository: "https://github.com/openai/openai-agents-python"
---

# OpenAI Agents SDK

## Overview

The OpenAI Agents SDK (`pip install openai-agents`, import name `agents`; version 0.24.0 checked, Python 3.10+) is the production successor to the experimental Swarm project. Its small set of primitives: `Agent` (instructions plus tools), handoffs and agents-as-tools for delegation, guardrails for validating input and output, sessions for memory, and built-in tracing. It uses the Responses API by default for OpenAI models. A JavaScript version exists as `@openai/agents`; this skill covers the Python SDK.

## Instructions

1. Install and set the key: `pip install openai-agents`, `export OPENAI_API_KEY=...`.
2. Create agents with `Agent(name=..., instructions=..., tools=[...], model=...)`. Run with `Runner.run_sync(agent, text)` in scripts, `await Runner.run(agent, text)` in async code; read `result.final_output`.
3. Tools: decorate a function with `@function_tool`. The schema comes from type hints and the docstring (Google-style `Args:` descriptions). Hosted tools such as `WebSearchTool` can go in the same `tools` list.
4. Handoffs: `handoffs=[billing_agent]` takes `Agent` objects (or `handoff(...)` wrappers), not name strings, so define the specialists first. A handoff transfers the conversation; use `agent.as_tool(...)` instead when the main agent should keep control and just call another agent.
5. Typed output: `output_type=SomePydanticModel` makes `final_output` a validated object.
6. Input guardrails: decorate `async def check(ctx, agent, input) -> GuardrailFunctionOutput` with `@input_guardrail` and pass `input_guardrails=[check]`. When `tripwire_triggered=True` the run raises `InputGuardrailTripwireTriggered`; catch it. Output guardrails work the same with `@output_guardrail`.
7. Streaming: `result = Runner.run_streamed(agent, input=...)` (not awaited), then `async for event in result.stream_events()`. Event types are `raw_response_event` (tokens; check `isinstance(event.data, ResponseTextDeltaEvent)` from `openai.types.responses`), `run_item_stream_event` (`event.name` such as `tool_called`, `tool_output`, `message_output_created`) and `agent_updated_stream_event` (after a handoff).
8. MCP: `MCPServerStdio(params={"command": "npx", "args": [...]})` as an async context manager, then `Agent(mcp_servers=[server])`. Also available: `MCPServerStreamableHttp(params={"url": ..., "headers": ...})` and `HostedMCPTool` (the Responses API connects to the server itself). `cache_tools_list=True` is safe only if the tool list rarely changes.
9. Tracing is on by default and uploads to the OpenAI dashboard; disable with `OPENAI_AGENTS_DISABLE_TRACING=1` or `set_tracing_disabled(True)` when data must not leave your environment.

## Examples

### Example 1: Triage agent with a billing specialist

**User request:** "Route refund questions to a billing agent that can look up orders."

```python
import asyncio
from agents import Agent, Runner, function_tool

@function_tool
def lookup_order(order_id: str) -> str:
    """Look up an order.

    Args:
        order_id: The order identifier, for example ORD-12345
    """
    return "ORD-12345: delivered 2026-10-02, total $48.00, status damaged-on-arrival"

billing = Agent(
    name="Billing Specialist",
    instructions="Handle refunds. Always look up the order first.",
    tools=[lookup_order],
)
triage = Agent(
    name="Triage",
    instructions="Send billing and refund questions to the Billing Specialist.",
    handoffs=[billing],
)

async def main():
    result = await Runner.run(triage, "Refund order ORD-12345, it arrived damaged")
    print(result.final_output)

asyncio.run(main())
```

**Result:** the trace shows Triage handing off to Billing Specialist, one `lookup_order` call, then a reply about the refund.

### Example 2: Block off-topic input with a guardrail

**User request:** "Reject messages that are not support requests before the main agent runs."

```python
# The `await`/`async for` lines in Examples 2 and 3 must run inside an `async def` (as in Example 1) or a notebook.
from pydantic import BaseModel
from agents import (Agent, Runner, GuardrailFunctionOutput, RunContextWrapper,
                    input_guardrail, InputGuardrailTripwireTriggered)

class Check(BaseModel):
    is_support_request: bool

checker = Agent(name="Checker", instructions="Is this a customer support request?", output_type=Check)

@input_guardrail
async def only_support(ctx: RunContextWrapper[None], agent: Agent, user_input) -> GuardrailFunctionOutput:
    res = await Runner.run(checker, user_input, context=ctx.context)
    return GuardrailFunctionOutput(output_info=res.final_output,
                                   tripwire_triggered=not res.final_output.is_support_request)

support = Agent(name="Support", instructions="Help with orders.", input_guardrails=[only_support])

try:
    await Runner.run(support, "Write me a poem about cats")
except InputGuardrailTripwireTriggered:
    print("Sorry, I can only help with orders.")
```

**Result:** the poem request raises the tripwire exception before the Support agent produces output.

### Example 3: Stream tokens and handoffs

```python
from agents import Runner   # triage is the agent from Example 1
from openai.types.responses import ResponseTextDeltaEvent
result = Runner.run_streamed(triage, input="Where is order ORD-12345?")
async for event in result.stream_events():
    if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
        print(event.data.delta, end="", flush=True)
    elif event.type == "agent_updated_stream_event":
        print(f"\n[now: {event.new_agent.name}]")
```

## Guidelines

- `handoffs` must hold agent objects; strings fail. Avoid circular definitions by creating the specialist first or by appending to `agent.handoffs` afterwards.
- Keep consuming `stream_events()` to the end; the run only finishes then.
- Input guardrails run only on the first agent in a chain, output guardrails only on the last; put checks that must always apply on the tool itself.
- Tracing sends prompts and tool data to OpenAI by default; turn it off for sensitive workloads.
- Give MCP servers only to agents that need them, connect only to trusted servers, and keep tokens in headers read from environment variables.
- Cap runaway loops with `max_turns` on `Runner.run`.
