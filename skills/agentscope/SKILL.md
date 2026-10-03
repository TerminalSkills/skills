---
name: agentscope
description: >-
  Build and trace AI agents in Python with AgentScope, an open-source agent framework with a ReAct loop, tools, middleware, team pipelines and OpenTelemetry tracing. Use when building production agents that need observability, debugging an agent's model and tool calls, capping token spend per reply, or coordinating a leader with specialist agents.
license: Apache-2.0
compatibility: "Python 3.11+ (AgentScope 2.x)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  repository: https://github.com/agentscope-ai/agentscope
  tags:
    - agents
    - observability
    - tracing
    - opentelemetry
    - multi-agent
---

# AgentScope

## Overview

[AgentScope](https://github.com/agentscope-ai/agentscope) is a Python framework (Apache-2.0) for building agents on a reasoning-acting (ReAct) loop. Version 2.x (2.0.9 at the time of writing) is a rewrite of the 1.x line: the 1.x names (`agentscope.init`, `ReActAgent`, `DialogAgent`, `msghub`) are gone, and docs for the two majors must not be mixed. Check the installed version with `pip show agentscope` and read the matching docs at `https://docs.agentscope.io/stable/en/index`.

Observability is built in through middleware. `TracingMiddleware` emits OpenTelemetry spans for each reply, model call and tool execution, so traces flow to any OTLP backend (Jaeger, Grafana Tempo, Langfuse, Datadog). AgentScope does not ship its own trace store, decision logger, audit-trail class or replay tool; use your OTLP backend, the streamed events, and persisted agent state for those jobs.

Requires Python 3.11 or newer. There is no Node.js package.

## Instructions

### Install

```bash
pip install agentscope
# 2.0.9 already installs the OpenTelemetry SDK and OTLP exporters; pin them yourself if you depend on them
pip install opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
# Redis state storage and the agent service need extras
pip install "agentscope[storage-redis,service]"
```

### A minimal agent

An agent needs a name, system prompt and a chat model. Credentials are objects built from environment variables, never literals.

```python
import asyncio, os
from agentscope.agent import Agent
from agentscope.credential import AnthropicCredential
from agentscope.message import UserMsg
from agentscope.model import AnthropicChatModel
from agentscope.tool import FunctionTool, Toolkit

def get_order_status(order_id: str) -> str:
    """Look up the shipping status of an order.

    Args:
        order_id: The order number, for example A-10482.
    """
    return f"Order {order_id} shipped on 2026-09-30 and arrives Monday."

agent = Agent(
    name="support-agent",
    system_prompt="You answer order questions. Use the tool for any order lookup.",
    model=AnthropicChatModel(
        credential=AnthropicCredential(api_key=os.environ["ANTHROPIC_API_KEY"]),
        model="claude-sonnet-4-5",
    ),
    toolkit=Toolkit(tools=[FunctionTool(get_order_status)]),
)

async def main():
    reply = await agent.reply(UserMsg(name="user", content="Where is order A-10482?"))
    print(reply.get_text_content())
    print(reply.finished_reason, reply.usage)

asyncio.run(main())
```

`reply()` returns one `Msg`. Check `finished_reason` (`completed`, `interrupted`, `exceed_max_iters`, `error`; `None` means the reply paused for human confirmation) and `usage` (total input/output tokens). Use `agent.reply_stream(msg)` to receive events as they are produced, and `structured_schema=<Pydantic class>` to force a validated result in `reply.structured_output`.

Other providers use the same shape: `OpenAIChatModel`, `GeminiChatModel`, `DashScopeChatModel`, `OllamaChatModel`, each with a matching `*Credential` from `agentscope.credential`.

### Trace with OpenTelemetry

Register a tracer provider once per process, then add the middleware to every agent you want traced.

```python
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from agentscope.middleware import TracingMiddleware

provider = TracerProvider()
provider.add_span_processor(
    BatchSpanProcessor(OTLPSpanExporter(endpoint="http://localhost:4318/v1/traces"))
)
trace.set_tracer_provider(provider)

agent = Agent(..., middlewares=[TracingMiddleware()])
```

Spans are nested: the reply span (agent name, session ID, input and output messages) contains model-call spans (model, provider, token counts, messages) and tool spans (tool name, call ID, arguments, result). Without a registered provider the middleware does nothing and costs almost nothing. For custom spans, use `trace.get_tracer("agentscope", agentscope.__version__)` and the standard OTel API.

To see spans locally without a collector, swap in `ConsoleSpanExporter` from `opentelemetry.sdk.trace.export`.

### Cap cost per reply

```python
from agentscope.middleware import ReplyBudgetControlMiddleware

middlewares=[TracingMiddleware(),
             ReplyBudgetControlMiddleware(token_budget=20000, output_token_weight=3.0)]
```

Once the weighted token cost reaches the budget, the agent is told to wrap up and tools are disabled for the next step.

### Leader and members

`TeamPipeline` (experimental) lets a leader agent assign tasks to member agents through an internal `TeamAssign` tool. The leader sees only each member's final reply.

```python
from agentscope.pipeline import TeamMember, TeamPipeline

pipe = TeamPipeline(
    leader=leader,                      # Agent with a Toolkit()
    members=[
        TeamMember(agent=researcher, description="Finds and summarizes sources."),
        TeamMember(agent=writer, description="Drafts the report from findings."),
    ],
)
```

Member names must be unique and differ from the leader's. Tasks for different members run concurrently. `launch_console(pipe)` from `agentscope.console` runs it in the terminal.

### Persist and resume

`agent.state` (an `AgentState`) serializes to JSON: context, permissions, tool state and the position of a paused reply. Pass `state=` when constructing an agent to resume. `agentscope.app.storage.RedisStorage` stores it under `(user_id, agent_id, session_id)`; use `upsert_session` on the first turn, because `update_session_state` raises `KeyError` for a session that does not exist yet. Saved states are your audit trail of what the agent saw and did.

## Examples

### Example 1: Trace a support agent into a local Jaeger

Request: "Add tracing to my support agent so I can see each model and tool call in Jaeger."

Start Jaeger with OTLP enabled (`docker run --rm -p 16686:16686 -p 4318:4318 jaegertracing/all-in-one`), use the exporter at `http://localhost:4318/v1/traces` from the section above, add `middlewares=[TracingMiddleware()]`, run the agent, and open `http://localhost:16686`. Choose the service name you set (`TracerProvider(resource=Resource.create({"service.name": "support-agent"}))`, `Resource` from `opentelemetry.sdk.resources`) and you will see one trace per reply with child spans for each model call and `get_order_status` execution, including token counts.

### Example 2: Researcher and writer team with a spend limit

Request: "I want a leader that sends research to one agent and drafting to another, and never spends more than about 20k tokens per reply."

Build `researcher` and `writer` as ordinary `Agent` instances with `ReplyBudgetControlMiddleware(token_budget=20000)` each, build a `leader = Agent(..., toolkit=Toolkit())`, wrap them in `TeamPipeline` as above, and call `launch_console(pipe)`. The leader's trace shows `TeamAssign` calls; each member's own spans carry their token use. A reply that hits its budget finishes with a short wrap-up instead of more tool calls.

## Guidelines

- Do not copy AgentScope 1.x snippets. Search results and older tutorials show `agentscope.init(...)`, `ReActAgent`, `msghub`; none apply to 2.x.
- Everything is async: `await agent.reply(...)` inside `asyncio.run`.
- Check `finished_reason` in production code: `exceed_max_iters` and `error` replies still return a `Msg`.
- Traces contain full prompts and tool arguments. Do not send them to a shared collector if they hold personal data, and keep API keys in environment variables, never in prompts.
- `TeamPipeline`, SOP and realtime features are marked experimental; their interfaces can change between 2.0.x releases. Pin the version.
- Tools that run shell commands (`Bash`, `Write`, `Edit`) are powerful; keep AgentScope's permission mode and a sandboxed workspace (Docker or similar) for untrusted tasks.
- Not the right tool when you need a hosted tracing UI with evaluations out of the box; pair it with an OTLP backend that has one.
