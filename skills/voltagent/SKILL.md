---
name: voltagent
description: >-
  VoltAgent is an open-source TypeScript framework for building AI agents with
  typed tools, persistent memory, supervisor/sub-agent teams, MCP tools,
  guardrails and suspendable workflows, served over a local HTTP API. Use when
  someone asks to "build an AI agent in TypeScript", "add tools and memory to
  an agent", "set up a supervisor with sub-agents", "pause a workflow for human
  approval", "connect an agent to an MCP server", or mentions VoltAgent,
  @voltagent/core or create-voltagent-app.
license: Apache-2.0
compatibility: "Node.js 20.19+; @voltagent/core 2.x (peer: ai 6.x, zod 3.25+ or 4.x); an API key for the chosen LLM provider, or a local Ollama"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["ai-agents", "typescript", "multi-agent", "llm-workflows", "mcp"]
  repository: https://github.com/VoltAgent/voltagent
---
# VoltAgent — TypeScript Framework for AI Agents and Workflows

## Overview

VoltAgent (`@voltagent/core`) lets a Node.js project define agents in code: a model, instructions, Zod-typed tools, a memory adapter, optional sub-agents and guardrails. A `VoltAgent` instance registers agents and workflows and, with `@voltagent/server-hono`, serves them over a REST API on port 3141 with Swagger UI at `/ui`. Workflows are declarative step chains that can suspend for a human decision and resume later. The companion VoltOps Console (console.voltagent.dev, cloud or self-hosted) connects to the local server for traces, chat testing and workflow runs; the framework itself is MIT-licensed and works without it.

## Instructions

### Installation

Scaffold a project (asks for provider, package manager and server; writes `.env`):

```bash
npm create voltagent-app@latest order-desk
cd order-desk
npm run dev
```

The generated project has `src/index.ts`, `src/tools/`, `src/workflows/`, and scripts `dev` (`tsx watch --env-file=.env ./src`), `build` (tsdown), `start` (`node dist/index.js`) and `typecheck`. `--example <name>` starts from a folder of the repo's `examples/` directory, e.g. `npm create voltagent-app@latest -- --example with-research-assistant`.

Adding VoltAgent to an existing project instead:

```bash
npm install @voltagent/core @voltagent/server-hono @voltagent/libsql @voltagent/logger zod
```

Put the provider key in `.env`: `OPENAI_API_KEY` (platform.openai.com/api-keys), `ANTHROPIC_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` or `MISTRAL_API_KEY`.

### Define an agent with a tool and memory

