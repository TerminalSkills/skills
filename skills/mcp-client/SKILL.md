---
name: mcp-client
description: >-
  Connect to and consume MCP servers from applications. Use when: integrating
  MCP servers into your app, building AI agents that use MCP tools, testing MCP
  server implementations, or programmatically calling MCP tools and reading
  resources.
license: Apache-2.0
compatibility: "Node.js 18+ (TypeScript) or Python 3.10+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ai-tools
  tags: ["mcp", "model-context-protocol", "ai-tools", "client"]
  use-cases:
    - "Build an AI agent that discovers and calls tools from MCP servers"
    - "Test an MCP server by listing and invoking its tools programmatically"
    - "Integrate MCP resources into a RAG pipeline"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# MCP Client

## Overview

The MCP client SDK lets you connect to any MCP server, discover its capabilities (tools, resources, prompts), and invoke them programmatically. Use this when building AI agents, testing MCP servers, or integrating MCP capabilities into your application.

## Instructions

### Step 1: Install the SDK

**TypeScript:**
```bash
npm install @modelcontextprotocol/sdk
```

**Python:**
```bash
pip install mcp
```

### Step 2: Connect to a stdio server

**TypeScript:**

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const client = new Client(
  { name: "my-client", version: "1.0.0" },
  { capabilities: {} }
);

const transport = new StdioClientTransport({
  command: "node",
  args: ["path/to/server/dist/index.js"],
  env: { API_KEY: process.env.API_KEY! },
});

await client.connect(transport);
console.log("Connected to MCP server");
```

**Python:**

```python
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

server_params = StdioServerParameters(
    command="python",
    args=["path/to/server.py"],
    env={"API_KEY": "your-key"},
)

async def main():
    async with stdio_client(server_params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            # Use session here
            print("Connected to MCP server")

asyncio.run(main())
```

### Step 3: Connect to an SSE server (remote)

**TypeScript:**

```typescript
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const transport = new SSEClientTransport(
  new URL("http://localhost:3000/sse")
);

await client.connect(transport);
```

**Python:**

```python
from mcp.client.sse import sse_client

async with sse_client("http://localhost:3000/sse") as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
```

### Step 4: Discover tools

```typescript
const toolsResponse = await client.listTools();
console.log("Available tools:", toolsResponse.tools);

// toolsResponse.tools is an array of:
// {
//   name: string,
//   description: string,
//   inputSchema: JSONSchema
// }
for (const tool of toolsResponse.tools) {
  console.log(`- ${tool.name}: ${tool.description}`);
}
```

**Python:**
```python
tools = await session.list_tools()
for tool in tools.tools:
    print(f"- {tool.name}: {tool.description}")
```

### Step 5: Call a tool

```typescript
const result = await client.callTool({
  name: "get_weather",
  arguments: {
    city: "Berlin",
    units: "celsius",
  },
});

// result.content is an array of content blocks
for (const block of result.content) {
  if (block.type === "text") {
    console.log(block.text);
  }
}

// Check for errors
if (result.isError) {
  console.error("Tool returned an error:", result.content);
}
```

**Python:**
```python
result = await session.call_tool("get_weather", {"city": "Berlin", "units": "celsius"})
for block in result.content:
    if block.type == "text":
        print(block.text)
```

### Step 6: List and read resources

```typescript
// List all available resources
const resources = await client.listResources();
for (const resource of resources.resources) {
  console.log(`- ${resource.uri}: ${resource.description}`);
}

// Read a specific resource
const content = await client.readResource({ uri: "config://app" });
for (const block of content.contents) {
  if (block.mimeType === "application/json") {
    console.log(JSON.parse(block.text as string));
  }
}
```

**Python:**
```python
resources = await session.list_resources()
resource_content = await session.read_resource("config://app")
for item in resource_content.contents:
    print(item.text)
```

### Step 7: List and use prompts

```typescript
const prompts = await client.listPrompts();
for (const prompt of prompts.prompts) {
  console.log(`- ${prompt.name}: ${prompt.description}`);
}

const prompt = await client.getPrompt({
  name: "code_review",
  arguments: { language: "TypeScript", focus: "security" },
});

// Use prompt.messages with your LLM
```

### Step 8: Build an AI agent with tool use

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Convert MCP tools to Anthropic format
const tools = toolsResponse.tools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema,
}));

async function runAgent(userMessage: string) {
  const messages = [{ role: "user" as const, content: userMessage }];

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 4096,
      tools,
      messages,
    });

    if (response.stop_reason === "end_turn") {
      return response.content;
    }

    // Process tool calls
    const toolUses = response.content.filter((b) => b.type === "tool_use");
    const toolResults = await Promise.all(
      toolUses.map(async (toolUse) => {
        if (toolUse.type !== "tool_use") return null;
        const result = await client.callTool({
          name: toolUse.name,
          arguments: toolUse.input as Record<string, unknown>,
        });
        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result.content,
        };
      })
    );

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults.filter(Boolean) });
  }
}
```

### Step 9: Clean up

```typescript
// Always disconnect when done
await client.close();
```

## Examples

### Example 1: List all capabilities of an MCP server

```typescript
const transport = new StdioClientTransport({
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
});

await client.connect(transport);

const [tools, resources, prompts] = await Promise.all([
  client.listTools(),
  client.listResources(),
  client.listPrompts(),
]);

console.log(`Tools: ${tools.tools.map((t) => t.name).join(", ")}`);
console.log(`Resources: ${resources.resources.map((r) => r.uri).join(", ")}`);
console.log(`Prompts: ${prompts.prompts.map((p) => p.name).join(", ")}`);

await client.close();
```

### Example 2: Test a specific tool

```typescript
async function testTool(toolName: string, args: Record<string, unknown>) {
  const result = await client.callTool({ name: toolName, arguments: args });

  if (result.isError) {
    console.error("FAIL:", result.content);
    return false;
  }

  console.log("PASS:", result.content);
  return true;
}

await testTool("query_database", { sql: "SELECT COUNT(*) FROM users", limit: 1 });
```

## Guidelines

- Always call `client.close()` after you're done to free resources
- Handle `isError: true` responses from `callTool` — these are tool-level errors, not exceptions
- Use `listTools()` at startup to dynamically discover available tools
- For long-running agents, reconnect if the server disconnects
- Validate tool arguments against the `inputSchema` before calling to catch errors early
- Use `StdioClientTransport` for local servers and `SSEClientTransport` for remote ones
- The `env` field in `StdioClientTransport` merges with the current process environment
