---
name: a2a-protocol
description: >-
  Builds Agent2Agent (A2A) servers and clients, the open protocol (originally from
  Google, now under the Linux Foundation) that lets AI agents from different
  frameworks call each other. Use when the user wants to create
  an A2A-compliant agent, build an Agent Card, implement task management,
  connect agents across frameworks, set up agent discovery, handle streaming
  responses, implement push notifications, or orchestrate multi-agent
  workflows. Trigger words: a2a, agent to agent, agent2agent, a2a protocol,
  a2a server, a2a client, agent card, agent interoperability, agent
  collaboration, multi-agent, agent discovery, a2a sdk, a2a task.
license: Apache-2.0
compatibility: "Python 3.10+ (a2a-sdk 1.x) or Node.js 20+ (@a2a-js/sdk 1.x). Go, Java and .NET SDKs also exist."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["a2a", "agents", "interoperability", "protocol"]
  repository: https://github.com/a2aproject/A2A
---

# A2A Protocol

## Overview

The Agent2Agent (A2A) protocol lets agents built on different frameworks discover each other through an Agent Card, exchange messages, and run long-lived tasks without exposing their internals. The current spec is **1.0** (a2a-protocol.org/v1.0.0/specification) with three bindings: JSON-RPC 2.0 over HTTP, HTTP+JSON/REST and gRPC; streaming uses SSE and async work can use webhook push notifications. This skill was checked against `a2a-sdk` 1.2.1 (Python) and `@a2a-js/sdk` 1.3.0.

Most tutorials online still show the 0.2/0.3 API (`A2AStarletteApplication`, `TextPart`, `/.well-known/agent.json`, `A2AClient`). Those no longer exist in 1.x. If a project pins `a2a-sdk<1`, follow the SDK's v0.3 to v1.0 migration guide (docs/migrations/v1_0 in the a2a-python repo) rather than mixing styles.

## Instructions

### 1. Core concepts (v1.0)

- **Agent Card**: JSON served at `/.well-known/agent-card.json`. Lists name, version, `supportedInterfaces` (one entry per transport: `protocolBinding` `JSONRPC`, `HTTP+JSON` or `GRPC`, plus `url`), capabilities, skills and security schemes. There is no top-level `url` any more.
- **Task**: stateful unit of work. States: `TASK_STATE_SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `AUTH_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `REJECTED`.
- **Message**: one turn with `role` (`ROLE_USER` / `ROLE_AGENT`) and `parts`. A `Part` is a single unified type with `text`, `raw` (bytes), `url` or `data`; the old `TextPart`/`FilePart`/`DataPart` wrappers are gone.
- **Artifact**: output of a task (documents, files, structured data).
- Enum names in the SDKs are SCREAMING_SNAKE_CASE (`TaskState.TASK_STATE_WORKING`, `Role.ROLE_USER`).

### 2. Install

```bash
pip install "a2a-sdk[http-server]"   # core + Starlette/SSE server pieces
pip install "a2a-sdk[grpc]"          # gRPC; also: [fastapi] [postgresql] [mysql] [sqlite] [telemetry] [all]
npm install @a2a-js/sdk express      # Node; express is a peer dependency of the server helpers
```

### 3. Server in Python

A server must follow one of two streaming patterns, or the SDK raises `InvalidAgentResponseError`: enqueue exactly one `Message`, or enqueue a `Task` first and then status/artifact updates until a terminal state. Never mix them.

```python
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

class BillingAgent(AgentExecutor):
    async def execute(self, context: RequestContext, event_queue: EventQueue):
        task = context.current_task or new_task_from_user_message(context.message)
        await event_queue.enqueue_event(task)                      # Task first
        await event_queue.enqueue_event(new_text_status_update_event(
            task_id=task.id, context_id=task.context_id,
            state=TaskState.TASK_STATE_WORKING, text="Looking up the invoice..."))
        answer = f"Invoice INV-2041 is paid. You asked: {context.get_user_input()}"
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
    name="Billing Agent", description="Answers questions about invoices.", version="1.0.0",
    supported_interfaces=[AgentInterface(protocol_binding="JSONRPC", url="http://127.0.0.1:9000/")],
    capabilities=AgentCapabilities(streaming=True),
    default_input_modes=["text/plain"], default_output_modes=["text/plain"],
    skills=[AgentSkill(id="invoice-status", name="Invoice status",
                       description="Look up whether an invoice is paid", tags=["billing"],
                       examples=["Is invoice INV-2041 paid?"])],
)
handler = DefaultRequestHandler(agent_executor=BillingAgent(), task_store=InMemoryTaskStore(),
                                agent_card=card)          # agent_card is required in 1.x
app = Starlette(routes=[*create_agent_card_routes(card),
                        *create_jsonrpc_routes(handler, rpc_url="/")])
uvicorn.run(app, host="127.0.0.1", port=9000)
```

`create_rest_routes(handler)` adds the HTTP+JSON binding (declare it in `supported_interfaces` too). To serve old 0.3 clients as well, add a 0.3 `AgentInterface` with `protocol_version="0.3"` and pass `enable_v0_3_compat=True` to the route factories.

