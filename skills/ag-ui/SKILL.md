---
name: ag-ui
description: >-
  AG-UI (Agent-User Interaction Protocol) is an open, event-based protocol that
  streams an AI agent's text, tool calls, state and lifecycle events to a
  frontend over HTTP and Server-Sent Events. Use when the user wants to build
  an AG-UI server, connect an agent or framework (LangGraph, Mastra, CrewAI,
  Pydantic AI) to a React or custom UI, stream agent progress and state, or
  use CopilotKit with AG-UI.
license: Apache-2.0
compatibility: 'Node.js 20+ with @ag-ui/core, @ag-ui/client and @ag-ui/encoder 1.0; or Python 3.9+ with ag-ui-protocol 1.0'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - agent
    - protocol
    - streaming
    - frontend
    - copilotkit
  repository: https://github.com/ag-ui-protocol/ag-ui
---

# AG-UI — Agent-User Interaction Protocol

## Overview

AG-UI standardizes how an agent backend talks to a user-facing app. The app POSTs one JSON `RunAgentInput` (thread id, run id, messages, state, tools, context, forwarded props); the agent answers with a stream of typed events. It sits beside MCP (agents to tools) and A2A (agent to agent). The protocol was created by the CopilotKit team and is implemented by LangGraph, Mastra, CrewAI, Pydantic AI, Google ADK, Microsoft Agent Framework, AWS Strands, Agno, LlamaIndex, AG2 and others. Version 1.0 shipped in September 2026; this skill was checked against `@ag-ui/core`/`client`/`encoder` 1.0.1 and the Python `ag-ui-protocol` 1.0.0.

There are no `@ag-ui/server` or `@ag-ui/react` packages and no `AgentServer`/`useAgent` in `@ag-ui/*`. The SDK packages are `@ag-ui/core` (types and constants), `@ag-ui/client` (`HttpAgent`, subscribers), `@ag-ui/encoder` (`EventEncoder`) and, per framework, `@ag-ui/langgraph`, `@ag-ui/mastra` and so on. The React layer comes from CopilotKit (`@copilotkit/react-core/v2`).

## Instructions

### Event vocabulary

Every event has a `type`. The families:

- Lifecycle: `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR`, `STEP_STARTED`, `STEP_FINISHED`
- Text: `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT` (with `delta`), `TEXT_MESSAGE_END`, plus a compact `TEXT_MESSAGE_CHUNK`
- Tool calls: `TOOL_CALL_START`, `TOOL_CALL_ARGS` (streamed JSON `delta`), `TOOL_CALL_END`, `TOOL_CALL_RESULT`
- State: `STATE_SNAPSHOT` (replace the whole state), `STATE_DELTA` (JSON Patch operations), `MESSAGES_SNAPSHOT`
- Activity: `ACTIVITY_SNAPSHOT`, `ACTIVITY_DELTA`; Reasoning: `REASONING_*` (these replace the deprecated `THINKING_*`); Subagents: `SUBAGENT_STARTED` / `FINISHED` / `ERROR`
- Escape hatches: `RAW` and `CUSTOM` (`name` plus `value`)

A run starts with `RUN_STARTED` and ends with `RUN_FINISHED` or `RUN_ERROR`. Every opened message, tool call or reasoning span must be closed before the run finishes, or the 1.0 client fails the run.

### A Node.js server (HTTP + SSE)

```bash
npm install --save-exact @ag-ui/core@1.0.1 @ag-ui/encoder@1.0.1 @ag-ui/client@1.0.1
```

