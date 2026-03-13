---
name: mcp-sdk
description: >-
  You are an expert in MCP (Model Context Protocol), the open standard by
  Anthropic for connecting AI models to external tools and data sources. You
  help developers build MCP servers that expose tools, resources, and prompts
  to any MCP-compatible client (Claude Desktop, Cursor, Windsurf, Cline,
  Continue) — creating a universal plugin system for AI assistants.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - mcp
    - model-context-protocol
    - tools
    - ai
    - agents
    - integration
    - anthropic
---

# MCP SDK — Model Context Protocol for AI Tools

You are an expert in MCP (Model Context Protocol), the open standard by Anthropic for connecting AI models to external tools and data sources. You help developers build MCP servers that expose tools, resources, and prompts to any MCP-compatible client (Claude Desktop, Cursor, Windsurf, Cline, Continue) — creating a universal plugin system for AI assistants.

## Core Capabilities

### MCP Server (TypeScript)

```typescript
// src/server.ts — MCP server exposing tools to AI clients
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "project-manager", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {} } },
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_task",
      description: "Create a new task in the project management system",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Task title" },
          description: { type: "string", description: "Task description" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          assignee: { type: "string", description: "Email of the assignee" },
        },
        required: ["title"],
      },
    },
    {
      name: "list_tasks",
      description: "List tasks with optional filters",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["todo", "in_progress", "done"] },
          assignee: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
        },
      },
    },
    {
      name: "search_docs",
      description: "Search project documentation",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "create_task": {
      const task = await db.tasks.create({
        title: args.title,
        description: args.description,
        priority: args.priority || "medium",
        assignee: args.assignee,
        status: "todo",
      });
      return {
        content: [{ type: "text", text: `Created task #${task.id}: ${task.title}` }],
      };
    }
    case "list_tasks": {
      const tasks = await db.tasks.find(args);
      const formatted = tasks.map(t => `- [${t.status}] #${t.id}: ${t.title} (${t.priority})`).join("\n");
      return {
        content: [{ type: "text", text: formatted || "No tasks found." }],
      };
    }
    case "search_docs": {
      const results = await vectorSearch(args.query, { topK: 5 });
      const formatted = results.map(r => `## ${r.title}\n${r.excerpt}`).join("\n\n");
      return {
        content: [{ type: "text", text: formatted || "No results found." }],
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Expose resources (data the AI can read)
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "project://readme",
      name: "Project README",
      description: "Main project documentation",
      mimeType: "text/markdown",
    },
    {
      uri: "project://changelog",
      name: "Changelog",
      description: "Recent changes and releases",
      mimeType: "text/markdown",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  switch (uri) {
    case "project://readme":
      return { contents: [{ uri, mimeType: "text/markdown", text: await fs.readFile("README.md", "utf-8") }] };
    case "project://changelog":
      return { contents: [{ uri, mimeType: "text/markdown", text: await fs.readFile("CHANGELOG.md", "utf-8") }] };
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Client Configuration

```json
// Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "project-manager": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": { "DATABASE_URL": "postgres://..." }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    }
  }
}
```

### Python Server

```python
# server.py — MCP server in Python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

server = Server("analytics-server")

@server.list_tools()
async def list_tools():
    return [
        Tool(
            name="run_query",
            description="Run a SQL query against the analytics database",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "SQL query to execute"},
                },
                "required": ["query"],
            },
        ),
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "run_query":
        results = await db.execute(arguments["query"])
        return [TextContent(type="text", text=format_results(results))]

async def main():
    async with stdio_server() as (read, write):
        await server.run(read, write, server.create_initialization_options())
```

## Installation

```bash
npm install @modelcontextprotocol/sdk     # TypeScript
pip install mcp                           # Python
```

## Best Practices

1. **Tools for actions** — Expose write operations as tools (create, update, delete); AI calls them with structured input
2. **Resources for context** — Expose read-only data as resources; AI reads them for background context
3. **Prompts for workflows** — Define prompt templates for common tasks; users select them from the client
4. **Clear descriptions** — Write detailed tool descriptions and parameter docs; the AI reads these to decide when to use tools
5. **Input validation** — Define JSON Schema for tool inputs; clients validate before calling your server
6. **Error handling** — Return clear error messages; the AI uses error text to retry or adjust its approach
7. **Stdio transport** — Use stdio for local servers (Claude Desktop, Cursor); SSE transport for remote/hosted servers
8. **Composable servers** — Each MCP server is focused (database, files, APIs); users combine multiple servers in their client
