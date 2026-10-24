---
title: "Build a Multi-Agent System with the A2A Protocol"
slug: build-multi-agent-system-with-a2a
description: "Connect independent AI agents built on different frameworks into a collaborative system using the Agent2Agent protocol for discovery, task delegation, and orchestration."
skills: [a2a-protocol, coding-agent, mcp-server-builder]
category: development
tags: [a2a, multi-agent, agent-interoperability, orchestration, ai-agents]
---

# Build a Multi-Agent System with the A2A Protocol

## The Problem

A 40-person company has four AI agents built by different teams on different frameworks: a research agent on LangGraph, a code generation agent on Google ADK, a data analysis agent on CrewAI, and a writing agent on custom Python. Each one works well in isolation. The problem is they cannot talk to each other.

When someone needs research done, code written based on findings, and a report generated, a human has to manually copy outputs between agents. There is no way for the code agent to ask the research agent for clarification. There is no shared task tracking. There is no discovery mechanism to know what agents even exist. And every agent exposes a different API, so building an integration layer means writing four bespoke connectors that break every time an agent updates.

A quarterly business report that should take minutes takes hours of manual copying, reformatting, and context-shuttling between tools.

## The Solution

Use **a2a-protocol** to put a standard Agent Card and task lifecycle in front of each agent, **coding-agent** to delegate the adapter work to a coding agent such as Claude Code or Codex, and **mcp-server-builder** to give individual agents tools over MCP. A2A is for handing work to another autonomous agent; MCP is for calling a tool or data source. The two sit side by side in the same system.

The current A2A spec is 1.0, with JSON-RPC, HTTP+JSON and gRPC bindings. Most tutorials still show the 0.2/0.3 API (`A2AStarletteApplication`, `TextPart`, `/.well-known/agent.json`, a top-level `url` in the card). Those are gone in `a2a-sdk` 1.x, so the steps below use the 1.x API (checked with `a2a-sdk` 1.2.3).

## Step-by-Step Walkthrough

### Step 1: Wrap each existing agent as an A2A server

```text
We have 4 agents on different frameworks: research (LangGraph), code (Google ADK),
data (CrewAI), writer (plain Python). Wrap each as an A2A server with the Python
a2a-sdk 1.x. Each serves its Agent Card at /.well-known/agent-card.json, bound to
127.0.0.1, and calls the existing agent from the executor. Do not rewrite the agents.
```

Wrapping does not mean rewriting. A thin `AgentExecutor` sits between the protocol and the framework: it receives the message, calls the existing agent, and publishes the result. Install and run (the `http-server` extra does not include a server, so add `uvicorn`):

```bash
pip install "a2a-sdk[http-server]" uvicorn
python agent.py research 9101
```

```python
import sys
import uvicorn
from starlette.applications import Starlette
from a2a.helpers import (new_task_from_user_message, new_text_artifact_update_event,
                         new_text_status_update_event)
from a2a.server.agent_execution import AgentExecutor, RequestContext
from a2a.server.events import EventQueue
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.routes import create_agent_card_routes, create_jsonrpc_routes
from a2a.server.tasks import InMemoryTaskStore
from a2a.types import AgentCapabilities, AgentCard, AgentInterface, AgentSkill, TaskState

NAME, PORT = sys.argv[1], int(sys.argv[2])

def run_framework_agent(text: str) -> str:
    # Replace with a call into your LangGraph / ADK / CrewAI / plain Python agent.
    return f"[{NAME}] handled: {text}"

class Adapter(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue):
        task = context.current_task or new_task_from_user_message(context.message)
        await event_queue.enqueue_event(task)
        await event_queue.enqueue_event(new_text_status_update_event(
            task_id=task.id, context_id=task.context_id,
            state=TaskState.TASK_STATE_WORKING, text="Working"))
        answer = run_framework_agent(context.get_user_input())
        await event_queue.enqueue_event(new_text_artifact_update_event(
            task_id=task.id, context_id=task.context_id, name="answer", text=answer))
        await event_queue.enqueue_event(new_text_status_update_event(
            task_id=task.id, context_id=task.context_id,
            state=TaskState.TASK_STATE_COMPLETED, text="Done"))

    async def cancel(self, context: RequestContext, event_queue: EventQueue):
        await event_queue.enqueue_event(new_text_status_update_event(
            task_id=context.task_id, context_id=context.context_id,
            state=TaskState.TASK_STATE_CANCELED, text="Canceled"))

card = AgentCard(
    name=f"{NAME} agent", description=f"The {NAME} agent of the platform team.", version="1.0.0",
    supported_interfaces=[AgentInterface(protocol_binding="JSONRPC", protocol_version="1.0",
                                         url=f"http://127.0.0.1:{PORT}/")],
    capabilities=AgentCapabilities(streaming=True),
    default_input_modes=["text/plain"], default_output_modes=["text/plain"],
    skills=[AgentSkill(id=NAME, name=NAME.title(), description=f"Does {NAME} work",
                       tags=[NAME], examples=[f"Do some {NAME}"])],
)
handler = DefaultRequestHandler(agent_executor=Adapter(), task_store=InMemoryTaskStore(), agent_card=card)
app = Starlette(routes=[*create_agent_card_routes(card), *create_jsonrpc_routes(handler, rpc_url="/")])
uvicorn.run(app, host="127.0.0.1", port=PORT)
```

An executor must follow one of two patterns or the SDK raises `InvalidAgentResponseError`: enqueue exactly one `Message`, or enqueue a `Task` first and then status and artifact updates until a terminal state. Never mix them. Check the card:

