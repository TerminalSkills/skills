---
name: mastra
description: >-
  Mastra is a TypeScript framework for building AI agents, tools, workflows, memory and RAG
  pipelines, with a local Studio for testing. Use when building an agent in TypeScript, adding
  tools, multi-step workflows with branching, conversation memory or retrieval to a Node.js app,
  or when the user mentions Mastra, @mastra/core, createWorkflow or mastra dev.
license: Apache-2.0
compatibility: "Node.js 22.13 or newer, an LLM provider API key (for example OPENAI_API_KEY)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: "mastra, ai-agents, typescript, workflows, rag"
  repository: "https://github.com/mastra-ai/mastra"
---

# Mastra

## Overview

Mastra is a TypeScript framework (1.x line; `@mastra/core` 1.78 and `mastra` CLI 1.34 were current on 2026-10-15) for agents, tools, workflows, memory and RAG. Everything is registered on one `Mastra` instance, and `mastra dev` serves it with Studio, a local UI for chatting with agents and running workflows. Models are named with `provider/model` strings and read the provider key from the environment (`OPENAI_API_KEY`). Imports use sub-paths such as `@mastra/core/agent`; the old `import { Agent } from "@mastra/core"`, `@mastra/openai` and `new Workflow`/`new Step` forms are gone.

## Instructions

1. Scaffold with `npm create mastra@latest`, or by hand: `npm install @mastra/core@latest zod typescript @types/node mastra@latest` in a package with `"type": "module"`. Source lives in `src/mastra/` (`index.ts`, `agents/`, `tools/`, `workflows/`).
2. Define tools with `createTool` from `@mastra/core/tools` (`id`, `description`, zod `inputSchema`, `execute`). Plain-object tools do not execute.
3. Define agents with `new Agent({ id, name, instructions, model, tools })` from `@mastra/core/agent`, register them in `new Mastra({ agents })`, and fetch with `mastra.getAgentById("id")`.
4. Call `agent.generate(prompt)` (returns `text`, `toolCalls`, `usage`) or `agent.stream(prompt)` and iterate `stream.textStream`. For typed output pass `{ structuredOutput: { schema: zodSchema } }` and read `response.object`.
5. Workflows: build steps with `createStep` and chain with `createWorkflow(...).then(step).branch([[condition, step]]).commit()` from `@mastra/core/workflows`. Run with `await mastra.getWorkflow("key").createRun()` then `run.start({ inputData })`; check `result.status === "success"` before reading `result.result` (other statuses: failed, suspended, tripwire, paused).
6. Memory: `npm install @mastra/memory @mastra/libsql`, set `storage` on the Mastra instance, give the agent `memory: new Memory({ options: { lastMessages: 20 } })`, and pass `memory: { resource, thread }` on each call. Observational memory (`observationalMemory: true`), working memory and semantic recall are the other memory types.
7. RAG: `MDocument.fromText()` and `doc.chunk()` from `@mastra/rag`, `embedMany` from `ai`, and a vector store such as `PgVector` from `@mastra/pg` (`upsert`, `query`).
8. Run `npx mastra dev` for Studio and the local API, `mastra build` and `mastra start` for production.

## Examples

### Example 1: Support agent with a tool

**User request:** "Build an agent that looks up a customer's plan by email."

```typescript
// src/mastra/tools/plan-tool.ts
import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const planTool = createTool({
  id: "get-customer-plan",
  description: "Look up a customer's subscription plan by email",
  inputSchema: z.object({ email: z.string().email() }),
  outputSchema: z.object({ plan: z.string() }),
  execute: async ({ email }) => ({ plan: email.endsWith("@acme.io") ? "Growth" : "Starter" }),
});

// src/mastra/agents/support-agent.ts
import { Agent } from "@mastra/core/agent";
import { planTool } from "../tools/plan-tool.ts";

export const supportAgent = new Agent({
  id: "support-agent",
  name: "Support Agent",
  instructions: "Answer billing questions. Check the plan with the tool before promising features.",
  model: "openai/gpt-5-mini",
  tools: { planTool },
});

// src/mastra/index.ts
import { Mastra } from "@mastra/core";
import { supportAgent } from "./agents/support-agent.ts";
export const mastra = new Mastra({ agents: { supportAgent } });
```

**Result:** `npx mastra dev` opens Studio where `support-agent` can be chatted with; in code, `(await mastra.getAgentById("support-agent").generate("What plan is dana@acme.io on?")).text` returns the answer after one tool call.

### Example 2: Workflow with a branch, verified to run

**User request:** "Add one to a number, then multiply by ten only if it is above one."

```typescript
import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const num = z.object({ n: z.number() });
const addOne = createStep({ id: "add-one", inputSchema: num, outputSchema: num,
  execute: async ({ inputData }) => ({ n: inputData.n + 1 }) });
const timesTen = createStep({ id: "times-ten", inputSchema: num, outputSchema: num,
  execute: async ({ inputData }) => ({ n: inputData.n * 10 }) });

export const calc = createWorkflow({ id: "calc", inputSchema: num, outputSchema: num })
  .then(addOne)
  .branch([[async ({ inputData }) => inputData.n > 1, timesTen]])
  .commit();
```

**Result:** with `new Mastra({ workflows: { calc } })`, `run.start({ inputData: { n: 2 } })` returns status `success`; the branch output is keyed by step id, here `{ "times-ten": { n: 30 } }`.

### Example 3: Remember a user across calls

**User request:** "The agent should remember my favourite colour."

```typescript
import { Memory } from "@mastra/memory";
// in the Agent options: memory: new Memory({ options: { lastMessages: 20 } })
await agent.generate("Remember my favourite colour is blue.", {
  memory: { resource: "user-123", thread: "chat-1" },
});
```

**Result:** a later call with the same `resource` and `thread` answers "blue". Storage must be configured on the `Mastra` instance (`new LibSQLStore({ id: "mastra-storage", url: "file:./mastra.db" })`).

## Guidelines

- Use `createTool`, `createStep` and `createWorkflow`; the pre-1.0 `new Step`, `parameters:` and `@mastra/openai` APIs do not exist in current releases.
- Node 22.13 or newer is required by the packages. Local imports in TypeScript need explicit file extensions when running without a bundler.
- `MDocument.chunk` takes `maxSize` for the recursive strategy; the documentation page showed `size`, which this version rejects (`'size' not supported`).
- Key the `getWorkflow` call by the registration key in `new Mastra({ workflows })`, not the workflow `id`.
- Memory needs a storage provider, and a thread's `resource` owner cannot change after creation.
- Keep API keys in environment variables, never in agent files.
