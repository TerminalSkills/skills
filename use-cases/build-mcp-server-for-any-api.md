---
title: Build an MCP Server for Any API in 5 Minutes
slug: build-mcp-server-for-any-api
description: Turn any REST API into a Model Context Protocol server so AI agents can call it natively — with typed tools, error handling, and authentication.
skills:
  - mcp-server-builder
  - rest-api
  - test-generator
category: data-ai
tags:
  - mcp
  - ai-agents
  - api-integration
  - typescript
  - protocol
---

## The Problem

Dani runs a SaaS product with a REST API. Customers keep asking the same thing: "Can I use this with Claude Code?" or "Does it work with Cursor?" Every AI coding agent speaks MCP now, but Dani's API speaks REST. The gap between what customers want (natural language → action) and what exists (HTTP endpoints with JSON bodies) means lost deals and support tickets.

Building an MCP server from scratch means reading the spec, setting up the TypeScript SDK, figuring out tool schemas, handling authentication, and wiring up error responses. For a team already stretched thin shipping product features, that's a week of work nobody wants to prioritize.

Dani needs to turn the existing REST API into an MCP server that any AI agent can discover and call — without rewriting the API or becoming an MCP protocol expert.

## The Solution

Use mcp-server-builder to generate a TypeScript MCP server that wraps the existing REST API. Each API endpoint becomes a typed MCP tool with input validation, authentication forwarding, and structured error responses. Use rest-api for designing clean endpoint mappings and test-generator for verifying the tools work correctly.

## Step-by-Step Walkthrough

### Step 1: Map API Endpoints to MCP Tools

The first decision is which API endpoints become MCP tools. Not every endpoint should be exposed — AI agents work best with high-level actions, not CRUD operations.

A project management API might have 30 endpoints, but an agent really needs five tools: create a project, list tasks, create a task, update task status, and search across everything. The mapping looks like this:

```typescript
// tool-mapping.ts — Define which API endpoints become MCP tools
/**
 * Maps REST API endpoints to MCP tool definitions.
 * Each tool gets a name agents can discover, a description they
 * can reason about, and a typed input schema for validation.
 */

export const toolDefinitions = [
  {
    name: "create_project",
    description: "Create a new project with a name and optional description. Returns the project ID and URL.",
    apiEndpoint: "POST /api/v1/projects",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Project name (2-100 characters)" },
        description: { type: "string", description: "Optional project description" },
        template: {
          type: "string",
          enum: ["blank", "kanban", "scrum", "roadmap"],
          description: "Project template to start from",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "search_tasks",
    description: "Search tasks across all projects by keyword, status, or assignee. Returns up to 50 matching tasks with their project context.",
    apiEndpoint: "GET /api/v1/tasks/search",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search keyword" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "review", "done"],
          description: "Filter by task status",
        },
        assignee: { type: "string", description: "Filter by assignee email" },
        project_id: { type: "string", description: "Limit search to a specific project" },
      },
      required: ["query"],
    },
  },
  {
    name: "update_task_status",
    description: "Move a task to a different status. Triggers notifications to watchers and updates the project board.",
    apiEndpoint: "PATCH /api/v1/tasks/{task_id}",
    inputSchema: {
      type: "object" as const,
      properties: {
        task_id: { type: "string", description: "Task ID to update" },
        status: {
          type: "string",
          enum: ["open", "in_progress", "review", "done"],
          description: "New status",
        },
        comment: { type: "string", description: "Optional comment explaining the status change" },
      },
      required: ["task_id", "status"],
    },
  },
] as const;
```

The descriptions matter more than you'd expect. AI agents use them to decide which tool to call. "Create a new project" is fine. "Create a new project with a name and optional description. Returns the project ID and URL." is better — the agent knows exactly what it gets back and can chain the result into the next action.

### Step 2: Build the MCP Server

The server uses the official `@modelcontextprotocol/sdk` package. It registers each tool, validates inputs against the schema, calls the REST API, and returns structured responses.

