---
name: mcp-server
description: >-
  Build Model Context Protocol (MCP) servers that extend AI assistant
  capabilities with custom tools, resources, and prompts. Use when: creating
  custom tools for Claude/Cursor/Windsurf, exposing internal APIs to AI agents,
  building MCP integrations, or adding new capabilities to AI coding assistants.
license: Apache-2.0
compatibility: "Node.js 18+ (TypeScript) or Python 3.10+ (Python SDK)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["mcp", "model-context-protocol", "claude", "ai-tools", "server"]
  use-cases:
    - "Expose internal company APIs as tools for Claude Desktop"
    - "Build a custom database query tool for AI coding assistants"
    - "Create a file system resource provider for AI agents"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# MCP Server

## Overview

The Model Context Protocol (MCP) is an open standard for connecting AI assistants to external tools, data sources, and capabilities. Build an MCP server to expose custom tools, resources, and prompt templates that any MCP-compatible AI client (Claude Desktop, Cursor, Windsurf, etc.) can use.

MCP servers provide three types of primitives:
- **Tools** — Functions the AI can call (like API endpoints)
- **Resources** — Data sources the AI can read (like files, database records)
- **Prompts** — Reusable prompt templates with parameters

## Instructions

### Step 1: Install the SDK

**TypeScript:**
```bash
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node tsx
```

**Python:**
```bash
pip install mcp
```

### Step 2: Create the server

**TypeScript — stdio transport (recommended for local tools):**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "my-mcp-server",
  version: "1.0.0",
});

// Define a tool
server.tool(
  "get_weather",
  "Get current weather for a city",
  {
    city: z.string().describe("City name to get weather for"),
    units: z.enum(["celsius", "fahrenheit"]).default("celsius"),
  },
  async ({ city, units }) => {
    // Your implementation here
    const weather = await fetchWeather(city, units);
    return {
      content: [
        {
          type: "text",
          text: `Weather in ${city}: ${weather.temp}°, ${weather.description}`,
        },
      ],
    };
  }
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

**Python — stdio transport:**

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

server = Server("my-mcp-server")

@server.list_tools()
async def list_tools() -> list[types.Tool]:
    return [
        types.Tool(
            name="get_weather",
            description="Get current weather for a city",
            inputSchema={
                "type": "object",
                "properties": {
                    "city": {"type": "string", "description": "City name"},
                    "units": {"type": "string", "enum": ["celsius", "fahrenheit"]},
                },
                "required": ["city"],
            },
        )
    ]

@server.call_tool()
async def call_tool(name: str, arguments: dict) -> list[types.TextContent]:
    if name == "get_weather":
        city = arguments["city"]
        # Your implementation here
        return [types.TextContent(type="text", text=f"Weather in {city}: 22°C, sunny")]
    raise ValueError(f"Unknown tool: {name}")

async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())

import asyncio
asyncio.run(main())
```

### Step 3: Add Resources

Resources let the AI read structured data from your server:

```typescript
server.resource(
  "config://app",
  "Application configuration",
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify({ version: "1.0", env: process.env.NODE_ENV }),
      },
    ],
  })
);

// Dynamic resource with URI template
server.resource(
  "db://users/{id}",
  "Fetch a user record by ID",
  async (uri) => {
    const id = uri.pathname.split("/").pop();
    const user = await db.users.findById(id);
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(user),
        },
      ],
    };
  }
);
```

### Step 4: Add Prompt Templates

```typescript
server.prompt(
  "code_review",
  "Generate a code review prompt for a PR",
  {
    language: z.string().describe("Programming language"),
    focus: z.string().optional().describe("Specific area to focus on"),
  },
  ({ language, focus }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Review the following ${language} code${
            focus ? `, focusing on ${focus}` : ""
          }. Check for bugs, performance issues, and best practices.`,
        },
      },
    ],
  })
);
```

### Step 5: SSE transport (for remote/web servers)

```typescript
import express from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

const app = express();
const transports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  transports[transport.sessionId] = transport;
  await server.connect(transport);
  res.on("close", () => delete transports[transport.sessionId]);
});

app.post("/messages", async (req, res) => {
  const sessionId = req.query.sessionId as string;
  await transports[sessionId]?.handlePostMessage(req, res);
});

app.listen(3000);
```

### Step 6: Configure in Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["/path/to/your/server/dist/index.js"],
      "env": {
        "API_KEY": "your-api-key"
      }
    }
  }
}
```

For Python:
```json
{
  "mcpServers": {
    "my-server": {
      "command": "python",
      "args": ["/path/to/server.py"]
    }
  }
}
```

### Step 7: Test with MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Opens a web UI to list tools, call them, and inspect responses.

## Examples

### Example 1: Database query tool

**User request:** "Build an MCP server with a tool to query our PostgreSQL database"

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const server = new McpServer({ name: "db-server", version: "1.0.0" });

server.tool(
  "query_database",
  "Run a read-only SQL query against the database",
  {
    sql: z.string().describe("SQL SELECT query to execute"),
    limit: z.number().int().min(1).max(100).default(10),
  },
  async ({ sql, limit }) => {
    if (!sql.trim().toUpperCase().startsWith("SELECT")) {
      return { content: [{ type: "text", text: "Error: Only SELECT queries allowed" }], isError: true };
    }
    const result = await pool.query(`${sql} LIMIT ${limit}`);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ rows: result.rows, count: result.rowCount }, null, 2),
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Example 2: File system resource provider

**User request:** "Create an MCP server that exposes project files as resources"

```typescript
import fs from "fs/promises";
import path from "path";

server.resource(
  "file://{path}",
  "Read a file from the project",
  async (uri) => {
    const filePath = path.join(process.cwd(), uri.pathname);
    const content = await fs.readFile(filePath, "utf-8");
    return {
      contents: [{ uri: uri.href, mimeType: "text/plain", text: content }],
    };
  }
);
```

## Guidelines

- Use **stdio transport** for local tools (simpler, more secure)
- Use **SSE transport** for remote servers that multiple clients share
- Define strict Zod schemas for all tool inputs — they appear as the tool's documentation to the AI
- Return `isError: true` in the content for error cases (don't throw exceptions)
- Keep tool names descriptive and use snake_case
- Test with `npx @modelcontextprotocol/inspector` before connecting to Claude Desktop
- Set environment variables in the claude_desktop_config.json `env` field, not in code
- Restart Claude Desktop after changing `claude_desktop_config.json`