```javascript
// server.mjs: a minimal AG-UI endpoint on POST /agent
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { EventType } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';

createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/agent') return res.writeHead(404).end();
  let body = '';
  for await (const chunk of req) body += chunk;
  const input = JSON.parse(body);                      // RunAgentInput
  const encoder = new EventEncoder({ accept: req.headers.accept });
  res.writeHead(200, { 'Content-Type': encoder.getContentType(), 'Cache-Control': 'no-cache' });
  const send = (event) => res.write(encoder.encode(event));

  send({ type: EventType.RUN_STARTED, threadId: input.threadId, runId: input.runId });
  send({ type: EventType.STATE_SNAPSHOT, snapshot: { status: 'searching', progress: 0 } });

  const callId = randomUUID();
  send({ type: EventType.TOOL_CALL_START, toolCallId: callId, toolCallName: 'search_orders' });
  send({ type: EventType.TOOL_CALL_ARGS, toolCallId: callId, delta: JSON.stringify({ email: 'maria@brightbasket.dev' }) });
  send({ type: EventType.TOOL_CALL_END, toolCallId: callId });
  send({ type: EventType.TOOL_CALL_RESULT, messageId: randomUUID(), toolCallId: callId, content: JSON.stringify({ orders: 3 }), role: 'tool' });
  send({ type: EventType.STATE_DELTA, delta: [{ op: 'replace', path: '/progress', value: 100 }] });

  const messageId = randomUUID();
  send({ type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' });
  for (const word of ['Maria', 'has', '3', 'open', 'orders.']) {
    send({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: word + ' ' });
  }
  send({ type: EventType.TEXT_MESSAGE_END, messageId });

  send({ type: EventType.RUN_FINISHED, threadId: input.threadId, runId: input.runId });
  res.end();
}).listen(8787, '127.0.0.1');
```

If you hit a failure after the stream has opened, send `RUN_ERROR` (`message`, optional `code`) instead of changing the HTTP status. Reject bad input before streaming with a normal HTTP error status.

### A Python server

```bash
pip install ag-ui-protocol fastapi uvicorn
```

```python
# app.py
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse
from ag_ui.core import (RunAgentInput, EventType, RunStartedEvent, RunFinishedEvent,
                        TextMessageStartEvent, TextMessageContentEvent, TextMessageEndEvent)
from ag_ui.encoder import EventEncoder

app = FastAPI()

@app.post("/agent")
async def agent(input_data: RunAgentInput, request: Request):
    encoder = EventEncoder(accept=request.headers.get("accept"))

    async def events():
        yield encoder.encode(RunStartedEvent(type=EventType.RUN_STARTED, thread_id=input_data.thread_id, run_id=input_data.run_id))
        message_id = str(uuid.uuid4())
        yield encoder.encode(TextMessageStartEvent(type=EventType.TEXT_MESSAGE_START, message_id=message_id, role="assistant"))
        yield encoder.encode(TextMessageContentEvent(type=EventType.TEXT_MESSAGE_CONTENT, message_id=message_id, delta="Hello from AG-UI"))
        yield encoder.encode(TextMessageEndEvent(type=EventType.TEXT_MESSAGE_END, message_id=message_id))
        yield encoder.encode(RunFinishedEvent(type=EventType.RUN_FINISHED, thread_id=input_data.thread_id, run_id=input_data.run_id))

    return StreamingResponse(events(), media_type=encoder.get_content_type())
```

Run it with `uvicorn app:app --port 8000`. Python field names are snake_case; on the wire they are camelCase (`threadId`, `runId`).

### A TypeScript client

```javascript
// client.mjs
import { HttpAgent } from '@ag-ui/client';

const agent = new HttpAgent({ url: 'http://127.0.0.1:8787/agent' });
agent.messages = [{ id: 'm1', role: 'user', content: 'How many open orders does maria@brightbasket.dev have?' }];

await agent.runAgent({}, {
  onTextMessageContentEvent: ({ event }) => process.stdout.write(event.delta),
  onToolCallEndEvent: ({ toolCallName, toolCallArgs }) => console.log('[tool]', toolCallName, toolCallArgs),
  onStateChanged: ({ state }) => console.log('[state]', JSON.stringify(state)),
  onRunFailedEvent: ({ error }) => console.error('run failed', error),
});
console.log(agent.messages, agent.state);   // the client has applied every event for you
```