Models can be given as `"provider/model"` strings (resolved by VoltAgent's built-in provider registry) or as AI SDK model objects.

```typescript
import { VoltAgent, Agent, Memory, createTool } from "@voltagent/core";
import { LibSQLMemoryAdapter } from "@voltagent/libsql";
import { honoServer } from "@voltagent/server-hono";
import { z } from "zod";

const lookupOrder = createTool({
  name: "lookupOrder",
  description: "Look up an order by ID and return its status and carrier",
  parameters: z.object({ orderId: z.string().describe("Order ID such as ORD-48213") }),
  execute: async ({ orderId }) => {
    const res = await fetch(`${process.env.ORDERS_API_URL}/orders/${orderId}`);
    return res.json();
  },
});

const memory = new Memory({
  storage: new LibSQLMemoryAdapter({ url: "file:./.voltagent/memory.db" }),
});

const support = new Agent({
  name: "order-support",
  instructions: "Answer order questions. Always call lookupOrder before answering.",
  model: "openai/gpt-4o-mini",
  tools: [lookupOrder],
  memory,
});

new VoltAgent({ agents: { support }, server: honoServer({ hostname: "127.0.0.1" }) });
```

Without `memory`, an agent keeps history in process memory only; `memory: false` disables it. `LibSQLMemoryAdapter` also accepts a Turso `url` plus `authToken`.

### Call an agent from code or over HTTP

```typescript
import { Output } from "ai";

const reply = await support.generateText("Where is order ORD-48213?", {
  memory: { userId: "cust-5521", conversationId: "ticket-9912" },
});
console.log(reply.text);

const stream = await support.streamText("Summarize my last three orders", {
  memory: { userId: "cust-5521", conversationId: "ticket-9912" },
});
for await (const chunk of stream.textStream) process.stdout.write(chunk);

const triage = await support.generateText("Classify: my parcel arrived damaged", {
  output: Output.object({ schema: z.object({ category: z.enum(["delivery", "damage", "billing"]) }) }),
});
console.log(triage.output.category);
```

Top-level `userId`/`conversationId` options still work but are deprecated in core 2.11; use the `memory` envelope. Structured output is `generateText`/`streamText` with an `output` setting; `generateObject`/`streamObject` are deprecated. The same calls are exposed by the server:

```bash
curl -s -X POST http://localhost:3141/agents/order-support/text \
  -H "Content-Type: application/json" \
  -d '{"input":"Where is order ORD-48213?","options":{"memory":{"userId":"cust-5521","conversationId":"ticket-9912"}}}'
```

Other routes: `GET /agents`, `POST /agents/:id/stream`, `POST /agents/:id/object`, `GET /workflows`.

### Supervisor and sub-agents

Passing agents in `subAgents` gives the supervisor an automatic `delegate_task` tool; it picks which specialist gets each part of the task.

```typescript
const billing = new Agent({
  name: "billing",
  instructions: "Handle invoices, refunds and payment failures.",
  model: "openai/gpt-4o-mini",
});

const lead = new Agent({
  name: "support-lead",
  instructions: "Route each question to order-support or billing, then write one reply.",
  model: "anthropic/claude-sonnet-4-5",
  subAgents: [support, billing],
  supervisorConfig: { customGuidelines: ["Never promise a refund amount"] },
});
```

### MCP tools

```typescript
import { MCPConfiguration } from "@voltagent/core";

const mcp = new MCPConfiguration({
  servers: {
    filesystem: {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "./policies"],
    },
  },
});
const policyTools = await mcp.getTools(); // names are prefixed: filesystem_read_file, ...
```

Pass `policyTools` into an agent's `tools`. Remote servers use `type: "http"` (or `"sse"`, `"streamable-http"`) with a `url`. Call `mcp.disconnect()` on shutdown.

### Guardrails

```typescript
import { createInputGuardrail, createInputLengthGuardrail } from "@voltagent/core";

const noCardNumbers = createInputGuardrail({
  name: "block-card-numbers",
  handler: async ({ inputText }) =>
    /\b\d{16}\b/.test(inputText ?? "")
      ? { pass: false, action: "block", message: "Please do not paste card numbers." }
      : { pass: true },
});
// new Agent({ ..., inputGuardrails: [createInputLengthGuardrail({ maxCharacters: 2000 }), noCardNumbers] })
```

A blocked input makes `generateText` throw with code `GUARDRAIL_INPUT_BLOCKED`. `outputGuardrails` work the same way on responses; ready-made ones include `createPIIInputGuardrail`, `createEmailRedactorGuardrail` and `createSensitiveNumberGuardrail`.

### Workflows with human approval

```typescript
import { createWorkflowChain } from "@voltagent/core";
import { z } from "zod";

export const refundApproval = createWorkflowChain({
  id: "refund-approval",
  name: "Refund Approval",
  purpose: "Auto-approve small refunds, pause large ones for a reviewer",
  input: z.object({ orderId: z.string(), amount: z.number() }),
  result: z.object({ status: z.enum(["approved", "rejected"]), approvedBy: z.string() }),
})
  .andThen({
    id: "check-amount",
    resumeSchema: z.object({ approved: z.boolean(), reviewer: z.string() }),
    execute: async ({ data, suspend, resumeData }) => {
      if (resumeData) return { ...data, approved: resumeData.approved, approvedBy: resumeData.reviewer };
      if (data.amount > 200) await suspend("Refund over $200 needs review", { orderId: data.orderId });
      return { ...data, approved: true, approvedBy: "auto" };
    },
  })
  .andThen({
    id: "finalize",
    execute: async ({ data }) => ({
      status: data.approved ? ("approved" as const) : ("rejected" as const),
      approvedBy: data.approvedBy,
    }),
  });
```

Register it with `new VoltAgent({ workflows: { refundApproval } })` to run it from the Console or REST. Other step builders: `andAgent` (call an agent inside a step), `andAll` and `andRace` (parallel), `andWhen` and `andBranch` (conditions), `andForEach`, `andSleep`, `andTap`.

## Examples

### Example 1: Order-status agent the frontend can call

**Request:** "Build me a TypeScript agent that answers 'where is my order' questions using our orders API and remembers each customer's ticket."

1. `npm create voltagent-app@latest order-desk`, pick OpenAI, then replace `src/index.ts` with the agent from "Define an agent with a tool and memory" and set `ORDERS_API_URL=https://orders.internal.shopnorth.io` in `.env`.
2. `npm run dev` prints `VOLTAGENT SERVER STARTED SUCCESSFULLY`, `HTTP Server: http://localhost:3141` and `Swagger UI: http://localhost:3141/ui`.
3. The frontend posts to `/agents/order-support/text`. The response looks like:

```json
{"success":true,"data":{"text":"Order ORD-48213 shipped via UPS, arriving 2026-10-03.","finishReason":"stop","toolCalls":[{"toolName":"lookupOrder","input":{"orderId":"ORD-48213"}}]}}
```

Follow-up messages with the same `conversationId` reuse the history stored in `.voltagent/memory.db`.

### Example 2: Refund workflow that waits for a manager

**Request:** "Refunds under $200 should go through automatically; bigger ones must wait until Maria approves them in our admin panel."

With the `refundApproval` workflow registered and the server running:

```bash
curl -s -X POST http://localhost:3141/workflows/refund-approval/execute \
  -H "Content-Type: application/json" \
  -d '{"input":{"orderId":"ORD-48377","amount":640}}'
```

```json
{"success":true,"data":{"executionId":"40be49cb-17d4-49ea-ae6b-5f278a92e993","status":"suspended","result":null}}
```

The admin panel stores the `executionId`; when Maria decides, it resumes:

```bash
curl -s -X POST http://localhost:3141/workflows/refund-approval/executions/40be49cb-17d4-49ea-ae6b-5f278a92e993/resume \
  -H "Content-Type: application/json" \
  -d '{"resumeData":{"approved":true,"reviewer":"maria.lopez"}}'
```

```json
{"success":true,"data":{"status":"completed","result":{"status":"approved","approvedBy":"maria.lopez"}}}
```

In code the same flow is `const wf = refundApproval.toWorkflow()`, register `wf` with `new VoltAgent({ workflows: { refundApproval: wf } })`, then `const run = await wf.run(input)` and `await run.resume({ approved: true, reviewer: "maria.lopez" })`. A $45 refund returns `status: "completed"` immediately with `approvedBy: "auto"`.

## Guidelines

- Pin one major version across the `@voltagent/*` packages. Core 2.x needs `ai` 6.x; the npm `latest` tag of `ai` and `@ai-sdk/openai` has moved to the next major, so if you pass AI SDK model objects install the `ai-v6` tagged versions (`npm install ai@ai-v6 @ai-sdk/openai@ai-v6`) or use `"provider/model"` strings, which need no extra provider package.
- Resuming from code needs the workflow registered on a `VoltAgent` instance and run through the same object: `const wf = chain.toWorkflow()`, register `wf`, call `wf.run()`. Resuming a chain that was never registered fails with "Workflow not found"; running the chain while `VoltAgent` holds its own copy fails with "Workflow state not found". Over REST this is handled for you.
- Suspension data is stored in the workflow's memory. Pass a persistent `Memory` (for example the LibSQL one above) as `memory` in `createWorkflowChain({...})` so approvals that wait for days survive a restart.
- Without auth every endpoint is open, including `POST /tools/:name/execute` (runs a tool directly) and `/api/memory/*` (reads stored conversations), and `honoServer()` listens on `0.0.0.0`, not localhost. For local-only use pass `honoServer({ hostname: "127.0.0.1" })`. Before exposing it, add `authNext: { provider: jwtAuth({ secret: process.env.JWT_SECRET! }) }` (`jwtAuth` is exported by `@voltagent/server-hono`) and run with `NODE_ENV=production`: in any other environment a request with the header `x-voltagent-dev: true` or `?dev=true` skips authNext.
- Tools run with your process's permissions. Validate inputs in `execute`, keep write actions narrow, and use `needsApproval` on tools that change data.
- Keep keys in `.env` (git-ignored). VoltOps keys (`VOLTAGENT_PUBLIC_KEY`, `VOLTAGENT_SECRET_KEY`, from console.voltagent.dev) are only needed to send traces to VoltOps.
- `maxSteps` caps tool-call loops per request; set it on agents whose tools can fail repeatedly.
- The official docs MCP server (`npx -y @voltagent/docs-mcp`) gives a coding agent current VoltAgent docs; use it when the API in this skill looks out of date. The repo README still shows the old name `@voltagent/mcp-docs-server`, which is not on npm.
- Not the right tool for Python stacks (use LangGraph, CrewAI or PydanticAI), for a single prompt-and-response call (the AI SDK alone is lighter), or when you need a visual no-code builder.