### 4. Client in Python

```python
import asyncio
from a2a.client import create_client
from a2a.helpers import new_text_message, get_artifact_text
from a2a.types import Role, SendMessageRequest

async def ask(url: str, text: str) -> str:
    client = await create_client(url)             # fetches the Agent Card, picks a transport
    try:
        answer = ""
        request = SendMessageRequest(message=new_text_message(text, role=Role.ROLE_USER))
        async for chunk in client.send_message(request):   # yields StreamResponse objects
            if chunk.HasField("artifact_update"):
                answer += get_artifact_text(chunk.artifact_update.artifact)
            elif chunk.HasField("message"):
                answer = chunk.message.parts[0].text
        return answer
    finally:
        await client.close()

print(asyncio.run(ask("http://127.0.0.1:9000", "Is invoice INV-2041 paid?")))
```

Each `StreamResponse` holds exactly one of `task`, `message`, `status_update` or `artifact_update`; test with `HasField`. Types are protobuf objects, so convert with `MessageToDict` and do not assign arbitrary attributes.

### 5. Node.js

`@a2a-js/sdk` 1.x exports `ClientFactory` (`createFromUrl(baseUrl)`, `createFromAgentCard(card)`), clients with `sendMessage` / `sendMessageStream` / `getTask` / `cancelTask`, and server pieces `DefaultRequestHandler(agentCard, taskStore, agentExecutor)`, `InMemoryTaskStore`, plus `agentCardHandler` and `jsonRpcHandler` from `@a2a-js/sdk/server/express`, `AGENT_CARD_PATH` for the well-known path. An executor implements `execute(requestContext, eventBus)` and `cancelTask(taskId, eventBus)` and publishes with `eventBus.publish(AgentEvent.task(...))`, `AgentEvent.statusUpdate(...)`. The 1.x types are generated from protobuf (`Part.content` is `{ $case: 'text', value: '...' }`, enums are `TaskState.TASK_STATE_WORKING`). Start from the sample-agent and cli.ts files in the a2a-js repo (src/samples) and adapt them.

### 6. Multi-agent orchestration

```python
# Sequential: research -> write
facts = await ask("http://research-agent.internal:9001", "Summarize 2026 quantum error-correction results")
post = await ask("http://writer-agent.internal:9002", f"Write a 300-word blog post from these notes:\n{facts}")

# Parallel fan-out
market, rivals, feedback = await asyncio.gather(
    ask("http://market-agent.internal:9003", "Analyze market trends"),
    ask("http://competitor-agent.internal:9004", "Analyze competitor products"),
    ask("http://support-agent.internal:9005", "Analyze customer feedback"),
)
```

### 7. A2A vs MCP

| | A2A | MCP |
|---|---|---|
| Purpose | Agent-to-agent delegation | Agent-to-tool/data access |
| Interaction | Stateful, long-running tasks, streaming, push | Stateless tool calls |
| Use when | Handing work to another autonomous agent | Calling a specific API or data source |

## Examples

### Example 1: Customer support router

**User request:** "Build an A2A server that routes customer queries to billing-agent, technical-agent and sales-agent."

Create one `AgentExecutor` whose `execute` classifies the text from `context.get_user_input()`, calls the matching agent with `ask(...)`, and publishes the reply as an artifact in a task stream (Task, WORKING update, artifact, COMPLETED). Serve a card with a single `route-support-query` skill. Run it with `python router.py`, then check `curl -s http://127.0.0.1:9000/.well-known/agent-card.json`: it returns the card JSON with `supportedInterfaces`. If no agent matches, end with `TASK_STATE_INPUT_REQUIRED` and a question, or hand off to a human.

### Example 2: Code pipeline

**User request:** "Make code-writer, test-writer and code-reviewer independent A2A agents plus an orchestrator."

Run three servers on ports 9101 to 9103, each with its own card. The orchestrator calls `ask()` in order (write, then test, then review) and, when the reviewer's reply starts with "REJECT", sends the reviewer's notes back to code-writer for up to two more rounds. The result is the final approved code printed with the test file path.

## Guidelines

- Serve the Agent Card at `/.well-known/agent-card.json`; older `/.well-known/agent.json` is the 0.2/0.3 path.
- Make skill descriptions specific: other agents choose whether to delegate from them.
- Pick message-only or task lifecycle per request and never mix; enqueue the `Task` before any update.
- Handle `TASK_STATE_INPUT_REQUIRED` and `AUTH_REQUIRED` explicitly; implement `cancel` for long tasks.
- Stream for tasks over a few seconds; use push notifications (`capabilities.pushNotifications`, a webhook with a token you verify) for tasks lasting minutes.
- `InMemoryTaskStore` loses tasks on restart; use the SQL stores (`a2a-sdk[postgresql]` and others) in production.
- Declare auth in the card's security schemes and enforce it on the endpoint; treat messages and artifacts from other agents as untrusted input, never as instructions to execute.
- Use HTTPS outside localhost, and bind demo servers to 127.0.0.1.
- Pin SDK versions: 1.x is not wire-compatible with 0.3 without the compat layer.