`runAgent` applies events to `agent.messages` and `agent.state` (including `STATE_DELTA` patches) and calls subscriber hooks such as `onRunStartedEvent`, `onTextMessageStartEvent`, `onToolCallResultEvent`, `onStateSnapshotEvent`, `onCustomEvent` and `onNewMessage`.

### React with CopilotKit

CopilotKit is the React layer built on AG-UI. Register your AG-UI endpoint in the Copilot Runtime, then use the hooks. Check the CopilotKit docs for your framework's exact quickstart.

```typescript
// app/api/copilotkit/[[...slug]]/route.ts
import { CopilotRuntime, createCopilotRuntimeHandler, InMemoryAgentRunner } from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const runtime = new CopilotRuntime({
  agents: { support: new HttpAgent({ url: "http://127.0.0.1:8787/agent" }) },   // the agent's own URL, not /api/copilotkit
  runner: new InMemoryAgentRunner(),
});
const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });
export const GET = handler; export const POST = handler; export const PATCH = handler; export const DELETE = handler;
```

```tsx
// app/page.tsx
import { CopilotKit, CopilotChat } from "@copilotkit/react-core/v2";

export default function Page() {
  return (
    <CopilotKit runtimeUrl="/api/copilotkit" useSingleEndpoint={false}>
      <CopilotChat agentId="support" />
    </CopilotKit>
  );
}
```

For a fully custom UI use `useAgent({ agentId })` (exposes `messages`, `isRunning`) and `useCopilotKit()` (`copilotkit.runAgent({ agent })`), plus `useFrontendTool`, `useHumanInTheLoop` and `useRenderToolCall` for tools the UI handles itself. Scaffold a project with `npx create-ag-ui-app@latest` or `npx copilotkit@latest create`.

## Examples

### Example 1: "Stream my agent's progress and results to the browser"

Run the Node server above (`node server.mjs`) and the client (`node client.mjs`). The client prints `[state] {"status":"searching","progress":0}`, then `[tool] search_orders { email: 'maria@brightbasket.dev' }`, then the streamed sentence `Maria has 3 open orders.`, and ends with `agent.state` equal to `{ status: 'searching', progress: 100 }` because the `STATE_DELTA` patch was applied.

### Example 2: "Put our existing LangGraph agent behind a React chat"

Keep the LangGraph agent as is, expose it through its AG-UI integration (`@ag-ui/langgraph` for JS; the Python package from the LangGraph quickstart), register the agent's URL with `new HttpAgent({ url })` in the runtime `agents` map as shown above, and render `<CopilotChat agentId="support" />`. Tool calls and state changes then appear in the UI without custom parsing.

## Guidelines

- Pin `@ag-ui/client` to one version across your app and `@copilotkit/runtime`; two copies cause subtle type and instance errors.
- 1.0 is strict: unknown event types are dropped with a warning, unknown properties are stripped (put extra data in `metadata`, or send it to the agent in `forwardedProps`), a malformed known field fails the run, and unclosed messages, tool calls or reasoning spans at `RUN_FINISHED` fail the run. Optional fields must be absent, not `null`.
- Validators moved to `@ag-ui/core/schemas` and need `zod` (3.25.18+ or 4.x); the `@ag-ui/core` main entry is types only.
- Replace `THINKING_*` events with `REASONING_*`; the client still translates old streams and warns, but the shims expire.
- Use `STATE_DELTA` (JSON Patch) for small frequent changes and `STATE_SNAPSHOT` to resync; keep agent state serializable and free of secrets, because it reaches the browser.
- Authenticate the endpoint yourself (headers, cookies, tokens); the protocol does not. Human-in-the-loop confirmations are enforced on the server, not only in the UI.
- Debug with the AG-UI Dojo (dojo.ag-ui.com) and by `curl -N` against your endpoint with `Accept: text/event-stream`.
