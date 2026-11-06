---
title: Build an MCP Server for Any API in 5 Minutes
slug: build-mcp-server-for-any-api
description: Turn any REST API into a Model Context Protocol server so AI agents can call it natively — with typed tools, error handling, and authentication.
skills:
  - mcp-server-builder
  - rest-api
  - test-generator
  - fastmcp
category: data-ai
tags:
  - mcp
  - ai-agents
  - api-integration
  - typescript
  - protocol
---

## The Problem

Dani runs a SaaS product with a REST API. Customers keep asking the same thing: "Can I use this with Claude Code?" or "Does it work with Cursor?" Most AI coding agents speak MCP now, but Dani's API speaks REST. The gap between what customers want (natural language → action) and what exists (HTTP endpoints with JSON bodies) means lost deals and support tickets.

Building an MCP server from scratch means reading the spec, setting up the SDK, figuring out tool schemas, handling authentication, and wiring up error responses. For a team already stretched thin shipping product features, that's a week of work nobody wants to prioritize.

Dani needs to turn the existing REST API into an MCP server that any AI agent can discover and call — without rewriting the API or becoming an MCP protocol expert.

## The Solution
Use **mcp-server-builder** to generate a TypeScript MCP server that wraps the existing REST API on the current v2 SDK. Each API endpoint the agent needs becomes a typed MCP tool with input validation, authentication forwarding, and structured error responses. Use **rest-api** to decide which endpoints deserve a tool and what errors they return, and **test-generator** to verify the tools against a local fake of the API. If the team works in Python, or the API already has an OpenAPI spec, **fastmcp** generates the tools from the spec instead.

## Step-by-Step Walkthrough

### Step 1: Map API Endpoints to MCP Tools

The first decision is which API endpoints become MCP tools. Not every endpoint should be exposed: AI agents work best with high-level actions, not CRUD operations. Apply the resource and status-code conventions from rest-api to decide what each tool returns and which errors the agent must be able to read.

A project management API might have 30 endpoints, but an agent really needs a handful: create a project, search tasks, update task status. The mapping lives in one file, with a Zod schema per tool.

```typescript
// tools.ts — which REST endpoints become MCP tools
import * as z from "zod/v4";

const status = z.enum(["open", "in_progress", "review", "done"]);

export interface ToolDefinition {
  name: string;
  description: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  input: z.ZodObject<z.ZodRawShape>;
}

export const toolDefinitions: ToolDefinition[] = [
  {
    name: "create_project",
    description:
      "Create a new project with a name and optional description. Returns the project ID and URL.",
    method: "POST",
    path: "/api/v1/projects",
    input: z.object({
      name: z.string().min(2).max(100).describe("Project name (2-100 characters)"),
      description: z.string().optional().describe("Optional project description"),
      template: z.enum(["blank", "kanban", "scrum", "roadmap"]).optional()
        .describe("Project template to start from"),
    }),
  },
  {
    name: "search_tasks",
    description:
      "Search tasks across all projects by keyword, status, or assignee. Returns up to 50 matching tasks with their project context.",
    method: "GET",
    path: "/api/v1/tasks/search",
    input: z.object({
      query: z.string().describe("Search keyword"),
      status: status.optional().describe("Filter by task status"),
      assignee: z.string().optional().describe("Filter by assignee email"),
      project_id: z.string().optional().describe("Limit search to a specific project"),
    }),
  },
  {
    name: "update_task_status",
    description:
      "Move a task to a different status. Triggers notifications to watchers and updates the project board.",
    method: "PATCH",
    path: "/api/v1/tasks/{task_id}",
    input: z.object({
      task_id: z.string().describe("Task ID to update"),
      status: status.describe("New status"),
      comment: z.string().optional().describe("Optional comment explaining the status change"),
    }),
  },
];
```

The descriptions matter more than you'd expect. AI agents use them to decide which tool to call. "Create a new project" is fine. "Create a new project with a name and optional description. Returns the project ID and URL." is better: the agent knows exactly what it gets back and can chain the result into the next action.

### Step 2: Build the MCP Server

Create the project with the v2 packages. The SDK is ESM only, so `type` must be `module`:

```bash
mkdir my-saas-mcp && cd my-saas-mcp
npm init -y && npm pkg set type=module
npm install @modelcontextprotocol/server zod tsx
mkdir src
```

The REST call goes in its own module so tests can import it without starting the server. Path parameters are URL-encoded, because the model, not a trusted caller, chooses their values.

```typescript
// api.ts — call the REST API on behalf of a tool
import type { ToolDefinition } from "./tools.js";

const API_BASE = process.env.API_BASE_URL ?? "https://api.example.com";

export async function callApi(
  tool: Pick<ToolDefinition, "method" | "path">,
  params: Record<string, unknown>,
): Promise<any> {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY environment variable is not set");

  // Fill {path_params}; encode them so an agent cannot inject "../" or "?"
  const rest = { ...params };
  const path = tool.path.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = rest[key];
    delete rest[key];
    return encodeURIComponent(String(value));
  });

  const url = new URL(path, API_BASE);
  const init: RequestInit = {
    method: tool.method,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  };
  if (tool.method === "GET") {
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  } else {
    init.body = JSON.stringify(rest);
  }

  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}
```

The server registers each tool with `registerTool`. The input is validated against the Zod schema before the handler runs, and API failures come back as `isError: true` results the agent can read and react to.

