---
name: copilotkit
description: >-
  CopilotKit is an open-source framework for putting AI agents inside React
  apps: a chat sidebar or popup, tools the agent can call in the browser or on
  the server, app state shared with the agent, and human-in-the-loop approvals.
  Use when a user asks to add an AI assistant or chat sidebar to a React or
  Next.js app, let an agent read app state or trigger UI actions, connect a
  LangGraph or other AG-UI agent to a frontend, or migrate CopilotKit v1 code
  (useCopilotAction, useCopilotReadable, OpenAIAdapter) to the v2 API.
license: Apache-2.0
compatibility: "CopilotKit 1.x with the v2 API (/v2 imports; checked against 1.76.0). Node.js 20+, React 18 or 19. Needs an LLM provider API key or an existing AG-UI agent."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["copilotkit", "react", "ai-agents", "ag-ui", "chat-ui"]
  repository: https://github.com/CopilotKit/CopilotKit
---

# CopilotKit — In-App AI Copilots for React

## Overview

CopilotKit connects a React frontend to an AI agent. The frontend gets prebuilt chat components (`CopilotSidebar`, `CopilotPopup`, `CopilotChat`) and hooks that share app state with the agent and let it call functions in the browser. The backend is the Copilot Runtime, an endpoint in your own server that hosts either the built-in agent (it calls an LLM directly) or agents from LangGraph, Mastra, CrewAI, Google ADK and other frameworks over the AG-UI protocol.

The v1 SDK is deprecated. Everything current is imported from the `/v2` subpaths — `@copilotkit/react-core/v2` and `@copilotkit/runtime/v2`. Code that imports `useCopilotAction`, `useCopilotReadable`, `OpenAIAdapter` or anything from `@copilotkit/react-ui` is v1; see the migration table below.

## Instructions

### Install

```bash
npm install @copilotkit/react-core @copilotkit/runtime zod
```