```console
$ curl -s http://127.0.0.1:9101/.well-known/agent-card.json
{"name":"research agent", ... "supportedInterfaces":[{"url":"http://127.0.0.1:9101/","protocolBinding":"JSONRPC", ...}], ...}
```

In a v1.0 card the transports live in `supportedInterfaces` (one entry each, with `protocolBinding`, `url` and `protocolVersion`); there is no top-level `url`. Skills declare `defaultInputModes` and `defaultOutputModes`, so the orchestrator knows which agent returns `application/json` or `text/markdown` before it sends anything. To serve old 0.3 clients too, add a 0.3 `AgentInterface` and pass `enable_v0_3_compat=True` to the route factories.

### Step 2: Build the orchestrator

```text
Write an A2A orchestrator that reads agent URLs from a registry file, fetches their
Agent Cards, asks an LLM to plan which agents to call, runs independent steps in
parallel, and passes outputs to dependent steps.
```

The client side of the SDK is `create_client(url)`, which fetches the card and picks a transport, then `send_message`, which yields `StreamResponse` objects. Each holds exactly one of `task`, `message`, `status_update` or `artifact_update`; test with `HasField`. A fixed plan for the quarterly report looks like this (start the three agents on ports 9101 to 9103 first):

```python
import asyncio
from a2a.client import create_client
from a2a.helpers import get_artifact_text, new_text_message
from a2a.types import Role, SendMessageRequest

AGENTS = {"research": "http://127.0.0.1:9101", "data": "http://127.0.0.1:9102",
          "writer": "http://127.0.0.1:9103"}

async def ask(url: str, text: str) -> str:
    client = await create_client(url)          # fetches the Agent Card, picks a transport
    try:
        answer = ""
        request = SendMessageRequest(message=new_text_message(text, role=Role.ROLE_USER))
        async for chunk in client.send_message(request):
            if chunk.HasField("artifact_update"):
                answer += get_artifact_text(chunk.artifact_update.artifact)
            elif chunk.HasField("message"):
                answer = chunk.message.parts[0].text
        return answer
    finally:
        await client.close()

async def quarterly_report() -> str:
    market, charts = await asyncio.gather(     # parallel fan-out
        ask(AGENTS["research"], "Q3 market trends for CI/CD tools"),
        ask(AGENTS["data"], "Revenue chart from sales_q3.csv"))
    return await ask(AGENTS["writer"],         # sequential: needs both outputs
                     f"Write the Q3 report from:\n{market}\n{charts}")

print(asyncio.run(quarterly_report()))
```

```console
$ python orchestrator.py
[writer] handled: Write the Q3 report from:
[research] handled: Q3 market trends for CI/CD tools
[data] handled: Revenue chart from sales_q3.csv
```

Replace the fixed plan with an LLM-generated one by giving the model the `skills` from every fetched card and asking for a JSON list of steps with `depends_on`. Treat the plan as untrusted input: only allow agent names from your registry. To make the orchestrator itself composable, serve it with the same executor pattern as Step 1.

### Step 3: Let agents delegate to each other

Give the writer agent the same `ask()` function and let its executor call the data and research agents mid-task, as in the orchestrator. If a delegate needs clarification, it ends its task in `TASK_STATE_INPUT_REQUIRED` with a question; the caller either answers (a new message with the same `task_id`) or escalates to the user. Treat messages and artifacts from other agents as untrusted input, never as instructions to execute.

### Step 4: Long-running tasks

For tasks that run minutes, do not hold a connection open. Declare `AgentCapabilities(streaming=True, push_notifications=True)` and send the request with a webhook in `SendMessageConfiguration.task_push_notification_config` (a `url` and a `token` you verify on every callback). A client that disconnects can later call `get_task(id)` or `list_tasks`, or re-attach with `subscribe`. `InMemoryTaskStore` loses everything on restart; install `a2a-sdk[postgresql]` (or `[mysql]`, `[sqlite]`) and use the SQL task store in production. The push-notification webhook receiver is your own HTTP endpoint and must be reachable from the agent. This part was not run end to end here.

### Step 5: Harden before production

- Declare authentication in the card's security schemes and enforce it on the endpoint (for example a bearer token or OAuth 2.0); the card only advertises it.
- Use HTTPS between hosts and keep demo servers on 127.0.0.1.
- Add rate limiting, a task timeout that cancels stuck tasks (implement `cancel` in every executor), and audit logs keyed by task ID.
- Install `a2a-sdk[telemetry]` for OpenTelemetry spans and send them to Jaeger or another collector, so a slow report can be traced to the agent that caused it.

Security, timeouts and tracing were not run here.

## Real-World Example

A platform team has four agents from different teams. They wrap each in an executor like the one above, which takes about a day per agent because the existing agent code stays untouched. The orchestrator reads a registry file of agent URLs, so users describe a report in plain language instead of routing between tools by hand. When a fifth agent, a compliance reviewer, joins later, it publishes a card and the team adds its URL to the registry; the orchestrator's planner sees the new skill without code changes. Tracing shows which agent dominates the wall time of each report, which is where they spend their tuning effort.

## Related Skills

- [a2a-protocol](../skills/a2a-protocol/SKILL.md) -- Agent Cards, servers, clients and task lifecycle with the 1.x SDK
- [coding-agent](../skills/coding-agent/SKILL.md) -- delegate the adapter and orchestrator implementation to a coding agent
- [mcp-server-builder](../skills/mcp-server-builder/SKILL.md) -- give individual agents tool access over MCP