```typescript
// server.ts — MCP server that wraps the REST API
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { callApi } from "./api.js";
import { toolDefinitions } from "./tools.js";

if (!process.env.API_KEY) {
  console.error("ERROR: API_KEY environment variable is required");
  process.exit(1);
}

function createServer(): McpServer {
  const server = new McpServer({ name: "my-saas-api", version: "1.0.0" });

  for (const tool of toolDefinitions) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (params: Record<string, unknown>) => {
        try {
          const result = await callApi(tool, params);
          return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
        }
      },
    );
  }
  return server;
}

void serveStdio(createServer);
console.error("MCP server running on stdio");
```

Logging goes to stderr: one `console.log` would corrupt the protocol stream on stdout. Note that `@modelcontextprotocol/server` (v2) replaces the older `@modelcontextprotocol/sdk` package; `server.tool()` and `StdioServerTransport` from tutorials written for v1 do not exist in it.

### Step 3: Configure for AI Agents

Register the server with Claude Code. The `--` separates the server command from the client's own flags; use an absolute path, because the host does not launch the server from your project directory.

```bash
claude mcp add my-saas-api --env API_KEY="$API_KEY" --env API_BASE_URL=https://api.example.com \
  -- npx tsx /home/dev/my-saas-mcp/src/server.ts
```

Cursor and Claude Desktop read the same shape from their JSON config (`"command": "npx"`, `"args": ["tsx", "/home/dev/my-saas-mcp/src/server.ts"]`, plus an `env` block). Keep the key itself in your own config or secret store, never in the repository.

To inspect the tools interactively, run `npx @modelcontextprotocol/inspector npx tsx src/server.ts`, click Connect, and call a tool from the Tools tab.

### Step 4: Test the Tools

Ask test-generator for Vitest tests (`npm install -D vitest`) that run against a local fake of the API, so no staging credentials are needed. These cover the paths where an agent goes wrong: a missing optional field, an invalid enum value, a hostile path parameter, and a 404.

```typescript
// test/tools.test.ts — run the tools against a local fake of the REST API
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let fake: Server;
let callApi: typeof import("../src/api.js").callApi;
let tools: typeof import("../src/tools.js").toolDefinitions;
const seen: string[] = [];

beforeAll(async () => {
  fake = createServer((req, res) => {
    seen.push(`${req.method} ${req.url}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url?.startsWith("/api/v1/tasks/nonexistent")) {
      res.statusCode = 404;
      return void res.end('{"error":"not found"}');
    }
    res.end(JSON.stringify({ id: "p_1", url: "https://app.example.com/p/p_1", name: "Q1 Roadmap", tasks: [] }));
  });
  await new Promise<void>((ok) => fake.listen(0, "127.0.0.1", ok));
  process.env.API_BASE_URL = `http://127.0.0.1:${(fake.address() as AddressInfo).port}`;
  process.env.API_KEY = "test-key";
  ({ callApi } = await import("../src/api.js"));
  ({ toolDefinitions: tools } = await import("../src/tools.js"));
});
afterAll(() => void fake.close());

const tool = (name: string) => tools.find((t) => t.name === name)!;

describe("MCP tools", () => {
  it("creates a project", async () => {
    const input = tool("create_project").input.parse({ name: "Q1 Roadmap", template: "kanban" });
    const result = await callApi(tool("create_project"), input);
    expect(result).toHaveProperty("id");
    expect(result.name).toBe("Q1 Roadmap");
  });

  it("sends search filters as query parameters", async () => {
    await callApi(tool("search_tasks"), { query: "bug", status: "open" });
    expect(seen.at(-1)).toBe("GET /api/v1/tasks/search?query=bug&status=open");
  });

  it("encodes path parameters", async () => {
    await callApi(tool("update_task_status"), { task_id: "../admin?x=1", status: "done" });
    expect(seen.at(-1)).toBe("PATCH /api/v1/tasks/..%2Fadmin%3Fx%3D1");
  });

  it("rejects an invalid status before any request", () => {
    expect(() => tool("update_task_status").input.parse({ task_id: "t1", status: "finished" })).toThrow();
  });

  it("surfaces API errors", async () => {
    await expect(callApi(tool("update_task_status"), { task_id: "nonexistent", status: "done" })).rejects.toThrow(/404/);
  });
});
```

Run them with `npx vitest run`. Validation errors for a bad enum value are produced by the SDK before your handler runs, so the test checks the schema directly.

## The Outcome

The MCP server ships as three small TypeScript files: the tool mapping, the API caller, and the server. Any AI agent that supports MCP can discover the API's capabilities and call them through natural conversation. A customer says "create a kanban project called Q1 Roadmap" to their agent, and the agent calls `create_project` with the right arguments.

Dani's team gives customers one `claude mcp add` command plus an API key, and support tickets about "how do I use this with Claude" turn into a short answer.

## Related Skills

- [mcp-server-builder](/skills/mcp-server-builder): scaffolds the v2 TypeScript server and its client configuration
- [rest-api](/skills/rest-api): guides which endpoints become tools and how errors and status codes should look
- [test-generator](/skills/test-generator): writes the Vitest tests that exercise the tools against a fake API
- [fastmcp](/skills/fastmcp): choose it when the team works in Python or the API already has an OpenAPI spec, because it generates the MCP tools from the spec instead of mapping each endpoint by hand