The chat components and the stylesheet ship in `@copilotkit/react-core/v2`, so `@copilotkit/react-ui` is not needed. Put the provider key in `.env` (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY`). For a new project, `npx copilotkit@latest create` scaffolds a starter in its own directory; it does not modify an existing app.

### Runtime endpoint

```typescript
// app/api/copilotkit/[[...slug]]/route.ts
import { BuiltInAgent, CopilotRuntime, createCopilotRuntimeHandler, defineTool } from "@copilotkit/runtime/v2";
import { z } from "zod";

// Server tool: runs on the backend, can use secrets and the database
const findOverdueTasks = defineTool({
  name: "findOverdueTasks",
  description: "List tasks in a project that are past their due date",
  parameters: z.object({ projectId: z.string().describe("Project identifier") }),
  execute: async ({ projectId }) => {
    return { projectId, overdue: [{ title: "Renew TLS certificate", dueDate: "2026-09-28" }] };
  },
});

const agent = new BuiltInAgent({
  model: "openai:gpt-5.4-mini", // or "anthropic:claude-sonnet-4-6", "google:gemini-2.5-pro"
  prompt: "You help the team manage tasks in the project dashboard.",
  tools: [findOverdueTasks],
  maxSteps: 5, // allow tool call → answer chains; the default is a single step
});

const runtime = new CopilotRuntime({ agents: { default: agent } });
const handler = createCopilotRuntimeHandler({ runtime, basePath: "/api/copilotkit" });

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

The v2 handler serves several routes under the base path, which is why the folder is the catch-all `[[...slug]]`. Express uses `createCopilotExpressHandler` from `@copilotkit/runtime/v2/express`.

### Provider and chat UI

```tsx
// app/providers.tsx
"use client";

import { CopilotKitProvider, CopilotSidebar } from "@copilotkit/react-core/v2";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <CopilotKitProvider runtimeUrl="/api/copilotkit">
      {children}
      <CopilotSidebar defaultOpen={false} labels={{ modalHeaderTitle: "Project Assistant" }} />
    </CopilotKitProvider>
  );
}
```

```tsx
// app/layout.tsx — a server component, so it renders the client Providers file
import { Providers } from "./providers";
import "@copilotkit/react-core/v2/styles.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

A relative `runtimeUrl` works because Next.js serves the app and the runtime from one origin. A client-only app (Vite) needs a standalone runtime server and an absolute URL.

### Share app state and expose tools

```tsx
// app/components/ProjectDashboard.tsx
"use client";

import { useState } from "react";
import { useAgentContext, useFrontendTool } from "@copilotkit/react-core/v2";
import { z } from "zod";

type Task = { id: string; title: string; status: "todo" | "doing" | "done"; assignee?: string };

export function ProjectDashboard({ projectName, initialTasks }: { projectName: string; initialTasks: Task[] }) {
  const [tasks, setTasks] = useState(initialTasks);

  // Shared with the agent; updates whenever `tasks` changes
  useAgentContext({
    description: "The project the user is viewing and its tasks",
    value: { projectName, tasks },
  });

  // A tool the agent can call; the handler runs in the browser
  useFrontendTool(
    {
      name: "createTask",
      description: "Create a new task in the current project",
      parameters: z.object({
        title: z.string().describe("Task title"),
        assignee: z.string().optional().describe("Who the task is assigned to"),
      }),
      handler: async ({ title, assignee }) => {
        setTasks((prev) => [...prev, { id: crypto.randomUUID(), title, status: "todo", assignee }]);
        return `Created task: ${title}`;
      },
    },
    [],
  );

  return (
    <ul>
      {tasks.map((t) => (
        <li key={t.id}>{t.title} — {t.status}</li>
      ))}
    </ul>
  );
}
```

### Connect an existing agent

Register an agent you already run instead of `BuiltInAgent`. The URL is the agent's own server, not `/api/copilotkit`. To import `@ag-ui/client` directly, install the exact version `@copilotkit/runtime` depends on (`npm install @ag-ui/client@1.0.1` for 1.76.0); `npm ls @ag-ui/client` must show a single copy:

```typescript
import { HttpAgent } from "@ag-ui/client";
import { CopilotRuntime } from "@copilotkit/runtime/v2";

const runtime = new CopilotRuntime({
  agents: {
    support_agent: new HttpAgent({ url: process.env.SUPPORT_AGENT_URL ?? "http://localhost:8000/" }),
  },
});
```

The frontend addresses an agent by its key in the `agents` map: `<CopilotSidebar agentId="support_agent" />` or `useAgent({ agentId: "support_agent" })`. The key `default` is used when no `agentId` is given. LangGraph deployments use `LangGraphAgent` from `@copilotkit/runtime/langgraph`.

### Migrating from v1

| v1 | v2 |
|---|---|
| `useCopilotAction` (parameter arrays) | `useFrontendTool` (Zod schema) |
| `useCopilotReadable`, `useCopilotAdditionalInstructions` | `useAgentContext` |
| `useCoAgent`, `useCopilotChat` | `useAgent` |
| `renderAndWaitForResponse` | `useHumanInTheLoop` |
| `@copilotkit/react-ui` components and `styles.css` | same names from `@copilotkit/react-core/v2` |
| `new OpenAIAdapter()` + `copilotRuntimeNextJSAppRouterEndpoint` | `BuiltInAgent` + `createCopilotRuntimeHandler` |
| `CopilotTextarea` (`@copilotkit/react-textarea`) | no replacement; its autosuggestions stopped reaching a backend in 1.50.0 |

## Examples

### Example 1: Assistant that sees the page and creates tasks

User request: "Add an AI sidebar to our Next.js project dashboard. It should know which tasks are on screen and be able to add new ones."

Create the route, `providers.tsx`, `layout.tsx` and `ProjectDashboard.tsx` from the Instructions, then check the wiring before opening the browser:

```bash
npm run build && npm run start
curl -s http://localhost:3000/api/copilotkit/info
```

```json
{"version":"1.76.0","agents":{"default":{"name":"default","description":"","capabilities":{"tools":{"supported":true,"clientProvided":true}}}},"mode":"sse"}
```

(Output shortened.) The agent is listed under the key `default`, so the sidebar finds it without an `agentId`. In the chat, "Add a task for Priya to update the pricing page" makes the agent call `createTask`; the handler appends the row to the list and the tool result goes back to the model.

### Example 2: Ask before a bulk action

User request: "The assistant must not archive anything until the user confirms."

```tsx
// app/components/ArchiveConfirmation.tsx — render <ArchiveConfirmation /> anywhere inside the provider
"use client";

import { ToolCallStatus, useHumanInTheLoop } from "@copilotkit/react-core/v2";
import { z } from "zod";

export function ArchiveConfirmation() {
  useHumanInTheLoop(
    {
      name: "confirmArchive",
      description: "Ask the user to confirm before archiving completed tasks",
      parameters: z.object({ count: z.number().describe("How many tasks would be archived") }),
      render: ({ args, status, respond }) =>
        status === ToolCallStatus.Executing && respond ? (
          <div>
            <p>Archive {args.count} completed tasks?</p>
            <button onClick={() => respond({ confirmed: true })}>Archive</button>
            <button onClick={() => respond({ confirmed: false })}>Cancel</button>
          </div>
        ) : null,
    },
    [],
  );
  return null;
}
```

Result: when the model calls `confirmArchive`, the run pauses and the two buttons appear in the chat. The clicked value (`{"confirmed":true}`) is returned to the agent as the tool result and the run continues.

## Guidelines

1. **Schemas are validators, not arrays** — `parameters` takes a Standard Schema validator such as `z.object(...)`. The v1 `[{ name, type }]` array shape no longer applies. A plain JSON Schema object is not accepted either: `defineTool` does not check it, and the run fails later when the runtime converts the tool.
2. **Validate inside handlers** — frontend tool arguments are typed from the schema but not validated at run time, and the handler runs in the user's browser. Re-check anything that matters on the server; never rely on a frontend tool for authorization.
3. **Keep keys on the server** — provider keys belong to the runtime route's environment. Do not expose them through `NEXT_PUBLIC_` variables or pass them to the provider component.
4. **Set `maxSteps`** — the built-in agent does one step by default, so a tool call would not be followed by an answer.
5. **Agent names are map keys** — a name the runtime did not register raises `CopilotKitAgentDiscoveryError`. `GET /api/copilotkit/info` lists the real keys.
6. **One run per agent instance** — a `BuiltInAgent` created at module scope refuses a second concurrent run ("Agent is already running"). On a multi-user server, construct the agent per request.
7. **Tool name collisions** — a server tool wins over a frontend tool with the same name, so the frontend handler never fires. Use distinct names.
8. **Context is sent as JSON text** — `useAgentContext` stringifies non-string values; an agent you host yourself has to parse them. The built-in agent needs no extra work.
9. **Telemetry** — the runtime reports anonymous usage; set `COPILOTKIT_TELEMETRY_DISABLED=true` to turn it off.
10. **When not to use it** — for one-off completions with no chat UI, shared state or tools, calling the provider SDK directly is simpler. Angular and Vue have their own CopilotKit packages; this skill covers React.