```typescript
// server.ts — MCP server that wraps a REST API
/**
 * Model Context Protocol server implementation.
 * Registers tools from the mapping, handles authentication,
 * calls the underlying REST API, and formats responses.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { toolDefinitions } from "./tool-mapping.js";

const API_BASE = process.env.API_BASE_URL || "https://api.example.com";
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("ERROR: API_KEY environment variable is required");
  process.exit(1);
}

const server = new McpServer({
  name: "my-saas-api",
  version: "1.0.0",
});

// Register each tool from the mapping
for (const tool of toolDefinitions) {
  // Build zod schema from JSON Schema (simplified for common types)
  const zodShape: Record<string, z.ZodTypeAny> = {};
  const props = tool.inputSchema.properties;
  const required = new Set(tool.inputSchema.required || []);

  for (const [key, prop] of Object.entries(props)) {
    let field: z.ZodTypeAny;

    if ("enum" in prop && prop.enum) {
      field = z.enum(prop.enum as [string, ...string[]]);
    } else {
      field = z.string();
    }

    field = field.describe(prop.description || "");
    zodShape[key] = required.has(key) ? field : field.optional();
  }

  server.tool(
    tool.name,
    tool.description,
    zodShape,
    async (params) => {
      try {
        const result = await callApi(tool.apiEndpoint, params);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    }
  );
}

/**
 * Call the REST API with the right method, path params, and body.
 */
async function callApi(endpoint: string, params: Record<string, unknown>): Promise<unknown> {
  const [method, pathTemplate] = endpoint.split(" ");
  
  // Replace path parameters like {task_id}
  let path = pathTemplate;
  const bodyParams = { ...params };
  for (const [key, value] of Object.entries(params)) {
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, String(value));
      delete bodyParams[key];
    }
  }

  const url = `${API_BASE}${path}`;
  const fetchOptions: RequestInit = {
    method,
    headers: {
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
  };

  if (method !== "GET" && Object.keys(bodyParams).length > 0) {
    fetchOptions.body = JSON.stringify(bodyParams);
  } else if (method === "GET" && Object.keys(bodyParams).length > 0) {
    const searchParams = new URLSearchParams(
      Object.entries(bodyParams).map(([k, v]) => [k, String(v)])
    );
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}${searchParams}`, fetchOptions);
    if (!response.ok) throw new Error(`API returned ${response.status}: ${await response.text()}`);
    return response.json();
  }

  const response = await fetch(url, fetchOptions);
  if (!response.ok) throw new Error(`API returned ${response.status}: ${await response.text()}`);
  return response.json();
}

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP server running on stdio");
}

main().catch(console.error);
```

### Step 3: Configure for AI Agents

The server needs to be discoverable by Claude Code, Cursor, and other MCP clients. This means a configuration entry that tells the agent where to find the server and what environment variables it needs.

```json
{
  "mcpServers": {
    "my-saas-api": {
      "command": "npx",
      "args": ["tsx", "server.ts"],
      "env": {
        "API_BASE_URL": "https://api.example.com",
        "API_KEY": "your-api-key-here"
      }
    }
  }
}
```

For distribution, package it as an npm module. Users install with `npm install -g @my-saas/mcp-server` and add the config. The entire setup takes under a minute.

### Step 4: Test with Real Agent Prompts

The real test is whether agents can discover and use the tools naturally. Write tests that simulate how users actually talk to their agents:

```typescript
// test-tools.ts — Verify MCP tools work with realistic prompts
/**
 * Tests that validate both the tool execution and the
 * response format agents expect. Run against a staging API.
 */
import { describe, it, expect } from "vitest";
import { callApi } from "./server.js";

describe("MCP Tool Integration", () => {
  it("creates a project from natural language intent", async () => {
    // Simulates: "Create a new kanban project called Q1 Roadmap"
    const result = await callApi("POST /api/v1/projects", {
      name: "Q1 Roadmap",
      template: "kanban",
    });

    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("url");
    expect(result.name).toBe("Q1 Roadmap");
  });

  it("searches tasks with partial context", async () => {
    // Simulates: "Find all open bugs assigned to me"
    const result = await callApi("GET /api/v1/tasks/search", {
      query: "bug",
      status: "open",
      assignee: "dani@example.com",
    });

    expect(Array.isArray(result.tasks)).toBe(true);
    expect(result.tasks.length).toBeLessThanOrEqual(50);
  });

  it("returns clear errors for invalid inputs", async () => {
    // Agent passes non-existent task ID
    await expect(
      callApi("PATCH /api/v1/tasks/{task_id}", {
        task_id: "nonexistent",
        status: "done",
      })
    ).rejects.toThrow(/404/);
  });
});
```

## The Outcome

The MCP server ships as a 200-line TypeScript file plus the tool mapping configuration. Any AI agent that supports MCP can now discover the API's capabilities and call them through natural conversation. Customers say "create a project called Q1 Roadmap" to their agent and it just works — no API docs, no HTTP clients, no authentication dance.

The setup takes five minutes: install the package, add the config with an API key, and the agent has full access. Support tickets about "how do I use this with Claude" turn into a one-line answer.
